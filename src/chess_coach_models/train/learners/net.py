"""A network that reads the board: one training loop for every task."""

from __future__ import annotations

import hashlib
import math
import time
from pathlib import Path
from typing import Any

import numpy as np

from ...evals.metrics import LOWER_IS_BETTER, METRICS, SETS
from .base import Fitted, Prepared, features, seed_of


SAME_BODY = ("body", "dim", "depth", "heads")


def start_from(model, saved: dict[str, Any], *, learner: dict[str, Any], marks: list[str], numbers: list[str]) -> dict[str, Any]:
    """Gives a new network the body of a trained one, and says what carried over.

    The two must be the same body at the same size. Then the piece and square embeddings, every block and
    the last norm carry over. A mark on squares both tasks know keeps its weights (the en passant square is
    one for every dataset) and a mark only the new task has starts new. The layers that read the numbers
    beside the board carry over only when both tasks read the same numbers. The head never does: it is the
    task's own.

    For a sequence network (``GameBody``), the pretrained single-board encoder is loaded into
    ``body.board.*`` while the sequence layers over it start fresh.

    What a transformer's attention is told is no part of its size. One told what each piece attacks takes
    the body of one told nothing, and since its weights on what it is told start at nothing it begins as
    that body does. What started new is named by its part of the network (``body.context``, ``head``), and
    by its own name too where the rest of its part carried over (``body.blocks.told_bias``).
    """
    from ...encode.board import TOKENS

    theirs = saved["learner"]
    differs = [key for key in SAME_BODY if theirs.get(key) != learner.get(key)]
    if differs:
        raise ValueError(
            "a run starts from a network of its own body and size, and these differ in "
            + ", ".join(f"{key} ({learner.get(key)} here, {theirs.get(key)} there)" for key in differs)
        )
    own, state = model.state_dict(), saved["state"]
    is_sequence = hasattr(model.body, "board")
    prefix = "body.board." if is_sequence else "body."
    same_numbers = list(saved["context"]) == list(numbers)
    shared = [(marks.index(name), saved["marks"].index(name)) for name in marks if name in saved["marks"]]
    # The two tensors that read the marks, and where their mark channels start.
    mark_tensors = {f"{prefix}mark.weight": 0, f"{prefix}stem.weight": TOKENS}
    taken, fresh = [], []
    for name, tensor in own.items():
        if not name.startswith(prefix):
            fresh.append(name)
            continue
        saved_name = "body." + name[len(prefix) :]
        source = state.get(saved_name)
        if source is None or (name.startswith(f"{prefix}context.") and not same_numbers):
            fresh.append(name)
        elif name in mark_tensors:
            first = mark_tensors[name]
            if source.shape[1] >= first and tensor.shape[0] == source.shape[0] and tensor.shape[2:] == source.shape[2:]:
                tensor[:, :first] = source[:, :first]
                for ours, their in shared:
                    if first + ours < tensor.shape[1] and first + their < source.shape[1]:
                        tensor[:, first + ours] = source[:, first + their]
                taken.append(name)
            else:
                fresh.append(name)
        elif source.shape == tensor.shape:
            own[name] = source.clone()
            taken.append(name)
        else:
            fresh.append(name)
    # Zero-initialise extra_piece embeddings when starting from a single-board pretrained model so the
    # network starts from the pretrained representation cleanly.
    for name in list(fresh):
        if name.startswith(f"{prefix}extra_piece.") and name.endswith(".weight"):
            own[name].zero_()
    model.load_state_dict(own)
    carried = {".".join(name.split(".")[:2]) for name in taken}
    new = set()
    for name in fresh:
        part = ".".join(name.split(".")[:2]) if name.startswith("body.") else name.split(".")[0]
        new.add(f"{part}.{name.rsplit('.', 1)[-1]}" if part in carried else part)
    return {
        "tensors_taken": len(taken),
        "marks_taken": [marks[ours] for ours, _ in shared],
        "new": sorted(new),
    }


def _asymmetric_loss(logits, targets, *, gamma_neg: float = 2.0, gamma_pos: float = 0.0, clip: float = 0.05):
    """Asymmetric multi-label focal loss (Ridnik et al., ICCV 2021) for imbalanced tag prediction."""
    import torch

    xs_pos = torch.sigmoid(logits)
    xs_neg = 1.0 - xs_pos
    if clip > 0.0:
        xs_neg = (xs_neg + clip).clamp(max=1.0)
    los_pos = targets * torch.log(xs_pos.clamp(min=1e-8))
    los_neg = (1.0 - targets) * torch.log(xs_neg.clamp(min=1e-8))
    if gamma_neg > 0.0 or gamma_pos > 0.0:
        pt = xs_pos * targets + xs_neg * (1.0 - targets)
        gamma = gamma_pos * targets + gamma_neg * (1.0 - targets)
        weight = torch.pow((1.0 - pt).clamp(min=0.0), gamma)
        loss = -(los_pos + los_neg) * weight
    else:
        loss = -(los_pos + los_neg)
    return loss.mean()


def fit(prepared: Prepared, config: dict[str, Any], *, log, device: str | None = None, start: Path | None = None) -> Fitted:
    """A board network trained with AdamW on a warm-up then cosine schedule, keeping the epoch that scores best on valid.

    With ``start`` the network begins from the body of the network saved there (``start_from``), and its
    record says what it took. For a task whose answer is a set the head gives a logit a candidate (a square,
    a tag), each trained as a yes or no of its own. Where a row is a sequence of positions the body reads
    every one of them with its own numbers and then the positions in order (``GameBody`` or ``StepBody``):
    a batch is filled out to its longest row, and the row's own numbers are what a row of one position has
    as context. For a task that predicts the move played the head gives a logit to every pair of squares
    (``MoveNet``), and the loss is the cross-entropy of the move played among the moves the position allows.
    """
    import torch
    import torch.nn.functional as F

    from ...nets.model import build_net, parameter_count

    learner, schedule = config["learner"], config["train"]
    task = prepared.task
    seed = seed_of(config)
    torch.manual_seed(seed)
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    on_gpu = device.startswith("cuda")
    mark_names = prepared.mark_names

    numbers, number_names = features(prepared, learner.get("features", "context"), learner.get("without", ()))
    mean = numbers[prepared.train].mean(axis=0)
    spread = numbers[prepared.train].std(axis=0)
    spread[spread == 0] = 1.0
    regression = task.kind == "regression"
    sets = task.kind in SETS
    moves = task.kind == "moves"
    y_mean = float(prepared.y[prepared.train].mean()) if regression else 0.0
    y_spread = float(prepared.y[prepared.train].std()) if regression else 1.0

    sequence = prepared.dataset.steps
    is_steps_body = learner["body"] == "steps"
    if is_steps_body and start is not None:
        raise ValueError(f"{task.name}: body 'steps' cannot start from a pretrained board encoder")
    extra_boards = 0
    if is_steps_body:
        tokens = marks = None
    elif sequence is None and learner.get("solution_boards"):
        from ...encode.solution import solution_boards

        extra = solution_boards(prepared.dataset)
        stacked = np.concatenate([prepared.dataset.tokens[:, None, :], extra], axis=1)
        tokens = torch.from_numpy(stacked).to(device)
        extra_boards = extra.shape[1]
        marks = torch.from_numpy(prepared.dataset.marks.astype(np.int16)).to(device)
    else:
        tokens = torch.from_numpy(prepared.dataset.tokens if sequence is None else sequence.tokens).to(device)
        marks = torch.from_numpy((prepared.dataset.marks if sequence is None else sequence.marks).astype(np.int16)).to(device)
    context = torch.from_numpy((numbers - mean) / spread).to(device)
    if sets:
        # One byte a candidate until a batch asks for it: a set over every row is large as fractions.
        target = torch.from_numpy(prepared.y).to(device)
    elif moves:
        # Every row's candidates as pairs of squares, and the pair that was played.
        candidates = torch.from_numpy(prepared.moves).to(device)
        target = torch.from_numpy(prepared.moves[np.arange(len(prepared.y)), prepared.y].astype(np.int64)).to(device)
    else:
        target = torch.from_numpy(((prepared.y - y_mean) / y_spread).astype(np.float32)).to(device)

    aux_col = schedule.get("aux_target")
    aux_weight = float(schedule.get("aux_weight", 0.3))
    aux_target = None
    aux_outputs = 0
    if aux_col is not None:
        if not regression:
            raise ValueError("aux_target is only supported for regression tasks")
        aux_values = prepared.dataset.rows[aux_col].to_numpy().astype(np.float64)
        aux_target = torch.from_numpy(((aux_values - y_mean) / y_spread).astype(np.float32)).to(device)
        aux_outputs = 1

    shifts = torch.tensor(prepared.mark_channels, device=device)

    def batch_of(rows: torch.Tensor) -> tuple[torch.Tensor, ...]:
        planes = ((marks[rows].long()[..., None] >> shifts) & 1).float()
        return tokens[rows].long(), planes, context[rows]

    step_mean = step_spread = None
    step_names = list(prepared.step_names)
    longest = 0
    if sequence is not None:
        frame = prepared.dataset.rows
        first, count = frame["first_step"].to_numpy().astype(np.int64), frame["steps"].to_numpy().astype(np.int64)
        longest = int(count.max())
        base_step = sequence.numbers[:, prepared.step_columns].astype(np.float32)
        without_opp = bool(learner.get("without_opponent", False))
        opp_base_cols = {"log_opponent_clock", "win_before", "castle_opp_king", "castle_opp_queen"}
        if without_opp:
            keep_idx = [i for i, name in enumerate(step_names) if name not in opp_base_cols]
            parts_step = [base_step[:, keep_idx]]
            step_names = [step_names[i] for i in keep_idx]
        else:
            parts_step = [base_step]
        if learner.get("temporal"):
            from ...encode.steps import temporal_features

            t_arr, t_names = temporal_features(
                base_step,
                prepared.step_names,
                first,
                count,
                frame["base"].to_numpy(),
                frame["increment"].to_numpy(),
                without_opponent=without_opp,
            )
            parts_step.append(t_arr)
            step_names += t_names
        if learner.get("board_features"):
            from ...data.store import dataset_dir
            from ...encode.steps import BOARD_STEP_NAMES, board_step_features

            fp = prepared.dataset.manifest.get("fingerprint")
            cache = dataset_dir(prepared.dataset.name) / f"board_step_features.{fp[:16]}.npy" if fp else None
            b_arr = None
            if cache is not None and cache.exists():
                loaded = np.load(cache)
                if loaded.shape == (len(sequence.tokens), len(BOARD_STEP_NAMES)):
                    b_arr, b_names = loaded, list(BOARD_STEP_NAMES)
            if b_arr is None:
                b_arr, b_names = board_step_features(sequence.tokens, sequence.marks, prepared.dataset.manifest["marks"])
                if cache is not None and cache.parent.exists():
                    tmp = cache.with_suffix(".tmp.npy")
                    np.save(tmp, b_arr)
                    tmp.replace(cache)
            if without_opp:
                opp_board_cols = {"is_recapture", "opp_moved_val", "opp_move_dist", "own_atk_last_to", "opp_def_last_to"}
                keep_b = [i for i, name in enumerate(b_names) if name not in opp_board_cols]
                b_arr = b_arr[:, keep_b]
                b_names = [b_names[i] for i in keep_b]
            parts_step.append(b_arr)
            step_names += b_names
        of_step = np.concatenate(parts_step, axis=1) if len(parts_step) > 1 else parts_step[0].copy()
        del parts_step, base_step
        if "t_arr" in locals():
            del t_arr
        if "b_arr" in locals():
            del b_arr
        # Compute training mean/std column-wise and normalize in-place to avoid gigabyte temporaries.
        in_train = np.zeros(len(count), dtype=bool)
        in_train[prepared.train] = True
        step_mask = np.repeat(in_train, count)
        n_cols = of_step.shape[1]
        step_mean = np.empty(n_cols, dtype=np.float32)
        step_spread = np.empty(n_cols, dtype=np.float32)
        for col in range(n_cols):
            vals = of_step[step_mask, col]
            m = float(vals.mean())
            s = float(vals.std())
            step_mean[col] = m
            step_spread[col] = s if s != 0.0 else 1.0
        of_step -= step_mean
        of_step /= step_spread
        step_numbers = torch.from_numpy(of_step).to(device)
        first_step, step_count = torch.from_numpy(first).to(device), torch.from_numpy(count).to(device)
        empty_tensor = torch.empty(0, device=device)

        def batch_of(rows: torch.Tensor) -> tuple[torch.Tensor, ...]:  # noqa: F811
            counts = step_count[rows]
            reach = torch.arange(int(counts.max()), device=device)
            held = reach[None, :] < counts[:, None]
            # A row shorter than the batch's longest is filled out with its own first position, which the body
            # never reads.
            index = first_step[rows][:, None] + torch.where(held, reach[None, :], 0)
            if is_steps_body:
                return empty_tensor, empty_tensor, step_numbers[index], held, context[rows]
            planes = ((marks[index].long()[..., None] >> shifts) & 1).float()
            return tokens[index].long(), planes, step_numbers[index], held, context[rows]

    model = build_net(
        learner,
        marks=len(mark_names),
        context=context.shape[1],
        outputs=len(task.candidates) if task.kind == "tags" else 1,
        squares=task.kind == "squares",
        steps=None if sequence is None else len(step_names),
        most=longest,
        moves=moves,
        extra_boards=extra_boards,
        aux_outputs=aux_outputs,
    )
    started = None
    if start is not None:
        saved = torch.load(start, map_location="cpu", weights_only=False)
        started = {
            **learner["init"],
            "sha256": hashlib.sha256(start.read_bytes()).hexdigest(),
            **start_from(
                model,
                saved,
                learner=learner,
                marks=mark_names,
                numbers=step_names if sequence is not None else number_names,
            ),
        }
        log(f"net: started from {learner['init']['model']}/{learner['init']['run']}, {started['tensors_taken']} tensors taken")
    model = model.to(device)
    parameters = parameter_count(model)
    batch = int(schedule["batch"])
    epochs = int(schedule["epochs"])
    train_rows = torch.from_numpy(prepared.train).to(device)
    steps = epochs * math.ceil(len(train_rows) / batch)
    warmup = max(1, int(float(schedule.get("warmup", 0.05)) * steps))
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=float(schedule["lr"]), weight_decay=float(schedule.get("weight_decay", 0.05))
    )
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizer,
        lambda step: (step + 1) / warmup
        if step < warmup
        else 0.5 * (1.0 + math.cos(math.pi * (step - warmup) / max(1, steps - warmup))),
    )
    scaler = torch.amp.GradScaler(enabled=on_gpu)
    loss_kind = schedule.get("loss")
    if not regression:
        if loss_kind == "asl":
            gamma_neg = float(schedule.get("gamma_neg", 2.0))
            gamma_pos = float(schedule.get("gamma_pos", 0.0))
            clip = float(schedule.get("clip", 0.05))
            loss_of = lambda output, wanted: _asymmetric_loss(  # noqa: E731
                output, wanted, gamma_neg=gamma_neg, gamma_pos=gamma_pos, clip=clip
            )
        else:
            loss_of = F.binary_cross_entropy_with_logits
    elif task.primary == "mae":
        loss_of = lambda output, wanted: F.smooth_l1_loss(output, wanted, beta=0.1)  # noqa: E731
    else:
        loss_of = F.mse_loss

    def allowed(output: torch.Tensor, rows: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """A logit for every pair of squares, with minus infinity where the pair is no move the row's position
        allows, and where each of the row's candidates is among the pairs (one place past them for none)."""
        places = candidates[rows].long()
        places = torch.where(places < 0, output.shape[1], places)
        legal = torch.zeros(len(rows), output.shape[1] + 1, dtype=torch.bool, device=output.device)
        legal.scatter_(1, places, True)
        return output.masked_fill(~legal[:, :-1], float("-inf")), places

    def loss_on(rows: torch.Tensor) -> torch.Tensor:
        if aux_target is not None:
            output, aux_out = model.forward_with_aux(*batch_of(rows))
            return loss_of(output.float(), target[rows].float()) + aux_weight * loss_of(
                aux_out.float(), aux_target[rows].float()
            )
        output = model(*batch_of(rows)).float()
        if moves:
            return F.cross_entropy(allowed(output, rows)[0], target[rows])
        return loss_of(output, target[rows].float())

    # Rows scored at a time: a row that is a sequence is as many boards as it has positions.
    at_once = 2048 if sequence is None or is_steps_body else max(1, 2048 // longest)

    def predict(rows: np.ndarray) -> np.ndarray:
        model.eval()
        parts = []
        index = torch.from_numpy(rows).to(device)
        with torch.no_grad(), torch.autocast(device_type="cuda" if on_gpu else "cpu", enabled=on_gpu):
            for start in range(0, len(index), at_once):
                chunk = index[start : start + at_once]
                output = model(*batch_of(chunk)).float()
                if moves:
                    # A chance for each of a row's candidates, and no number where it has none.
                    logits, places = allowed(output, chunk)
                    chances = torch.cat([torch.softmax(logits, dim=1), output.new_full((len(chunk), 1), float("nan"))], dim=1)
                    output = chances.gather(1, places)
                parts.append(output)
        output = torch.cat(parts)
        if not moves:
            output = output * y_spread + y_mean if regression else torch.sigmoid(output)
        return output.cpu().numpy().astype(np.float64)

    metric = METRICS[task.kind][task.primary]
    sign = 1.0 if task.primary in LOWER_IS_BETTER else -1.0
    best = (math.inf, None, 0)
    history = []
    patience = int(schedule.get("patience", 3))
    began = time.time()
    log(f"net: {learner['body']} with {parameters:,} parameters on {device}, {steps:,} steps")
    for epoch in range(1, epochs + 1):
        model.train()
        epoch_started = time.time()
        order = train_rows[torch.randperm(len(train_rows), device=device)]
        total = 0.0
        for start in range(0, len(order), batch):
            rows = order[start : start + batch]
            with torch.autocast(device_type="cuda" if on_gpu else "cpu", enabled=on_gpu):
                loss = loss_on(rows)
            optimizer.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            total += loss.item() * len(rows)
        seconds = time.time() - epoch_started
        score = metric(prepared.y[prepared.valid], predict(prepared.valid))
        history.append(
            {
                "epoch": epoch,
                "train_loss": round(total / len(order), 5),
                f"valid_{task.primary}": round(score, 5),
                "rows_a_second": round(len(order) / seconds),
            }
        )
        log(f"net: epoch {epoch}/{epochs} {history[-1]}")
        if sign * score < best[0]:
            best = (
                sign * score,
                {name: value.detach().cpu().clone() for name, value in model.state_dict().items()},
                epoch,
            )
        elif epoch - best[2] >= patience:
            log(f"net: stopping, no better valid score since epoch {best[2]}")
            break
    model.load_state_dict(best[1])

    def save(directory: Path) -> None:
        torch.save(
            {
                "state": best[1],
                "learner": learner,
                "marks": mark_names,
                "context": number_names,
                "context_mean": mean,
                "context_spread": spread,
                "label_mean": y_mean,
                "label_spread": y_spread,
                **({"candidates": list(task.candidates)} if sets else {}),
                **(
                    {}
                    if sequence is None
                    else {"steps": step_names, "step_mean": step_mean, "step_spread": step_spread, "most_steps": longest}
                ),
            },
            directory / "model.pt",
        )

    return Fitted(
        valid=predict(prepared.valid),
        test=predict(prepared.test),
        details={
            "features": len(number_names),
            **({"step_features": len(step_names)} if sequence is not None else {}),
            "parameters": parameters,
            "device": torch.cuda.get_device_name(0) if on_gpu else "cpu",
            "best_epoch": best[2],
            "fit_seconds": round(time.time() - began, 1),
            "history": history,
            **({} if started is None else {"started_from": started}),
        },
        save=save,
    )
