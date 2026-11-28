"""Evaluate a trained puzzle-themes model on real-game tactics and non-tactical game lines.

Two questions matter when the coaching app feeds an engine line from a player's rapid game
into ``puzzle-themes``:

1. **Real-game tactics (``tactics-v1`` / ``tactic-found``):** does the model hold up on tactics
   cut from real rapid/blitz/classical games, especially the ones the player **missed**
   (``found == 0``) at club level? Any game whose ``game_id`` appeared in ``puzzles-v1``'s
   train or valid split is excluded so the score is strictly leak-free.
2. **Non-tactical game moves (false-positive stress test):** every Lichess puzzle is a working
   tactic. When the app feeds an ordinary, non-tactical move from a real game (``games-2026-10``
   test split, ``abs(loss) <= 2``), how often does the model still fire a theme with high
   confidence, and which themes misfire most?

usage:
    python models/puzzle-themes/eval_game_tactics.py --run gbm-hand [--smoke] [--out results/game-eval-gbm-hand.json]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import chess
import numpy as np
import torch

from chess_coach_models import paths, tasks
from chess_coach_models.data import recipe
from chess_coach_models.data.puzzles import HAND, MARKS, line_marks
from chess_coach_models.data.store import Dataset, read_dataset
from chess_coach_models.encode.board import CASTLING, encode_positions
from chess_coach_models.encode.hand import line_features, position_features
from chess_coach_models.encode.solution import solution_boards
from chess_coach_models.evals.calibration import apply_platt
from chess_coach_models.evals.metrics import calibration_table, mean_of_rows, row_scores
from chess_coach_models.nets.model import build_net
from chess_coach_models.train.run import by_candidate, by_candidate_summary


def _apply_calibration(raw_p: np.ndarray, record: dict[str, Any], candidates: tuple[str, ...]) -> np.ndarray:
    cal = record.get("calibration")
    if not cal:
        return raw_p
    if cal.get("kind") == "per_candidate":
        out = np.empty_like(raw_p, dtype=np.float64)
        per = cal["candidates"]
        for col, name in enumerate(candidates):
            cfg = per.get(name, {"platt_slope": 1.0, "platt_intercept": 0.0})
            out[:, col] = apply_platt(raw_p[:, col], cfg["platt_slope"], cfg["platt_intercept"])
        return out
    return apply_platt(raw_p, cal["platt_slope"], cal["platt_intercept"])


def _load_gbm_boosters(model_txt: Path, candidates: tuple[str, ...]) -> dict[str, Any]:
    import lightgbm as lgb

    text = model_txt.read_text(encoding="utf-8")
    boosters: dict[str, Any] = {}
    parts = re.split(r"(?m)^tag (\S+)\n", text)
    for idx in range(1, len(parts), 2):
        tag_name = parts[idx].strip()
        body = parts[idx + 1].strip()
        if tag_name in candidates and body:
            boosters[tag_name] = lgb.Booster(model_str=body)
    return boosters


def _predict_dataset(
    run_name: str,
    dataset: Dataset,
    row_indices: np.ndarray,
    *,
    smoke: bool = False,
) -> np.ndarray:
    task = tasks.get("puzzle-themes")
    record_path = paths.results("puzzle-themes", smoke=smoke) / f"{run_name}.json"
    record = json.loads(record_path.read_text(encoding="utf-8"))
    run_dir = paths.predictions("puzzle-themes", run_name, smoke=smoke).parent
    learner = record["config"]["learner"]
    candidates = task.candidates

    if learner["kind"] == "gbm":
        boosters = _load_gbm_boosters(run_dir / "model.txt", candidates)
        ctx_cols = list(task.context)
        if learner.get("features") == "hand":
            want_hand = [c for c in record["task"].get("hand", dataset.manifest["hand"]) if c not in ctx_cols]
            x = dataset.rows.select(ctx_cols + want_hand).to_numpy().astype(np.float32)[row_indices]
        else:
            x = dataset.rows.select(ctx_cols).to_numpy().astype(np.float32)[row_indices]
        raw = np.zeros((len(row_indices), len(candidates)), dtype=np.float64)
        for col, tag in enumerate(candidates):
            if tag in boosters:
                raw[:, col] = boosters[tag].predict(x)
        return _apply_calibration(raw, record, candidates)

    if learner["kind"] == "net":
        saved = torch.load(run_dir / "model.pt", map_location="cpu", weights_only=False)
        extra_boards = 2 if learner.get("solution_boards") else 0
        model = build_net(
            saved["learner"],
            marks=len(saved["marks"]),
            context=len(saved["context"]),
            outputs=len(candidates),
            extra_boards=extra_boards,
        )
        model.load_state_dict(saved["state"])
        model.eval()
        ctx_names = saved["context"]
        ctx = (dataset.rows.select(ctx_names).to_numpy().astype(np.float32)[row_indices] - saved["context_mean"]) / saved["context_spread"]
        mark_channels = np.array([dataset.manifest["marks"].index(m) for m in saved["marks"]], dtype=np.int64)
        if extra_boards:
            sol = solution_boards(dataset)[row_indices]
            tok = np.concatenate([dataset.tokens[row_indices][:, None, :], sol], axis=1)
        else:
            tok = dataset.tokens[row_indices]
        mrk = dataset.marks[row_indices].astype(np.int16)
        out = np.empty((len(row_indices), len(candidates)), dtype=np.float64)
        shifts = torch.tensor(mark_channels)
        with torch.no_grad():
            for start in range(0, len(row_indices), 256):
                end = min(len(row_indices), start + 256)
                t_tok = torch.from_numpy(tok[start:end]).long()
                t_mrk = ((torch.from_numpy(mrk[start:end]).long()[..., None] >> shifts) & 1).float()
                t_ctx = torch.from_numpy(ctx[start:end].astype(np.float32))
                logits = model(t_tok, t_mrk, t_ctx)
                out[start:end] = torch.sigmoid(logits).numpy()
        return _apply_calibration(out, record, candidates)

    raise ValueError(f"Unsupported learner kind for game evaluation: {learner['kind']}")


def _tags_matrix(themes_col: list[str], candidates: tuple[str, ...]) -> np.ndarray:
    by_name = {name: col for col, name in enumerate(candidates)}
    y = np.zeros((len(themes_col), len(candidates)), dtype=np.uint8)
    for row, text in enumerate(themes_col):
        for word in (text or "").split():
            col = by_name.get(word)
            if col is not None:
                y[row, col] = 1
    return y


def _score_slice(y: np.ndarray, p: np.ndarray, candidates: tuple[str, ...]) -> dict[str, Any]:
    rs = row_scores("tags", y, p)
    means = mean_of_rows(rs)
    each = by_candidate(candidates, y, p)
    summary = by_candidate_summary(each)
    y_flat, p_flat = y.reshape(-1).astype(np.float64), p.reshape(-1)
    active = p_flat >= 0.01
    return {
        "rows": int(len(y)),
        "ap": float(means[0]),
        "top1": float(means[1]),
        "log_loss": float(means[2]),
        "macro_pr_auc": summary["macro_pr_auc"],
        "macro_roc_auc": summary["macro_roc_auc"],
        "rare_pr_auc": summary["rare_pr_auc"],
        "active_calibration": calibration_table(y_flat[active], p_flat[active]) if int(active.sum()) >= 20 else [],
        "weakest_5": [
            {"tag": name, "rows": row["rows"], "pr_auc": round(row["pr_auc"], 4)}
            for name, row in sorted(each.items(), key=lambda kv: (kv[1]["pr_auc"] if kv[1]["pr_auc"] == kv[1]["pr_auc"] else 2.0))[:5]
        ],
    }


def _reconstruct_fen_from_tokens(tok: np.ndarray) -> chess.Board | None:
    """Reconstruct a valid White-to-move board from mover-oriented tokens (1..6 own, 7..12 opp)."""
    piece_map = {
        1: chess.Piece(chess.PAWN, chess.WHITE),
        2: chess.Piece(chess.KNIGHT, chess.WHITE),
        3: chess.Piece(chess.BISHOP, chess.WHITE),
        4: chess.Piece(chess.ROOK, chess.WHITE),
        5: chess.Piece(chess.QUEEN, chess.WHITE),
        6: chess.Piece(chess.KING, chess.WHITE),
        7: chess.Piece(chess.PAWN, chess.BLACK),
        8: chess.Piece(chess.KNIGHT, chess.BLACK),
        9: chess.Piece(chess.BISHOP, chess.BLACK),
        10: chess.Piece(chess.ROOK, chess.BLACK),
        11: chess.Piece(chess.QUEEN, chess.BLACK),
        12: chess.Piece(chess.KING, chess.BLACK),
    }
    board = chess.Board(None)
    board.turn = chess.WHITE
    for sq in range(64):
        code = int(tok[sq])
        if code in piece_map:
            board.set_piece_at(sq, piece_map[code])
    if board.king(chess.WHITE) is None or board.king(chess.BLACK) is None or not board.is_valid():
        return None
    return board


def eval_non_tactical_games(
    run_name: str,
    games_dataset: Dataset,
    *,
    smoke: bool = False,
    limit: int = 1000,
) -> dict[str, Any]:
    """Measure false-positive firing rate when feeding ordinary non-tactical game moves into puzzle-themes."""
    import polars as pl

    task = tasks.get("puzzle-themes")
    candidates = task.candidates
    record = json.loads((paths.results("puzzle-themes", smoke=smoke) / f"{run_name}.json").read_text(encoding="utf-8"))
    learner = record["config"]["learner"]
    run_dir = paths.predictions("puzzle-themes", run_name, smoke=smoke).parent

    # Pick quiet test-split positions from games-2026-10: abs(loss) <= 1.5, not capture, not check, equal-ish game.
    rows = games_dataset.rows
    test_mask = (rows["split"] == "test").to_numpy()
    first = rows["first_step"].to_numpy()
    count = rows["steps"].to_numpy()
    step_names = games_dataset.manifest["steps"]
    loss_col = step_names.index("loss")
    win_col = step_names.index("win_before")
    cap_col = step_names.index("capture")
    chk_col = step_names.index("check")
    mark_names = games_dataset.manifest["marks"]
    ch_lf = mark_names.index("last_from")
    ch_lt = mark_names.index("last_to")
    ch_mf = mark_names.index("move_from")
    ch_mt = mark_names.index("move_to")

    fens, setup_ucis, lines_ucis, hand_rows = [], [], [], []
    seq = games_dataset.steps
    assert seq is not None

    for row_idx in np.flatnonzero(test_mask):
        if len(fens) >= limit:
            break
        s0, cnt = int(first[row_idx]), int(count[row_idx])
        # Pick one quiet middlegame move per test game row.
        for offset in range(2, min(cnt - 1, 15)):
            idx = s0 + offset
            nums = seq.numbers[idx]
            if abs(float(nums[loss_col])) > 1.5 or float(nums[cap_col]) > 0 or float(nums[chk_col]) > 0:
                continue
            if abs(float(nums[win_col]) - 50.0) > 20.0:
                continue
            tok = seq.tokens[idx]
            mrk = seq.marks[idx]
            lf = np.flatnonzero((mrk >> ch_lf) & 1)
            lt = np.flatnonzero((mrk >> ch_lt) & 1)
            mf = np.flatnonzero((mrk >> ch_mf) & 1)
            mt = np.flatnonzero((mrk >> ch_mt) & 1)
            if not (len(lf) == 1 and len(lt) == 1 and len(mf) == 1 and len(mt) == 1):
                continue
            board = _reconstruct_fen_from_tokens(tok)
            if board is None:
                continue
            move = chess.Move(int(mf[0]), int(mt[0]))
            if move not in board.legal_moves:
                continue
            # Build a quiet 2-ply line: player's quiet move + opponent's first legal quiet reply (non-capture, non-check).
            b2 = board.copy(stack=False)
            b2.push(move)
            reply = next((m for m in b2.legal_moves if not b2.is_capture(m) and not b2.gives_check(m)), None)
            if reply is None:
                continue
            setup = f"{chess.square_name(int(lf[0]))}{chess.square_name(int(lt[0]))}"
            line = f"{move.uci()} {reply.uci()}"
            fens.append(board.fen())
            setup_ucis.append(setup)
            lines_ucis.append(line)
            feat_dict = {**position_features(board), **line_features(board, [move, reply], setup_capture=False)}
            hand_rows.append([float(feat_dict[name]) for name in HAND])
            break

    if not fens:
        return {"rows": 0}

    sq_marks = [line_marks(setup, line.split(), True) for setup, line in zip(setup_ucis, lines_ucis)]
    tokens_arr, marks_arr, rights_arr = encode_positions(fens, sq_marks)

    hand_arr = np.array(hand_rows, dtype=np.float32)
    synth_cols = {
        "fen": fens,
        "line": lines_ucis,
        "castle_own_king": rights_arr[:, 0].astype(np.int8),
        "castle_own_queen": rights_arr[:, 1].astype(np.int8),
        "castle_opp_king": rights_arr[:, 2].astype(np.int8),
        "castle_opp_queen": rights_arr[:, 3].astype(np.int8),
        **{name: hand_arr[:, col] for col, name in enumerate(HAND)},
    }
    synth_rows = pl.DataFrame(synth_cols)
    synth = Dataset(
        name="non-tactical-games",
        rows=synth_rows,
        tokens=tokens_arr,
        marks=marks_arr,
        manifest={"marks": list(MARKS), "hand": list(HAND)},
    )
    p = _predict_dataset(run_name, synth, np.arange(len(fens)), smoke=smoke)
    max_p = p.max(axis=1)
    by_tag_fp = {name: float((p[:, col] >= 0.5).mean()) for col, name in enumerate(candidates)}
    top_fp = [
        {"tag": name, "rate_at_0.5": round(rate, 4), "mean_p": round(float(p[:, candidates.index(name)].mean()), 4)}
        for name, rate in sorted(by_tag_fp.items(), key=lambda kv: -kv[1])[:8]
    ]
    return {
        "rows": len(fens),
        "any_tag_ge_0.3": round(float((max_p >= 0.3).mean()), 4),
        "any_tag_ge_0.5": round(float((max_p >= 0.5).mean()), 4),
        "any_tag_ge_0.7": round(float((max_p >= 0.7).mean()), 4),
        "any_tag_ge_0.85": round(float((max_p >= 0.85).mean()), 4),
        "mean_max_prob": round(float(max_p.mean()), 4),
        "mean_tags_ge_0.5": round(float((p >= 0.5).sum(axis=1).mean()), 4),
        "top_false_positive_tags": top_fp,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True, help="puzzle-themes run name (e.g. gbm-hand, gbm-hand-per-tag)")
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--non-tactical-limit", type=int, default=1000)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    task = tasks.get("puzzle-themes")
    candidates = task.candidates
    report: dict[str, Any] = {"run": args.run, "smoke": args.smoke}

    # 1. Real-game tactics evaluation (tactics-v1), excluding any game seen in puzzles-v1 train/valid.
    tactics_name = recipe("tactics", smoke=args.smoke)["name"]
    tactics_dir = paths.ROOT / "data" / "processed" / tactics_name
    if tactics_dir.exists():
        tactics_ds = read_dataset(tactics_name)
        seen_games: set[str] = set()
        puzzles_name = recipe("puzzles", smoke=args.smoke)["name"]
        if (paths.ROOT / "data" / "processed" / puzzles_name).exists():
            puzzles_ds = read_dataset(puzzles_name)
            tv = puzzles_ds.rows.filter(puzzles_ds.rows["split"].is_in(["train", "valid"]))
            seen_games = set(tv["game_id"].to_list())
        test_mask = (tactics_ds.rows["split"] == "test").to_numpy()
        gids = tactics_ds.rows["game_id"].to_list()
        clean_idx = np.array([i for i in np.flatnonzero(test_mask) if gids[i] not in seen_games], dtype=np.int64)
        p = _predict_dataset(args.run, tactics_ds, clean_idx, smoke=args.smoke)
        y = _tags_matrix(tactics_ds.rows["themes"].to_list(), candidates)[clean_idx]
        found_arr = tactics_ds.rows["found"].to_numpy()[clean_idx]
        speed_arr = tactics_ds.rows["speed"].to_numpy()[clean_idx]
        band_arr = tactics_ds.rows["band"].to_numpy()[clean_idx]
        tactics_res: dict[str, Any] = {
            "dataset": tactics_name,
            "excluded_overlap_games": int(test_mask.sum()) - len(clean_idx),
            "overall": _score_slice(y, p, candidates),
            "missed_in_game": _score_slice(y[found_arr == 0], p[found_arr == 0], candidates),
            "found_in_game": _score_slice(y[found_arr == 1], p[found_arr == 1], candidates),
            "by_speed": {},
            "by_band": {},
        }
        for sp in sorted(set(speed_arr.tolist())):
            m = speed_arr == sp
            if int(m.sum()) >= 50:
                tactics_res["by_speed"][sp] = _score_slice(y[m], p[m], candidates)
        for bd in sorted(set(band_arr.tolist())):
            m = band_arr == bd
            if int(m.sum()) >= 50:
                tactics_res["by_band"][bd] = _score_slice(y[m], p[m], candidates)
        report["real_game_tactics"] = tactics_res

    # 2. Non-tactical real-game false-positive stress test (games-2026-10).
    games_name = recipe("games", smoke=args.smoke)["name"]
    if (paths.ROOT / "data" / "processed" / games_name).exists():
        games_ds = read_dataset(games_name)
        report["non_tactical_games"] = eval_non_tactical_games(
            args.run, games_ds, smoke=args.smoke, limit=args.non_tactical_limit
        )

    out_text = json.dumps(report, indent=2) + "\n"
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(out_text, encoding="utf-8")
    print(out_text)


if __name__ == "__main__":
    main()
