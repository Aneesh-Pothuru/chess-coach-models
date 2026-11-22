"""The tree baseline: gradient-boosted trees on numbers a person could count.

For a task with one number a row the trees read one row a position. For a task
whose answer is a set they still give one chance at a time: a booster a tag,
each on the position's numbers, or one booster that reads a row a square, the
position's numbers beside what stands on the square and, with the hand
features, what a person would count there (``encode/squares.py``). For a task
that predicts the move played, one booster reads a row a legal move
(``encode/moves.py``) and says the chance that it is the one played, and a
position's chances are scaled to add up to one.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from ...encode import moves as move_code
from ...encode.squares import SQUARE_HAND, SQUARE_PLAIN, plain_of, squares_of
from .base import Fitted, Prepared, features


# What a tree run uses unless its config says otherwise, and the three settings no config changes.
DEFAULTS = {"learning_rate": 0.05, "num_leaves": 127, "min_child_samples": 40, "rounds": 4000, "patience": 100}
FIXED = {"subsample": 0.8, "subsample_freq": 1, "colsample_bytree": 0.8, "lambda_l2": 1.0}
# A booster that reads a row a square is given at most this many rows to train on: more than that and a
# run says which share of the training games it reads (``data: {train_share: 0.1}``).
MOST_SQUARE_ROWS = 16_000_000
# Positions scored at a time by a booster that reads a row a square.
SQUARES_AT_ONCE = 20_000
# The same two for a booster that reads a row a legal move: a position is about thirty of those.
MOST_MOVE_ROWS = 8_000_000
MOVES_AT_ONCE = 20_000


def _params(objective: str, metric: str, learner: dict[str, Any], seed: int) -> dict[str, Any]:
    return {
        "objective": objective,
        "metric": metric,
        "learning_rate": float(learner.get("learning_rate", DEFAULTS["learning_rate"])),
        "num_leaves": int(learner.get("num_leaves", DEFAULTS["num_leaves"])),
        "min_child_samples": int(learner.get("min_child_samples", DEFAULTS["min_child_samples"])),
        **FIXED,
        "seed": seed,
        "verbosity": -1,
    }


def _boost(params: dict[str, Any], train, valid, learner: dict[str, Any], *, every: int = 200):
    import lightgbm as lgb

    return lgb.train(
        params,
        train,
        num_boost_round=int(learner.get("rounds", DEFAULTS["rounds"])),
        valid_sets=[valid],
        callbacks=[
            lgb.early_stopping(int(learner.get("patience", DEFAULTS["patience"])), verbose=False),
            lgb.log_evaluation(every),
        ],
    )


def _leans_on(names: list[str], gain: np.ndarray) -> list[dict[str, Any]]:
    """The ten features the trees gained most from, each with its share of the gain."""
    total = float(gain.sum())
    if total <= 0:
        return []
    return [
        {"feature": names[index], "share_of_gain": round(float(gain[index] / total), 4)}
        for index in np.argsort(-gain)[:10]
    ]


def fit(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """LightGBM on the context numbers, with the hand features when the run asks for them."""
    import lightgbm as lgb

    learner = config["learner"]
    task = prepared.task
    if task.kind == "tags":
        return _fit_tags(prepared, config, log=log)
    if task.kind == "squares":
        return _fit_squares(prepared, config, log=log)
    if task.kind == "moves":
        return _fit_moves(prepared, config, log=log)
    x, names = features(prepared, learner["features"], learner.get("without", ()))
    if task.kind == "binary":
        objective, metric = "binary", "binary_logloss"
    elif task.primary == "mae":
        objective, metric = "regression_l1", "l1"
    else:
        objective, metric = "regression", "rmse"
    train = lgb.Dataset(x[prepared.train], prepared.y[prepared.train], feature_name=names)
    valid = lgb.Dataset(x[prepared.valid], prepared.y[prepared.valid], reference=train)
    started = time.time()
    booster = _boost(_params(objective, metric, learner, int(config.get("seed", 0))), train, valid, learner)
    return Fitted(
        valid=booster.predict(x[prepared.valid], num_iteration=booster.best_iteration),
        test=booster.predict(x[prepared.test], num_iteration=booster.best_iteration),
        details={
            "features": len(names),
            "trees": int(booster.best_iteration),
            "fit_seconds": round(time.time() - started, 1),
            "leans_on": _leans_on(names, booster.feature_importance(importance_type="gain")),
        },
        save=lambda directory: booster.save_model(str(directory / "model.txt")) and None,
    )


def _fit_tags(prepared: Prepared, config: dict[str, Any], *, log) -> Fitted:
    """A booster a tag, each on the same numbers and each stopped on its own valid log loss.

    A tag no training row carries, or every one, is given that share and no trees. The boosters are saved
    one after another in ``model.txt``, each under a line ``tag <name>``.
    """
    import lightgbm as lgb

    learner, tags = config["learner"], prepared.task.candidates
    x, names = features(prepared, learner["features"], learner.get("without", ()))
    params = _params("binary", "binary_logloss", learner, int(config.get("seed", 0)))
    x_train, x_valid, x_test = x[prepared.train], x[prepared.valid], x[prepared.test]
    y_train, y_valid = prepared.y[prepared.train], prepared.y[prepared.valid]
    said_valid = np.zeros((len(prepared.valid), len(tags)))
    said_test = np.zeros((len(prepared.test), len(tags)))
    gain = np.zeros(len(names))
    trees, saved = {}, []
    started = time.time()
    for column, tag in enumerate(tags):
        share = float(y_train[:, column].mean())
        if share in (0.0, 1.0):
            said_valid[:, column], said_test[:, column], trees[tag] = share, share, 0
            continue
        train = lgb.Dataset(x_train, y_train[:, column], feature_name=names)
        valid = lgb.Dataset(x_valid, y_valid[:, column], reference=train)
        booster = _boost(params, train, valid, learner, every=0)
        said_valid[:, column] = booster.predict(x_valid, num_iteration=booster.best_iteration)
        said_test[:, column] = booster.predict(x_test, num_iteration=booster.best_iteration)
        gain += booster.feature_importance(importance_type="gain")
        trees[tag] = int(booster.best_iteration)
        saved.append(f"tag {tag}\n{booster.model_to_string(num_iteration=booster.best_iteration)}")
        log(f"gbm: {tag}, {trees[tag]} trees ({column + 1} of {len(tags)})")
    return Fitted(
        valid=said_valid,
        test=said_test,
        details={
            "features": len(names),
            "trees": sum(trees.values()),
            "trees_by_tag": trees,
            "fit_seconds": round(time.time() - started, 1),
            "leans_on": _leans_on(names, gain),
        },
        save=lambda directory: (directory / "model.txt").write_text("\n".join(saved), encoding="utf-8") and None,
    )


def square_rows(prepared: Prepared, index: np.ndarray, which: str, without=()) -> tuple[np.ndarray, list[str]]:
    """One row a square for the positions ``index`` names, 64 after each other a position: the position's own
    numbers (``features``), then where the square is, the piece on it and the marks the task lets a learner
    read there, and with ``hand`` what a person would count on it."""
    numbers, names = features(prepared, which, without)
    dataset = prepared.dataset
    shifts = np.array(prepared.mark_channels, dtype=np.uint16)
    parts = [
        np.repeat(numbers[index][:, None, :], 64, axis=1),
        plain_of(dataset.tokens[index]),
        ((dataset.marks[index][..., None] >> shifts) & 1).astype(np.float32),
    ]
    names = names + list(SQUARE_PLAIN) + [f"square_{name}" for name in prepared.mark_names]
    if which == "hand":
        parts.append(squares_of(dataset.rows["fen"].gather(index).to_list()))
        names += list(SQUARE_HAND)
    return np.concatenate(parts, axis=2).reshape(len(index) * 64, len(names)), names


def _fit_squares(prepared: Prepared, config: dict[str, Any], *, log) -> Fitted:
    """One booster that reads a row a square and says the chance that the square is right."""
    import lightgbm as lgb

    learner = config["learner"]
    which, without = learner["features"], learner.get("without", ())
    if len(prepared.train) * 64 > MOST_SQUARE_ROWS:
        raise ValueError(
            f"{prepared.task.name}: trees that read a row a square would train on {len(prepared.train) * 64:,} rows. "
            f"Give the run a share of the training games (`data: {{train_share: ...}}`) that keeps them under "
            f"{MOST_SQUARE_ROWS:,}"
        )
    started = time.time()
    x_train, names = square_rows(prepared, prepared.train, which, without)
    x_valid, _ = square_rows(prepared, prepared.valid, which, without)
    log(f"gbm: {len(x_train):,} train and {len(x_valid):,} valid rows, one a square, of {len(names)} numbers")
    train = lgb.Dataset(x_train, prepared.y[prepared.train].reshape(-1), feature_name=names)
    valid = lgb.Dataset(x_valid, prepared.y[prepared.valid].reshape(-1), reference=train)
    booster = _boost(_params("binary", "binary_logloss", learner, int(config.get("seed", 0))), train, valid, learner)

    def predict(index: np.ndarray) -> np.ndarray:
        parts = []
        for start in range(0, len(index), SQUARES_AT_ONCE):
            x, _ = square_rows(prepared, index[start : start + SQUARES_AT_ONCE], which, without)
            parts.append(booster.predict(x, num_iteration=booster.best_iteration).reshape(-1, 64))
        return np.concatenate(parts) if parts else np.zeros((0, 64))

    return Fitted(
        valid=booster.predict(x_valid, num_iteration=booster.best_iteration).reshape(-1, 64),
        test=predict(prepared.test),
        details={
            "features": len(names),
            "trees": int(booster.best_iteration),
            "fit_seconds": round(time.time() - started, 1),
            "leans_on": _leans_on(names, booster.feature_importance(importance_type="gain")),
        },
        save=lambda directory: booster.save_model(str(directory / "model.txt")) and None,
    )


def move_rows(prepared: Prepared, index: np.ndarray, which: str, without=()) -> tuple[np.ndarray, list[str], np.ndarray]:
    """One row a legal move for the positions ``index`` names, a position's moves after each other in the
    order of its candidates: the position's own numbers (``features``), then where the move leaves and
    lands, what moves and what it lands on, and the marks the task lets a learner read on both squares.
    With ``hand``, what a person would count on the two squares and of the move. The third part says
    which of the positions each row belongs to."""
    numbers, names = features(prepared, which, without)
    dataset = prepared.dataset
    pairs = prepared.moves[index]
    held = pairs >= 0
    position = np.broadcast_to(np.arange(len(index))[:, None], pairs.shape)[held]
    flat = pairs[held].astype(np.int64)
    boards = index[position]
    shifts = np.array(prepared.mark_channels, dtype=np.uint16)
    parts = [
        numbers[boards],
        move_code.plain_of(dataset.tokens[boards], flat),
        ((dataset.marks[boards, flat // 64][:, None] >> shifts) & 1).astype(np.float32),
        ((dataset.marks[boards, flat % 64][:, None] >> shifts) & 1).astype(np.float32),
    ]
    names = (
        names
        + list(move_code.MOVE_PLAIN)
        + [f"from_{name}" for name in prepared.mark_names]
        + [f"to_{name}" for name in prepared.mark_names]
    )
    if which == "hand":
        counted = move_code.move_features_of(dataset.rows["fen"].gather(index).to_list())
        if len(counted) != len(flat):
            raise ValueError(f"{dataset.name}: the moves counted by hand are not the candidates of its rows")
        parts.append(counted)
        names += list(move_code.MOVE_HAND)
    return np.concatenate(parts, axis=1), names, position


def _fit_moves(prepared: Prepared, config: dict[str, Any], *, log) -> Fitted:
    """One booster that reads a row a legal move and says the chance that it is the move played. A position's
    chances are then scaled to add up to one."""
    import lightgbm as lgb

    learner = config["learner"]
    which, without = learner["features"], learner.get("without", ())
    rows = int((prepared.moves[prepared.train] >= 0).sum())
    if rows > MOST_MOVE_ROWS:
        raise ValueError(
            f"{prepared.task.name}: trees that read a row a legal move would train on {rows:,} rows. "
            f"Give the run a share of the training games (`data: {{train_share: ...}}`) that keeps them under "
            f"{MOST_MOVE_ROWS:,}"
        )

    def wanted(index: np.ndarray) -> np.ndarray:
        """1 on the row of the move played in each position, in the rows' own order."""
        held = prepared.moves[index] >= 0
        right = np.zeros(held.shape, dtype=np.float32)
        right[np.arange(len(index)), prepared.y[index]] = 1.0
        return right[held]

    started = time.time()
    x_train, names, _ = move_rows(prepared, prepared.train, which, without)
    x_valid, _, _ = move_rows(prepared, prepared.valid, which, without)
    log(f"gbm: {len(x_train):,} train and {len(x_valid):,} valid rows, one a legal move, of {len(names)} numbers")
    train = lgb.Dataset(x_train, wanted(prepared.train), feature_name=names)
    valid = lgb.Dataset(x_valid, wanted(prepared.valid), reference=train)
    booster = _boost(_params("binary", "binary_logloss", learner, int(config.get("seed", 0))), train, valid, learner)

    def chances(index: np.ndarray, x: np.ndarray) -> np.ndarray:
        """What the booster says of each move of the positions, scaled to add up to one a position."""
        held = prepared.moves[index] >= 0
        said = np.full(held.shape, np.nan)
        # A booster's chance is never nothing, so a position's always add up to something.
        said[held] = np.clip(booster.predict(x, num_iteration=booster.best_iteration), 1e-12, None)
        return said / np.nansum(said, axis=1, keepdims=True)

    def predict(index: np.ndarray) -> np.ndarray:
        parts = []
        for start in range(0, len(index), MOVES_AT_ONCE):
            chunk = index[start : start + MOVES_AT_ONCE]
            parts.append(chances(chunk, move_rows(prepared, chunk, which, without)[0]))
        return np.concatenate(parts) if parts else np.zeros((0, prepared.moves.shape[1]))

    return Fitted(
        valid=chances(prepared.valid, x_valid),
        test=predict(prepared.test),
        details={
            "features": len(names),
            "trees": int(booster.best_iteration),
            "fit_seconds": round(time.time() - started, 1),
            "leans_on": _leans_on(names, booster.feature_importance(importance_type="gain")),
        },
        save=lambda directory: booster.save_model(str(directory / "model.txt")) and None,
    )
