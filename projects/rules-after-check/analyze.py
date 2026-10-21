#!/usr/bin/env python3
"""The fixed after-check analysis. Phase one exercises only synthetic rows.

The real command requires --reviewed, committed content and input hashes,
and complete board and score journals for every inherited row. No chess
reading is implemented here. The predecessor supplies the game bootstrap.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PREDECESSOR = PROJECT.parent / "rules-of-thumb"
PRIVATE = LAB / "private" / "rules-after-check" / "full"

# A distinct module name avoids importing this file as its own predecessor.
_spec = importlib.util.spec_from_file_location("rules_of_thumb_bootstrap", PREDECESSOR / "analyze.py")
original = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(original)
import numpy as np

MONTHS, BANDS, DRAWS, SEED = original.MONTHS, original.BANDS, original.DRAWS, original.SEED
RULES = tuple(rule for rule in original.RULES if rule not in ("lucena", "philidor"))
SPLITS = {key: values for key, values in original.SPLITS.items() if key != "opponentThreat"}
OLD_MOVES = ("R", "N", "A", "R0")
NEW_MOVES = ("Rs", "Ns", "R0s")
require = original.require


def key_of(row):
    return row["month"], row["game"], row["rule"]


def key_text(row):
    return ":".join(key_of(row))


def validate_rows(rows):
    """Check scalar readings and identities without reading a chess board."""
    seen, game_month = set(), {}
    for row in rows:
        key = key_of(row)
        require(key not in seen, "duplicate game/rule row")
        seen.add(key)
        require(row.get("datasetKind") == "rules-after-check", "wrong scored dataset")
        require(row["month"] in MONTHS and row["rule"] in RULES, "unregistered month or rule")
        require(game_month.setdefault(row["game"], row["month"]) == row["month"],
                "one game occurs in multiple months")
        require(row["band"] in BANDS and row["opponentBand"] in BANDS, "invalid band")
        require(type(row["quiet"]) is bool and type(row["originalRPasses"]) is bool,
                "missing board Boolean")
        for field in ("safeMoves", "safeRuleMoves"):
            values = row[field]
            require(isinstance(values, list) and all(isinstance(move, str) for move in values)
                    and len(set(values)) == len(values), "invalid safe move set")
        safe, safe_rule = set(row["safeMoves"]), set(row["safeRuleMoves"])
        require(safe_rule.issubset(safe), "a safe rule move does not pass the check")
        require(row["originalRPasses"] == (row["R"] in safe), "original R check disagrees with S")
        for label in OLD_MOVES:
            require(isinstance(row[label], str) and type(row["sound"][label]) is bool,
                    "missing original move or soundness")
        eligible = bool(safe_rule)
        if eligible:
            require(row["Rs"] in safe_rule and row["Ns"] in safe and row["R0s"] in safe,
                    "a selected move is outside its safe set")
            require(all(type(row["sound"][label]) is bool for label in NEW_MOVES),
                    "missing selected move soundness")
        else:
            require(all(row.get(label) is None and row["sound"].get(label) is None for label in NEW_MOVES),
                    "an empty safe rule set has a selected move")
        labels = (*OLD_MOVES, *NEW_MOVES) if eligible else OLD_MOVES
        for i, first in enumerate(labels):
            for second in labels[i + 1:]:
                require(row[first] != row[second] or row["sound"][first] == row["sound"][second],
                        "matching move labels disagree on soundness")
        require(type(row["freshSearch"]) is bool and (eligible or not row["freshSearch"]),
                "invalid fresh-search flag")
        require(type(row.get("freshBestChanged")) is bool if row["freshSearch"]
                else row.get("freshBestChanged") is None, "invalid fresh-best-change flag")
        for field, values in SPLITS.items():
            if field == "forcing" and not eligible:
                require(row["splits"].get(field) is None, "empty safe rule set has an Rs split")
            else:
                require(row["splits"][field] in values, "missing check-app split")


def verdict(train, heldout, heldout_positions, control_passed):
    if not control_passed:
        return None, "control failed"
    if heldout_positions < 300:
        return f"not enough data (n={heldout_positions})", "not enough data"
    if original.above_zero(train) and original.above_zero(heldout):
        return "holds after the check", None
    if original.below_zero(train) and original.below_zero(heldout):
        return "misleads after the check", None
    return "does no better than the natural move", None


def masks_and_sound(rows):
    quiet = np.asarray([row["quiet"] for row in rows], dtype=bool)
    eligible = np.asarray([bool(row["safeRuleMoves"]) for row in rows], dtype=bool)
    # Unselected sounds have no numerical reading. Zero is only an internal
    # placeholder outside every eligible mask; it never enters a denominator.
    sound = {label: np.asarray([row["sound"].get(label) if row["sound"].get(label) is not None else 0
                               for row in rows], dtype=float)
             for label in (*OLD_MOVES, *NEW_MOVES)}
    return quiet, eligible, sound


def bootstrap_for(rows, draws=DRAWS, seed=SEED):
    return original.GameBootstrap([row["month"] + ":" + row["game"] for row in rows], draws, seed)


def control_period(rows, draws=DRAWS, seed=SEED):
    """Resample games across all thirteen rules; same-game rows stay together."""
    boot = bootstrap_for(rows, draws, seed)
    quiet, eligible, sound = masks_and_sound(rows)
    mask = quiet & eligible & ~np.asarray([row["originalRPasses"] for row in rows], dtype=bool)
    return {"retainedPositions": len(rows), "retainedGames": boot.games,
            "positions": int(mask.sum()),
            "games": len({rows[i]["month"] + ":" + rows[i]["game"] for i in np.flatnonzero(mask)}),
            "lift": boot.summary(sound["Rs"] - sound["R"], mask)}


def fresh_best(rows, mask):
    selected = [row for row, keep in zip(rows, mask) if keep and row["freshSearch"]]
    changed = sum(row["freshBestChanged"] for row in selected)
    return {"positions": len(selected), "changed": changed,
            "share": changed / len(selected) if selected else None}


def summarize_period(rows, draws=DRAWS, seed=SEED):
    # Every retained game enters once in the sampling population. The masks
    # below preserve the same weights for coverage, primary and descriptive
    # estimates, including bootstrap draws with empty subgroups.
    boot = bootstrap_for(rows, draws, seed)
    quiet, eligible, sound = masks_and_sound(rows)
    primary = quiet & eligible
    same_r = np.asarray([row.get("Rs") == row["R"] for row in rows], dtype=float)
    same_n = np.asarray([row.get("Ns") == row["N"] for row in rows], dtype=float)
    different = np.asarray([row.get("Rs") != row.get("Ns") for row in rows], dtype=bool)
    lift = sound["Rs"] - sound["Ns"]

    def group(mask):
        selected_games = {rows[i]["month"] + ":" + rows[i]["game"] for i in np.flatnonzero(mask)}
        return {
            "positions": int(mask.sum()), "games": len(selected_games),
            "soundness": {label: boot.summary(sound[label], mask) for label in (*OLD_MOVES, *NEW_MOVES)},
            "lift": boot.summary(lift, mask),
            "againstNatural": boot.summary(sound["Rs"] - sound["N"], mask),
            "content": boot.summary(sound["Rs"] - sound["R0s"], mask),
            "liftWhereRsDiffersFromNs": {"positions": int((mask & different).sum()),
                                         "lift": boot.summary(lift, mask & different)},
            "shareRsIsR": boot.summary(same_r, mask),
            "shareNsIsN": boot.summary(same_n, mask),
            "naturalAfterCheckMinusBefore": boot.summary(sound["Ns"] - sound["N"], mask),
            "freshBestDiffersFromStored": fresh_best(rows, mask),
        }

    out = {
        "retainedPositions": len(rows), "retainedGames": boot.games,
        "coverage": {
            "quietPositions": int(quiet.sum()), "nonquietPositions": int((~quiet).sum()),
            "quietWithSafeRulePositions": int(primary.sum()),
            "quietWithoutSafeRulePositions": int((quiet & ~eligible).sum()),
            "allWithSafeRulePositions": int(eligible.sum()),
            "quietShare": boot.summary(quiet.astype(float)),
            "safeRuleShareAmongQuiet": boot.summary(eligible.astype(float), quiet),
            "safeRuleShareAll": boot.summary(eligible.astype(float)),
        },
        "primary": group(primary),
        "allEligible": group(eligible),
        "splits": {},
    }
    for field, cells in SPLITS.items():
        values = np.asarray([row["splits"][field] for row in rows], dtype=object)
        out["splits"][field] = {
            original.cell_name(cell): {
                "positions": int((primary & (values == cell)).sum()),
                "lift": boot.summary(lift, primary & (values == cell)),
            } for cell in cells}
    return out


def analyze(rows, inherited_counts, apps, draws=DRAWS):
    validate_rows(rows)
    require(set(inherited_counts) == set(RULES), "inherited population is not the thirteen rules")
    counts = Counter((row["rule"], row["month"]) for row in rows)
    for rule in RULES:
        require(set(inherited_counts[rule]) == set(MONTHS), "incomplete inherited months")
        for month in MONTHS:
            require(counts[rule, month] == inherited_counts[rule][month],
                    "scored population differs from the inherited rows")
    # The registered positive control is computed before any rule receives
    # a summary or a verdict. Its failed result withholds every verdict.
    controls = {period: control_period([row for row in rows if row["month"] in months], draws)
                for period, months in (("train", MONTHS[:2]), ("heldout", MONTHS[2:]))}
    passed = all(original.above_zero(item["lift"]) for item in controls.values())
    result = {
        "datasetKind": "rules-after-check", "apps": dict(apps),
        "data": {"source": "rules-of-thumb full and null journals; Lichess rated standard 600+0",
                 "license": "CC0", "train": list(MONTHS[:2]), "heldout": MONTHS[2],
                 "bands": {"1300": [1250, 1449], "1500": [1450, 1649]}},
        "bootstrap": {"draws": draws, "seed": SEED, "unit": "game",
                      "sampling": "with replacement, fixed game count",
                      "interval": "95% percentile, linear interpolation",
                      "undefined": "omit undefined ratios and count them"},
        "readings": {
            "population": "all inherited rows of the thirteen rules; parenthetical caps do not replace their actual counts",
            "bootstrapPopulation": "all retained games of each rule and period; every measure shares those game multiplicities",
            "controlBootstrap": "all retained games pooled across the thirteen rules; repeated game rows across rules share a multiplicity",
            "primary": "quiet positions with a nonempty safe rule set",
            "allEligible": "all positions with a nonempty safe rule set, quiet or not; descriptive only",
            "coverage": "quiet divided by all retained rows; nonempty safe rule set among quiet divided by quiet rows; move identity shares within each comparison population",
            "emptySafeRuleSet": "counted in coverage, excluded from every move comparison including Ns minus N",
            "splits": "lift in quiet eligible positions only; material, phase, Rs capture-or-check, king danger from the check app",
            "controlFailure": "no rule receives a verdict; measures remain descriptive",
            "freshBestDifference": "first exact line UCI compared with the original first exact line; denominator is positions needing a fresh search",
        },
        "control": {"passed": passed, **controls},
        "coverage": {"retainedPositions": len(rows),
                     "retainedPositionsByMonth": {month: sum(counts[rule, month] for rule in RULES) for month in MONTHS}},
        "rules": {},
    }
    for rule in RULES:
        selected = [row for row in rows if row["rule"] == rule]
        before = summarize_period([row for row in selected if row["month"] in MONTHS[:2]], draws)
        after = summarize_period([row for row in selected if row["month"] == MONTHS[2]], draws)
        decision, reason = verdict(before["primary"]["lift"], after["primary"]["lift"],
                                   after["primary"]["positions"], passed)
        result["rules"][rule] = {"countsByMonth": dict(inherited_counts[rule]),
                                 "verdict": decision, "verdictReason": reason,
                                 "train": before, "heldout": after}
    return result


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_jsonl(path):
    raw = path.read_bytes()
    require(not raw or raw.endswith(b"\n"), "completed journal has an incomplete final line")
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


def inherited_counts(prior):
    included = {rule for rule, record in prior["rules"].items() if record["heldout"]["positions"] >= 300}
    require(included == set(RULES), "the predecessor's judged rule population changed")
    return {rule: {month: prior["rules"][rule]["countsByMonth"][month]["scoredPositions"]
                   for month in MONTHS} for rule in RULES}


def load_full(directory, frozen, content_sha, counts):
    """Future phase-two loader. Never called on real journals in phase one."""
    loaded_rows, all_manifests = [], []
    for month in MONTHS:
        checked, scored = {}, {}
        checked_hashes, shard_keys = [], {}
        for stage, source_name, target in (("checked", "board.mjs", checked), ("scored", "score.mjs", scored)):
            paths = sorted(directory.glob(f"{stage}-{month}-*-of-*.json"))
            require(len(paths) == 2, f"{stage} {month}: exactly two completed shards required")
            metadata = [json.loads(path.read_text()) for path in paths]
            require({item.get("shard") for item in metadata} == {0, 1}
                    and all(type(item.get("shards")) is int and item["shards"] == 2 for item in metadata),
                    f"{stage} {month}: wrong shard layout")
            for path, meta in zip(paths, metadata):
                require(path.name == f"{stage}-{month}-{meta['shard']}-of-2.json", "journal shard filename differs")
                require(meta.get("schema") == 1 and meta.get("datasetKind") == "rules-after-check"
                        and meta.get("stage") == stage and meta.get("month") == month
                        and meta.get("run") == "full", "journal metadata population mismatch")
                require(meta.get("complete") is True and meta.get("status") == "complete",
                        "board or score stage is incomplete")
                for field in ("boardApp", "refereeApp", "records"):
                    require(meta.get(field) == frozen[field], "journal app or records provenance mismatch")
                require(meta.get("contentManifestSha256") == content_sha, "journal content freeze changed")
                require(meta.get("sourceInputsSha256") == frozen["inputs"]["sha256"],
                        "journal original input freeze changed")
                require(meta.get("sourceSha256") == frozen["files"][source_name], "journal source code changed")
                if stage == "scored":
                    require(meta.get("boardInputSha256") == hashlib.sha256("\n".join(checked_hashes).encode()).hexdigest(),
                            "score journal used different checked rows")
                journal_path = path.with_suffix(".jsonl")
                require(meta.get("outputSha256") == digest(journal_path), "completed journal content changed")
                rows = read_jsonl(journal_path)
                require(len(rows) == meta.get("rows") == meta.get("expectedRows"), "journal row count mismatch")
                keys = [key_text(row) for row in rows]
                require(hashlib.sha256("\n".join(keys).encode()).hexdigest() == meta.get("keysSha256"),
                        "journal keys changed or are out of order")
                if stage == "checked":
                    checked_hashes.append(meta["outputSha256"])
                    shard_keys[meta["shard"]] = keys
                else:
                    require(keys == shard_keys[meta["shard"]], "scored and checked shard keys differ")
                for row in rows:
                    key = key_of(row)
                    require(key not in target and row.get("key") == key_text(row), "duplicate or mismatched journal row key")
                    require(row.get("datasetKind") == "rules-after-check" and row["month"] == month
                            and row["rule"] in RULES, "foreign journal row")
                    target[key] = row
                all_manifests.append(meta)
        require(set(scored) == set(checked), "not every checked row has a score")
        actual_counts = Counter(row["rule"] for row in scored.values())
        require(all(actual_counts[rule] == counts[rule][month] for rule in RULES),
                "completed stages differ from inherited rule counts")
        for key in sorted(scored):
            row, board = scored[key], checked[key]
            for field in ("band", "opponentBand", "quiet", "safeMoves", "safeRuleMoves", "originalRPasses",
                          "R", "N", "A", "R0"):
                require(row[field] == board[field], "score changed a stored board or inherited reading")
            for label in OLD_MOVES:
                require(row["sound"][label] == board["sound"][label], "score changed inherited soundness")
            for field in ("material", "phase", "kingDanger"):
                require(row["splits"][field] == board["splits"][field], "score changed a position split")
            # Keep only scalar readings and the sets needed to validate
            # selection. FEN, policy, source traces and diagnostics stay out.
            fields = ("datasetKind", "month", "game", "rule", "band", "opponentBand", "quiet",
                      "safeMoves", "safeRuleMoves", "originalRPasses", *OLD_MOVES, *NEW_MOVES,
                      "sound", "splits", "freshSearch")
            loaded_rows.append({**{field: row[field] for field in fields},
                                "freshBestChanged": row.get("freshBestChanged")})
    validate_rows(loaded_rows)
    return loaded_rows, all_manifests


def operation_totals(manifests):
    fields = ("workerSeconds", "stoppedJobs")
    metrics = ("rowSeconds", "positionSeconds", "safetySeconds", "splitSeconds", "positionCalls", "safetyCalls", "legalMoves",
               "maiaSeconds", "engineSeconds",
               "tablebaseSeconds", "newGameSeconds", "maiaCalls", "bestCalls", "scoreCalls",
               "maiaBands", "newGameCalls", "storedProbeReads", "reusedMoves", "newSearches")
    output = {}
    for stage in ("checked", "scored"):
        output[stage] = {}
        for month in MONTHS:
            entries = [item for item in manifests if item["stage"] == stage and item["month"] == month]
            output[stage][month] = {
                "rows": sum(item["rows"] for item in entries),
                **{field: original.sum_reported(entries, field) for field in fields},
                "completedRowTotals": {field: original.sum_reported([item.get("totals", {}) for item in entries], field)
                                       for field in metrics},
                "failedAttemptTotals": {field: original.sum_reported([item.get("failedAttemptTotals", {}) for item in entries], field)
                                        for field in metrics},
            }
    return output


def markdown(report):
    def fmt(item):
        if item["value"] is None:
            return "undefined"
        point = f"{100 * item['value']:.2f}"
        if item["lo"] is None:
            return point + " (interval undefined)"
        return point + f" ({100 * item['lo']:.2f} to {100 * item['hi']:.2f})"

    lines = ["# Rules after the check: results", "",
        f"Written by `analyze.py`. The board check is app `{report['apps']['check']}`; Maia-2 and the referee are app `{report['apps']['score']}`, with records `{report['apps']['records']}`. The positions are inherited from rules-of-thumb's Lichess rated standard 600+0 run (CC0): July and August 2026 pooled for train, September 2026 held out.", "",
        f"Intervals are 95% percentile intervals from {report['bootstrap']['draws']:,} game resamples, seed {report['bootstrap']['seed']}. Shares are percentages and soundness differences are percentage points. Every measure of a rule and period uses the same game multiplicities. Undefined subgroup draws are counted in `rules.json`.", "",
        "## The control", "",
        "The pooled control includes quiet positions where the original R fails the check and the safe rule set is nonempty. It compares soundness of Rs with R. The bootstrap keeps all rows of a game together across rules.", "",
        "| Period | Control positions | Games | Rs minus R |", "|---|---:|---:|---|"]
    for period in ("train", "heldout"):
        item = report["control"][period]
        lines.append(f"| {period} | {item['positions']} | {item['games']} | {fmt(item['lift'])} |")
    lines.extend(["", "The control passes on both periods." if report["control"]["passed"]
                  else "The control does not pass on both periods. No rule receives a verdict; the measures below describe only.", "",
        "## Quiet positions with a safe rule move", "",
        "| Rule | Train positions | Held-out positions | Train lift Rs minus Ns | Held-out lift Rs minus Ns | Verdict |",
        "|---|---:|---:|---|---|---|"])
    for rule, item in report["rules"].items():
        before, after = item["train"]["primary"], item["heldout"]["primary"]
        decision = item["verdict"] or "no verdict (control failed)"
        lines.append(f"| {rule} | {before['positions']} | {after['positions']} | {fmt(before['lift'])} | {fmt(after['lift'])} | {decision} |")
    lines.extend(["", "## Coverage", "",
        "Quiet share uses all inherited rows. Safe-rule coverage among quiet uses all quiet rows, including those with no safe rule move. Move identity shares below use quiet positions with a nonempty safe rule set.", "",
        "| Rule | Period | Inherited rows | Quiet | Quiet without a safe rule move | Quiet share | Safe rule among quiet | Rs = R | Ns = N |",
        "|---|---|---:|---:|---:|---|---|---|---|"])
    for rule, item in report["rules"].items():
        for period in ("train", "heldout"):
            group = item[period]; coverage = group["coverage"]; primary = group["primary"]
            lines.append(f"| {rule} | {period} | {group['retainedPositions']} | {coverage['quietPositions']} | {coverage['quietWithoutSafeRulePositions']} | {fmt(coverage['quietShare'])} | {fmt(coverage['safeRuleShareAmongQuiet'])} | {fmt(primary['shareRsIsR'])} | {fmt(primary['shareNsIsN'])} |")
    for title, population in (("Quiet comparisons", "primary"), ("All positions with a safe rule move", "allEligible")):
        lines.extend(["", f"## {title}", "",
            "These comparisons describe. Only the primary Rs minus Ns lift can decide a verdict after the control passes.", "",
            "| Rule | Period | Positions | Rs minus Ns | Rs minus N | Rs minus R0s | Positions Rs ≠ Ns | Lift where Rs ≠ Ns | Ns minus N |",
            "|---|---|---:|---|---|---|---:|---|---|"])
        for rule, item in report["rules"].items():
            for period in ("train", "heldout"):
                group = item[period][population]; distinct = group["liftWhereRsDiffersFromNs"]
                values = [fmt(group[field]) for field in ("lift", "againstNatural", "content")]
                lines.append(f"| {rule} | {period} | {group['positions']} | " + " | ".join(values)
                             + f" | {distinct['positions']} | {fmt(distinct['lift'])} | {fmt(group['naturalAfterCheckMinusBefore'])} |")
    lines.extend(["", "## Quiet splits", "",
        "The split is read by the check app. Forcing means Rs is a capture or gives check. These lifts describe and create no additional decision rule.", "",
        "| Rule | Split | Cell | Train positions | Train lift | Held-out positions | Held-out lift |",
        "|---|---|---|---:|---|---:|---|"])
    for rule, item in report["rules"].items():
        for field, cells in SPLITS.items():
            for cell in cells:
                name = original.cell_name(cell)
                before, after = (item[period]["splits"][field][name] for period in ("train", "heldout"))
                lines.append(f"| {rule} | {field} | {name} | {before['positions']} | {fmt(before['lift'])} | {after['positions']} | {fmt(after['lift'])} |")
    lines.extend(["", "## Fresh referee searches", "",
        "The denominator is all eligible positions needing a fresh search, quiet or not. The first exact line's move is compared with the original referee's first exact line. Stored moves and saved tablebase probes do not enter this denominator.", "",
        "| Rule | Period | Fresh positions | Best changed | Share changed |", "|---|---|---:|---:|---|"])
    for rule, item in report["rules"].items():
        for period in ("train", "heldout"):
            fresh = item[period]["allEligible"]["freshBestDiffersFromStored"]
            share = "undefined" if fresh["share"] is None else f"{100 * fresh['share']:.2f}%"
            lines.append(f"| {rule} | {period} | {fresh['positions']} | {fresh['changed']} | {share} |")
    lines.extend(["", "Soundness shares, all-position identity shares and coverage, and the numeric operational counters are in `rules.json`."])
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args(argv)
    if not args.reviewed:
        parser.error("real analysis is disabled in phase one; review is required before any position is read")
    from freeze import MANIFEST, verify_manifest
    frozen = verify_manifest(require_committed=True, verify_inputs=True)
    require(frozen.get("datasetKind") == "rules-after-check", "wrong project freeze")
    started = time.monotonic()
    prior = json.loads((PREDECESSOR / "results/rules.json").read_text())
    counts = inherited_counts(prior)
    content_sha = digest(MANIFEST)
    rows, manifests = load_full(PRIVATE, frozen, content_sha, counts)
    apps = {"check": frozen["boardApp"], "score": frozen["refereeApp"], "records": frozen["records"]}
    result = analyze(rows, counts, apps)
    result["provenance"] = {"contentManifestSha256": content_sha,
                            "inputManifestSha256": frozen["inputs"]["sha256"],
                            "ruleReadmeSha256": frozen["rule"]["sha256"],
                            "originalResultsSha256": digest(PREDECESSOR / "results/rules.json"),
                            "analysisSha256": digest(Path(__file__)),
                            "bootstrapSourceSha256": digest(PREDECESSOR / "analyze.py"),
                            "completedInputs": [{field: item[field] for field in ("stage", "month", "shard", "outputSha256")}
                                                for item in manifests]}
    result["operations"] = operation_totals(manifests)
    result["seconds"] = time.monotonic() - started
    destination = PROJECT / "results"
    destination.mkdir(exist_ok=True)
    for name, text in (("rules.json", json.dumps(result, indent=2, allow_nan=False) + "\n"),
                       ("rules.md", markdown(result))):
        partial = destination / (name + ".partial")
        partial.write_text(text)
        partial.replace(destination / name)
    print(f"Wrote the after-check analysis for {len(RULES)} rules.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
