from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import chess
import polars as pl

from .bands import representative_elo
from .config import load_config, project_path
from .maia import MaiaPolicy


@dataclass
class NodeAggregate:
    n: int = 0
    score_sum: float = 0.0
    traps: int = 0
    continuations: Counter[str] = field(default_factory=Counter)
    openings: Counter[str] = field(default_factory=Counter)
    ecos: Counter[str] = field(default_factory=Counter)


def wilson_interval(
    score_sum: float, n: int, z: float = 1.96
) -> tuple[float, float]:
    if n <= 0:
        return (0.0, 1.0)
    proportion = score_sum / n
    denominator = 1.0 + z * z / n
    center = (proportion + z * z / (2.0 * n)) / denominator
    margin = (
        z
        * math.sqrt(
            proportion * (1.0 - proportion) / n + z * z / (4.0 * n * n)
        )
        / denominator
    )
    return max(0.0, center - margin), min(1.0, center + margin)


def _trap_plies(eval_frame: pl.DataFrame) -> dict[str, list[int]]:
    if eval_frame.is_empty():
        return {}
    rows = eval_frame.filter(
        (pl.col("is_blunder") == 1) & (pl.col("early_ply") == 1)
    ).select("game_id", "ply")
    result: dict[str, list[int]] = defaultdict(list)
    for game_id, ply in rows.iter_rows():
        result[str(game_id)].append(int(ply))
    return result


def aggregate_opening_tree(
    openings: pl.DataFrame,
    eval_positions: pl.DataFrame,
    *,
    max_plies: int,
    z: float = 1.96,
) -> list[dict[str, Any]]:
    traps_by_game = _trap_plies(eval_positions)
    aggregates: dict[tuple[str, str, str], NodeAggregate] = {}
    totals: Counter[tuple[str, str]] = Counter()

    for row in openings.iter_rows(named=True):
        moves = str(row["moves_uci"]).split()[:max_plies]
        if not moves:
            continue
        game_traps = traps_by_game.get(str(row["game_id"]), [])
        perspectives = (
            ("white", str(row["white_band"]), float(row["white_score"])),
            ("black", str(row["black_band"]), float(row["black_score"])),
        )
        for perspective, band, score in perspectives:
            totals[(perspective, band)] += 1
            for depth in range(1, len(moves) + 1):
                prefix = " ".join(moves[:depth])
                key = (perspective, band, prefix)
                aggregate = aggregates.setdefault(key, NodeAggregate())
                aggregate.n += 1
                aggregate.score_sum += score
                aggregate.traps += int(any(depth < ply <= 15 for ply in game_traps))
                if depth < len(moves):
                    aggregate.continuations[moves[depth]] += 1
                opening = str(row.get("opening") or "")
                eco = str(row.get("eco") or "")
                if opening:
                    aggregate.openings[opening] += 1
                if eco:
                    aggregate.ecos[eco] += 1

    records: list[dict[str, Any]] = []
    for (perspective, band, prefix), aggregate in aggregates.items():
        lower, upper = wilson_interval(aggregate.score_sum, aggregate.n, z)
        top_continuations = [
            {"move_uci": move, "n": count, "popularity": count / aggregate.n}
            for move, count in aggregate.continuations.most_common(5)
        ]
        records.append(
            {
                "perspective": perspective,
                "rating_band": band,
                "prefix_uci": prefix,
                "depth": len(prefix.split()),
                "n": aggregate.n,
                "score_pct": 100.0 * aggregate.score_sum / aggregate.n,
                "wilson_low_pct": 100.0 * lower,
                "wilson_high_pct": 100.0 * upper,
                "popularity": aggregate.n / totals[(perspective, band)],
                "trap_density": aggregate.traps / aggregate.n,
                "main_continuations": top_continuations,
                "opening": (
                    aggregate.openings.most_common(1)[0][0]
                    if aggregate.openings
                    else ""
                ),
                "eco": aggregate.ecos.most_common(1)[0][0] if aggregate.ecos else "",
            }
        )
    return records


def _line_san(prefix_uci: str) -> str:
    board = chess.Board()
    san_moves: list[str] = []
    for token in prefix_uci.split():
        move = chess.Move.from_uci(token)
        if move not in board.legal_moves:
            return prefix_uci
        san_moves.append(board.san(move))
        board.push(move)
    return " ".join(san_moves)


def _findability(
    prefix_uci: str,
    perspective: str,
    elo: int,
    provider: MaiaPolicy | None,
) -> float | None:
    if provider is None:
        return None
    board = chess.Board()
    probabilities: list[float] = []
    target = chess.WHITE if perspective == "white" else chess.BLACK
    for token in prefix_uci.split():
        move = chess.Move.from_uci(token)
        if board.turn == target:
            policy = provider.policy(board.fen(), elo, elo)
            probabilities.append(float(policy.get(token, 0.0)))
        if move not in board.legal_moves:
            return None
        board.push(move)
    if not probabilities:
        return None
    # Geometric mean penalizes one line-breaking move more than an arithmetic mean.
    return math.exp(sum(math.log(max(value, 1e-8)) for value in probabilities) / len(probabilities))


def _rank_candidates(
    records: list[dict[str, Any]],
    *,
    perspective: str,
    band: str,
    minimum_n: int,
    top_n: int,
    context_first_move: str | None = None,
) -> list[dict[str, Any]]:
    desired_parity = 1 if perspective == "white" else 0
    candidates = []
    for row in records:
        if row["perspective"] != perspective or row["rating_band"] != band:
            continue
        if int(row["n"]) < minimum_n:
            continue
        depth = int(row["depth"])
        if depth > 4 or depth % 2 != desired_parity:
            continue
        first_move = str(row["prefix_uci"]).split()[0]
        if context_first_move and first_move != context_first_move:
            continue
        candidate = dict(row)
        candidate["line_san"] = _line_san(str(row["prefix_uci"]))
        candidates.append(candidate)

    candidates.sort(
        key=lambda row: (
            float(row["wilson_low_pct"]),
            float(row["trap_density"]),
            int(row["n"]),
        ),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    seen_prefixes: set[str] = set()
    for candidate in candidates:
        prefix = str(candidate["prefix_uci"])
        # Avoid exact duplicates while allowing a broad move and a concrete system.
        if prefix in seen_prefixes:
            continue
        selected.append(candidate)
        seen_prefixes.add(prefix)
        if len(selected) >= top_n:
            break
    return selected


def _format_table(rows: list[dict[str, Any]]) -> str:
    header = (
        "| Line | Opening | Score | Wilson 95% CI | N | Popularity | "
        "Trap density | Maia findability |\n"
        "|---|---|---:|---:|---:|---:|---:|---:|\n"
    )
    body = []
    for row in rows:
        findability = row.get("maia_findability")
        body.append(
            "| {line} | {opening} | {score:.1f}% | {low:.1f}–{high:.1f}% | "
            "{n:,} | {pop:.1f}% | {trap:.1f}% | {findability} |".format(
                line=row["line_san"],
                opening=str(row.get("opening", "")).replace("|", "/"),
                score=row["score_pct"],
                low=row["wilson_low_pct"],
                high=row["wilson_high_pct"],
                n=row["n"],
                pop=100 * row["popularity"],
                trap=100 * row["trap_density"],
                findability=(
                    f"{100 * findability:.1f}%" if findability is not None else "n/a"
                ),
            )
        )
    return header + ("\n".join(body) if body else "| _No line met minimum N._ | | | | | | | |")


def build_repertoire(
    config: dict[str, Any],
    *,
    use_maia: bool = True,
) -> dict[str, Any]:
    openings = pl.read_parquet(
        project_path(config, config["data"]["opening_games_path"])
    )
    eval_positions = pl.read_parquet(
        project_path(config, config["data"]["eval_positions_path"])
    )
    cfg = config["repertoire"]
    records = aggregate_opening_tree(
        openings,
        eval_positions,
        max_plies=int(config["data"]["opening_plies"]),
        z=float(cfg["wilson_z"]),
    )
    tree_path = project_path(config, "data/processed/opening_tree.parquet")
    pl.DataFrame(records, infer_schema_length=None).write_parquet(
        tree_path, compression="zstd"
    )
    provider = MaiaPolicy(config) if use_maia and config["maia2"]["enabled"] else None
    output: dict[str, Any] = {
        "source_month": config["data"]["month"],
        "minimum_node_games": int(cfg["minimum_node_games"]),
        "bands": {},
    }
    slug_by_band = {"<1100": "lt1100", "1100-1400": "1100-1400"}
    for band in ("<1100", "1100-1400"):
        elo = representative_elo(band, config["rating_bands"])
        sections = {
            "white_systems": _rank_candidates(
                records,
                perspective="white",
                band=band,
                minimum_n=int(cfg["minimum_node_games"]),
                top_n=int(cfg["recommend_top_n"]),
            ),
            "black_vs_e4": _rank_candidates(
                records,
                perspective="black",
                band=band,
                minimum_n=int(cfg["minimum_node_games"]),
                top_n=int(cfg["recommend_top_n"]),
                context_first_move="e2e4",
            ),
            "black_vs_d4": _rank_candidates(
                records,
                perspective="black",
                band=band,
                minimum_n=int(cfg["minimum_node_games"]),
                top_n=int(cfg["recommend_top_n"]),
                context_first_move="d2d4",
            ),
        }
        for rows in sections.values():
            for row in rows:
                row["maia_findability"] = _findability(
                    row["prefix_uci"], row["perspective"], elo, provider
                )
            rows.sort(
                key=lambda row: (
                    float(row["wilson_low_pct"])
                    + 8.0 * float(row.get("maia_findability") or 0.0)
                    + 5.0 * float(row["trap_density"])
                ),
                reverse=True,
            )
        output["bands"][band] = sections

        report = [
            f"# Repertoire recommendations: {band}",
            "",
            f"Source: Lichess {config['data']['month']}; strict minimum N = {cfg['minimum_node_games']:,}.",
            "Findability is the geometric mean of Maia2 probabilities for the target player's moves.",
            "",
            "## White systems",
            "",
            _format_table(sections["white_systems"]),
            "",
            "## Black defenses vs 1.e4",
            "",
            _format_table(sections["black_vs_e4"]),
            "",
            "## Black defenses vs 1.d4",
            "",
            _format_table(sections["black_vs_d4"]),
            "",
            "Trap density is the fraction of games with a >20 Win% swing after the node and by ply 15.",
        ]
        report_path = project_path(
            config, f"reports/repertoire_{slug_by_band[band]}.md"
        )
        report_path.write_text("\n".join(report) + "\n", encoding="utf-8")

    json_path = project_path(config, "reports/repertoire.json")
    json_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    return output


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build Elo-conditioned repertoire data.")
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--no-maia", action="store_true")
    args = parser.parse_args(argv)
    output = build_repertoire(
        load_config(args.config), use_maia=not args.no_maia
    )
    print(json.dumps({"bands": list(output["bands"])}, indent=2))


if __name__ == "__main__":
    main()

