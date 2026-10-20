#!/usr/bin/env python3
"""The registered null addition, separate from the completed phase-two run.

The command validates the committed addition freeze and complete original
and null scores before computing any measure. Unit tests use synthetic rows.
All chess readings come from the scorer; this file only aggregates them.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import time

# Import the original game's resampling instrument without its command or
# phase-two README verifier. The completed run and its freeze stay unchanged.
import analyze as original
import numpy as np

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PRIVATE = LAB / "private" / "rules-of-thumb"
MONTHS, RULES, BANDS = original.MONTHS, original.RULES, original.BANDS
DRAWS, SEED = original.DRAWS, original.SEED
require = original.require


def content_reading(train, heldout):
    """The addition describes content; it never replaces a verdict."""
    if original.above_zero(train) and original.above_zero(heldout):
        return "points to better moves than chance"
    if original.below_zero(train) and original.below_zero(heldout):
        return "points to worse moves than chance"
    return "no differently from chance"


def searched_best(rows):
    searched = [row for row in rows if row["source"] == "engine"]
    changed = sum(row["bestChanged"] for row in searched)
    return {"searches": len(searched), "changed": changed,
            "share": changed / len(searched) if searched else None}


def summarize_period(rows, draws=DRAWS, seed=SEED):
    """Use one set of game multiplicities for every paired measure and mask."""
    boot = original.GameBootstrap(
        [row["month"] + ":" + row["game"] for row in rows], draws, seed)
    sound_r = np.asarray([row["sound"]["R"] for row in rows], dtype=float)
    sound_n = np.asarray([row["sound"]["N"] for row in rows], dtype=float)
    sound_r0 = np.asarray([row["sound"]["R0"] for row in rows], dtype=float)
    same_r = np.asarray([row["R"] == row["N"] for row in rows], dtype=bool)
    same_r0 = np.asarray([row["R0"] == row["N"] for row in rows], dtype=bool)
    band = np.asarray([row["band"] for row in rows])
    return {
        "positions": len(rows), "games": boot.games,
        "nullLift": boot.summary(sound_r0 - sound_n),
        "content": boot.summary(sound_r - sound_r0),
        "shareRIsN": boot.summary(same_r.astype(float)),
        "shareR0IsN": boot.summary(same_r0.astype(float)),
        "liftWhenRDiffersFromN": {
            "positions": int((~same_r).sum()),
            "lift": boot.summary(sound_r - sound_n, ~same_r),
        },
        "soundnessR0": boot.summary(sound_r0),
        "soundnessR0ByBand": {
            str(value): {"positions": int((band == value).sum()),
                         "soundness": boot.summary(sound_r0, band == value)}
            for value in BANDS
        },
        "newBestDiffersFromStored": searched_best(rows),
    }


def validate_rows(rows):
    seen = set()
    for row in rows:
        key = original.row_key(row)
        require(key not in seen, "duplicate null row")
        seen.add(key)
        require(row["month"] in MONTHS and row["rule"] in RULES,
                "unregistered month or rule")
        require(row["band"] in BANDS, "invalid mover band")
        require(all(type(row["sound"][move]) is bool for move in ("R", "N", "A", "R0")),
                "missing Boolean soundness")
        require(row["source"] in ("tablebase", "stored-move", "engine"),
                "unknown null soundness source")
        require(type(row.get("bestChanged")) is bool if row["source"] == "engine"
                else row.get("bestChanged") is None,
                "best-change indicator must refer only to a fresh engine search")
        for move in ("R", "N", "A"):
            require(row["R0"] != row[move] or row["sound"]["R0"] == row["sound"][move],
                    "same move has inconsistent soundness")
        if row["source"] == "stored-move":
            require(row["R0"] in (row["R"], row["N"], row["A"]),
                    "stored soundness does not match a stored move")
        if row["source"] == "engine":
            require(row["R0"] not in (row["R"], row["N"], row["A"]),
                    "fresh null search repeats a stored move")


def analyze(rows, prior, app, draws=DRAWS):
    """Aggregate validated joined rows. Production always uses fixed draws."""
    validate_rows(rows)
    require(prior["app"] == app and prior.get("datasetKind") == "amended",
            "original report has different provenance")
    require(set(prior["rules"]) == set(RULES), "original rule set changed")
    counts = Counter((row["rule"], row["month"]) for row in rows)
    for rule in RULES:
        for month in MONTHS:
            require(counts[rule, month] ==
                    prior["rules"][rule]["countsByMonth"][month]["scoredPositions"],
                    "null coverage differs from the completed run")
    output = {
        "app": app, "datasetKind": "null-addition",
        "data": prior["data"],
        "bootstrap": {"draws": draws, "seed": SEED, "unit": "game",
                      "sampling": "with replacement, fixed game count",
                      "interval": "95% percentile, linear interpolation",
                      "undefined": "omit undefined ratios and count them"},
        "readings": {
            "train": "July and August pooled",
            "bootstrapPopulation": "games retained for each rule, separately for train and heldout",
            "pairing": "R, N and R0 use the same position and the same bootstrap game multiplicity",
            "conditionalLift": "S(R) minus S(N), restricted to positions where R differs from N",
            "exclusion": "rules with fewer than 300 held-out positions have no addition measures or reading",
            "newBestDifference": "fresh Stockfish best UCI differs from the stored Stockfish best UCI; denominator is fresh null searches",
            "verdicts": "the original preregistered verdicts are unchanged",
            "units": "shares and soundness differences are fractions; Markdown prints percentages and percentage points",
        },
        "coverage": {
            "scoredPositions": len(rows),
            "scoredPositionsByMonth": {month: sum(row["month"] == month for row in rows)
                                       for month in MONTHS},
        },
        "excludedRules": {},
        "rules": {},
    }
    for rule in RULES:
        selected = [row for row in rows if row["rule"] == rule]
        train = [row for row in selected if row["month"] in MONTHS[:2]]
        heldout = [row for row in selected if row["month"] == MONTHS[2]]
        if len(heldout) < 300:
            output["excludedRules"][rule] = {
                "trainPositions": len(train), "heldoutPositions": len(heldout),
                "reason": "fewer than 300 held-out positions",
            }
            continue
        before = summarize_period(train, draws)
        after = summarize_period(heldout, draws)
        output["rules"][rule] = {
            "originalVerdict": prior["rules"][rule]["verdict"],
            "reading": content_reading(before["content"], after["content"]),
            "countsByMonth": {month: counts[rule, month] for month in MONTHS},
            "train": before, "heldout": after,
        }
    return output


def markdown(report):
    def fmt(estimate):
        if estimate["value"] is None:
            return "undefined"
        point = f"{100 * estimate['value']:.2f}"
        if estimate["lo"] is None:
            return point + " (interval undefined)"
        return point + f" ({100 * estimate['lo']:.2f} to {100 * estimate['hi']:.2f})"

    def percent(value):
        return "undefined" if value is None else f"{100 * value:.2f}%"

    lines = ["# Rules of thumb: the random-rule comparison", "",
        f"Written by `analyze_null.py` on app `{report['app']}`. The data are the completed run's rated standard Lichess 600+0 games (CC0): July and August 2026 pooled for train, and September 2026 held out.", "",
        f"The addition uses {report['bootstrap']['draws']:,} game-bootstrap resamples with seed {report['bootstrap']['seed']}. Intervals are 95% percentile intervals. Soundness differences below are percentage points; identity and soundness shares are percentages. Undefined subgroup draws are counted in `null.json`.", "",
        "R0 is Maia-2's most likely move in a random legal subset the same size as the rule's subset. Null lift is S(R0) − S(N). Content is S(R) − S(R0). These readings change no preregistered verdict.", "",
        "| Rule | Train positions | Held-out positions | Train null lift | Held-out null lift | Train content | Held-out content | Content reading |",
        "|---|---:|---:|---|---|---|---|---|"]
    for rule, result in report["rules"].items():
        before, after = result["train"], result["heldout"]
        values = [fmt(group[field]) for field in ("nullLift", "content")
                  for group in (before, after)]
        lines.append(f"| {rule} | {before['positions']} | {after['positions']} | "
                     + " | ".join(values) + f" | {result['reading']} |")
    lines.extend(["", "## Identity and the lift where the moves differ", "",
        "The conditional lift is the original S(R) − S(N), restricted to R ≠ N. It uses the same game resamples as the other measures. It is undefined if no positions remain.", "",
        "| Rule | Period | R = N | R0 = N | Positions with R ≠ N | Lift where R ≠ N |",
        "|---|---|---|---|---:|---|"])
    for rule, result in report["rules"].items():
        for period in ("train", "heldout"):
            group = result[period]
            conditional = group["liftWhenRDiffersFromN"]
            lines.append(f"| {rule} | {period} | {fmt(group['shareRIsN'])} | "
                         f"{fmt(group['shareR0IsN'])} | {conditional['positions']} | "
                         f"{fmt(conditional['lift'])} |")
    lines.extend(["", "## Null move soundness", "",
        "| Rule | Period | Both bands | His band (1300) | Band above (1500) |",
        "|---|---|---|---|---|"])
    for rule, result in report["rules"].items():
        for period in ("train", "heldout"):
            group = result[period]
            values = [fmt(group["soundnessR0"])]
            values += [fmt(group["soundnessR0ByBand"][str(band)]["soundness"]) for band in BANDS]
            lines.append(f"| {rule} | {period} | " + " | ".join(values) + " |")
    lines.extend(["", "## Fresh searches", "",
        "These counts cover positions where R0 needed a fresh Stockfish reading. The best was searched after clearing the hash, then R0 was scored against it. Stored-move reuse and tablebase probes are outside this denominator.", "",
        "| Rule | Period | Fresh searches | Best changed | Share changed |",
        "|---|---|---:|---:|---|"])
    for rule, result in report["rules"].items():
        for period in ("train", "heldout"):
            changed = result[period]["newBestDiffersFromStored"]
            lines.append(f"| {rule} | {period} | {changed['searches']} | "
                         f"{changed['changed']} | {percent(changed['share'])} |")
    if report["excludedRules"]:
        lines.extend(["", "## Rules left out", "",
            "The addition leaves out rules with fewer than 300 held-out positions. No addition measure or content reading is computed for them.", "",
            "| Rule | Train positions | Held-out positions |", "|---|---:|---:|"])
        for rule, item in report["excludedRules"].items():
            lines.append(f"| {rule} | {item['trainPositions']} | {item['heldoutPositions']} |")
    if "operations" in report:
        def seconds(value):
            return "unknown" if value is None else f"{value:,.2f}"

        lines.extend(["", "## Run times", "",
            "Worker time sums elapsed time across workers and resumes. It is not CPU time. Completed-row instrument time excludes failed attempts, which are kept separately in `null.json`. Missing values stay unknown.", "",
            "| Month | Completed rows | Cumulative worker seconds | Completed Maia seconds | Completed engine seconds | Failed engine seconds | Stopped worker jobs |",
            "|---|---:|---:|---:|---:|---:|---:|"])
        for month, item in report["operations"]["byMonth"].items():
            values = [item["cumulativeWorkerSeconds"], item["completedRowTotals"]["maiaSeconds"],
                      item["completedRowTotals"]["engineSeconds"], item["failedAttemptTotals"]["engineSeconds"]]
            stops = item["stoppedWorkerJobs"]
            lines.append(f"| {month} | {item['completedRows']} | "
                         + " | ".join(seconds(value) for value in values)
                         + f" | {'unknown' if stops is None else stops} |")
        lines.extend(["", f"Analysis took {report['seconds']:.2f} elapsed seconds."])
    return "\n".join(lines) + "\n"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def key_text(row):
    return ":".join(original.row_key(row))


def load_null(directory, originals, app, addition_sha, source_directory):
    """Join only complete null journals to the validated original rows.

    The old source input determines both the retained population and shard
    assignment. No stored score or selection is recomputed by this loader.
    """
    source_rows = {original.row_key(row): row for row in originals}
    require(len(source_rows) == len(originals), "duplicate original row")
    scorer_version = sha256(PROJECT / "null-score.mjs")
    joined, manifests = {}, []
    for month in MONTHS:
        positions_path = source_directory / f"positions-{month}.jsonl.gz"
        input_sha = sha256(positions_path)
        positions = original.read_jsonl(positions_path)
        expected = {original.row_key(row) for row in positions}
        require(len(expected) == len(positions), "duplicate position row")
        require(expected == {key for key in source_rows if key[0] == month},
                "original scores differ from the retained positions")
        paths = sorted(directory.glob(f"scored-{month}-*-of-*.json"))
        require(bool(paths), f"{month}: no null score manifests")
        loaded = [json.loads(path.read_text()) for path in paths]
        shard_counts = {manifest["shards"] for manifest in loaded}
        require(len(shard_counts) == 1, f"{month}: mixed null shard layouts")
        shards = shard_counts.pop()
        require(type(shards) is int and shards == 2,
                "null scoring must use the reviewed two-shard layout")
        require(len(loaded) == shards and {m["shard"] for m in loaded} == set(range(shards)),
                f"{month}: missing or duplicate null shard")
        for path, manifest in zip(paths, loaded):
            require(manifest.get("complete") is True and manifest.get("status") == "complete"
                    and manifest.get("run") == "full",
                    f"{path.name}: incomplete null scoring")
            require(manifest.get("datasetKind") == "null-addition",
                    f"{path.name}: wrong dataset")
            require(manifest.get("app") == app and manifest.get("month") == month,
                    f"{path.name}: wrong null provenance")
            require(manifest.get("scorerVersion") == scorer_version,
                    f"{path.name}: null scorer code changed")
            require(manifest.get("inputSha256") == input_sha,
                    f"{path.name}: original positions changed")
            require(manifest.get("additionManifestSha256") == addition_sha,
                    f"{path.name}: addition content manifest changed")
            shard_positions = [row for index, row in enumerate(positions)
                               if index % shards == manifest["shard"]]
            keys = "\n".join(key_text(row) for row in shard_positions)
            require(manifest.get("keysSha256") == hashlib.sha256(keys.encode()).hexdigest(),
                    f"{path.name}: null shard keys changed")
            require(manifest.get("expectedRows") == len(shard_positions),
                    f"{path.name}: null expected row count differs")
            allowed = {original.row_key(row) for row in shard_positions}
            journal_path = path.with_suffix(".jsonl")
            require(manifest.get("outputSha256") == sha256(journal_path),
                    f"{path.name}: null journal changed after completion")
            scored = original.read_jsonl(journal_path)
            require(len(scored) == manifest["rows"] == manifest["expectedRows"],
                    f"{path.name}: null row count mismatch")
            for row in scored:
                require(row.get("datasetKind") == "null-addition", "wrong null row dataset")
                key = original.row_key(row)
                require(key in allowed and key not in joined,
                        f"{path.name}: unexpected or duplicate null row")
                require(row.get("key") == key_text(row), "null row key changed")
                source = source_rows[key]
                for field in ("band", "opponentBand", "R", "N", "A"):
                    require(row[field] == source[field], "null row changed an original reading")
                for move in ("R", "N", "A"):
                    require(row["sound"][move] == source["sound"][move],
                            "null row changed original soundness")
                sample = row.get("sampledMoves")
                require(type(row.get("k")) is int and row["k"] == len(source["ruleMoves"]),
                        "null subset size differs from the recorded rule move set")
                require(isinstance(sample, list) and len(sample) == row["k"]
                        and all(isinstance(move, str) for move in sample)
                        and len(set(sample)) == len(sample) and row["R0"] in sample,
                        "null subset is missing, repeated or does not include R0")
                # Do not carry private FEN, policy or engine traces into
                # aggregation; explicit field selection keeps them out.
                joined[key] = {
                    **{field: row[field] for field in
                       ("month", "game", "rule", "band", "R", "N", "A", "R0", "source")},
                    "sound": {move: row["sound"][move] for move in ("R", "N", "A", "R0")},
                    "bestChanged": row.get("bestChanged"),
                }
            manifests.append(manifest)
    require(set(joined) == set(source_rows), "some original rows have no null score")
    rows = [joined[key] for key in sorted(joined)]
    validate_rows(rows)
    return rows, manifests


def operation_totals(manifests):
    """Copy only recorded numeric counters; unknown timing stays unknown."""
    metrics = ("maiaSeconds", "engineSeconds", "tablebaseSeconds", "rowSeconds",
               "newGameSeconds", "maiaCalls", "maiaBands", "bestCalls", "scoreCalls",
               "tablebaseCalls", "newGameCalls", "storedProbeReads", "reusedMoves", "newSearches")
    return {month: {
        "workers": sum(item["month"] == month for item in manifests),
        "completedRows": sum(item["rows"] for item in manifests if item["month"] == month),
        "cumulativeWorkerSeconds": original.sum_reported(
            [item for item in manifests if item["month"] == month], "workerSeconds"),
        "stoppedWorkerJobs": original.sum_reported(
            [item for item in manifests if item["month"] == month], "stoppedJobs"),
        "completedRowTotals": {metric: original.sum_reported(
            [item.get("totals", {}) for item in manifests if item["month"] == month], metric)
            for metric in metrics},
        "failedAttemptTotals": {metric: original.sum_reported(
            [item.get("failedAttemptTotals", {}) for item in manifests if item["month"] == month], metric)
            for metric in metrics},
    } for month in MONTHS}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args(argv)
    if not args.reviewed:
        parser.error("null analysis requires the reviewed addition and committed content freeze")
    from freeze_null import verify_manifest
    frozen = verify_manifest(require_committed=True)
    app = frozen["app"]
    require(frozen.get("datasetKind") == "null", "the addition content freeze is missing")
    started = time.monotonic()
    original_directory = PRIVATE / "full"
    originals, _ = original.load_full(original_directory, app)
    addition_path = PROJECT / "null-manifest.json"
    addition_sha = sha256(addition_path)
    rows, manifests = load_null(PRIVATE / "null", originals, app, addition_sha, original_directory)
    prior_path = PROJECT / "results" / "rules.json"
    require(sha256(prior_path) == frozen["originalFiles"]["results/rules.json"],
            "the original aggregate report changed")
    prior = json.loads(prior_path.read_text())
    result = analyze(rows, prior, app)
    result["records"] = frozen["records"]
    result["provenance"] = {
        "additionManifestSha256": addition_sha,
        "additionRuleSha256": frozen["rule"]["additionSha256"],
        "originalRuleSha256": frozen["rule"]["originalRuleSha256"],
        "originalContentManifestSha256": frozen["originalFiles"]["phase2-manifest.json"],
        "originalResultsSha256": frozen["originalFiles"]["results/rules.json"],
        "inputManifestSha256": frozen["inputs"]["sha256"],
        "analysisSha256": sha256(Path(__file__)),
        "scorerSha256": sha256(PROJECT / "null-score.mjs"),
    }
    result["operations"] = {
        "byMonth": operation_totals(manifests),
        "timingDefinition": "Worker seconds sum elapsed worker time across workers and resumes. Completed-row and failed-attempt instrument times are separate. Missing values are unknown, not zero.",
    }
    result["seconds"] = time.monotonic() - started
    destination = PROJECT / "results"
    destination.mkdir(exist_ok=True)
    for name, content in (("null.json", json.dumps(result, indent=2, allow_nan=False) + "\n"),
                          ("null.md", markdown(result))):
        temporary = destination / (name + ".partial")
        temporary.write_text(content)
        temporary.replace(destination / name)
    print(f"Wrote the registered null comparison for {len(result['rules'])} rules.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
