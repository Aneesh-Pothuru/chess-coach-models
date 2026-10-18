#!/usr/bin/env python3
"""The fixed README's analysis. Never run on a timing slice.

Only ``--run full --phase2-reviewed`` enables reading real outcomes. The
loader then requires complete streams, position scans and score shards for
all three months, with every kept row scored once. Synthetic unit tests call
the pure statistical functions and do not read any games.

All proportions use [0, 1]; the Markdown report prints percentage points.
No chess is judged here. Soundness and board features are app bridge output.
"""
from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

# The owner shares this machine. Do not let a NumPy import create a large
# BLAS pool. This analysis is one process and runs after the engine workers.
for _name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[_name] = "1"
import numpy as np

LAB = Path(__file__).resolve().parents[2]
PROJECT = Path(__file__).resolve().parent
PRIVATE = LAB / "private" / "rules-of-thumb"
MONTHS = ("2026-07", "2026-08", "2026-09")
RULES = (
    "active-king", "opposition", "square-rule", "rook-behind-passer", "cut-off-king",
    "outside-passer", "trade-when-ahead", "lucena", "philidor", "open-file",
    "rook-on-the-seventh", "outpost", "pawn-break", "passed-pawn", "bishop-pair",
    "king-shelter", "worst-piece",
)
BANDS = (1300, 1500)
DRAWS = 2000
SEED = 20261018
SPLITS = {
    "opponentThreat": (False, True),
    "material": ("ahead", "level", "behind"),
    "phase": ("middlegame", "endgame"),
    "forcing": (False, True),
    "kingDanger": (False, True),
}


def cell_name(value):
    return str(value).lower() if isinstance(value, bool) else value


def finite(value):
    return float(value) if value is not None and math.isfinite(value) else None


def interval(point, draws):
    """Linear-interpolated empirical 2.5th and 97.5th percentiles.

    A bootstrap draw with an empty subgroup has an undefined ratio. It is
    omitted from that interval and counted, not converted to a zero.
    """
    values = np.asarray(draws, dtype=float)
    good = values[np.isfinite(values)]
    lo, hi = np.percentile(good, [2.5, 97.5], method="linear") if len(good) else (None, None)
    return {"value": finite(point), "lo": finite(lo), "hi": finite(hi),
            "validDraws": int(len(good)), "undefinedDraws": int(len(values) - len(good))}


class GameBootstrap:
    """Fixed-size samples with replacement over distinct games.

    All rows of a drawn game receive the same multiplicity. The fixed rule
    permits one row per game per rule; supporting clusters here also makes
    that property testable rather than relying on an accidental row draw.
    The same multiplicities serve all bands, paired moves and split cells.
    """
    def __init__(self, games, draws=DRAWS, seed=SEED):
        ids = sorted(set(games))
        index = {game: i for i, game in enumerate(ids)}
        self.gi = np.asarray([index[game] for game in games], dtype=np.int32)
        self.games = len(ids)
        self.draws = draws
        self.weights = np.zeros((draws, self.games), dtype=np.float64)
        rng = np.random.default_rng(seed)
        for draw in range(draws):
            if self.games:
                chosen = rng.integers(0, self.games, size=self.games)
                self.weights[draw] = np.bincount(chosen, minlength=self.games)
        self._denominators = {}
        self._means = {}

    def totals(self, x, mask):
        values = np.asarray(x, dtype=float)
        keep = np.asarray(mask, dtype=bool)
        per_game = np.bincount(self.gi[keep], weights=values[keep], minlength=self.games)
        return float(per_game.sum()), self.weights @ per_game

    def mean(self, x, mask=None):
        if mask is None:
            mask = np.ones(len(self.gi), dtype=bool)
        keep = np.asarray(mask, dtype=bool)
        values = np.asarray(x, dtype=float)
        result_key = (values.tobytes(), keep.tobytes())
        if result_key in self._means:
            return self._means[result_key]
        key = keep.tobytes()
        if key not in self._denominators:
            self._denominators[key] = self.totals(np.ones(len(keep)), keep)
        count, sampled_counts = self._denominators[key]
        total, sampled_totals = self.totals(values, keep)
        with np.errstate(divide="ignore", invalid="ignore"):
            draws = sampled_totals / sampled_counts
        result = ((total / count if count else None), draws)
        self._means[result_key] = result
        return result

    def summary(self, x, mask=None):
        return interval(*self.mean(x, mask))

    def difference(self, x, first, second):
        ap, ad = self.mean(x, first)
        bp, bd = self.mean(x, second)
        return interval(ap - bp if ap is not None and bp is not None else None, ad - bd)


def above_zero(estimate):
    return estimate["lo"] is not None and estimate["lo"] > 0


def below_zero(estimate):
    return estimate["hi"] is not None and estimate["hi"] < 0


def verdict(train, heldout, heldout_positions):
    if heldout_positions < 300:
        return f"not enough data (n={heldout_positions})"
    if above_zero(train) and above_zero(heldout):
        return "Teach it"
    if below_zero(train) and below_zero(heldout):
        return "It misleads"
    return "No better than the natural move"


def step_up(train, heldout):
    return above_zero(train) and above_zero(heldout)


def failure_condition(train, heldout):
    # Ten points below the rest is inclusive; the entire interval below
    # zero is strict. No cell-size threshold was registered.
    return all(x["value"] is not None and
               (x["value"] <= -0.10 or math.isclose(x["value"], -0.10, rel_tol=0, abs_tol=1e-14)) and below_zero(x)
               for x in (train, heldout))


def split_summary(rows, boot, sound, base):
    out = {}
    for feature, cells in SPLITS.items():
        values = np.asarray([row["splits"][feature] for row in rows])
        out[feature] = {}
        for cell in cells:
            inside = base & (values == cell)
            rest = base & (values != cell)
            out[feature][cell_name(cell)] = {
                "positions": int(inside.sum()), "restPositions": int(rest.sum()),
                "soundnessR": boot.summary(sound, inside),
                "restSoundnessR": boot.summary(sound, rest),
                "difference": boot.difference(sound, inside, rest),
            }
    return out


def summarize_period(rows, draws=DRAWS, seed=SEED):
    # Month makes the game's identity explicit in the bootstrap. The loader
    # separately rejects a game appearing in more than one source month.
    boot = GameBootstrap([row["month"] + ":" + row["game"] for row in rows], draws, seed)
    band = np.asarray([row["band"] for row in rows])
    sound = {move: np.asarray([row["sound"][move] for row in rows], dtype=float) for move in "RNA"}
    adopted = np.asarray([row["A"] == row["R"] for row in rows], dtype=float)
    findability = np.asarray([row["probabilityRAtHisBand"] for row in rows], dtype=float)

    def group(mask):
        return {
            "positions": int(mask.sum()),
            "games": len({rows[i]["game"] for i in np.flatnonzero(mask)}),
            "soundness": {move: boot.summary(values, mask) for move, values in sound.items()},
            "lift": boot.summary(sound["R"] - sound["N"], mask),
            "adoption": boot.summary(adopted, mask),
            "probabilityRAtHisBand": boot.summary(findability, mask),
            "splits": split_summary(rows, boot, sound["R"], mask),
        }

    all_rows = group(np.ones(len(rows), dtype=bool))
    all_rows["byBand"] = {str(b): group(band == b) for b in BANDS}
    all_rows["adoptionDifferenceAboveMinusHis"] = boot.difference(adopted, band == 1500, band == 1300)
    return all_rows


def fit_tree(rows, depth=2):
    """A descriptive greedy categorical Gini tree, with at most two splits
    on a path. Equality vs all other cells is enough for these binary and
    three-cell features. No tunable sample minimum or pruning is added.
    Equal-gain candidates use SPLITS' order; tied leaves predict sound.
    """
    n = len(rows)
    bad = sum(not row["sound"]["R"] for row in rows)
    node = {"positions": n, "unsound": bad, "predictUnsound": bad > n / 2}
    if not n:
        node["predictUnsound"] = None
    if depth == 0 or bad in (0, n):
        return node
    impurity = lambda k, total: 2 * k * (total - k) / total if total else 0.0
    parent = impurity(bad, n)
    best = None
    best_gain = 0.0
    for feature, cells in SPLITS.items():
        # For two cells, the other equality is the identical partition.
        for cell in cells if len(cells) > 2 else cells[:1]:
            yes = [row for row in rows if row["splits"][feature] == cell]
            no = [row for row in rows if row["splits"][feature] != cell]
            if not yes or not no:
                continue
            loss = impurity(sum(not row["sound"]["R"] for row in yes), len(yes))
            loss += impurity(sum(not row["sound"]["R"] for row in no), len(no))
            gain = parent - loss
            if gain > best_gain:
                best_gain, best = gain, (feature, cell, yes, no)
    if best is not None:
        feature, cell, yes, no = best
        node.update({"feature": feature, "equals": cell, "giniGain": best_gain / n,
                     "yes": fit_tree(yes, depth - 1), "no": fit_tree(no, depth - 1)})
    return node


def predict_tree(tree, row):
    while "feature" in tree:
        tree = tree["yes" if row["splits"][tree["feature"]] == tree["equals"] else "no"]
    return tree["predictUnsound"]


def tree_report(train, heldout, draws=DRAWS):
    tree = fit_tree(train)
    predictions = [predict_tree(tree, row) for row in heldout]
    boot = GameBootstrap([row["game"] for row in heldout], draws, SEED)
    valid = np.asarray([value is not None for value in predictions], dtype=bool)
    correct = np.asarray([prediction == (not row["sound"]["R"])
                          for prediction, row in zip(predictions, heldout)], dtype=float)
    band = np.asarray([row["band"] for row in heldout])
    return {"tree": tree, "heldoutPositions": len(heldout),
            "heldoutAccuracy": boot.summary(correct, valid),
            "heldoutAccuracyByBand": {str(b): boot.summary(correct, valid & (band == b)) for b in BANDS}}


def availability(manifests, rule):
    def group(band=None):
        sources = [m["availability"]["all"] if band is None else m["availability"]["byBand"][str(band)]
                   for m in manifests]
        n = sum(x["positions"] for x in sources)
        k = sum(x["rules"][rule] for x in sources)
        return {"availablePositions": k, "positions": n, "share": k / n if n else None}
    return {**group(), "byBand": {str(band): group(band) for band in BANDS}}


def analyze(rows, manifests, app, draws=DRAWS, stage_events=None):
    """Aggregate already validated rows. Production calls always use 2000 draws.

    This function is also exercised with explicit synthetic rows by tests.
    Do not call it with phase-one timing data.
    """
    require(all(row.get("datasetKind") == "literal" for row in rows), "only the literal fixed-rule dataset can be analyzed")
    require(all(m.get("datasetKind") == "literal" for m in manifests), "only literal position manifests can be analyzed")
    out = {
        "app": app, "datasetKind": "literal", "data": {"source": "Lichess rated standard 600+0", "license": "CC0",
            "train": list(MONTHS[:2]), "heldout": MONTHS[2], "bands": {"1300": [1250, 1449], "1500": [1450, 1649]},
            "gamesByMonth": {m["month"]: m["games"] for m in manifests},
            "positionsByMonth": {m["month"]: m["positions"] for m in manifests}},
        "bootstrap": {"draws": draws, "seed": SEED, "unit": "game", "sampling": "with replacement, fixed game count",
            "interval": "95% percentile, linear interpolation", "undefined": "omit undefined ratios and count them"},
        "readings": {"train": "July and August pooled", "verdictPopulation": "both bands pooled",
            "bootstrapPopulation": "games retained for each rule, separately for train and heldout",
            "tree": "greedy categorical Gini; maximum depth 2; deterministic feature/cell order; ties predict sound",
            "emptyCells": "undefined differences cannot establish a failure; no extra minimum count",
            "failureGap": "cell minus all remaining cells of that split; at most -0.10 in each period",
            "multiplicity": "no adjustment; none is registered"},
        "operations": {"byMonth": {m["month"]: m.get("stageTotals") for m in manifests},
            "stageAttempts": stage_attempts(stage_events),
            "stageEventsRecorded": stage_events is not None,
            "timingDefinition": "Worker seconds sum process time across workers and resumes; stage seconds sum completed/stopped invocation wall times. Completed-row instrument time excludes failed attempts, which are reported separately.",
            "missing": "null means the instrument did not report this count or time"},
        "rules": {},
    }
    for rule in RULES:
        selected = [row for row in rows if row["rule"] == rule]
        train = [row for row in selected if row["month"] in MONTHS[:2]]
        heldout = [row for row in selected if row["month"] == MONTHS[2]]
        train_summary = summarize_period(train, draws)
        heldout_summary = summarize_period(heldout, draws)
        failures = []
        for feature, cells in SPLITS.items():
            for cell in cells:
                name = cell_name(cell)
                before = train_summary["splits"][feature][name]["difference"]
                after = heldout_summary["splits"][feature][name]["difference"]
                if failure_condition(before, after):
                    failures.append({"split": feature, "cell": cell, "train": before, "heldout": after})
        out["rules"][rule] = {
            "countsByMonth": {m["month"]: {
                "scannedGames": m["games"], "scannedPositions": m["positions"],
                "availablePositions": m["availability"]["all"]["rules"][rule],
                "gamesWithAvailability": m.get("availableGames", {}).get(rule),
                "retainedPositions": m["kept"][rule],
                "scoredPositions": sum(row["month"] == m["month"] for row in selected),
            } for m in manifests},
            "verdict": verdict(train_summary["lift"], heldout_summary["lift"], len(heldout)),
            "stepUp": step_up(train_summary["adoptionDifferenceAboveMinusHis"], heldout_summary["adoptionDifferenceAboveMinusHis"]),
            "train": train_summary, "heldout": heldout_summary, "failureConditions": failures,
            "availability": {"all": availability(manifests, rule),
                "train": availability(manifests[:2], rule), "heldout": availability(manifests[2:], rule),
                "byMonth": {m["month"]: availability([m], rule) for m in manifests}},
            "descriptionTree": tree_report(train, heldout, draws),
        }
    return out


def read_jsonl(path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def measurement_versions():
    """Fingerprints must match the scripts that produce the three inputs."""
    return {
        "streamVersion": hashlib.sha256((PROJECT / "stream.py").read_bytes()).hexdigest(),
        "scannerVersion": hashlib.sha256((PROJECT / "positions.mjs").read_bytes()
                                          + (PROJECT / "detect.mjs").read_bytes()).hexdigest(),
        "scorerVersion": hashlib.sha256((PROJECT / "score.mjs").read_bytes()).hexdigest(),
    }


def require(condition, message):
    if not condition:
        raise ValueError(message)


def stage_attempts(events):
    """Aggregate only the supervisor's public operational counters.

    Analysis events are excluded: the current analysis's own duration is
    written separately after this function returns. Unknown details of
    attempts are not copied to the public result.
    """
    if events is None:
        return None
    attempts = {}
    groups = {}

    def group_for(stage, month):
        return groups.setdefault(stage, {}).setdefault(month, {
            "attempts": 0, "completedJobs": 0, "stoppedJobs": 0, "unfinishedJobs": 0,
            "completedSeconds": 0.0, "stoppedSeconds": 0.0, "cumulativeFinishedInvocationSeconds": 0.0,
            "alreadyCompleteChecks": 0, "restartBackoffs": 0, "restartBackoffSeconds": 0.0,
        })

    for event in events:
        stage, month = event["stage"], event.get("month") or "all"
        require(stage in ("stream", "positions", "score", "analysis"), "unknown stage event")
        require(month in (*MONTHS, "all"), "unknown stage month")
        if stage == "analysis":
            continue
        require(event["event"] in ("started", "completed", "stopped", "already-complete", "restart-backoff"), "unknown stage event kind")
        if event["event"] == "already-complete":
            group_for(stage, month)["alreadyCompleteChecks"] += 1
            continue
        if event["event"] == "restart-backoff":
            seconds = event["seconds"]
            require(isinstance(seconds, (int, float)) and not isinstance(seconds, bool)
                    and math.isfinite(seconds) and seconds >= 0, "invalid retry backoff")
            group_for(stage, month)["restartBackoffs"] += 1
            group_for(stage, month)["restartBackoffSeconds"] += seconds
            continue
        number = event["attempt"]
        key = stage, month, number
        if event["event"] == "started":
            require(key not in attempts, "stage attempt identifier was reused")
            attempts[key] = {"status": "started", "seconds": None}
        else:
            require(key in attempts and attempts[key]["status"] == "started", "stage terminal event has no unique start")
            seconds = event.get("seconds")
            require(isinstance(seconds, (int, float)) and not isinstance(seconds, bool)
                    and math.isfinite(seconds) and seconds >= 0, "invalid stage elapsed time")
            attempts[key] = {"status": event["event"], "seconds": seconds}
    for (stage, month, _), attempt in attempts.items():
        group = group_for(stage, month)
        group["attempts"] += 1
        if attempt["status"] == "started":
            group["unfinishedJobs"] += 1
        elif attempt["status"] == "completed":
            group["completedJobs"] += 1
            group["completedSeconds"] += attempt["seconds"]
        else:
            group["stoppedJobs"] += 1
            group["stoppedSeconds"] += attempt["seconds"]
        if attempt["seconds"] is not None:
            group["cumulativeFinishedInvocationSeconds"] += attempt["seconds"]
    return groups


def sum_reported(records, field):
    values = [record.get(field) for record in records]
    if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value)
           for value in values):
        return None
    return sum(values)


def stage_totals(stream, scan, scores):
    """Whitelist numbers; errors, worker identities and private paths stay private."""
    metric_names = ("maiaSeconds", "engineSeconds", "tablebaseSeconds", "rowSeconds", "newGameSeconds",
                    "maiaCalls", "maiaBands", "bestCalls", "scoreCalls", "tablebaseCalls", "tablebaseUnavailable",
                    "tablebaseRetries", "tablebaseRetrySeconds", "newGameCalls")
    completed = [score.get("totals", {}) for score in scores]
    failed = [score.get("failedAttemptTotals", {}) for score in scores]
    return {
        "stream": {"cumulativeCheckpointedSeconds": stream.get("seconds"), "gamesRead": stream.get("gamesRead"),
                   "gamesKept": stream["kept"]},
        "positions": {"completedGameTiming": {name: scan.get("timing", {}).get(name) for name in
                       ("seconds", "describeMoveSeconds", "worstPieceSeconds", "splitsSeconds")},
                      "lastInvocationWallSeconds": scan.get("wallSeconds"),
                      "describeMoveCalls": scan.get("describeMoveCalls"), "legalMoves": scan.get("legalMoves")},
        "score": {"workers": len(scores), "cumulativeWorkerSeconds": sum_reported(scores, "workerSeconds"),
                  "stoppedWorkerJobs": sum_reported(scores, "stoppedJobs"),
                  "completedRows": sum(score["rows"] for score in scores),
                  "completedRowTotals": {name: sum_reported(completed, name) for name in metric_names},
                  "failedAttemptTotals": {name: sum_reported(failed, name) for name in metric_names}},
    }


def row_key(row):
    return row["month"], row["game"], row["rule"]


def load_full(directory, app):
    """Validate coverage before a single decision statistic is computed."""
    manifests, rows = [], []
    game_month = {}
    versions = measurement_versions()
    for month in MONTHS:
        stream = json.loads((directory / f"games-{month}.json").read_text())
        scan = json.loads((directory / f"positions-{month}.json").read_text())
        require(scan.get("datasetKind") == "literal", f"{month}: nonliteral position dataset")
        require(stream.get("streamVersion") == versions["streamVersion"], f"{month}: stream code changed")
        require(scan.get("scannerVersion") == versions["scannerVersion"], f"{month}: position scanner code changed")
        for label, manifest in (("stream", stream), ("positions", scan)):
            require(manifest.get("month") == month, f"{label}: wrong month")
            require(manifest.get("complete") is True, f"{label} {month}: incomplete")
            require(manifest.get("run") == "full", f"{label} {month}: phase-one input")
            require(manifest.get("app") == app, f"{label} {month}: wrong app commit")
        require(scan["games"] == stream["kept"], f"{month}: stream/scan game count mismatch")
        require(stream.get("cap") == 30000, f"{month}: full stream cap must be 30000")
        require(stream["kept"] == 30000 or stream.get("eof") is True, f"{month}: stream ended before cap or EOF")
        source_path = directory / f"games-{month}.jsonl.gz"
        source_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
        require(scan.get("inputSha256") == source_sha, f"{month}: scan source changed")
        source_rows = read_jsonl(source_path)
        source_games = {row["id"] for row in source_rows}
        require(len(source_rows) == len(source_games) == stream["kept"], f"{month}: source game count or uniqueness mismatch")
        for game in source_games:
            previous = game_month.setdefault(game, month)
            require(previous == month, "a game appears in multiple months")
        input_path = directory / f"positions-{month}.jsonl.gz"
        input_sha = hashlib.sha256(input_path.read_bytes()).hexdigest()
        expected_rows = read_jsonl(input_path)
        expected = {row_key(row): row for row in expected_rows}
        require(len(expected) == len(expected_rows), f"{month}: repeated game/rule in kept positions")
        require(scan.get("outputSha256") == input_sha, f"{month}: positions changed after scan")
        require(scan.get("capPerRule") == 4000, f"{month}: position cap changed")
        require(scan.get("keptPositions") == len(expected_rows), f"{month}: position total mismatch")
        counts = Counter(row["rule"] for row in expected_rows)
        require(set(counts).issubset(RULES), f"{month}: unknown rule")
        for rule in RULES:
            require(counts[rule] == scan["kept"][rule] <= 4000, f"{month}: kept cap/count mismatch")
        for row in expected_rows:
            require(row.get("datasetKind") == "literal", "nonliteral position row")
            require(row["month"] == month, "position month mismatch")
            require(row["game"] in source_games, "position from a game outside the stream")
        shard_manifests = sorted(directory.glob(f"scored-{month}-*-of-*.json"))
        require(bool(shard_manifests), f"{month}: no score manifests")
        loaded_shards = [json.loads(path.read_text()) for path in shard_manifests]
        shard_counts = {manifest["shards"] for manifest in loaded_shards}
        require(len(shard_counts) == 1, f"{month}: mixed shard layouts")
        shards = shard_counts.pop()
        require(type(shards) is int and 1 <= shards <= 2, f"{month}: score worker count exceeds the reviewed allowance")
        require({m["shard"] for m in loaded_shards} == set(range(shards)), f"{month}: missing score shard")
        require(len(loaded_shards) == shards, f"{month}: repeated score shard")
        scored = {}
        for path, manifest in zip(shard_manifests, loaded_shards):
            require(manifest.get("datasetKind") == "literal", f"{path.name}: nonliteral score dataset")
            require(manifest.get("complete") is True and manifest.get("run") == "full" and manifest.get("timing") is False, f"{path.name}: incomplete or phase one")
            require(manifest.get("app") == app and manifest.get("month") == month, f"{path.name}: provenance mismatch")
            require(manifest.get("scorerVersion") == versions["scorerVersion"], f"{path.name}: scorer code changed")
            require(manifest.get("inputSha256") == input_sha, f"{path.name}: different position input")
            shard_expected = [row for i, row in enumerate(expected_rows) if i % shards == manifest["shard"]]
            keys = "\n".join(":".join(row_key(row)) for row in shard_expected)
            require(manifest.get("keysSha256") == hashlib.sha256(keys.encode()).hexdigest(), f"{path.name}: shard keys changed")
            require(manifest.get("expectedRows") == len(shard_expected), f"{path.name}: shard expected count mismatch")
            allowed = {row_key(row) for row in shard_expected}
            shard_rows = read_jsonl(path.with_suffix(".jsonl"))
            require(len(shard_rows) == manifest["rows"], f"{path.name}: row count mismatch")
            for row in shard_rows:
                require(row.get("datasetKind") == "literal", "nonliteral scored row")
                key = row_key(row)
                require(key in allowed and key not in scored, f"{path.name}: unexpected or duplicate row")
                source = expected[key]
                for field in ("game", "month", "rule", "band", "opponentBand", "fen", "ply", "A", "ruleMoves"):
                    require(row[field] == source[field], f"{path.name}: scored position changed")
                require(row["band"] in BANDS and row["opponentBand"] in BANDS, "invalid band")
                require(row["R"] in source["ruleMoves"], "R does not show the rule")
                require(all(type(row["sound"][move]) is bool for move in "RNA"), "missing soundness")
                for first, second in (("R", "N"), ("R", "A"), ("N", "A")):
                    require(row[first] != row[second] or row["sound"][first] == row["sound"][second], "same move has different soundness")
                require(isinstance(row["probabilityRAtHisBand"], (int, float)) and 0 <= row["probabilityRAtHisBand"] <= 1, "missing Maia probability")
                for feature, cells in SPLITS.items():
                    require(row["splits"][feature] in cells, "missing split")
                    if feature != "forcing":
                        require(row["splits"][feature] == source["splits"][feature], "scored split changed")
                # The engine traces remain in the private score journal.
                # Aggregation needs only the app's completed scalar readings.
                row.pop("evidence", None)
                row.pop("times", None)
                scored[key] = row
        require(set(scored) == set(expected), f"{month}: some kept rows have no score")
        # Availability is the complete scan before either sampling operation.
        available = scan["availability"]
        require(available["all"]["positions"] == scan["positions"], "availability denominator mismatch")
        require(sum(available["byBand"][str(b)]["positions"] for b in BANDS) == scan["positions"], "availability bands mismatch")
        for rule in RULES:
            require(0 <= available["all"]["rules"][rule] <= scan["positions"], "availability count invalid")
            require(sum(available["byBand"][str(b)]["rules"][rule] for b in BANDS) == available["all"]["rules"][rule], "availability numerator mismatch")
        scan["stageTotals"] = stage_totals(stream, scan, loaded_shards)
        manifests.append(scan)
        rows.extend(scored[key] for key in sorted(scored))
    return rows, manifests


def markdown(report):
    def fmt(estimate):
        if estimate["value"] is None:
            return "undefined"
        point = f"{100 * estimate['value']:.2f}"
        if estimate["lo"] is None:
            return point + " (interval undefined)"
        return point + f" ({100 * estimate['lo']:.2f} to {100 * estimate['hi']:.2f})"

    def number(value):
        return "unrecorded" if value is None else f"{value:,.2f}" if isinstance(value, float) else str(value)

    lines = ["# Rules of thumb: results", "",
        f"Written by `analyze.py` on the app at `{report['app']}`. The data are rated standard Lichess 600+0 games (CC0), July and August 2026 pooled for train and September 2026 held out.", "",
        f"Intervals are 95% percentile intervals from {report['bootstrap']['draws']:,} bootstrap samples over games, seed {report['bootstrap']['seed']}. Shares and differences below are percentage points. Undefined subgroup draws are counted in `rules.json`.", "",
        "| Rule | Train positions | Held-out positions | Train lift | Held-out lift | Verdict | A step up |",
        "|---|---:|---:|---|---|---|---|"]
    for rule, result in report["rules"].items():
        train, heldout = result["train"], result["heldout"]
        lines.append(f"| {rule} | {train['positions']} | {heldout['positions']} | {fmt(train['lift'])} | {fmt(heldout['lift'])} | {result['verdict']} | {'yes' if result['stepUp'] else 'no'} |")
    lines.extend(["", "## Counts and run times", "",
                  "| Rule | Month | Available positions | Games with availability | Retained positions | Scored positions |",
                  "|---|---|---:|---:|---:|---:|"])
    for rule, result in report["rules"].items():
        for month, counts in result["countsByMonth"].items():
            values = [number(counts[key]) for key in ("availablePositions", "gamesWithAvailability", "retainedPositions", "scoredPositions")]
            lines.append(f"| {rule} | {month} | " + " | ".join(values) + " |")
    lines.extend(["", "Worker seconds sum across workers and resumes. Instrument times cover completed rows; failed attempts are separate. Missing timings are not counted as zero.", "",
                  "| Month | Stream checkpointed seconds | Completed availability seconds | Cumulative score worker seconds | Maia seconds | Engine seconds | Tablebase seconds | Completed-row tablebase retries | Failed-attempt tablebase retries |",
                  "|---|---:|---:|---:|---:|---:|---:|---:|---:|"])
    for month, totals in report["operations"]["byMonth"].items():
        if totals is None:
            continue
        score = totals["score"]
        values = [totals["stream"]["cumulativeCheckpointedSeconds"], totals["positions"]["completedGameTiming"]["seconds"],
                  score["cumulativeWorkerSeconds"], score["completedRowTotals"]["maiaSeconds"],
                  score["completedRowTotals"]["engineSeconds"], score["completedRowTotals"]["tablebaseSeconds"],
                  score["completedRowTotals"]["tablebaseRetries"], score["failedAttemptTotals"]["tablebaseRetries"]]
        lines.append(f"| {month} | " + " | ".join(number(value) for value in values) + " |")
    attempts = report["operations"]["stageAttempts"]
    if attempts is None:
        lines.extend(["", "Supervisor attempts were not recorded; stopped-job counts and cumulative invocation times are unknown."])
    else:
        lines.extend(["", "| Stage | Month | Attempts | Completed jobs | Stopped jobs | Unfinished jobs | Cumulative finished invocation seconds |",
                      "|---|---|---:|---:|---:|---:|---:|"])
        for stage, months in attempts.items():
            for month, counts in months.items():
                values = [counts[key] for key in ("attempts", "completedJobs", "stoppedJobs", "unfinishedJobs", "cumulativeFinishedInvocationSeconds")]
                lines.append(f"| {stage} | {month} | " + " | ".join(number(value) for value in values) + " |")
        lines.extend(["", "Analysis elapsed seconds are recorded separately. Stage restart backoffs and checks that found a completed stage are in `rules.json`."])
    for rule, result in report["rules"].items():
        lines.extend(["", f"## {rule}", "", "| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |",
                      "|---|---:|---|---|---|---|---|---|"])
        for period in ("train", "heldout"):
            total = result[period]
            for name, group in [("both", total), *total["byBand"].items()]:
                values = [fmt(group["soundness"][move]) for move in "RNA"]
                values += [fmt(group[key]) for key in ("lift", "adoption", "probabilityRAtHisBand")]
                lines.append(f"| {period}, {name} | {group['positions']} | " + " | ".join(values) + " |")
        lines.extend(["", f"Adoption above minus his band: train {fmt(result['train']['adoptionDifferenceAboveMinusHis'])}; held out {fmt(result['heldout']['adoptionDifferenceAboveMinusHis'])}.", "",
                      "| Availability period | Both bands | His band | Band above |", "|---|---|---|---|"])
        for period in ("all", "train", "heldout"):
            entry = result["availability"][period]
            parts = [entry, entry["byBand"]["1300"], entry["byBand"]["1500"]]
            rates = [f"{p['availablePositions']}/{p['positions']} ({100 * p['share']:.2f}%)" if p["share"] is not None else "undefined" for p in parts]
            lines.append(f"| {period} | " + " | ".join(rates) + " |")
        failures = {(x["split"], cell_name(x["cell"])) for x in result["failureConditions"]}
        lines.extend(["", "Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.", "",
                      "| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |",
                      "|---|---|---:|---|---|---:|---|---|---|"])
        for feature, cells in SPLITS.items():
            for cell in cells:
                name = cell_name(cell)
                train, heldout = (result[period]["splits"][feature][name] for period in ("train", "heldout"))
                lines.append(f"| {feature} | {name} | {train['positions']}/{train['restPositions']} | {fmt(train['soundnessR'])} | {fmt(train['difference'])} | {heldout['positions']}/{heldout['restPositions']} | {fmt(heldout['soundnessR'])} | {fmt(heldout['difference'])} | {'yes' if (feature, name) in failures else 'no'} |")
        tree = result["descriptionTree"]
        lines.extend(["", f"The descriptive tree's held-out accuracy is {fmt(tree['heldoutAccuracy'])}; his band {fmt(tree['heldoutAccuracyByBand']['1300'])}, the band above {fmt(tree['heldoutAccuracyByBand']['1500'])}. The tree and every split's measures apart by band are in `rules.json`.", "", "```json", json.dumps(tree["tree"], indent=2), "```"])
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", choices=("full",), required=True)
    parser.add_argument("--phase2-reviewed", action="store_true")
    args = parser.parse_args(argv)
    if not args.phase2_reviewed:
        parser.error("analysis is disabled in phase 1; review is required before the full scan and analysis")
    from freeze import verify_manifest
    frozen = verify_manifest(require_committed=True)
    require(frozen.get("datasetKind") == "literal" and frozen.get("alternativeScoringAuthorized") is False,
            "analysis requires the committed literal-rule content manifest")
    pin = json.loads((LAB / "bridge" / "chess.json").read_text())
    app = pin["commit"]
    require(app == "f4bd63f19b343f686fb97ea4cf70b211c0bddc0a", "the fixed app pin changed")
    require(frozen["app"] == app, "frozen app differs from the pin")
    started = time.monotonic()
    rows, manifests = load_full(PRIVATE / args.run, app)
    events_path = PRIVATE / args.run / "stage-events.jsonl"
    events = read_jsonl(events_path) if events_path.exists() else None
    result = analyze(rows, manifests, app, stage_events=events)
    result["measurementVersions"] = measurement_versions()
    result["seconds"] = time.monotonic() - started
    result["ruleReadmeSha256"] = frozen["rule"]["sha256"]
    result["contentManifestSha256"] = hashlib.sha256((PROJECT / "phase2-manifest.json").read_bytes()).hexdigest()
    result["operations"]["currentAnalysisSeconds"] = result["seconds"]
    destination = PROJECT / "results"
    destination.mkdir(exist_ok=True)
    serialized = json.dumps(result, indent=2, allow_nan=False) + "\n"
    text = markdown(result)
    for name, value in (("rules.json", serialized), ("rules.md", text)):
        temporary = destination / (name + ".partial")
        temporary.write_text(value)
        temporary.replace(destination / name)
    print(f"Wrote aggregate results for {len(RULES)} rules.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
