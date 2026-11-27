"""Coaching moments: every corpus's positions with the engine's lines, Maia-2's likely moves at several
ratings, the board's hand features and, where people wrote about the position, their words.

usage: python coach_moments.py [--corpus data/corpus] [--out data/corpus/coach-moments]

Reads what the other scripts wrote under ``--corpus``:

- ``annotated/openings.parquet``, ``annotated/diagrams.parquet``, ``annotated/games.parquet``,
  ``annotated/stackexchange.parquet``: the texts and their positions;
- ``masters/sample.parquet`` and ``masters/games/``: the moves of strong players the engine read, with the
  games they come from;
- every file in ``engine/`` and ``maia/``, matched to a position by its key.

Writes ``moments.parquet`` and ``moments.jsonl``: a row a moment, with the position (FEN and the moves that
led to it as SAN when they are known), the move it is about, the engine's best lines in SAN with their
scores from the mover's side, where that move stands among them and what it gives away, Maia-2's likeliest
moves at each rating, the hand features, and the reference text with its source, licence and attribution.
A language model is trained to say what these facts hold; it judges nothing on its own.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess
import polars as pl

from chess_coach_models import paths
from chess_coach_models.encode.hand import POSITION_FEATURES, position_features


def _san_line(fen: str, ucis: list[str] | None) -> str:
    if not ucis:
        return ""
    board = chess.Board(fen)
    sans = []
    for uci in ucis:
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            break
        if move not in board.legal_moves:
            break
        sans.append(board.san(move))
        board.push(move)
    return " ".join(sans)


def _score(line: dict) -> str:
    if line.get("mate") is not None:
        return f"mate in {abs(line['mate'])} for {'the mover' if line['mate'] > 0 else 'the opponent'}"
    return f"{line['cp'] / 100:+.2f}"


def _engine_facts(fen: str, row: dict | None) -> dict | None:
    if not row or not row.get("lines"):
        return None
    lines = [
        {"move": _san_line(fen, [line["move"]]), "score": _score(line), "line": _san_line(fen, line["pv"])}
        for line in row["lines"]
    ]
    facts = {
        "engine": row.get("engine"),
        "nodes": row.get("nodes"),
        "depth": row.get("depth"),
        "best": lines,
        "best_win": None if row.get("best_win") is None else round(row["best_win"], 1),
    }
    if row.get("played_win") is not None:
        facts["move_rank"] = row.get("played_rank")
        facts["move_win"] = round(row["played_win"], 1)
        facts["move_loss"] = round(row["loss"], 1)
        facts["move_line"] = _san_line(fen, row.get("played_pv"))
    if row.get("also_lines"):
        facts["others"] = [
            {"move": _san_line(fen, [line["move"]]), "score": _score(line), "win": round(line["mover_win"], 1),
             "line": _san_line(fen, line["pv"])}
            for line in row["also_lines"]
        ]
    return facts


def _maia_facts(fen: str, row: dict | None) -> dict | None:
    if not row:
        return None
    out = {}
    for name, value in row.items():
        if name.startswith("maia_") and name[5:].isdigit() and value:
            out[name[5:]] = [{"move": _san_line(fen, [pick["move"]]), "chance": pick["chance"]} for pick in value]
    return out or None


def _by_key(folder: Path) -> dict[str, dict]:
    """Every row of every file in a folder, by its key."""
    found: dict[str, dict] = {}
    for path in sorted(folder.glob("*.parquet")) if folder.exists() else []:
        for row in pl.read_parquet(path).to_dicts():
            if row.get("key") is not None:
                found[row["key"]] = row
    return found


def moments(corpus: Path) -> list[dict]:
    rows: list[dict] = []
    annotated = corpus / "annotated"
    engine = _by_key(corpus / "engine")
    maia = _by_key(corpus / "maia")
    sources = [(name, annotated / f"{name}.parquet") for name in ("openings", "diagrams", "games", "stackexchange")]
    sources += [("books", path) for path in sorted(annotated.glob("book-games-*.parquet"))]
    for name, path in sources:
        if not path.exists():
            continue
        for row in pl.read_parquet(path).to_dicts():
            fen = row.get("fen_before") if name in ("games", "books") else row.get("fen")
            if not fen:
                continue
            if name == "openings":
                move, history = row.get("candidate"), row["moves"]
                text = (f"{row['section']}\n\n" if row["section"] else "") + row["text"]
            elif name == "diagrams":
                move = row["line"][0] if row["line"] else None
                history = ""
                text = "\n\n".join(part for part in (row["caption"], row["context"]) if part)
            elif name in ("games", "books"):
                move = row["move"]
                history = " ".join(row["moves"].split()[:-1])
                # A book's note keeps the book's own notation, which the moment says.
                text = row["comment"] if name == "games" else f"[{row['notation']} notation] {row['comment']}"
            else:
                move = None
                board = row["boards"][0]
                history = board["moves"] if board["fen_start"].startswith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w") else ""
                best = row["answers"][0]
                text = f"Q: {row['title']}\n{row['question']}\n\nA ({best['score']} votes{', accepted' if best['accepted'] else ''}): {best['text']}"
            rows.append({
                "key": row["key"],
                "kind": name,
                "source": row["source"],
                "licence": row["licence"],
                "url": row["url"],
                "attribution": row.get("attribution", ""),
                "fen": fen,
                "history": history,
                "move": move,
                "move_san": _san_line(fen, [move]) if move else "",
                "mover": None,
                "engine": _engine_facts(fen, engine.get(row["key"])),
                "maia": _maia_facts(fen, maia.get(row["key"])),
                "features": position_features(chess.Board(fen)),
                "reference": text,
            })
    sample_path = corpus / "masters" / "sample.parquet"
    if sample_path.exists():
        sample = pl.read_parquet(sample_path)
        wanted = set(sample["game_id"].to_list())
        games = (
            pl.scan_parquet(str(corpus / "masters" / "games" / "*" / "part-*.parquet"))
            .filter(pl.col("game_id").is_in(list(wanted)))
            .select("game_id", "sans", "white_name", "black_name", "event", "date", "game_url", "result")
            .collect()
        )
        by_game = {row["game_id"]: row for row in games.to_dicts()}
        positions = (
            pl.scan_parquet(str(corpus / "masters" / "positions" / "*" / "part-*.parquet"))
            .filter(pl.col("key").is_in(sample["key"].to_list()))
            .collect()
        )
        for row in positions.to_dicts():
            game = by_game.get(row["game_id"], {})
            sans = game.get("sans") or []
            rows.append({
                "key": row["key"],
                "kind": "masters",
                "source": "lichess-broadcasts",
                "licence": "CC BY-SA 4.0",
                "url": game.get("game_url", ""),
                "attribution": f"Lichess broadcast database, {game.get('event', '')} {game.get('date', '')}, CC BY-SA 4.0",
                "fen": row["fen"],
                "history": " ".join(sans[: row["ply"] - 1]),
                "move": row["move"],
                "move_san": row["san"],
                "mover": {"title": row["mover_title"], "elo": row["mover_elo"], "clock": row["clock"],
                          "spent": row["spent"], "champion": row["mover_champion"]},
                "engine": _engine_facts(row["fen"], engine.get(row["key"])),
                "maia": _maia_facts(row["fen"], maia.get(row["key"])),
                "features": {name: row[name] for name in POSITION_FEATURES},
                "reference": "",
            })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", default=str(paths.ROOT / "data" / "corpus"))
    parser.add_argument("--out", default=str(paths.ROOT / "data" / "corpus" / "coach-moments"))
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rows = moments(Path(args.corpus))
    with (out / "moments.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    frame = pl.DataFrame([{**row, "engine": json.dumps(row["engine"]), "maia": json.dumps(row["maia"]),
                           "mover": json.dumps(row["mover"]), "features": json.dumps(row["features"])} for row in rows])
    frame.write_parquet(out / "moments.parquet", compression="zstd")
    counts = frame.group_by("kind").agg(
        pl.len().alias("moments"),
        (pl.col("engine") != "null").sum().alias("with_engine"),
        (pl.col("maia") != "null").sum().alias("with_maia"),
        (pl.col("reference").str.len_chars() > 0).sum().alias("with_text"),
    )
    print(json.dumps(counts.to_dicts(), indent=2))


if __name__ == "__main__":
    main()
