"""The learners a run can name: a constant, gradient-boosted trees, a network.

Each takes the prepared arrays of a task and returns its predictions on the
valid and test rows in the label's own unit (a rating, a log of seconds, a
chance), with what it took to get them.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from ..data.store import Dataset
from ..evals.metrics import LOWER_IS_BETTER, METRICS
from ..tasks.base import Task


@dataclass
class Prepared:
    """A task's arrays over one dataset: labels, context numbers, hand features and the three splits."""

    task: Task
    dataset: Dataset
    y: np.ndarray
    context: np.ndarray
    hand: np.ndarray
    train: np.ndarray
    valid: np.ndarray
    test: np.ndarray


@dataclass
class Fitted:
    valid: np.ndarray
    test: np.ndarray
    details: dict[str, Any] = field(default_factory=dict)
    save: Callable[[Path], None] = lambda directory: None


def prepare(task: Task, dataset: Dataset) -> Prepared:
    rows = dataset.rows
    return Prepared(
        task=task,
        dataset=dataset,
        y=rows[task.label].to_numpy().astype(np.float64),
        context=rows.select(list(task.context)).to_numpy().astype(np.float32),
        hand=rows.select(list(dataset.manifest["hand"])).to_numpy().astype(np.float32),
        train=dataset.split("train"),
        valid=dataset.split("valid"),
        test=dataset.split("test"),
    )


def features(prepared: Prepared, which: str) -> tuple[np.ndarray, list[str]]:
    """The numbers a learner reads beside the board: the task's ``context``, or with ``hand`` the dataset's hand features too."""
    names = list(prepared.task.context)
    if which == "context":
        return prepared.context, names
    if which != "hand":
        raise ValueError("a learner reads `context` or `hand` features")
    hand = prepared.dataset.manifest["hand"]
    extra = [name for name in hand if name not in names]
    columns = [hand.index(name) for name in extra]
    return np.concatenate([prepared.context, prepared.hand[:, columns]], axis=1), names + extra


def fit_constant(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """One number for every row: the training rows' mean label, or their median when the task is scored by absolute error. What a model must beat to have learned anything."""
    labels = prepared.y[prepared.train]
    value = float(np.median(labels) if prepared.task.primary == "mae" else labels.mean())
    return Fitted(
        valid=np.full(len(prepared.valid), value),
        test=np.full(len(prepared.test), value),
        details={"constant": value},
    )


def fit_gbm(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """LightGBM on the context numbers, with the hand features when the run asks for them."""
    import lightgbm as lgb

    learner = config["learner"]
    task = prepared.task
    x, names = features(prepared, learner["features"])
    if task.kind == "binary":
        objective, metric = "binary", "binary_logloss"
    elif task.primary == "mae":
        objective, metric = "regression_l1", "l1"
    else:
        objective, metric = "regression", "rmse"
    params = {
        "objective": objective,
        "metric": metric,
        "learning_rate": float(learner.get("learning_rate", 0.05)),
        "num_leaves": int(learner.get("num_leaves", 127)),
        "min_child_samples": int(learner.get("min_child_samples", 40)),
        "subsample": 0.8,
        "subsample_freq": 1,
        "colsample_bytree": 0.8,
        "lambda_l2": 1.0,
        "seed": int(config.get("seed", 0)),
        "verbosity": -1,
    }
    train = lgb.Dataset(x[prepared.train], prepared.y[prepared.train], feature_name=names)
    valid = lgb.Dataset(x[prepared.valid], prepared.y[prepared.valid], reference=train)
    started = time.time()
    booster = lgb.train(
        params,
        train,
        num_boost_round=int(learner.get("rounds", 4000)),
        valid_sets=[valid],
        callbacks=[
            lgb.early_stopping(int(learner.get("patience", 100)), verbose=False),
            lgb.log_evaluation(200),
        ],
    )
    gain = booster.feature_importance(importance_type="gain")
    order = np.argsort(-gain)[:10]
    return Fitted(
        valid=booster.predict(x[prepared.valid], num_iteration=booster.best_iteration),
        test=booster.predict(x[prepared.test], num_iteration=booster.best_iteration),
        details={
            "features": len(names),
            "trees": int(booster.best_iteration),
            "fit_seconds": round(time.time() - started, 1),
            "leans_on": [
                {"feature": names[index], "share_of_gain": round(float(gain[index] / gain.sum()), 4)}
                for index in order
            ],
        },
        save=lambda directory: booster.save_model(str(directory / "model.txt")) and None,
    )


def fit_net(prepared: Prepared, config: dict[str, Any], *, log, device: str | None = None) -> Fitted:
    """A board network trained with AdamW on a warm-up then cosine schedule, keeping the epoch that scores best on valid."""
    import torch
    import torch.nn.functional as F

    from ..nets.model import build_net, parameter_count

    learner, schedule = config["learner"], config["train"]
    task = prepared.task
    seed = int(config.get("seed", 0))
    torch.manual_seed(seed)
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    on_gpu = device.startswith("cuda")
    mark_names = prepared.dataset.manifest["marks"]

    numbers, number_names = features(prepared, learner.get("features", "context"))
    mean = numbers[prepared.train].mean(axis=0)
    spread = numbers[prepared.train].std(axis=0)
    spread[spread == 0] = 1.0
    regression = task.kind == "regression"
    y_mean = float(prepared.y[prepared.train].mean()) if regression else 0.0
    y_spread = float(prepared.y[prepared.train].std()) if regression else 1.0

    tokens = torch.from_numpy(prepared.dataset.tokens).to(device)
    marks = torch.from_numpy(prepared.dataset.marks.astype(np.int16)).to(device)
    context = torch.from_numpy((numbers - mean) / spread).to(device)
    target = torch.from_numpy(((prepared.y - y_mean) / y_spread).astype(np.float32)).to(device)
    shifts = torch.arange(len(mark_names), device=device)

    def batch_of(rows: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        planes = ((marks[rows].long()[..., None] >> shifts) & 1).float()
        return tokens[rows].long(), planes, context[rows]

    model = build_net(learner, marks=len(mark_names), context=context.shape[1]).to(device)
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

    def predict(rows: np.ndarray) -> np.ndarray:
        model.eval()
        parts = []
        index = torch.from_numpy(rows).to(device)
        with torch.no_grad(), torch.autocast(device_type="cuda" if on_gpu else "cpu", enabled=on_gpu):
            for start in range(0, len(index), 2048):
                parts.append(model(*batch_of(index[start : start + 2048])).float())
        output = torch.cat(parts)
        output = output * y_spread + y_mean if regression else torch.sigmoid(output)
        return output.cpu().numpy().astype(np.float64)

    metric = METRICS[task.kind][task.primary]
    sign = 1.0 if task.primary in LOWER_IS_BETTER else -1.0
    best = (math.inf, None, 0)
    history = []
    patience = int(schedule.get("patience", 3))
    started = time.time()
    log(f"net: {learner['body']} with {parameters:,} parameters on {device}, {steps:,} steps")
    for epoch in range(1, epochs + 1):
        model.train()
        epoch_started = time.time()
        order = train_rows[torch.randperm(len(train_rows), device=device)]
        total = 0.0
        for start in range(0, len(order), batch):
            rows = order[start : start + batch]
            with torch.autocast(device_type="cuda" if on_gpu else "cpu", enabled=on_gpu):
                loss = loss_of(model(*batch_of(rows)).float(), target[rows])
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
            },
            directory / "model.pt",
        )

    return Fitted(
        valid=predict(prepared.valid),
        test=predict(prepared.test),
        details={
            "parameters": parameters,
            "device": torch.cuda.get_device_name(0) if on_gpu else "cpu",
            "best_epoch": best[2],
            "fit_seconds": round(time.time() - started, 1),
            "history": history,
        },
        save=save,
    )


LEARNERS = {"constant": fit_constant, "gbm": fit_gbm, "net": fit_net}
