import io

import numpy as np
import pandas as pd
import torch

from chess_coach_models.config import load_config
from chess_coach_models.concepts import (
    ConceptHead,
    evaluate_concept_head,
    game_id_from_url,
    labels_matrix,
    puzzle_position,
    sample_puzzles,
    theme_vocabulary,
    train_concept_head,
)


CSV_HEADER = (
    "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags\n"
)
# Scholar's mate: after the setup blunder 3...Nf6??, White mates with Qxf7#.
SCHOLARS_FEN = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3"
ROW_TEMPLATE = (
    "{pid}," + SCHOLARS_FEN + ","
    "g8f6 h5f7,{rating},80,95,{plays},{themes},https://lichess.org/{game}#8,Italian_Game\n"
)


def _csv(rows: list[str]) -> io.StringIO:
    return io.StringIO(CSV_HEADER + "".join(rows))


def test_puzzle_position_applies_the_setup_move() -> None:
    result = puzzle_position(SCHOLARS_FEN, "g8f6 h5f7")
    assert result is not None
    position, solution = result
    # The solver faces the position after 3...Nf6, with White to move.
    assert position.split()[1] == "w"
    assert position.split()[0].split("/")[2] == "2n2n2"
    assert solution == "h5f7"
    assert puzzle_position("invalid fen", "e2e4 e7e5") is None
    # A single-token movetext has no solver move.
    assert puzzle_position(SCHOLARS_FEN, "a7a5") is None
    # An illegal setup move invalidates the row (rook through its own pawn).
    assert puzzle_position(SCHOLARS_FEN, "a8a6 h5f7") is None


def test_game_id_from_url_variants() -> None:
    assert game_id_from_url("https://lichess.org/AbCd1234/black#56") == "AbCd1234"
    assert game_id_from_url("https://lichess.org/AbCd1234#56") == "AbCd1234"
    assert game_id_from_url("https://lichess.org/AbCd1234/white") == "AbCd1234"


def test_sampling_filters_and_reservoir_are_deterministic() -> None:
    config = load_config()
    config["concepts"]["max_puzzles"] = 3
    config["concepts"]["min_plays"] = 100
    rows = [
        ROW_TEMPLATE.format(
            pid=f"p{i}", rating=1400 + i, plays=500, themes="fork mate short", game=f"game{i}"
        )
        for i in range(6)
    ]
    rows.append(
        ROW_TEMPLATE.format(
            pid="lowplays", rating=1400, plays=50, themes="fork", game="gameX"
        )
    )
    rows.append(
        ROW_TEMPLATE.format(
            pid="onlyexcluded", rating=1400, plays=500, themes="short veryLong", game="gameY"
        )
    )
    sampled_a, stats_a = sample_puzzles(_csv(rows), config)
    sampled_b, _ = sample_puzzles(_csv(rows), config)
    assert sampled_a == sampled_b
    assert stats_a.rows_read == 8
    # The low-plays row and the row with only excluded themes never qualify.
    assert stats_a.rows_eligible == 6
    assert stats_a.rows_sampled == 3
    # Excluded themes are stripped before storage, so 'short' never appears.
    assert all("short" not in record["themes"] for record in sampled_a)
    assert stats_a.theme_counts.get("short") is None


def test_theme_vocabulary_threshold() -> None:
    assert theme_vocabulary({"fork": 10, "pin": 3}, 5) == ["fork"]


def test_labels_matrix_maps_only_vocabulary_themes() -> None:
    matrix = labels_matrix(["fork pin", "pin", "skewer"], ["fork", "pin"])
    assert matrix.tolist() == [[1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]


def test_head_learns_separable_synthetic_concepts() -> None:
    config = load_config()
    config["concepts"].update(
        {
            "hidden_dim": 0,
            "epochs": 80,
            "batch_size": 64,
            "early_stopping_patience": 80,
            "learning_rate": 0.02,
        }
    )
    rng = np.random.default_rng(0)
    n = 600
    embeddings = rng.normal(size=(n, 8)).astype(np.float32)
    labels = (embeddings[:, :2] > 0).astype(np.float32)
    splits = pd.Series(
        ["train"] * 400 + ["validation"] * 100 + ["test"] * 100
    )
    head, info = train_concept_head(embeddings, labels, splits, config)
    assert info["best_val_macro_ap"] > 0.9
    test_mask = (splits == "test").to_numpy()
    evaluation = evaluate_concept_head(
        head, embeddings[test_mask], labels[test_mask], ["a", "b"]
    )
    assert evaluation["macro_average_precision"] > 0.9
    assert evaluation["macro_average_precision"] > evaluation["macro_prevalence_baseline"]


def test_concept_head_linear_and_mlp_shapes() -> None:
    linear = ConceptHead(16, 0, 3)
    mlp = ConceptHead(16, 8, 3)
    batch = torch.zeros((4, 16))
    assert linear(batch).shape == (4, 3)
    assert mlp(batch).shape == (4, 3)
