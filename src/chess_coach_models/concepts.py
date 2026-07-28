"""Concept tagger (model #6): position -> human concept vocabulary.

A multi-label head on frozen Maia2 penultimate activations, supervised by
Lichess puzzle themes. Puzzle semantics matter: the CSV's FEN is the position
*before* the opponent's setup move, so the tagged position is FEN with
``Moves[0]`` applied — the position the solver actually faces. Themes cover
tactical vocabulary well; positional concepts are out of scope for this
supervised path and tracked separately.
"""

from __future__ import annotations

import csv
import json
import random
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, TextIO

import chess
import numpy as np
import pandas as pd
import torch

from .config import project_path
from .splitting import group_stratified_split


PUZZLE_BAND_EDGES = (
    # Puzzle-difficulty strata for the split; puzzle ratings are not player
    # ratings, so these buckets exist only to balance difficulty across splits.
    ("<1200", 1199),
    ("1200-1600", 1599),
    ("1600-2000", 1999),
    ("2000+", 10_000),
)


def puzzle_band(rating: int) -> str:
    for name, upper in PUZZLE_BAND_EDGES:
        if rating <= upper:
            return name
    return PUZZLE_BAND_EDGES[-1][0]


def puzzle_position(fen: str, moves: str) -> tuple[str, str] | None:
    """Return (position the solver faces, first solution move in UCI).

    The Lichess puzzle CSV stores the position one ply before the puzzle: the
    first token of ``Moves`` is the opponent's setup move and the second is
    the solver's first move. Returns None for malformed rows.
    """
    tokens = moves.split()
    if len(tokens) < 2:
        return None
    try:
        board = chess.Board(fen)
        setup = chess.Move.from_uci(tokens[0])
        if setup not in board.legal_moves:
            return None
        board.push(setup)
        solution = chess.Move.from_uci(tokens[1])
        if solution not in board.legal_moves:
            return None
    except ValueError:
        return None
    return board.fen(), tokens[1]


def game_id_from_url(url: str) -> str:
    """Extract the source game id from a GameUrl like lichess.org/AbCd1234/black#56."""
    path = url.split("#", 1)[0].rstrip("/")
    tail = path.rsplit("/", 1)[-1]
    if tail in {"white", "black"}:
        tail = path.rsplit("/", 2)[-2]
    return tail


@dataclass
class PuzzleStats:
    rows_read: int = 0
    rows_eligible: int = 0
    rows_sampled: int = 0
    rows_malformed: int = 0
    theme_counts: dict[str, int] = field(default_factory=dict)


def sample_puzzles(
    handle: TextIO, config: dict[str, Any]
) -> tuple[list[dict[str, Any]], PuzzleStats]:
    """Seeded uniform reservoir over eligible puzzles from the CSV stream.

    Uniform sampling preserves natural theme prevalence, which keeps the
    prevalence baselines in the evaluation honest.
    """
    cfg = config["concepts"]
    max_puzzles = int(cfg["max_puzzles"])
    min_plays = int(cfg["min_plays"])
    exclude = set(cfg["exclude_themes"])
    rng = random.Random(int(config["seed"]))
    stats = PuzzleStats()
    reservoir: list[dict[str, Any]] = []

    reader = csv.DictReader(handle)
    for row in reader:
        stats.rows_read += 1
        try:
            plays = int(row["NbPlays"])
            rating = int(row["Rating"])
        except (KeyError, TypeError, ValueError):
            stats.rows_malformed += 1
            continue
        themes = [
            theme for theme in (row.get("Themes") or "").split() if theme not in exclude
        ]
        if plays < min_plays or not themes:
            continue
        # csv.DictReader fills missing trailing fields with None on short
        # (truncated) rows, so "or" guards every string field.
        position = puzzle_position(row.get("FEN") or "", row.get("Moves") or "")
        if position is None:
            stats.rows_malformed += 1
            continue
        stats.rows_eligible += 1
        record = {
            "puzzle_id": row.get("PuzzleId", ""),
            "fen": position[0],
            "solution_uci": position[1],
            "puzzle_rating": rating,
            "rating_band": puzzle_band(rating),
            "popularity": int(row.get("Popularity") or 0),
            "nb_plays": plays,
            "themes": " ".join(themes),
            "game_id": game_id_from_url(row.get("GameUrl") or ""),
        }
        if len(reservoir) < max_puzzles:
            reservoir.append(record)
        else:
            replacement = rng.randrange(stats.rows_eligible)
            if replacement < max_puzzles:
                reservoir[replacement] = record

    stats.rows_sampled = len(reservoir)
    for record in reservoir:
        for theme in record["themes"].split():
            stats.theme_counts[theme] = stats.theme_counts.get(theme, 0) + 1
    return reservoir, stats


def theme_vocabulary(
    theme_counts: dict[str, int], min_theme_count: int
) -> list[str]:
    return sorted(
        theme for theme, count in theme_counts.items() if count >= min_theme_count
    )


class MaiaEmbedder:
    """Frozen Maia2 penultimate activations (last_ln output, 1024-dim)."""

    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.model = None

    def _load(self) -> None:
        if self.model is not None:
            return
        from maia2.model import from_pretrained

        maia_cfg = self.config["maia2"]
        save_root = project_path(self.config, maia_cfg["weights_dir"])
        save_root.mkdir(parents=True, exist_ok=True)
        self.model = from_pretrained(
            str(maia_cfg.get("model_type", "rapid")),
            device=str(self.config["concepts"].get("device", "cpu")),
            save_root=str(save_root),
        )

    def embed(self, fens: list[str], filler_moves: list[str]) -> np.ndarray:
        """Row-aligned embeddings. Conditioning Elo is fixed so the concept
        head stays rating-independent; the filler move only satisfies the
        maia2 batch interface and never influences the embedding."""
        self._load()
        from maia2.inference import inference_batch

        cfg = self.config["concepts"]
        elo = int(cfg["conditioning_elo"])
        captured: list[torch.Tensor] = []
        hook = self.model.last_ln.register_forward_hook(
            lambda module, args, output: captured.append(output.detach())
        )
        try:
            frame = pd.DataFrame(
                {
                    "board": fens,
                    "move": filler_moves,
                    "active_elo": elo,
                    "opponent_elo": elo,
                }
            )
            inference_batch(
                frame,
                self.model,
                verbose=False,
                batch_size=int(cfg["embed_batch_size"]),
                num_workers=0,
            )
        finally:
            hook.remove()
        return torch.cat(captured).cpu().numpy().astype(np.float32)


class ConceptHead(torch.nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int) -> None:
        super().__init__()
        if hidden_dim > 0:
            self.network = torch.nn.Sequential(
                torch.nn.Linear(input_dim, hidden_dim),
                torch.nn.ReLU(),
                torch.nn.Linear(hidden_dim, output_dim),
            )
        else:
            self.network = torch.nn.Linear(input_dim, output_dim)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.network(features)


def labels_matrix(theme_lists: Iterable[str], vocabulary: list[str]) -> np.ndarray:
    index = {theme: position for position, theme in enumerate(vocabulary)}
    matrix = np.zeros((len(list_ := list(theme_lists)), len(vocabulary)), dtype=np.float32)
    for row, themes in enumerate(list_):
        for theme in themes.split():
            if theme in index:
                matrix[row, index[theme]] = 1.0
    return matrix


def _average_precision(labels: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(-scores, kind="stable")
    sorted_labels = labels[order]
    positives = sorted_labels.sum()
    if positives == 0:
        return 0.0
    cumulative = np.cumsum(sorted_labels)
    precision = cumulative / np.arange(1, len(sorted_labels) + 1)
    return float((precision * sorted_labels).sum() / positives)


def train_concept_head(
    embeddings: np.ndarray,
    labels: np.ndarray,
    splits: pd.Series,
    config: dict[str, Any],
) -> tuple[ConceptHead, dict[str, Any]]:
    cfg = config["concepts"]
    torch.manual_seed(int(config["seed"]))
    train_mask = (splits == "train").to_numpy()
    val_mask = (splits == "validation").to_numpy()
    head = ConceptHead(embeddings.shape[1], int(cfg["hidden_dim"]), labels.shape[1])
    optimizer = torch.optim.Adam(head.parameters(), lr=float(cfg["learning_rate"]))
    loss_fn = torch.nn.BCEWithLogitsLoss()
    x_train = torch.from_numpy(embeddings[train_mask])
    y_train = torch.from_numpy(labels[train_mask])
    x_val = torch.from_numpy(embeddings[val_mask])
    y_val = labels[val_mask]
    batch_size = int(cfg["batch_size"])
    patience = int(cfg["early_stopping_patience"])
    generator = torch.Generator().manual_seed(int(config["seed"]))
    best_state = None
    best_val = -1.0
    stale = 0
    history: list[dict[str, float]] = []

    for epoch in range(int(cfg["epochs"])):
        head.train()
        order = torch.randperm(len(x_train), generator=generator)
        epoch_loss = 0.0
        for start in range(0, len(order), batch_size):
            batch = order[start : start + batch_size]
            optimizer.zero_grad()
            loss = loss_fn(head(x_train[batch]), y_train[batch])
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.detach()) * len(batch)
        head.eval()
        with torch.no_grad():
            val_scores = torch.sigmoid(head(x_val)).numpy()
        val_ap = float(
            np.mean(
                [
                    _average_precision(y_val[:, column], val_scores[:, column])
                    for column in range(y_val.shape[1])
                ]
            )
        )
        history.append(
            {"epoch": epoch, "train_loss": epoch_loss / len(x_train), "val_macro_ap": val_ap}
        )
        print(
            f"epoch={epoch} loss={epoch_loss / len(x_train):.4f} val_macro_ap={val_ap:.4f}",
            file=sys.stderr,
        )
        if val_ap > best_val:
            best_val = val_ap
            best_state = {k: v.clone() for k, v in head.state_dict().items()}
            stale = 0
        else:
            stale += 1
            if stale >= patience:
                break

    if best_state is not None:
        head.load_state_dict(best_state)
    head.eval()
    return head, {"best_val_macro_ap": best_val, "history": history}


def evaluate_concept_head(
    head: ConceptHead,
    embeddings: np.ndarray,
    labels: np.ndarray,
    vocabulary: list[str],
) -> dict[str, Any]:
    with torch.no_grad():
        scores = torch.sigmoid(head(torch.from_numpy(embeddings))).numpy()
    per_theme: dict[str, Any] = {}
    for column, theme in enumerate(vocabulary):
        theme_labels = labels[:, column]
        prevalence = float(theme_labels.mean())
        ap = _average_precision(theme_labels, scores[:, column])
        per_theme[theme] = {
            "n_positive": int(theme_labels.sum()),
            "prevalence": round(prevalence, 4),
            "average_precision": round(ap, 4),
            "lift": round(ap / prevalence, 2) if prevalence > 0 else None,
        }
    macro_ap = float(
        np.mean([values["average_precision"] for values in per_theme.values()])
    )
    macro_prevalence = float(
        np.mean([values["prevalence"] for values in per_theme.values()])
    )
    micro_ap = _average_precision(labels.ravel(), scores.ravel())
    return {
        "n_positions": int(len(labels)),
        "n_themes": len(vocabulary),
        "macro_average_precision": round(macro_ap, 4),
        "macro_prevalence_baseline": round(macro_prevalence, 4),
        "micro_average_precision": round(micro_ap, 4),
        "micro_prevalence_baseline": round(float(labels.mean()), 4),
        "per_theme": per_theme,
    }


def build_dataset(handle: TextIO, config: dict[str, Any]) -> dict[str, Any]:
    """Stream the puzzle CSV, sample, and persist the labeled dataset."""
    started = time.monotonic()
    records, stats = sample_puzzles(handle, config)
    cfg = config["concepts"]
    frame = pd.DataFrame(records)
    dataset_path = project_path(config, cfg["dataset_path"])
    dataset_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(dataset_path, compression="zstd")
    vocabulary = theme_vocabulary(stats.theme_counts, int(cfg["min_theme_count"]))
    metadata = {
        "rows_read": stats.rows_read,
        "rows_eligible": stats.rows_eligible,
        "rows_sampled": stats.rows_sampled,
        "rows_malformed": stats.rows_malformed,
        "vocabulary_size": len(vocabulary),
        "vocabulary": vocabulary,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    metadata_path = project_path(config, cfg["sampling_metadata_path"])
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata


def concepts(fen: str, config: dict[str, Any] | None = None) -> dict[str, float]:
    """Product API: concept probabilities for one position."""
    from .config import load_config

    config = config or load_config()
    cfg = config["concepts"]
    artifact = torch.load(
        project_path(config, cfg["model_path"]), weights_only=True
    )
    vocabulary = artifact["vocabulary"]
    head = ConceptHead(
        artifact["input_dim"], artifact["hidden_dim"], len(vocabulary)
    )
    head.load_state_dict(artifact["state_dict"])
    head.eval()
    board = chess.Board(fen)
    filler = next(iter(board.legal_moves)).uci()
    embedding = MaiaEmbedder(config).embed([fen], [filler])
    with torch.no_grad():
        scores = torch.sigmoid(head(torch.from_numpy(embedding)))[0].numpy()
    return {
        theme: float(score)
        for theme, score in sorted(
            zip(vocabulary, scores), key=lambda pair: -pair[1]
        )
    }
