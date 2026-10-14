#!/usr/bin/env python3
"""The rule in README.md over the player-games ledger.mjs wrote.

    python3 projects/band-above/analyze.py --month 2026-09

Reads private/band-above/player-games-<month>.csv.gz, the slopes and the app's
constants ledger.mjs wrote beside them (slopes-<month>.json) and his games'
rows (archive-player-games.csv.gz), applies the rule and writes the aggregates
to results/analysis.json and results/analysis.md. Nothing per game is written
to results/.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

LAB = Path(__file__).resolve().parents[2]
PROJECT = LAB / "projects" / "band-above"
PRIVATE = LAB / "private" / "band-above"

# The study's own parameters, as the README fixes them.
BANDS = [(850, 1049), (1050, 1249), (1250, 1449), (1450, 1649), (1650, 1849), (1850, 2049)]
HIS = (1250, 1449)
ABOVE = (1450, 1649)
DRAWS = 2000
SEED = 20261014
ALPHA = 0.05
KINDS = [("serious", "serious errors"), ("hanging", "hanging a piece"), ("mate1", "allowing mate in one"),
         ("mateN", "allowing a forced mate"), ("untagged", "other serious errors")]


def label(band: tuple[int, int]) -> str:
    return f"{band[0]}-{band[1]}"


def interval(draws: np.ndarray) -> dict:
    d = draws[np.isfinite(draws)]
    if len(d) == 0:
        return {"lo": float("nan"), "hi": float("nan"), "p": float("nan")}
    lo, hi = np.percentile(d, [2.5, 97.5])
    n = len(d)
    p = min(1.0, 2 * min((np.sum(d >= 0) + 1) / (n + 1), (np.sum(d <= 0) + 1) / (n + 1)))
    return {"lo": float(lo), "hi": float(hi), "p": float(p)}


def holm(ps: list[float]) -> list[float]:
    order = np.argsort(ps)
    adj = np.empty(len(ps))
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, (len(ps) - rank) * ps[i])
        adj[i] = min(1.0, running)
    return adj.tolist()


class Draws:
    """Poisson(1) weights over games (a game's player-games share its weight), the same draws for every estimate."""

    def __init__(self, gi: np.ndarray, games: int, draws: int, seed: int):
        self.gi = gi
        self.games = games
        self.w = np.random.default_rng(seed).poisson(1.0, size=(draws, games)).astype(np.float32)

    def total(self, x: np.ndarray, mask: np.ndarray) -> tuple[float, np.ndarray]:
        """Σ x over the masked rows: the point and the draws."""
        per_game = np.bincount(self.gi[mask], weights=x[mask], minlength=self.games).astype(np.float32)
        return float(per_game.sum()), self.w @ per_game

    def mean(self, x: np.ndarray, mask: np.ndarray) -> tuple[float, np.ndarray]:
        s, sd = self.total(x, mask)
        n, nd = self.total(np.ones(len(x)), mask)
        with np.errstate(invalid="ignore", divide="ignore"):
            return s / n, sd / nd


def summary(point: float, draws: np.ndarray) -> dict:
    return {"value": float(point), **interval(draws)}


def discount(dr: Draws, d: pd.DataFrame, mask: np.ndarray, col: str) -> dict:
    """δ: minus the slope of the result (percent) on the points given away, with the rating difference, by least squares."""
    x = d[col].to_numpy(float)
    diff = (d["rating"] - d["oppRating"]).to_numpy(float)
    y = 100 * d["score"].to_numpy(float)
    cols = [np.ones(len(d)), x, diff]
    # The normal equations' sums, the point and each draw's.
    xtx_p = np.empty((3, 3))
    xty_p = np.empty(3)
    xtx_d = np.empty((dr.w.shape[0], 3, 3))
    xty_d = np.empty((dr.w.shape[0], 3))
    for i in range(3):
        for j in range(i, 3):
            p, ds = dr.total(cols[i] * cols[j], mask)
            xtx_p[i, j] = xtx_p[j, i] = p
            xtx_d[:, i, j] = xtx_d[:, j, i] = ds
        p, ds = dr.total(cols[i] * y, mask)
        xty_p[i] = p
        xty_d[:, i] = ds
    point = np.linalg.lstsq(xtx_p, xty_p, rcond=None)[0] if np.linalg.matrix_rank(xtx_p) == 3 else np.full(3, np.nan)
    # A draw whose points on c are all zero has no slope: it is left out of the interval.
    draws = np.full((len(xtx_d), 3), np.nan)
    ok = np.linalg.matrix_rank(xtx_d) == 3
    draws[ok] = np.linalg.solve(xtx_d[ok], xty_d[ok][..., None])[..., 0]
    return {**summary(-point[1], -draws[:, 1]), "ratingSlope": float(point[2]), "rows": int(mask.sum()),
            "drawsWithoutSlope": int((~ok).sum())}


def log(started: float, what: str) -> None:
    print(f"{time.time() - started:7.1f}s  {what}", file=sys.stderr, flush=True)


def run(month: str) -> dict:
    started = time.time()
    slopes = json.loads((PRIVATE / f"slopes-{month}.json").read_text())
    app = slopes["app"]
    causes = [c["id"] for c in app["causes"]]
    labels = {c["id"]: c["label"] for c in app["causes"]}
    partition = app["partition"]
    built = [json.loads(p.read_text()) for p in sorted(PRIVATE.glob(f"primary-{month}*.json"))]
    ledger = json.loads((PRIVATE / f"player-games-{month}.json").read_text())

    d = pd.read_csv(PRIVATE / f"player-games-{month}.csv.gz")
    if (d["partitionGap"] > 1e-3).any():
        raise SystemExit("the seven causes do not split every move: the rule's shares do not hold")
    games = pd.Index(d["game"].unique())
    gi = games.get_indexer(d["game"])
    dr = Draws(gi, len(games), DRAWS, SEED)
    rating = d["rating"].to_numpy()
    in_band = {label(b): (rating >= b[0]) & (rating <= b[1]) for b in BANDS}
    his, above = in_band[label(HIS)], in_band[label(ABOVE)]
    log(started, f"loaded {len(d):,} player-games of {len(games):,} games")

    # 1: what separates the bands.
    means = {}
    for b in BANDS:
        m = in_band[label(b)]
        means[label(b)] = {c: dr.mean(d[f"{c}.mine"].to_numpy(float), m) for c in causes + ["all"]}
    sep = {}
    for c in causes + ["all"]:
        (ph, dh), (pa, da) = means[label(HIS)][c], means[label(ABOVE)][c]
        sep[c] = {"his": summary(ph, dh), "above": summary(pa, da), "delta": summary(pa - ph, da - dh)}
    adj = holm([sep[c]["delta"]["p"] for c in causes])
    for c, ph in zip(causes, adj):
        r = sep[c]
        r["label"] = labels[c]
        r["pHolm"] = ph
        r["separates"] = bool(r["delta"]["value"] < 0 and ph < ALPHA)
    ranked = sorted((c for c in causes if sep[c]["separates"]), key=lambda c: sep[c]["delta"]["value"])
    total_p = sep["all"]["delta"]["value"]
    total_d = means[label(ABOVE)]["all"][1] - means[label(HIS)]["all"][1]
    shares = {}
    for c in partition:
        dc = means[label(ABOVE)][c][1] - means[label(HIS)][c][1]
        with np.errstate(invalid="ignore", divide="ignore"):
            shares[c] = summary(sep[c]["delta"]["value"] / total_p, dc / total_d)
    log(started, "bands compared")

    # 2: the discount, within his band.
    disc = {}
    for c in causes + ["all"]:
        r = discount(dr, d, his, f"{c}.mine")
        r["verdict"] = ("too high" if r["hi"] < app["LEAK_DISCOUNT"] else "too low" if r["lo"] > app["LEAK_DISCOUNT"]
                        else "within")
        disc[c] = r
    log(started, "discounts fitted")

    # Without a rule: error kinds, the trend, the moves per cause, game length.
    kinds = {}
    for b in BANDS:
        m = in_band[label(b)]
        row = {}
        for k, _ in KINDS:
            n_p, n_d = dr.mean(d[f"{k}.moves"].to_numpy(float), m)
            l_p, l_d = dr.mean(d[f"{k}.mine"].to_numpy(float), m)
            row[k] = {"perGame": summary(n_p, n_d), "points": summary(l_p, l_d),
                      "everyGames": float(1 / n_p) if n_p > 0 else None}
        kinds[label(b)] = row
    trend = {label(b): {c: summary(*means[label(b)][c]) for c in causes + ["all"]} for b in BANDS}
    moves = {label(b): {c: float(d.loc[in_band[label(b)], f"{c}.moves"].mean()) for c in causes + ["all"]} for b in BANDS}
    plies = {label(b): float(d.loc[in_band[label(b)], "plies"].mean()) for b in BANDS}
    sizes = {label(b): {"playerGames": int(in_band[label(b)].sum()),
                        "games": int(len(np.unique(gi[in_band[label(b)]])))} for b in BANDS}
    log(started, "described")

    archive = archive_summary(causes)

    return {
        "month": month,
        "appCommit": slopes["appCommit"],
        "app": app,
        "games": {"built": sum(s["gamesBuilt"] for s in built), "read": sum(s["gamesRead"] for s in built),
                  "skipped": {k: sum(s["skipped"].get(k, 0) for s in built)
                              for k in sorted(set().union(*(s["skipped"] for s in built)))},
                  "blackBuildsChecked": sum(s["blackBuildsChecked"] for s in built),
                  "playerGames": int(len(d)), "ledgerRows": ledger["rows"], "ledgerBroken": ledger["broken"]},
        "bands": sizes,
        "slopes": {"yardstick": slopes["yardstick"], "bands": slopes["bands"], "lichessK": slopes["lichessK"]},
        "separates": sep, "ranked": ranked, "shares": shares,
        "discount": disc,
        "kinds": kinds, "trend": trend, "movesPerGame": moves, "plies": plies,
        "archive": archive,
        "seconds": round(time.time() - started),
    }


def archive_summary(causes: list[str]) -> dict | None:
    """His own games, described beside the bands (ledger.mjs --archive writes them; absent until it has run)."""
    path = PRIVATE / "archive-player-games.csv.gz"
    if not path.exists():
        return None
    meta = json.loads((PRIVATE / "archive-player-games.json").read_text())
    h = pd.read_csv(path)
    dr = Draws(np.arange(len(h)), len(h), DRAWS, SEED)
    every = np.ones(len(h), dtype=bool)
    out = {"games": int(len(h)), "ownSlope": meta["ownSlope"]["k"] if meta["ownSlope"] else None, "causes": {}, "kinds": {}}
    for c in causes + ["all"]:
        out["causes"][c] = summary(*dr.mean(h[f"{c}.mine"].to_numpy(float), every))
    for k, _ in KINDS:
        n_p, n_d = dr.mean(h[f"{k}.moves"].to_numpy(float), every)
        out["kinds"][k] = {"perGame": summary(n_p, n_d), "points": summary(*dr.mean(h[f"{k}.mine"].to_numpy(float), every)),
                           "everyGames": float(1 / n_p) if n_p > 0 else None}
    out["plies"] = float(h["plies"].mean())
    return out


def num(x: float | None, d: int = 2) -> str:
    return "n/a" if x is None or not np.isfinite(x) else f"{x:.{d}f}"


def ci(r: dict, d: int = 2, sign: bool = False) -> str:
    f = (lambda x: "n/a" if not np.isfinite(x) else f"{x:+.{d}f}") if sign else (lambda x: num(x, d))
    return f"{f(r['value'])} ({f(r['lo'])} to {f(r['hi'])})"


def markdown(res: dict) -> str:
    """The report, every number from the analysis."""
    g, y = res["games"], res["slopes"]["yardstick"]
    causes = [c["id"] for c in res["app"]["causes"]]
    his, above = label(HIS), label(ABOVE)
    out = [
        "# The band above: results",
        "",
        f"Written by `analyze.py` for the Lichess month {res['month']} on the app at `{res['appCommit']}`. Points are "
        "percent of a game given away on the band curve, per player-game, with 95% bootstrap intervals over games.",
        "",
        "## Data",
        "",
        f"- Games: {g['built']:,} built of {g['read']:,} read" + (f"; skipped {g['skipped']}" if g["skipped"] else "")
        + f". Black's flipped build matched its own build on all {g['blackBuildsChecked']:,} games checked. "
        f"{g['playerGames']:,} player-games.",
        f"- The yardstick: k = {y['k']:.6f} per centipawn, fitted on his band's {y['playerGames']:,} player-games "
        f"({y['positions']:,} positions); the Lichess curve's k is {res['slopes']['lichessK']:.6f}.",
        "- Bands: " + "; ".join(f"{b}: {s['playerGames']:,} player-games, k {num(res['slopes']['bands'][b]['k'], 6)}"
                                for b, s in res["bands"].items()) + ".",
        "",
        f"## What separates the bands ({above} against {his})",
        "",
        "| Cause | His band | The band above | Δ | Holm p | Separates | Share of the difference |",
        "|---|---|---|---|---|---|---|",
    ]
    for c in causes + ["all"]:
        r = res["separates"][c]
        share = ci(res["shares"][c], 2) if c in res["shares"] else ""
        out.append(f"| {r.get('label', 'every move')} | {ci(r['his'])} | {ci(r['above'])} | {ci(r['delta'], sign=True)} | "
                   + (f"{r['pHolm']:.4f} | {'yes' if r['separates'] else 'no'}" if c != "all" else " | ")
                   + f" | {share} |")
    out += ["", "Ranked: " + (", ".join(res["ranked"]) if res["ranked"] else "none") + ".", "",
            f"## The discount (his band; the app's {res['app']['LEAK_DISCOUNT']})", "",
            "| Cause | δ | Verdict |", "|---|---|---|"]
    for c in causes + ["all"]:
        r = res["discount"][c]
        out.append(f"| {res['separates'][c].get('label', 'every move')} | {ci(r)} | {r['verdict']} |")
    out += ["", "## Error kinds by band", "",
            "| Band | " + " | ".join(f"{name} per game" for _, name in KINDS) + " | Hanging a piece: once every N games |",
            "|---" * (len(KINDS) + 2) + "|"]
    for b, row in res["kinds"].items():
        out.append(f"| {b} | " + " | ".join(ci(row[k]['perGame']) for k, _ in KINDS)
                   + f" | {num(row['hanging']['everyGames'], 1)} |")
    out += ["", "Points a game they cost:", "",
            "| Band | " + " | ".join(name for _, name in KINDS) + " |", "|---" * (len(KINDS) + 1) + "|"]
    for b, row in res["kinds"].items():
        out.append(f"| {b} | " + " | ".join(ci(row[k]['points']) for k, _ in KINDS) + " |")
    out += ["", "## The trend", "", "| Cause | " + " | ".join(res["trend"]) + " |", "|---" * (len(res["trend"]) + 1) + "|"]
    for c in causes + ["all"]:
        out.append(f"| {res['separates'][c].get('label', 'every move')} | "
                   + " | ".join(num(res["trend"][b][c]["value"]) for b in res["trend"]) + " |")
    arc = res["archive"]
    if arc:
        out += ["", "## His games", "",
                f"{arc['games']:,} of his 10-minute games, priced on the yardstick (his own slope: "
                f"{num(arc['ownSlope'], 6)}).", "",
                "| Cause | His games | His band | The band above |", "|---|---|---|---|"]
        for c in causes + ["all"]:
            r = res["separates"][c]
            out.append(f"| {r.get('label', 'every move')} | {ci(arc['causes'][c])} | {num(r['his']['value'])} | "
                       f"{num(r['above']['value'])} |")
        out += ["", "| Kind | His per game | Once every N games |", "|---|---|---|"]
        for k, name in KINDS:
            out.append(f"| {name} | {ci(arc['kinds'][k]['perGame'])} | {num(arc['kinds'][k]['everyGames'], 1)} |")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    args = ap.parse_args()
    res = run(args.month)
    out = PROJECT / "results"
    out.mkdir(exist_ok=True)
    (out / "analysis.json").write_text(json.dumps(res, indent=2, default=lambda o: o.item()) + "\n")
    (out / "analysis.md").write_text(markdown(res))
    print(json.dumps({"seconds": res["seconds"], "ranked": res["ranked"],
                      "discount": {c: r["verdict"] for c, r in res["discount"].items()}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
