"""A network that reads the board: one training loop for every task."""

from __future__ import annotations

import hashlib
import math
import time
from pathlib import Path
from typing import Any

import numpy as np

from ...evals.metrics import LOWER_IS_BETTER, METRICS, SETS
from .base import Fitted, Prepared, features


SAME_BODY = ("body", "dim", "depth", "heads")


def start_from(model, saved: dict[str, Any], *, learner: dict[str, Any], marks: list[str], numbers: list[str]) -> dict[str, Any]:
    """Gives a new network the body of a trained one, and says what carried over.

    The two must be the same body at the same size. Then the piece and square embeddings, every block and
    the last norm carry over. A mark on squares both tasks know keeps its weights (the en passant square is
    one for every dataset) and a mark only the new task has starts new. The layers that read the numbers
    beside the board carry over only when both tasks read the same numbers. The head never does: it is the
    task's own.
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
    same_numbers = list(saved["context"]) == list(numbers)
    shared = [(marks.index(name), saved["marks"].index(name)) for name in marks if name in saved["marks"]]
    # The two tensors that read the marks, and where their mark channels start.
    mark_tensors = {"body.mark.weight": 0, "body.stem.weight": TOKENS}
    taken, fresh = [], []
    for name, tensor in own.items():
        source = state.get(name)
        if source is None or not name.startswith("body.") or (name.startswith("body.context.") and not same_numbers):
            fresh.append(name)
        elif name in mark_tensors:
            first = mark_tensors[name]
            tensor[:, :first] = source[:, :first]
            for ours, their in shared:
                tensor[:, first + ours] = source[:, first + their]
            taken.append(name)
        elif source.shape == tensor.shape:
            own[name] = source.clone()
            taken.append(name)
        else:
            fresh.append(name)
    model.load_state_dict(own)
    return {
        "tensors_taken": len(taken),
        "marks_taken": [marks[ours] for ours, _ in shared],
        "new": sorted({".".join(name.split(".")[:2]) if name.startswith("body.") else name.split(".")[0] for name in fresh}),
    }


def fit(prepared: Prepared, config: dict[str, Any], *, log, device: str | None = None, start: Path | None = None) -> Fitted:
    """A board network trained with AdamW on a warm-up then cosine schedule, keeping the epoch that scores best on valid.

    With ``start`` the network begins from the body of the network saved there (``start_from``), and its
    record says what it took. For a task whose answer is a set the head gives a logit a candidate (a square,
    a tag), each trained as a yes or no of its own. Where a row is a sequence of positions the body reads
    every one of them with its own numbers and then the positions in order (``GameBody``): a batch is filled
    out to its longest row, and the row's own numbers are what a row of one position has as context.
    """
    import torch
    import torch.nn.functional as F

    from ...nets.model import build_net, parameter_count

    learner, schedule = config["learner"], config["train"]
    task = prepared.task
    seed = int(config.get("seed", 0))
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
    y_mean = float(prepared.y[prepared.train].mean()) if regression else 0.0
    y_spread = float(prepared.y[prepared.train].std()) if regression else 1.0

    sequence = prepared.dataset.steps
    if sequence is not None and start is not None:
        raise ValueError(f"{task.name}: a network that reads a row's positions in order does not start from another run yet")
    tokens = torch.from_numpy(prepared.dataset.tokens if sequence is None else sequence.tokens).to(device)
    marks = torch.from_numpy((prepared.dataset.marks if sequence is None else sequence.marks).astype(np.int16)).to(device)
    context = torch.from_numpy((numbers - mean) / spread).to(device)
    if sets:
        # One byte a candidate until a batch asks for it: a set over every row is large as fractions.
        target = torch.from_numpy(prepared.y).to(device)
    else:
        target = torch.from_numpy(((prepared.y - y_mean) / y_spread).astype(np.float32)).to(device)
    shifts = torch.tensor(prepared.mark_channels, device=device)

    def batch_of(rows: torch.Tensor) -> tuple[torch.Tensor, ...]:
        planes = ((marks[rows].long()[..., None] >> shifts) & 1).float()
        return tokens[rows].long(), planes, context[rows]

    step_mean = step_spread = None
    longest = 0
    if sequence is not None:
        frame = prepared.dataset.rows
        first, count = frame["first_step"].to_numpy().astype(np.int64), frame["steps"].to_numpy().astype(np.int64)
        longest = int(count.max())
        # Each position's numbers, scaled by what the training rows' positions hold.
        of_step = sequence.numbers[:, prepared.step_columns].astype(np.float32)
        in_train = np.zeros(len(count), dtype=bool)
        in_train[prepared.train] = True
        step_mean = of_step[np.repeat(in_train, count)].mean(axis=0)
        step_spread = of_step[np.repeat(in_train, count)].std(axis=0)
        step_spread[step_spread == 0] = 1.0
        step_numbers = torch.from_numpy((of_step - step_mean) / step_spread).to(device)
        first_step, step_count = torch.from_numpy(first).to(device), torch.from_numpy(count).to(device)

        def batch_of(rows: torch.Tensor) -> tuple[torch.Tensor, ...]:  # noqa: F811
            counts = step_count[rows]
            reach = torch.arange(int(counts.max()), device=device)
            held = reach[None, :] < counts[:, None]
            # A row shorter than the batch's longest is filled out with its own first position, which the body
            # never reads.
            index = first_step[rows][:, None] + torch.where(held, reach[None, :], 0)
            planes = ((marks[index].long()[..., None] >> shifts) & 1).float()
            return tokens[index].long(), planes, step_numbers[index], held, context[rows]

    model = build_net(
        learner,
        marks=len(mark_names),
        context=context.shape[1],
        outputs=len(task.candidates) if task.kind == "tags" else 1,
        squares=task.kind == "squares",
        steps=None if sequence is None else len(prepared.step_names),
        most=longest,
    )
    started = None
    if start is not None:
        saved = torch.load(start, map_location="cpu", weights_only=False)
        started = {
            **learner["init"],
            "sha256": hashlib.sha256(start.read_bytes()).hexdigest(),
            **start_from(model, saved, learner=learner, marks=mark_names, numbers=number_names),
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
    if not regression:
        loss_of = F.binary_cross_entropy_with_logits
    elif task.primary == "mae":
        loss_of = lambda output, wanted: F.smooth_l1_loss(output, wanted, beta=0.1)  # noqa: E731
    else:
        loss_of = F.mse_loss

    # Rows scored at a time: a row that is a sequence is as many boards as it has positions.
    at_once = 2048 if sequence is None else max(1, 2048 // longest)

    def predict(rows: np.ndarray) -> np.ndarray:
        model.eval()
        parts = []
        index = torch.from_numpy(rows).to(device)
        with torch.no_grad(), torch.autocast(device_type="cuda" if on_gpu else "cpu", enabled=on_gpu):
            for start in range(0, len(index), at_once):
                parts.append(model(*batch_of(index[start : start + at_once])).float())
        output = torch.cat(parts)
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
                loss = loss_of(model(*batch_of(rows)).float(), target[rows].float())
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
                    else {"steps": prepared.step_names, "step_mean": step_mean, "step_spread": step_spread, "most_steps": longest}
                ),
            },
            directory / "model.pt",
        )

    return Fitted(
        valid=predict(prepared.valid),
        test=predict(prepared.test),
        details={
            "features": len(number_names),
            "parameters": parameters,
            "device": torch.cuda.get_device_name(0) if on_gpu else "cpu",
            "best_epoch": best[2],
            "fit_seconds": round(time.time() - began, 1),
            "history": history,
            **({} if started is None else {"started_from": started}),
        },
        save=save,
    )
