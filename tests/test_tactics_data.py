"""Puzzles joined to their games: the export's movetext, the label, and rows built from real ones.

``fixtures/puzzles_with_games_sample.parquet`` is the first 160 rows of the source's first file, with the columns
the builder reads and nothing changed.
"""

from pathlib import Path

import chess
import polars as pl
import pytest

from chess_coach_models.data import store, tactics
from chess_coach_models.data.games import parse_export, parse_movetext
from chess_coach_models.encode.board import square
from chess_coach_models.encode.hand import LINE_FEATURES, POSITION_FEATURES


FIXTURE = Path(__file__).parent / "fixtures" / "puzzles_with_games_sample.parquet"
FILTERS = {"max_rating_deviation": 500, "min_plays": 0, "speeds": ["blitz", "rapid", "classical"]}
RECIPE = {
    "name": "tactics-test",
    "builder": "tactics",
    "source": "https://huggingface.co/datasets/Lichess/chess-puzzles-with-games",
    "revision": "test",
    "files": 1,
    "filters": FILTERS,
    "sample": 1.0,
    "split": {"salt": "test", "valid": 0.2, "test": 0.2},
}
PLAIN = (
    "1. e4 { [%eval 0.20] [%clk 0:10:00] } e5 { [%eval 0.10] [%clk 0:10:00] } "
    "2. Qh5 { [%eval -0.20] [%clk 0:09:55] } Nc6 { [%eval 0.00] [%clk 0:09:57] } "
    "3. Bc4 { [%eval 0.20] [%clk 0:09:50] } Nf6?? { [%eval 4.00] [%clk 0:09:53] } "
    "4. Qxf7# { [%eval #1] [%clk 0:09:46] } 1-0"
)
EXPORT = (
    "1. e4 { [%eval 0.2] [%clk 0:10:00] } 1... e5 { [%eval 0.1] [%clk 0:10:00] } "
    "2. Qh5?! { (0.10 → -0.20) Inaccuracy. Nf3 was best. } { [%eval -0.2] [%clk 0:09:55] } (2. Nf3 Nc6 3. Bb5 a6) "
    "2... Nc6 { [%eval 0.0] [%clk 0:09:57] } { C20 King's Pawn Game: Wayward Queen Attack } "
    "3. Bc4 { [%eval 0.2] [%clk 0:09:50] } "
    "3... Nf6?? { (0.20 → Mate in 1) Checkmate is now unavoidable. g6 was best. } { [%eval #1] [%clk 0:09:53] } "
    "(3... g6 4. Qf3 Nf6) 4. Qxf7# { [%clk 0:09:46] } 1-0"
)
BEFORE_THE_MISTAKE = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3"


def item(movetext: str = EXPORT, *, game: str = "tinygame#6", fen: str = BEFORE_THE_MISTAKE) -> tuple:
    return ("tiny1", fen, "g8f6 h5f7", 600, 80, 5000, "mate mateIn1 short", game, 1250, 1300, 600, 5, "rapid", movetext)


def test_the_export_keeps_only_the_games_own_moves():
    plies = parse_export(EXPORT)
    assert [ply.san for ply in plies] == ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]
    assert plies[2].eval_cp_white == pytest.approx(-20.0) and plies[2].clock == 595.0
    assert plies[3].eval_cp_white == 0.0 and plies[3].clock == 597.0
    assert plies[5].eval_cp_white == 10_000
    assert plies[6].eval_cp_white is None and plies[6].clock == 586.0


def test_the_export_reader_agrees_with_the_database_reader_on_a_database_game():
    assert parse_export(PLAIN) == parse_movetext(PLAIN)
    assert parse_export("") == []


def test_a_puzzle_names_its_game_and_the_ply_that_sets_it_up():
    assert tactics.game_and_ply("AiNXhpcc#27") == ("AiNXhpcc", 27)
    assert tactics.game_and_ply("NcD6lul8/black#50") == ("NcD6lul8", 50)
    assert tactics.game_and_ply("AiNXhpcc") is None
    assert tactics.game_and_ply("AiNXhpcc#1") is None
    assert tactics.game_and_ply("#27") is None


def test_a_row_carries_what_the_player_knew_and_what_he_did():
    row = tactics.example(item())
    assert row["key"] == "tiny1" and row["game_id"] == "tinygame" and row["ply"] == 7
    assert row["fen"].split(" ")[:2] == ["r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR", "w"]
    assert row["setup"] == "g8f6" and row["line"] == "h5f7" and row["played"] == "h5f7"
    assert row["found"] == 1
    assert row["mover_elo"] == 1250 and row["opponent_elo"] == 1300
    assert row["clock"] == 590.0 and row["opponent_clock"] == 593.0 and row["spent"] == 9.0
    assert 50 < row["win_prior"] < 60 and row["win_before"] > 95
    assert row["rating"] == 600 and row["themes"] == "mate mateIn1 short" and row["speed"] == "rapid"
    assert row["solver_moves"] == 1 and row["ends_in_mate"] == 1 and row["first_capture"] == 1
    assert set(POSITION_FEATURES + LINE_FEATURES) <= set(row)


def test_another_move_lets_the_tactic_go():
    quiet = EXPORT.replace("4. Qxf7# { [%clk 0:09:46] } 1-0", "4. d3 { [%eval -0.3] [%clk 0:09:40] } 4... g6")
    row = tactics.example(item(quiet))
    assert row["played"] == "d2d3" and row["found"] == 0 and row["spent"] == 15.0


def test_any_mate_counts_when_the_tactic_mates_at_once():
    board = chess.Board("7k/6pp/8/8/8/8/5PPP/RR4K1 w - - 0 1")
    first = chess.Move.from_uci("a1a8")
    assert tactics.found(board, first, first)
    assert tactics.found(board, first, chess.Move.from_uci("b1b8"))
    assert not tactics.found(board, first, chess.Move.from_uci("g2g3"))
    longer = chess.Board("6k1/5ppp/8/8/8/8/1q3PPP/1R4K1 b - - 0 1")
    assert not tactics.found(longer, chess.Move.from_uci("b2f2"), chess.Move.from_uci("b2b1"))


def test_a_row_that_cannot_be_read_says_why():
    ended = EXPORT.replace(" 4. Qxf7# { [%clk 0:09:46] } 1-0", " 0-1")
    assert tactics.example(item(ended)) == "no reply"
    assert tactics.example(item(EXPORT.replace(" [%clk 0:09:50]", ""))) == "no clock"
    assert tactics.example(item(EXPORT.replace("[%eval 0.2] [%clk 0:09:50]", "[%clk 0:09:50]"))) == "no evaluation"
    assert tactics.example(item(game="tinygame#8")) == "unreadable"
    assert tactics.example(item(EXPORT.replace("3... Nf6??", "3... d6??"))) == "unreadable"
    assert tactics.example(item(game="tinygame")) == "unreadable"
    assert set(tactics.DROPPED) == {"no reply", "no clock", "no evaluation", "unreadable"}


def test_the_recipe_keeps_wanted_speeds_settled_ratings_and_people():
    source = pl.read_parquet(FIXTURE)
    assert len(source) == 160 and set(tactics.COLUMNS) == set(source.columns)
    loose = tactics.candidates(source, FILTERS)
    assert len(loose) == 157 and len(loose.columns) == 14
    assert len(tactics.candidates(source, {**FILTERS, "speeds": ["rapid"]})) == int((source["speed"] == "rapid").sum())
    settled = tactics.candidates(source, {**FILTERS, "max_rating_deviation": 100, "min_plays": 100})
    assert 0 < len(settled) < len(loose)
    assert settled["RatingDeviation"].max() <= 100 and settled["NbPlays"].min() >= 100
    bots = source.with_columns(pl.lit("BOT").alias("WhiteTitle"))
    assert len(tactics.candidates(bots, FILTERS)) == 0


def test_real_rows_match_their_games():
    rows = [tactics.example(row) for row in tactics.candidates(pl.read_parquet(FIXTURE), FILTERS).iter_rows()]
    assert all(isinstance(row, dict) for row in rows)
    by_key = {row["key"]: row for row in rows}
    found = by_key["00K8j"]
    assert found["game_id"] == "AiNXhpcc" and found["ply"] == 28
    assert found["setup"] == "f4c7" and found["played"] == "d8c7" and found["found"] == 1
    assert found["mover_elo"] == 1923 and found["opponent_elo"] == 1910
    assert found["base"] == 600 and found["increment"] == 5
    assert found["clock"] == 587.0 and found["opponent_clock"] == 424.0 and found["spent"] == 11.0
    assert found["win_prior"] < 50 < found["win_before"]
    missed = by_key["00H2L"]
    assert missed["line"].split()[0] == "c6c5" and missed["played"] == "b4a4" and missed["found"] == 0
    assert 0.5 < sum(row["found"] for row in rows) / len(rows) < 0.8


def test_a_dataset_is_built_from_the_file(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "PROCESSED", tmp_path / "processed")
    rows, tokens, marks, manifest = tactics.build(RECIPE, source=str(FIXTURE), workers=2, log=lambda _: None)
    store.write_dataset(RECIPE["name"], rows, tokens, marks, manifest)
    dataset = store.read_dataset("tactics-test")
    assert len(dataset.rows) == len(dataset.tokens) == len(dataset.marks) == 157
    assert dataset.manifest["source_rows_read"] == 160 and dataset.manifest["passed_recipe"] == 157
    assert dataset.manifest["passed_recipe"] == 157 + sum(dataset.manifest["dropped"].values())
    assert dataset.manifest["found"] == int(dataset.rows["found"].sum())
    assert dataset.manifest["group"] == "game_id" and dataset.manifest["marks"][1] == "setup_from"
    assert dataset.manifest["fingerprint"] == store.fingerprint(dataset.rows, dataset.tokens, dataset.marks)
    assert set(dataset.rows["split"].unique()) == {"train", "valid", "test"}
    assert dataset.rows.group_by("game_id").agg(pl.col("split").n_unique())["split"].max() == 1
    assert set(dataset.rows["band"].unique()) <= {name for _, name in tactics.BANDS}
    assert dataset.rows.null_count().sum_horizontal().item() == 0
    row = dataset.rows.row(by_predicate=pl.col("key") == "00K8j", named=True)
    position = dataset.rows["key"].to_list().index("00K8j")
    white = row["fen"].split(" ")[1] == "w"
    setup_to = dataset.manifest["marks"].index("setup_to")
    assert dataset.marks[position, square("c7", white)] >> setup_to & 1
    assert row["log_clock"] == pytest.approx(6.3767, abs=1e-3)


def test_a_limit_stops_the_read_and_a_missing_file_stops_the_build():
    capped = {**RECIPE, "source_rows": 50}
    rows, _, _, manifest = tactics.build(capped, source=str(FIXTURE), workers=1, log=lambda _: None)
    assert manifest["source_rows_read"] == 50 and manifest["recipe"]["source_rows"] == 50 and 0 < len(rows) <= 50
    with pytest.raises(ValueError, match="reads 2 files"):
        tactics.build({**RECIPE, "files": 2}, source=str(FIXTURE), workers=1, log=lambda _: None)
