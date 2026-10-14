#!/usr/bin/env python3
"""The rule in README.md over the moves facts.mjs built.

    python3 projects/think-time-rapid/analyze.py --month 2026-09

Reads private/think-time-rapid/moves-<month>*.csv.gz and the app constants
facts.mjs wrote beside them, fits the danger score, applies the rule and writes
the aggregates to results/analysis.json and results/analysis.md. Nothing per
game is written to results/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.metrics import roc_auc_score

LAB = Path(__file__).resolve().parents[2]
PROJECT = LAB / "projects" / "think-time-rapid"
PRIVATE = LAB / "private" / "think-time-rapid"

# The study's own parameters, as the README fixes them.
WINDOW = (1250, 1449)          # his level: the primary set's mover ratings
MIN_CLOCK = 60                 # seconds on the mover's clock before the move
STRATA = 5                     # quintiles of the danger score
DRAWS = 2000
SEED = 20261014
ALPHA = 0.05
TRIGGERS = ["book-end", "conversion", "forcing", "structure"]
THINK_BINS = [(10, 14), (15, 19), (20, 29), (30, 44), (45, 59), (60, 89), (90, None)]
PLATEAU = 60                   # a think of this long or more is the plateau
BAR_SHARE = 0.8
DEFENDING_CP = -300            # conversion's mirror (triggerOf converts from +300)
EARLY_OWN_MOVES = 4            # the book-end move and the player's next four
HIGH_DANGER = 0.8              # the top fifth of the danger score
RATING_BINS = [(900, 1099), (1100, 1299), (1300, 1499), (1500, 1699), (1700, 1899), (1900, 2099)]

LGB_PARAMS = dict(objective="binary", n_estimators=400, learning_rate=0.05, num_leaves=31,
                  min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                  reg_lambda=1.0, random_state=0, n_jobs=4, verbose=-1, deterministic=True, force_row_wise=True)
FEATURES = ["rating", "oppRating", "clockBefore", "oppClock", "oppThink", "ply", "sinceBook", "evalBefore",
            "wpBefore", "phaseCode", "material", "legalMoves", "forcing", "hangingOwn", "hangingOpp", "inCheck",
            "prevCapture", "afterOppError", "afterOwnError", "black"]
PHASES = {"opening": 0, "middlegame": 1, "endgame": 2}
CANDIDATES = [
    ("in-check", "in check"),
    ("after-capture", "just after a capture"),
    ("own-hanging", "one of his pieces hanging"),
    ("opp-hanging", "one of the opponent's pieces hanging"),
    ("after-opp-error", "just after the opponent's serious error"),
    ("defending", "defending: eval −3 or worse"),
    ("early", "the book-end move and his next four"),
    ("high-danger", "high danger: the top fifth of the danger score"),
]


def load(month: str) -> pd.DataFrame:
    files = sorted(PRIVATE.glob(f"moves-{month}*.csv.gz"))
    if not files:
        raise SystemExit(f"no moves for {month}: run facts.mjs first")
    d = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
    d["phaseCode"] = d["phase"].map(PHASES)
    d["black"] = (d["color"] == "b").astype(int)
    d["sinceBook"] = d["ply"] - d["bookExitPly"]
    d["trigger"] = d["trigger"].fillna("none")
    return d


def fold_of(game: str) -> int:
    return int(hashlib.md5(game.encode()).hexdigest()[:8], 16) % 2


def danger_scores(a: pd.DataFrame, quick: np.ndarray) -> tuple[np.ndarray, dict]:
    """The danger score, cross-fitted in two halves by game, trained on quick moves."""
    folds = a["game"].map(fold_of).to_numpy()
    score = np.full(len(a), np.nan)
    x = a[FEATURES].astype(float).to_numpy()
    y = a["serious"].to_numpy().astype(int)
    for f in (0, 1):
        train = (folds != f) & quick
        model = lgb.LGBMClassifier(**LGB_PARAMS).fit(x[train], y[train])
        score[folds == f] = model.predict_proba(x[folds == f])[:, 1]
    long_ = ~quick
    diag = {
        "aucQuick": float(roc_auc_score(y[quick], score[quick])),
        "aucOther": float(roc_auc_score(y[long_], score[long_])),
        "meanScoreQuick": float(score[quick].mean()), "seriousQuick": float(y[quick].mean()),
    }
    return score, diag


class Draws:
    """Poisson(1) weights over games, the same draws for every estimate."""

    def __init__(self, games: int, draws: int, seed: int):
        self.games = games
        # Games by draws, so a sparse (cells by games) product reads it row by row.
        self.wt = np.ascontiguousarray(np.random.default_rng(seed).poisson(1.0, size=(draws, games)).astype(np.float32).T)

    def sums(self, gi: np.ndarray, cell: np.ndarray, ncell: int, y: np.ndarray) -> tuple:
        """Per-cell counts and serious sums: the point (ncell,) and the draws (draws, ncell)."""
        n = len(gi)
        c = sparse.csr_matrix((np.ones(n, np.float32), (gi, cell)), shape=(self.games, ncell))
        s = sparse.csr_matrix((y.astype(np.float32), (gi, cell)), shape=(self.games, ncell))
        return (np.asarray(c.sum(0)).ravel(), np.asarray(s.sum(0)).ravel(),
                np.asarray((c.T.tocsr() @ self.wt).T), np.asarray((s.T.tocsr() @ self.wt).T))


def stratified(cq, sq, cl, sl):
    """Δ: long minus quick per stratum, weighted by the quick moves; strata without a long move add nothing."""
    with np.errstate(invalid="ignore", divide="ignore"):
        ok = (cl > 0) & (cq > 0)
        diff = np.where(ok, sl / np.where(cl > 0, cl, 1) - sq / np.where(cq > 0, cq, 1), 0.0)
        w = np.where(ok, cq, 0.0)
        total = w.sum(-1)
        delta = np.where(total > 0, (w * diff).sum(-1) / np.where(total > 0, total, 1), np.nan)
        dropped = 1 - total / np.maximum(cq.sum(-1), 1e-9)
    return delta, dropped


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


class Study:
    def __init__(self, a: pd.DataFrame, draws: Draws, rushed: int, deep: int, quick_floor: int | None = None):
        self.a = a
        self.draws = draws
        self.think = a["think"].to_numpy()
        lo = -1 if quick_floor is None else quick_floor
        self.quick = (self.think < rushed) & (self.think > lo)
        self.long = self.think >= deep
        self.gi = a["gi"].to_numpy()
        self.y = a["serious"].to_numpy().astype(np.float32)
        self.danger = a["danger"].to_numpy()

    def strata(self, mask: np.ndarray, k: int) -> np.ndarray:
        """Each move's stratum at the quantiles of the danger score over the set's quick moves."""
        q = self.danger[mask & self.quick]
        if len(q) < k:
            return np.zeros(len(self.a), dtype=int)
        cuts = np.quantile(q, np.linspace(0, 1, k + 1)[1:-1])
        return np.searchsorted(cuts, self.danger, side="right")

    def delta(self, mask: np.ndarray, k: int = STRATA, long_mask: np.ndarray | None = None) -> dict:
        """Δ for a set of moves: the point, its draws, the dropped weight and the counts."""
        long_ = self.long if long_mask is None else long_mask
        st = self.strata(mask, k)
        keep = mask & (self.quick | long_)
        cell = st[keep] * 2 + long_[keep].astype(int)
        c, s, cd, sd = self.draws.sums(self.gi[keep], cell, 2 * k, self.y[keep])
        point, dropped = stratified(c[0::2], s[0::2], c[1::2], s[1::2])
        draws, _ = stratified(cd[:, 0::2], sd[:, 0::2], cd[:, 1::2], sd[:, 1::2])
        nq, nl = int(c[0::2].sum()), int(c[1::2].sum())
        return {"delta": float(point), "draws": draws, "dropped": float(dropped), "quick": nq, "long": nl,
                "rateQuick": float(s[0::2].sum() / max(nq, 1)), "rateLong": float(s[1::2].sum() / max(nl, 1)),
                "moves": int(mask.sum())}

    def think_means(self, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Mean think of the set's long minus quick moves: the point and the draws."""
        keep = mask & (self.quick | self.long)
        cell = self.long[keep].astype(int)
        c, s, cd, sd = self.draws.sums(self.gi[keep], cell, 2, self.think[keep])
        point = s[1] / c[1] - s[0] / c[0]
        with np.errstate(invalid="ignore", divide="ignore"):
            draws = sd[:, 1] / cd[:, 1] - sd[:, 0] / cd[:, 0]
        return point, draws


def summary(est: dict) -> dict:
    out = {k: v for k, v in est.items() if k != "draws"}
    out.update(interval(est["draws"]))
    return out


def compare(a: dict, b: dict) -> dict:
    d = a["draws"] - b["draws"]
    return {"delta": a["delta"] - b["delta"], **interval(d)}


def log(started: float, what: str) -> None:
    print(f"{time.time() - started:7.1f}s  {what}", file=sys.stderr, flush=True)


def run(month: str) -> dict:
    started = time.time()
    const = json.loads((PRIVATE / "app-constants.json").read_text())
    rushed, deep, book_end = const["RUSHED_SECONDS"], const["DEEP_THINK_SECONDS"], const["BOOK_END_SECONDS"]
    decided = next(b["maxSeconds"] for b in const["CLOCK_BUCKETS"])
    games_meta = json.loads((PRIVATE / f"games-{month}.json").read_text())
    shards = [json.loads(p.read_text()) for p in sorted(PRIVATE.glob(f"moves-{month}*.json"))]

    d = load(month)
    a = d[d["think"].notna() & (d["nonTrivial"] == 1) & (d["clockBefore"] >= MIN_CLOCK)].reset_index(drop=True)
    games = pd.Index(a["game"].unique())
    a["gi"] = games.get_indexer(a["game"])
    log(started, f"loaded {len(d):,} moves, {len(a):,} analysed")
    quick_all = (a["think"] < rushed).to_numpy()
    a["danger"], diag = danger_scores(a, quick_all)
    log(started, "danger score fitted")
    draws = Draws(len(games), DRAWS, SEED)
    st = Study(a, draws, rushed, deep)

    in_window = a["rating"].between(*WINDOW).to_numpy()
    trig = a["trigger"].to_numpy()
    sets = {t: in_window & (trig == t) for t in TRIGGERS + ["none"]}
    player_games = a.loc[in_window, ["game", "color"]].drop_duplicates().shape[0]

    # 1-3: the triggers.
    est = {t: st.delta(m) for t, m in sets.items()}
    p_cmp = []
    triggers = {}
    for t in TRIGGERS:
        c = compare(est[t], est["none"])
        p_cmp.append(c["p"])
        gap, gap_draws = st.think_means(sets[t])
        with np.errstate(invalid="ignore", divide="ignore"):
            saved = -est[t]["draws"] * 60 / gap_draws
        triggers[t] = {**summary(est[t]), "vsNone": c, "perGame": sets[t].sum() / player_games,
                       "thinkGap": float(gap), "savedPerMinute": {"value": float(-est[t]["delta"] * 60 / gap),
                                                                  **interval(saved)}}
    for t, ph in zip(TRIGGERS, holm(p_cmp)):
        r = triggers[t]
        r["vsNone"]["pHolm"] = ph
        pays = r["hi"] < 0
        marks = pays and r["vsNone"]["delta"] < 0 and ph < ALPHA
        r["pays"], r["marks"] = bool(pays), bool(marks)
        r["verdict"] = "keep" if marks else "pays, but no more than an ordinary move" if pays else "no sign it pays"
    gap, gap_draws = st.think_means(sets["none"])
    none = {**summary(est["none"]), "perGame": sets["none"].sum() / player_games, "thinkGap": float(gap)}

    log(started, "triggers")
    # 4: the candidates.
    prim_quick_danger = a.loc[in_window & st.quick, "danger"]
    cut_high = float(np.quantile(prim_quick_danger, HIGH_DANGER))
    # Each player's book-end move, from every timed move (it need not be analysed itself).
    ends = d.loc[d["trigger"] == "book-end"].groupby(["game", "color"])["ply"].min().rename("endPly")
    end_ply = a[["game", "color"]].merge(ends, left_on=["game", "color"], right_index=True, how="left")["endPly"].to_numpy()
    ply = a["ply"].to_numpy()
    cand_masks = {
        "in-check": a["inCheck"].to_numpy() == 1,
        "after-capture": a["prevCapture"].to_numpy() == 1,
        "own-hanging": a["hangingOwn"].to_numpy() > 0,
        "opp-hanging": a["hangingOpp"].to_numpy() > 0,
        "after-opp-error": a["afterOppError"].to_numpy() == 1,
        "defending": a["evalBefore"].to_numpy() <= DEFENDING_CP,
        "early": (ply >= end_ply) & (ply <= end_ply + 2 * EARLY_OWN_MOVES),
        "high-danger": a["danger"].to_numpy() >= cut_high,
    }
    cand_est = {k: st.delta(in_window & m) for k, m in cand_masks.items()}
    cand_cmp = {k: compare(e, est["none"]) for k, e in cand_est.items()}
    adj = holm([cand_cmp[k]["p"] for k, _ in CANDIDATES])
    candidates = {}
    for (k, label), ph in zip(CANDIDATES, adj):
        r = {**summary(cand_est[k]), "label": label, "vsNone": {**cand_cmp[k], "pHolm": ph},
             "perGame": (in_window & cand_masks[k]).sum() / player_games}
        r["pays"] = bool(r["hi"] < 0)
        r["join"] = bool(r["pays"] and r["vsNone"]["delta"] < 0 and ph < ALPHA)
        candidates[k] = r

    log(started, "candidates")
    # 5: the bars.
    bars = {}
    for t in TRIGGERS:
        m = sets[t]
        rows = []
        for lo, hi in THINK_BINS:
            lm = (st.think >= lo) & (st.think <= (np.inf if hi is None else hi))
            e = st.delta(m, long_mask=lm)
            rows.append({"bin": f"{lo}-{hi}" if hi is not None else f"{lo}+", "from": lo, **summary(e)})
        plateau = summary(st.delta(m, long_mask=st.think >= PLATEAU))
        app_bar = book_end if t == "book-end" else deep
        bar = None
        if plateau["hi"] < 0:
            bar = next((r["from"] for r in rows if r["delta"] <= BAR_SHARE * plateau["delta"]), None)
        bars[t] = {"bins": rows, "plateau": plateau, "bar": bar, "appBar": app_bar,
                   "verdict": "no bar" if bar is None else "the app's bar" if bar == app_bar
                   else "the app's bar is longer" if app_bar > bar else "the app's bar is shorter"}

    log(started, "bars")
    # Without a rule: the trend with rating, the same position, the sensitivity.
    rating = a["rating"].to_numpy()
    trend = {}
    for lo, hi in RATING_BINS:
        inb = (rating >= lo) & (rating <= hi)
        e_none = st.delta(inb & (trig == "none"))
        row = {"none": summary(e_none)}
        for t in TRIGGERS:
            e = st.delta(inb & (trig == t))
            row[t] = {**summary(e), "vsNone": compare(e, e_none)}
        trend[f"{lo}-{hi}"] = row

    same = same_position(a, st, sets["book-end"], draws)

    sens_quick = Study(a, draws, rushed, deep, quick_floor=decided)
    sens = {"quickFrom": decided, "strata10": {}, "quick6to10": {}}
    e10_none = st.delta(sets["none"], k=10)
    q_none = sens_quick.delta(sets["none"])
    for t in TRIGGERS:
        e10 = st.delta(sets[t], k=10)
        sens["strata10"][t] = {**summary(e10), "vsNone": compare(e10, e10_none)}
        eq = sens_quick.delta(sets[t])
        sens["quick6to10"][t] = {**summary(eq), "vsNone": compare(eq, q_none)}

    archive = archive_summary(st, a, in_window, rushed, deep)

    return {
        "month": month,
        "appCommit": const["appCommit"],
        "constants": {"RUSHED_SECONDS": rushed, "DEEP_THINK_SECONDS": deep, "BOOK_END_SECONDS": book_end},
        "games": {"kept": games_meta["kept"], "read": games_meta["gamesRead"],
                  "built": sum(s["gamesBuilt"] for s in shards),
                  "skipped": {k: sum(s["skipped"].get(k, 0) for s in shards)
                              for k in sorted(set().union(*(s["skipped"] for s in shards)))},
                  "blackBuildsChecked": sum(s["blackBuildsChecked"] for s in shards)},
        "moves": {"timed": int(len(d)), "analysed": int(len(a)), "primary": int(in_window.sum()),
                  "primaryPlayerGames": int(player_games), "primaryQuick": int((in_window & st.quick).sum()),
                  "primaryLong": int((in_window & st.long).sum())},
        "danger": {**diag, "features": FEATURES, "params": LGB_PARAMS, "highDangerCut": cut_high},
        "triggers": triggers, "none": none, "candidates": candidates, "bars": bars,
        "trend": trend, "samePosition": same, "sensitivity": sens, "archive": archive,
        "seconds": round(time.time() - started),
    }


def same_position(a: pd.DataFrame, st: Study, mask: np.ndarray, draws: Draws) -> dict:
    """Book-end moves compared within one position: long minus quick in each, weighted by its quick moves."""
    keep = mask & (st.quick | st.long) & a["fen"].notna().to_numpy()
    sub = a.loc[keep, ["fen"]].copy()
    sub["long"] = st.long[keep]
    both = sub.groupby("fen")["long"].agg(["min", "max"])
    fens = both.index[(both["min"] == 0) & (both["max"] == 1)]
    pos = pd.Index(fens).get_indexer(sub["fen"])
    ok = pos >= 0
    idx = np.flatnonzero(keep)[ok]
    cell = pos[ok] * 2 + st.long[idx].astype(int)
    c, s, cd, sd = draws.sums(st.gi[idx], cell, 2 * len(fens), st.y[idx])
    point, _ = stratified(c[0::2], s[0::2], c[1::2], s[1::2])
    dr, _ = stratified(cd[:, 0::2], sd[:, 0::2], cd[:, 1::2], sd[:, 1::2])
    return {"positions": int(len(fens)), "quick": int(c[0::2].sum()), "long": int(c[1::2].sum()),
            "delta": float(point), **interval(dr)}


def archive_summary(st: Study, a: pd.DataFrame, in_window: np.ndarray, rushed: int, deep: int) -> dict | None:
    """His own games, described beside the primary set (archive.mjs writes them; absent until it has run)."""
    path = PRIVATE / "archive-moves.csv.gz"
    if not path.exists():
        return None
    h = pd.read_csv(path, low_memory=False)
    h["trigger"] = h["trigger"].fillna("none")
    h = h[h["think"].notna() & (h["nonTrivial"] == 1) & (h["clockBefore"] >= MIN_CLOCK)]
    games = h["game"].nunique()
    prim = a[in_window]
    out = {"games": int(games), "moves": int(len(h)), "byTrigger": {}}
    for t in TRIGGERS + ["none"]:
        mine, peers = h[h["trigger"] == t], prim[prim["trigger"] == t]
        row = {"perGame": len(mine) / max(games, 1), "peersPerGame": len(peers) / max(len(prim[["game", "color"]].drop_duplicates()), 1)}
        for name, x in (("his", mine), ("peers", peers)):
            th = x["think"]
            row[name] = {"moves": int(len(x)), "longShare": float((th >= deep).mean()) if len(x) else None,
                         "quickShare": float((th < rushed).mean()) if len(x) else None,
                         "seriousQuick": float(x.loc[th < rushed, "serious"].mean()) if (th < rushed).any() else None,
                         "seriousLong": float(x.loc[th >= deep, "serious"].mean()) if (th >= deep).any() else None,
                         "quickN": int((th < rushed).sum()), "longN": int((th >= deep).sum())}
        out["byTrigger"][t] = row
    return out


def pp(x: float | None) -> str:
    """A rate difference in percentage points."""
    return "n/a" if x is None or not np.isfinite(x) else f"{x * 100:+.1f}"


def ci(r: dict) -> str:
    return f"{pp(r['delta'])} ({pp(r['lo'])} to {pp(r['hi'])})"


def pct(x: float | None) -> str:
    return "n/a" if x is None or not np.isfinite(x) else f"{x * 100:.1f}%"


def markdown(res: dict) -> str:
    """The report, every number from the analysis."""
    g, mv, dg = res["games"], res["moves"], res["danger"]
    out = [
        "# Think time in rapid: results",
        "",
        f"Written by `analyze.py` for the Lichess month {res['month']} on the app at `{res['appCommit']}`. "
        "Rates are serious errors per move; Δ is long minus quick in percentage points, adjusted by the danger "
        "score's strata, with its 95% bootstrap interval over games.",
        "",
        "## Data",
        "",
        f"- Games: {g['built']:,} built of {sum(g['kept'].values()):,} kept from {g['read']:,} read"
        + (f"; skipped {g['skipped']}" if g["skipped"] else "") + f". Black's flipped build matched its own build "
        f"on all {g['blackBuildsChecked']:,} games checked.",
        f"- Moves: {mv['timed']:,} timed, {mv['analysed']:,} analysed, {mv['primary']:,} in the primary set "
        f"({mv['primaryPlayerGames']:,} player-games; {mv['primaryQuick']:,} quick, {mv['primaryLong']:,} long).",
        f"- Danger score: AUC {dg['aucQuick']:.3f} on quick moves and {dg['aucOther']:.3f} on the others, "
        "each scored by the half that never saw its game.",
        "",
        "## The triggers",
        "",
        "| Moment | Per game | Quick | Long | Errors, quick | Errors, long | Δ | Δ − Δ none | Holm p | Verdict | Errors saved per extra minute |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for t, r in res["triggers"].items():
        out.append(f"| {t} | {r['perGame']:.1f} | {r['quick']:,} | {r['long']:,} | {pct(r['rateQuick'])} | "
                   f"{pct(r['rateLong'])} | {ci(r)} | {ci(r['vsNone'])} | {r['vsNone']['pHolm']:.3f} | "
                   f"{r['verdict']} | {r['savedPerMinute']['value']:.3f} ({r['savedPerMinute']['lo']:.3f} to "
                   f"{r['savedPerMinute']['hi']:.3f}) |")
    n = res["none"]
    out.append(f"| none | {n['perGame']:.1f} | {n['quick']:,} | {n['long']:,} | {pct(n['rateQuick'])} | "
               f"{pct(n['rateLong'])} | {ci(n)} | | | | |")
    out += ["", "## Candidates", "",
            "| Candidate | Per game | Quick | Long | Δ | Δ − Δ none | Holm p | Pays | Should join |",
            "|---|---|---|---|---|---|---|---|---|"]
    for r in res["candidates"].values():
        out.append(f"| {r['label']} | {r['perGame']:.1f} | {r['quick']:,} | {r['long']:,} | {ci(r)} | "
                   f"{ci(r['vsNone'])} | {r['vsNone']['pHolm']:.3f} | {'yes' if r['pays'] else 'no'} | "
                   f"{'yes' if r['join'] else 'no'} |")
    out += ["", "## The bars", ""]
    for t, b in res["bars"].items():
        out += [f"**{t}.** A think of {PLATEAU} seconds or more: Δ {ci(b['plateau'])}. "
                f"Bar: {'none' if b['bar'] is None else str(b['bar']) + ' s'}; the app's: {b['appBar']} s "
                f"({b['verdict']}).", "", "| Think (s) | Moves | Δ |", "|---|---|---|"]
        out += [f"| {r['bin']} | {r['long']:,} | {ci(r)} |" for r in b["bins"]]
        out.append("")
    out += ["## The trend with rating", "",
            "| Mover's rating | none | " + " | ".join(TRIGGERS) + " |", "|---" * (len(TRIGGERS) + 2) + "|"]
    for band, row in res["trend"].items():
        out.append(f"| {band} | {ci(row['none'])} | " + " | ".join(ci(row[t]) for t in TRIGGERS) + " |")
    sp = res["samePosition"]
    out += ["", "## The same position", "",
            f"Book-end moves in {sp['positions']:,} positions reached with both a quick and a long think "
            f"({sp['quick']:,} quick, {sp['long']:,} long): Δ {ci(sp)}.", "",
            "## Sensitivity", "",
            "| Moment | Δ, ten strata | Δ − Δ none, ten strata | Δ, quick from 6 s | Δ − Δ none, quick from 6 s |",
            "|---|---|---|---|---|"]
    for t in TRIGGERS:
        a, b = res["sensitivity"]["strata10"][t], res["sensitivity"]["quick6to10"][t]
        out.append(f"| {t} | {ci(a)} | {ci(a['vsNone'])} | {ci(b)} | {ci(b['vsNone'])} |")
    arc = res["archive"]
    if arc:
        out += ["", "## His games", "",
                f"{arc['games']:,} of his 10-minute games, {arc['moves']:,} moves analysed. Raw rates, no adjustment.", "",
                "| Moment | His per game | Peers per game | His long share | Peers' long share | His errors quick | His errors long | Peers' errors quick | Peers' errors long |",
                "|---|---|---|---|---|---|---|---|---|"]
        for t, r in arc["byTrigger"].items():
            h, q = r["his"], r["peers"]
            out.append(f"| {t} | {r['perGame']:.1f} | {r['peersPerGame']:.1f} | {pct(h['longShare'])} | "
                       f"{pct(q['longShare'])} | {pct(h['seriousQuick'])} (n={h['quickN']}) | "
                       f"{pct(h['seriousLong'])} (n={h['longN']}) | {pct(q['seriousQuick'])} | {pct(q['seriousLong'])} |")
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
    print(json.dumps({"seconds": res["seconds"], "triggers": {t: r["verdict"] for t, r in res["triggers"].items()}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
