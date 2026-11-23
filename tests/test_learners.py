"""What a learner is given, and the learners that fit nothing: a column of the dataset read as the prediction, and
the rating formula."""

import numpy as np
import polars as pl
import pytest

from chess_coach_models import tasks
from chess_coach_models.data import store
from chess_coach_models.train import learners
from chess_coach_models.train.learners import base, column, rating_formula


ROWS = 600


def a_task(label: str) -> tasks.Task:
    return tasks.Task(
        name="tiny",
        dataset="tiny",
        kind="regression",
        label=label,
        unit="a unit",
        context=("mover_elo",),
        primary="rmse",
        reference="gbm-hand",
    )


def a_dataset() -> store.Dataset:
    rng = np.random.default_rng(0)
    index = np.arange(ROWS)
    rows = pl.DataFrame(
        {
            "key": [f"row{number:04d}" for number in index],
            "game_id": [f"game{number // 3:04d}" for number in index],
            "mover_elo": rng.integers(800, 2400, size=ROWS),
            "opponent_elo": rng.integers(800, 2400, size=ROWS),
            "win_before": rng.uniform(0, 100, size=ROWS),
            "mover_score": rng.choice([0.0, 0.5, 1.0], size=ROWS),
            "band": ["all"] * ROWS,
            "split": np.where(index % 5 == 0, "test", np.where(index % 5 == 1, "valid", "train")),
        }
    )
    empty = np.zeros((ROWS, 64), dtype=np.uint8)
    manifest = {"group": "game_id", "hand": ["win_before"], "marks": ["en_passant"]}
    return store.Dataset(name="tiny", rows=rows, tokens=empty, marks=empty.astype(np.uint16), manifest=manifest)


def test_a_column_is_read_as_the_prediction_with_nothing_fitted():
    dataset = a_dataset()
    prepared = learners.prepare(a_task("mover_score"), dataset)
    config = {"learner": {"kind": "column", "column": "win_before", "scale": 0.01}}
    fitted = learners.fit(prepared, config, log=lambda _: None)
    said = dataset.rows["win_before"].to_numpy() * 0.01
    assert np.array_equal(fitted.test, said[prepared.test]) and np.array_equal(fitted.valid, said[prepared.valid])
    assert fitted.details == {"column": "win_before", "scale": 0.01}
    as_it_is = column.fit(prepared, {"learner": {"kind": "column", "column": "win_before"}}, log=lambda _: None)
    assert np.array_equal(as_it_is.test, dataset.rows["win_before"].to_numpy()[prepared.test])


def test_the_rating_formula_gives_a_result_its_expected_score():
    dataset = a_dataset()
    prepared = learners.prepare(a_task("mover_score"), dataset)
    config = {"learner": {"kind": "rating-formula", "player": "mover_elo", "against": "opponent_elo"}}
    fitted = learners.fit(prepared, config, log=lambda _: None)
    gap = (dataset.rows["mover_elo"] - dataset.rows["opponent_elo"]).to_numpy()[prepared.test]
    assert np.allclose(fitted.test, 1 / (1 + 10 ** (-gap / 400)))
    assert ((fitted.test > 0) & (fitted.test < 1)).all()


def test_the_rating_formula_refuses_a_label_that_is_no_score():
    prepared = learners.prepare(a_task("mover_elo"), a_dataset())
    config = {"learner": {"kind": "rating-formula", "player": "mover_elo", "against": "opponent_elo"}}
    with pytest.raises(ValueError, match="yes-or-no label or a score from 0 to 1"):
        rating_formula.fit(prepared, config, log=lambda _: None)


def test_a_run_names_a_learner_the_lab_has():
    prepared = learners.prepare(a_task("mover_score"), a_dataset())
    with pytest.raises(ValueError, match="no learner named"):
        learners.fit(prepared, {"learner": {"kind": "oracle"}}, log=lambda _: None)


def a_puzzle_dataset() -> store.Dataset:
    """A dataset with hand features of four groups and three marks on its squares."""
    dataset = a_dataset()
    rng = np.random.default_rng(1)
    hand = ["material_count", "legal_moves", "hanging_own", "solver_moves", "line_checks", "first_check"]
    rows = dataset.rows.with_columns(pl.Series(name, rng.integers(0, 9, size=ROWS).astype(np.float64)) for name in hand)
    manifest = {"group": "game_id", "hand": hand, "marks": ["en_passant", "setup_to", "solver1_to"]}
    return store.Dataset(name="tiny", rows=rows, tokens=dataset.tokens, marks=dataset.marks, manifest=manifest)


def test_a_task_that_names_nothing_reads_all_the_dataset_has():
    prepared = learners.prepare(a_task("mover_score"), a_puzzle_dataset())
    assert prepared.hand_names == ["material_count", "legal_moves", "hanging_own", "solver_moves", "line_checks", "first_check"]
    assert (prepared.mark_names, prepared.mark_channels) == (["en_passant", "setup_to", "solver1_to"], [0, 1, 2])
    numbers, names = learners.features(prepared, "hand")
    assert names == ["mover_elo"] + prepared.hand_names and numbers.shape == (ROWS, 7)


def test_a_task_keeps_marks_and_hand_groups_from_its_learners():
    hidden = tasks.Task(**{**a_task("mover_score").__dict__, "marks": ("en_passant", "solver1_to"), "hand": ("material", "mobility")})
    prepared = learners.prepare(hidden, a_puzzle_dataset())
    assert prepared.hand_names == ["material_count", "legal_moves"] and prepared.hand.shape == (ROWS, 2)
    assert (prepared.mark_names, prepared.mark_channels) == (["en_passant", "solver1_to"], [0, 2])
    assert learners.features(prepared, "hand")[1] == ["mover_elo", "material_count", "legal_moves"]
    absent = tasks.Task(**{**hidden.__dict__, "marks": ("en_passant", "last_to")})
    with pytest.raises(ValueError, match="asks for last_to"):
        learners.prepare(absent, a_puzzle_dataset())


def a_game_dataset() -> store.Dataset:
    """A dataset whose rows are sequences of one, two or three positions, each with three numbers."""
    dataset = a_dataset()
    counts = np.tile([2, 3, 1], ROWS // 3)
    rows = dataset.rows.with_columns(pl.Series("steps", counts), pl.Series("first_step", np.cumsum(counts) - counts))
    positions = int(counts.sum())
    steps = store.Steps(
        tokens=np.zeros((positions, 64), dtype=np.uint8),
        marks=np.zeros((positions, 64), dtype=np.uint16),
        numbers=np.zeros((positions, 3), dtype=np.float32),
    )
    manifest = {**dataset.manifest, "steps": ["ply", "log_clock", "loss"]}
    store.check_steps(rows, steps, manifest)
    return store.Dataset(name="tiny", rows=rows, tokens=dataset.tokens, marks=dataset.marks, manifest=manifest, steps=steps)


def test_a_task_names_the_numbers_of_each_position_a_network_reads():
    whole = learners.prepare(a_task("mover_score"), a_game_dataset())
    assert (whole.step_names, whole.step_columns) == (["ply", "log_clock", "loss"], [0, 1, 2])
    some = tasks.Task(**{**a_task("mover_score").__dict__, "steps": ("loss", "ply")})
    prepared = learners.prepare(some, a_game_dataset())
    assert (prepared.step_names, prepared.step_columns) == (["loss", "ply"], [2, 0])
    with pytest.raises(ValueError, match="asks for weather"):
        learners.prepare(tasks.Task(**{**some.__dict__, "steps": ("loss", "weather")}), a_game_dataset())
    # A dataset of single positions has no such numbers, and says so to a task that asks for one.
    single = learners.prepare(a_task("mover_score"), a_dataset())
    assert (single.step_names, single.step_columns) == ([], [])
    with pytest.raises(ValueError, match="its rows are not sequences"):
        learners.prepare(some, a_dataset())


def test_a_run_leaves_groups_of_hand_features_out_and_never_the_context():
    in_context = tasks.Task(**{**a_task("mover_score").__dict__, "context": ("mover_elo", "solver_moves")})
    prepared = learners.prepare(in_context, a_puzzle_dataset())
    numbers, names = learners.features(prepared, "hand", ["line", "hanging"])
    assert names == ["mover_elo", "solver_moves", "material_count", "legal_moves", "first_check"]
    whole, all_names = learners.features(prepared, "hand")
    assert np.array_equal(numbers, whole[:, [all_names.index(name) for name in names]])
    with pytest.raises(ValueError, match="not weather"):
        learners.features(prepared, "hand", ["weather"])
    with pytest.raises(ValueError, match="no hand feature of the group pawns"):
        learners.features(prepared, "hand", ["pawns"])
    with pytest.raises(ValueError, match="only a run that reads the hand features"):
        learners.features(prepared, "context", ["line"])


def test_a_share_of_the_training_games_keeps_whole_games_and_sits_inside_a_larger_share():
    dataset = a_dataset()
    whole = learners.prepare(a_task("mover_score"), dataset)
    half = learners.prepare(a_task("mover_score"), dataset, train_share=0.5)
    quarter = learners.prepare(a_task("mover_score"), dataset, train_share=0.25)
    assert set(quarter.train) < set(half.train) < set(whole.train)
    assert 0.35 < len(half.train) / len(whole.train) < 0.65 and 0.15 < len(quarter.train) / len(whole.train) < 0.4
    assert np.array_equal(half.test, whole.test) and np.array_equal(half.valid, whole.valid)
    games = dataset.rows["game_id"].to_numpy()
    kept, dropped = set(games[half.train]), set(games[whole.train]) - set(games[half.train])
    assert kept and dropped and not kept & dropped
    assert np.array_equal(half.train, learners.prepare(a_task("mover_score"), dataset, train_share=0.5).train)
    assert base.share_of(np.array(["a", "a", "b"]), 1.0).all()
    for share in (0.0, 1.5, -0.1):
        with pytest.raises(ValueError, match="a share of the games"):
            learners.prepare(a_task("mover_score"), dataset, train_share=share)


def a_set_task(kind: str, **changes) -> tasks.Task:
    return tasks.Task(**{**a_task("themes").__dict__, "kind": kind, "primary": "ap", **changes})


def test_the_squares_that_are_right_are_the_ones_the_label_marks():
    dataset = a_puzzle_dataset()
    dataset.marks[0, 12] = 0b100
    dataset.marks[0, 20] = 0b110
    dataset.marks[0, 28] = 0b011
    dataset.marks[1, 5] = 0b001
    one = a_set_task("squares", label=("solver1_to",), marks=("en_passant", "setup_to"))
    prepared = learners.prepare(one, dataset)
    assert prepared.y.shape == (ROWS, 64) and prepared.y.dtype == np.uint8
    assert np.flatnonzero(prepared.y[0]).tolist() == [12, 20] and not prepared.y[1:].any()
    assert (prepared.mark_names, prepared.mark_channels) == (["en_passant", "setup_to"], [0, 1])
    both = a_set_task("squares", label=("setup_to", "solver1_to"), marks=("en_passant",))
    assert np.flatnonzero(base.labels(both, dataset)[0]).tolist() == [12, 20, 28]
    absent = a_set_task("squares", label=("solver1_to", "later"), marks=("en_passant",))
    with pytest.raises(ValueError, match="predicts later"):
        base.labels(absent, dataset)


def test_the_tags_that_are_right_are_the_whole_words_of_the_label():
    dataset = a_dataset()
    words = ["fork pin", "", None, "mateIn2 fork", "pinned"] + ["quietMove"] * (ROWS - 5)
    tagged = store.Dataset(
        name="tiny",
        rows=dataset.rows.with_columns(pl.Series("themes", words)),
        tokens=dataset.tokens,
        marks=dataset.marks,
        manifest=dataset.manifest,
    )
    prepared = learners.prepare(a_set_task("tags", tags=("fork", "pin", "skewer")), tagged)
    assert prepared.y.shape == (ROWS, 3) and prepared.y.dtype == np.uint8
    assert prepared.y[:5].tolist() == [[1, 1, 0], [0, 0, 0], [0, 0, 0], [1, 0, 0], [0, 0, 0]]
    assert not prepared.y[5:].any()


def test_the_floor_of_a_set_gives_every_row_each_candidates_share_of_the_training_rows():
    dataset = a_dataset()
    rng = np.random.default_rng(2)
    words = [" ".join(tag for tag, chance in (("fork", 0.5), ("pin", 0.1)) if rng.random() < chance) for _ in range(ROWS)]
    tagged = store.Dataset(
        name="tiny",
        rows=dataset.rows.with_columns(pl.Series("themes", words)),
        tokens=dataset.tokens,
        marks=dataset.marks,
        manifest=dataset.manifest,
    )
    prepared = learners.prepare(a_set_task("tags", tags=("fork", "pin", "skewer")), tagged)
    fitted = learners.fit(prepared, {"learner": {"kind": "constant"}}, log=lambda _: None)
    shares = prepared.y[prepared.train].mean(axis=0)
    assert fitted.test.shape == (len(prepared.test), 3) and fitted.valid.shape == (len(prepared.valid), 3)
    assert np.allclose(fitted.test, shares) and np.allclose(fitted.valid, shares)
    assert 0.4 < shares[0] < 0.6 and 0.03 < shares[1] < 0.2 and shares[2] == 0.0
    assert fitted.details == {"shares": {"fork": round(float(shares[0]), 6), "pin": round(float(shares[1]), 6), "skewer": 0.0}}


def a_position_dataset(games: int = 40, plies: int = 12) -> store.Dataset:
    """Positions from games of random legal moves, each with the move played there, as ``game-positions`` holds them."""
    import random

    import chess

    from chess_coach_models.encode.board import encode_positions, white_to_move
    from chess_coach_models.data.positions import MARKS, last_move_marks

    rng = random.Random(0)
    found = []
    for game in range(games):
        board = chess.Board()
        last = ""
        for ply in range(plies):
            move = rng.choice(sorted(board.legal_moves, key=lambda one: one.uci()))
            if ply >= 2:
                found.append((f"game{game:03d}", ply, board.fen(), last, move.uci()))
            last = move.uci()
            board.push(move)
    tokens, marks, _ = encode_positions(
        [row[2] for row in found], (last_move_marks(row[3], white_to_move(row[2])) for row in found)
    )
    count = len(found)
    rows = pl.DataFrame(
        {
            "key": [f"{row[0]}#{row[1]}" for row in found],
            "game_id": [row[0] for row in found],
            "fen": [row[2] for row in found],
            "last_move": [row[3] for row in found],
            "move": [row[4] for row in found],
            "mover_elo": [800 + 37 * (number % 40) for number in range(count)],
            "opponent_elo": [900 + 31 * (number % 40) for number in range(count)],
            "legal_moves": [float(chess.Board(row[2]).legal_moves.count()) for row in found],
            "band": ["all"] * count,
            "split": [("test", "valid", "train", "train", "train")[int(row[0][4:]) % 5] for row in found],
        }
    )
    manifest = {"group": "game_id", "hand": ["legal_moves"], "marks": list(MARKS)}
    return store.Dataset(name="tiny-positions", rows=rows, tokens=tokens, marks=marks, manifest=manifest)


def a_move_task(**changes) -> tasks.Task:
    return tasks.Task(**{**a_task("move").__dict__, "kind": "moves", "primary": "top1", **changes})


def test_the_move_played_is_one_of_the_row_s_own_candidates():
    import chess

    from chess_coach_models.encode.moves import pair_of, pairs_of

    dataset = a_position_dataset()
    prepared = learners.prepare(a_move_task(), dataset)
    fens, played = dataset.rows["fen"].to_list(), dataset.rows["move"].to_list()
    assert prepared.moves.shape[0] == len(fens) == 400 and prepared.moves.dtype == np.int16
    assert prepared.y.shape == (400,) and prepared.y.dtype.kind == "i"
    for row in (0, 57, 399):
        board = chess.Board(fens[row])
        held = prepared.moves[row][prepared.moves[row] >= 0].tolist()
        assert held == pairs_of(board) and len(held) == board.legal_moves.count()
        assert prepared.moves[row, prepared.y[row]] == pair_of(played[row], board.turn == chess.WHITE)
    assert learners.prepare(a_task("mover_elo"), dataset).moves is None
    wrong = store.Dataset(
        name="tiny-positions",
        rows=dataset.rows.with_columns(pl.Series("move", ["a1a8"] + played[1:])),
        tokens=dataset.tokens,
        marks=dataset.marks,
        manifest=dataset.manifest,
    )
    with pytest.raises(ValueError, match="1 rows name a move their position does not allow, the first game000#2: a1a8"):
        learners.prepare(a_move_task(), wrong)
    with pytest.raises(ValueError, match="does not hold one position a row"):
        learners.prepare(a_move_task(label="mover_elo"), a_dataset())


def test_the_floor_of_a_move_gives_every_legal_move_the_same_chance():
    dataset = a_position_dataset()
    prepared = learners.prepare(a_move_task(), dataset)
    fitted = learners.fit(prepared, {"learner": {"kind": "constant"}}, log=lambda _: None)
    held = prepared.moves[prepared.test] >= 0
    assert fitted.test.shape == held.shape and np.array_equal(~np.isnan(fitted.test), held)
    assert np.nansum(fitted.test, axis=1) == pytest.approx(1.0)
    assert np.nanmax(fitted.test, axis=1) == pytest.approx(1.0 / held.sum(axis=1))
    assert np.nanmin(fitted.test, axis=1) == pytest.approx(1.0 / held.sum(axis=1))
    choices = (prepared.moves[prepared.train] >= 0).sum(axis=1)
    assert fitted.details == {"legal_moves": {"mean": round(float(choices.mean()), 3), "most": int(choices.max())}}


def test_trees_that_predict_the_move_read_a_row_a_legal_move():
    from chess_coach_models.encode.moves import MOVE_HAND, MOVE_PLAIN, move_features, plain_of
    from chess_coach_models.train.learners import gbm

    import chess

    dataset = a_position_dataset()
    prepared = learners.prepare(a_move_task(marks=("en_passant", "last_to")), dataset)
    index = prepared.test[:7]
    held = prepared.moves[index] >= 0
    plain, names, position = gbm.move_rows(prepared, index, "context")
    assert names == ["mover_elo", *MOVE_PLAIN, "from_en_passant", "from_last_to", "to_en_passant", "to_last_to"]
    assert plain.shape == (int(held.sum()), len(names)) and plain.dtype == np.float32
    # A position's moves follow each other in the order of its candidates, and each row says whose it is.
    assert position.tolist() == np.repeat(np.arange(7), held.sum(axis=1)).tolist()
    first = index[0]
    own = prepared.moves[first][held[0]].astype(np.int64)
    assert np.array_equal(plain[: len(own), 1:9], plain_of(np.repeat(dataset.tokens[first][None], len(own), axis=0), own))
    assert (plain[: len(own), 0] == dataset.rows["mover_elo"][int(first)]).all()
    # The square the opponent's last move reached is marked on the moves that land there, and on no other.
    last_to = (dataset.marks[first] >> 2) & 1
    assert np.array_equal(plain[: len(own), names.index("to_last_to")], last_to[own % 64])
    assert np.array_equal(plain[: len(own), names.index("from_last_to")], last_to[own // 64])
    counted, names, _ = gbm.move_rows(prepared, index, "hand")
    assert names[-len(MOVE_HAND) :] == list(MOVE_HAND) and "legal_moves" in names
    assert counted.shape == (int(held.sum()), len(plain[0]) + 1 + len(MOVE_HAND))
    assert np.array_equal(counted[: len(own), -len(MOVE_HAND) :], move_features(chess.Board(dataset.rows["fen"][int(first)])))
