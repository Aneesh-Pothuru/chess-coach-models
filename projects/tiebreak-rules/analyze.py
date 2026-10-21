#!/usr/bin/env python3
"""The registered tie-break analysis; only synthetic inputs before review."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import time

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PRIVATE = LAB / "private/tiebreak-rules/full"
PREDECESSOR = PROJECT.parent / "rules-of-thumb/analyze.py"
_spec = importlib.util.spec_from_file_location("tiebreak_predecessor_bootstrap", PREDECESSOR)
original = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(original)
import numpy as np

APP = json.loads((PROJECT / "app-pin.json").read_text())["commit"]
MONTHS = ("2026-07", "2026-08", "2026-09")
TRAIN, HELDOUT = MONTHS[:2], MONTHS[2]
RULES = {"tension": ("tension",), "trades-development": ("trades-ahead", "trades-behind"),
         "bishop-knight": ("bishop-for-knight", "knight-for-bishop"), "bishop-colour": ("bishop-colour",)}
RULE_UNITS = tuple(unit for units in RULES.values() for unit in units)
REFERENCE, CONTROL = "trades-level", "hang"
UNITS = (*RULE_UNITS, REFERENCE, CONTROL)
ORDERS = ("follow-first", "break-first")
BANDS = (1300, 1500)
TRADE_UNITS = ("trades-ahead", "trades-behind", "trades-level", "bishop-for-knight", "knight-for-bishop")
BASE_SPLITS = {"close": (False, True), "band": BANDS, "phase": ("opening", "middlegame", "endgame")}
DRAWS, SEED = 2000, 20261021
require = original.require


def finite(value):
    return float(value) if value is not None and math.isfinite(value) else None


def interval(point, draws):
    """One undefined draw invalidates the interval, while retaining the point."""
    values = np.asarray(draws, dtype=float)
    valid = int(np.isfinite(values).sum())
    lo, hi = np.percentile(values, [2.5, 97.5], method="linear") if valid == len(values) and valid else (None, None)
    return {"value": finite(point), "lo": finite(lo), "hi": finite(hi),
            "validDraws": valid, "undefinedDraws": len(values) - valid}


def mean_estimates(estimates):
    """Equal weight per unit or order, on each shared draw; never pool rows."""
    points, samples = zip(*estimates)
    point = sum(points) / len(points) if all(p is not None for p in points) else None
    return point, np.mean(np.asarray(samples), axis=0)


def splits_for(unit):
    return {**BASE_SPLITS, **({"tensionCentral": (False, True)} if unit == "tension" else {}),
            **({"tradePiece": ("n", "b", "r", "q")} if unit in TRADE_UNITS else {})}


def game_key(row):
    return row["month"] + ":" + row["game"]


def flatten(rows):
    """Validate grouped app readings and expose each retained unit once."""
    flat, keys, seen, game_month = [], set(), set(), {}
    for row in rows:
        require(row.get("datasetKind") == "tiebreak-rules", "wrong grouped dataset")
        require(row["month"] in MONTHS, "unregistered month")
        require(row["key"] == f"{row['month']}:{row['game']}:{row['ply']}" and row["key"] not in keys,
                "duplicate or mismatched occurrence key")
        keys.add(row["key"])
        require(game_month.setdefault(row["game"], row["month"]) == row["month"], "game in multiple months")
        require(row["band"] in BANDS and row["opponentBand"] in BANDS, "invalid Maia band")
        require(type(row["ply"]) is int and row["ply"] >= 8, "invalid kept ply")
        legal = row["legalMoves"]
        require(isinstance(legal, list) and len(legal) >= 2 and len(set(legal)) == len(legal), "invalid legal moves")
        require(row["M1"] in legal and row["M2"] in legal and row["M1"] != row["M2"] and row["played"] in legal,
                "invalid natural or played move")
        p1, p2 = row["p1"], row["p2"]
        require(all(type(p) in (float, int) and math.isfinite(p) and 0 <= p <= 1 for p in (p1, p2))
                and p1 >= p2 and (p1 != p2 or row["M1"] < row["M2"]), "invalid top-two probabilities or tie")
        require(isinstance(row["units"], list) and len(row["units"]) > 0, "occurrence has no kept unit")
        moves = {move for u in row["units"] for move in (u["F"], u["B"])}
        require(set(row["sound"]) == moves and all(type(v) is bool for v in row["sound"].values()),
                "soundness must cover only distinct compared moves")
        for u in row["units"]:
            unit = u["unit"]
            require(unit in UNITS and (row["month"], row["game"], unit) not in seen, "duplicate or unregistered unit/game")
            seen.add((row["month"], row["game"], unit))
            require({u["F"], u["B"]} == {row["M1"], row["M2"]}, "F/B differ from natural pair")
            require(u["stratum"] == ("follow-first" if u["F"] == row["M1"] else "break-first"), "wrong order")
            expected = {label: p1 if u[label] == row["M1"] else p2 for label in ("F", "B")}
            require(u["probabilities"] == expected, "unit probabilities differ from natural pair")
            require(u["splits"]["close"] == (p2 >= .5 * p1) and type(u["splits"]["close"]) is bool
                    and u["splits"]["band"] == row["band"], "close or band split differs")
            for field, cells in splits_for(unit).items():
                require(u["splits"].get(field) in cells, "missing registered split")
            require(unit == "tension" or u["splits"].get("tensionCentral") is None, "foreign tension split")
            require(unit in TRADE_UNITS or u["splits"].get("tradePiece") is None, "foreign trade split")
            flat.append({"month": row["month"], "game": row["game"], "unit": unit, "band": row["band"],
                         "F": u["F"], "B": u["B"], "M1": row["M1"], "played": row["played"],
                         "stratum": u["stratum"], "splits": u["splits"], "probabilities": u["probabilities"],
                         "soundF": row["sound"][u["F"]], "soundB": row["sound"][u["B"]]})
    return flat


class PeriodBootstrap:
    """One predecessor draw over the union, shared by all units and masks."""
    def __init__(self, rows, draws=DRAWS, seed=SEED):
        self.rows = rows
        self.boot = original.GameBootstrap([game_key(row) for row in rows], draws, seed)
        self.draws = draws
        self.base = {unit: np.asarray([row["unit"] == unit for row in rows], dtype=bool) for unit in UNITS}
        self.sound_f = np.asarray([row["soundF"] for row in rows], dtype=float)
        self.sound_b = np.asarray([row["soundB"] for row in rows], dtype=float)
        self.orders = np.asarray([row["stratum"] for row in rows], dtype=object)

    def estimates(self, mask):
        mask = np.asarray(mask, dtype=bool)
        difference = self.sound_f - self.sound_b
        orders = {order: mask & (self.orders == order) for order in ORDERS}
        one = self.sound_f != self.sound_b
        lift_orders = {order: self.boot.mean(difference, keep) for order, keep in orders.items()}
        one_orders = {order: self.boot.mean(self.sound_f, keep & one) for order, keep in orders.items()}
        estimates = {"plainLift": self.boot.mean(difference, mask),
                     "followFirstLift": lift_orders[ORDERS[0]], "breakFirstLift": lift_orders[ORDERS[1]],
                     "balancedLift": mean_estimates(list(lift_orders.values())),
                     "oneSoundFollowShare": mean_estimates(list(one_orders.values())),
                     "followFirstOneSoundFollowShare": one_orders[ORDERS[0]],
                     "breakFirstOneSoundFollowShare": one_orders[ORDERS[1]],
                     "againstFirst": self.boot.mean(difference * (self.orders == "break-first"), mask),
                     "soundnessF": self.boot.mean(self.sound_f, mask), "soundnessB": self.boot.mean(self.sound_b, mask)}
        for label in ("F", "B"):
            probabilities = np.asarray([row["probabilities"][label] for row in self.rows])
            estimates["probability" + label] = self.boot.mean(probabilities, mask)
        for order, keep in orders.items():
            for played in ("F", "B", "other"):
                values = np.asarray([row["played"] not in (row["F"], row["B"]) if played == "other"
                                     else row["played"] == row[played] for row in self.rows], dtype=float)
                estimates[f"played:{order}:{played}"] = self.boot.mean(values, keep)
        counts = {"positions": int(mask.sum()), "games": len({game_key(self.rows[i]) for i in np.flatnonzero(mask)}),
                  "orders": {order: int(keep.sum()) for order, keep in orders.items()},
                  "oneSoundPositions": int((mask & one).sum()),
                  "oneSoundByOrder": {order: int((keep & one).sum()) for order, keep in orders.items()}}
        return counts, estimates

    def group(self, mask):
        counts, estimates = self.estimates(mask)
        return {**counts, "measures": {name: interval(*value) for name, value in estimates.items()}}, estimates

    def unit(self, unit):
        base = self.base[unit]
        main, estimates = self.group(base)
        main["splits"] = {}
        for field, cells in splits_for(unit).items():
            values = np.asarray([row["splits"].get(field) for row in self.rows], dtype=object)
            main["splits"][field] = {str(cell).lower(): self.group(base & (values == cell))[0] for cell in cells}
        main["byBand"] = main["splits"]["band"]
        return main, estimates


def enough_data(units, heldout):
    counts = {unit: {"positions": heldout[unit]["positions"], "orders": dict(heldout[unit]["orders"])} for unit in units}
    failed = []
    for unit, item in counts.items():
        if item["positions"] < 300:
            failed.append({"unit": unit, "population": "all", "n": item["positions"], "required": 300})
        for order in ORDERS:
            if item["orders"][order] < 100:
                failed.append({"unit": unit, "population": order, "n": item["orders"][order], "required": 100})
    label = None if not failed else "not enough data (n=" + "; ".join(f"{x['unit']} {x['population']} {x['n']}" for x in failed) + ")"
    return {"passed": not failed, "counts": counts, "failures": failed, "label": label}


def decide(train, heldout, enough, control_passed):
    if not control_passed:
        return None, "control failed"
    if not enough["passed"]:
        return enough["label"], "not enough data"
    if original.above_zero(train) and original.above_zero(heldout):
        return "breaks the tie", None
    if original.below_zero(train) and original.below_zero(heldout):
        return "misleads", None
    return "does no better than Maia-2's order", None


def rule_period(units, unit_reports, unit_estimates):
    measures = {name: interval(*mean_estimates([unit_estimates[unit][name] for unit in units]))
                for name in unit_estimates[units[0]]}
    bands = {}
    # Band summaries must average the underlying paired draws, not CI endpoints.
    for band in BANDS:
        band_key = str(band)
        selected = [unit_reports[unit]["_bandEstimates"][band_key] for unit in units]
        bands[band_key] = {"unitPositions": {unit: unit_reports[unit]["byBand"][band_key]["positions"] for unit in units},
                           "measures": {name: interval(*mean_estimates([entry[name] for entry in selected])) for name in selected[0]}}
    return {"unitPositions": {unit: unit_reports[unit]["positions"] for unit in units}, "measures": measures, "byBand": bands}


def analyze(rows, coverage, app=APP, draws=DRAWS):
    flat = flatten(rows)
    require(set(coverage) == set(MONTHS), "incomplete coverage months")
    counts = Counter((row["month"], row["unit"], row["stratum"]) for row in flat)
    for month in MONTHS:
        require(set(coverage[month]["units"]) == set(UNITS), "incomplete unit coverage")
        for unit in UNITS:
            item = coverage[month]["units"][unit]
            follow, broke = (counts[month, unit, order] for order in ORDERS)
            require(item["kept"] == follow + broke and item["followFirst"] == follow and item["breakFirst"] == broke,
                    "kept coverage differs from scored units")
            require(0 <= item["kept"] <= 3000 and item["kept"] <= item["gamesWithSplit"] <= item["splits"] <= item["situation"],
                    "invalid coverage counts")
    period_rows = {"train": [row for row in flat if row["month"] in TRAIN],
                   "heldout": [row for row in flat if row["month"] == HELDOUT]}
    # Draw both period unions once, before computing the control or any unit.
    boots = {period: PeriodBootstrap(selected, draws) for period, selected in period_rows.items()}
    control_reports = {period: boot.group(boot.base[CONTROL])[0] for period, boot in boots.items()}
    control_enough = enough_data((CONTROL,), {CONTROL: control_reports["heldout"]})
    control_passed = control_enough["passed"] and all(original.above_zero(item["measures"]["balancedLift"])
                                                    for item in control_reports.values())
    result = {"schema": 1, "datasetKind": "tiebreak-rules", "app": app,
              "data": {"source": "rules-of-thumb Lichess rated standard 600+0 games; CC0", "train": list(TRAIN), "heldout": HELDOUT,
                       "bands": {"1300": [1250, 1449], "1500": [1450, 1649]}},
              "bootstrap": {"draws": draws, "seed": SEED, "unit": "game", "population": "union of retained games across all eight units, separately by period",
                            "sampling": "fixed game count with replacement; month:game sorted as in the predecessor",
                            "shared": "every unit, rule, control, band and split uses the same period game weights",
                            "interval": "95% percentile, linear interpolation; undefined if any resample is undefined"},
              "counts": {"occurrencesByMonth": {month: sum(row["month"] == month for row in rows) for month in MONTHS},
                         "unitRowsByMonth": {month: sum(row["month"] == month for row in flat) for month in MONTHS},
                         "unionGamesByPeriod": {period: boot.boot.games for period, boot in boots.items()}},
              "control": {"passed": control_passed, "enoughData": control_enough,
                          "status": "passes" if control_passed else control_enough["label"] or "does not pass", **control_reports},
              "coverage": coverage, "units": {}, "rules": {}}
    reports, estimates = {period: {} for period in boots}, {period: {} for period in boots}
    for period, boot in boots.items():
        for unit in UNITS:
            report, estimate = boot.unit(unit)
            report["_bandEstimates"] = {str(band): boot.estimates(boot.base[unit] & np.asarray([row["band"] == band for row in boot.rows], dtype=bool))[1] for band in BANDS}
            reports[period][unit], estimates[period][unit] = report, estimate
    for unit in UNITS:
        enough = enough_data((unit,), reports["heldout"])
        before, after = (reports[p][unit] for p in ("train", "heldout"))
        decision, reason = decide(before["measures"]["balancedLift"], after["measures"]["balancedLift"], enough, control_passed)
        result["units"][unit] = {"role": "control" if unit == CONTROL else "reference" if unit == REFERENCE else "rule-unit",
                                 "enoughData": enough, "descriptiveVerdict": decision if unit in RULE_UNITS else None,
                                 "verdictReason": reason if unit in RULE_UNITS else None, "train": before, "heldout": after}
    for rule, units in RULES.items():
        before, after = (rule_period(units, reports[period], estimates[period]) for period in ("train", "heldout"))
        enough = enough_data(units, reports["heldout"])
        decision, reason = decide(before["measures"]["balancedLift"], after["measures"]["balancedLift"], enough, control_passed)
        worth = all(original.above_zero(item["measures"]["breakFirstLift"]) for item in (before, after))
        result["rules"][rule] = {"units": list(units), "enoughData": enough, "verdict": decision, "verdictReason": reason,
                                "worthSwitching": {"criterionMet": worth, "descriptiveOnly": not control_passed or not enough["passed"]},
                                "train": before, "heldout": after}
    for period in reports:
        for unit in reports[period]:
            reports[period][unit].pop("_bandEstimates")
    return result


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_jsonl(path):
    raw = path.read_bytes()
    require(not raw or raw.endswith(b"\n"), "completed journal has an incomplete tail")
    return [json.loads(line) for line in raw.splitlines() if line.strip()]


def load_full(directory, frozen, content_hash, source_inputs):
    rows, coverage, completed, position_inputs = [], {}, [], []
    for month in MONTHS:
        prefix = directory / f"positions-{month}"
        metadata = json.loads(prefix.with_suffix(".json").read_text())
        expected = {"schema": 1, "datasetKind": "tiebreak-rules", "run": "full", "month": month,
                    "app": frozen["app"], "contentManifestSha256": content_hash, "sourceInputsSha256": frozen["inputs"]["sha256"],
                    "complete": True, "status": "complete", "timing": False, "limit": None}
        require(all(metadata.get(key) == value for key, value in {**expected, "stage": "positions", "sourceSha256": frozen["files"]["select.mjs"]}.items()), "positions provenance differs")
        require(metadata.get("complete") is True and metadata.get("timing") is False, "positions is not a completed full run")
        scan_hashes = []
        for shard in range(2):
            scan_path = directory / f"scan-{month}-{shard}-of-2.json"
            scan = json.loads(scan_path.read_text())
            source_month = source_inputs["months"][month]
            scan_expected = {**expected, "stage": "scan", "shard": shard, "shards": 2,
                             "sourceSha256": frozen["files"]["scan.mjs"], "inputSha256": source_month["outputSha256"]}
            require(all(scan.get(key) == value for key, value in scan_expected.items())
                    and scan.get("complete") is True and scan.get("timing") is False, "source scan provenance differs")
            require(type(scan.get("rows")) is int and scan["rows"] == scan["expectedRows"]
                    == (source_month["games"] + 1 - shard) // 2, "source scan coverage differs")
            scan_hash = digest(scan_path.with_suffix(".jsonl"))
            require(scan["outputSha256"] == scan_hash, "completed source scan changed")
            scan_hashes.append(scan_hash)
        require(metadata["inputSha256"] == hashlib.sha256("\n".join(scan_hashes).encode()).hexdigest(),
                "positions used different source scans")
        source_path = prefix.with_suffix(".jsonl")
        source_hash = digest(source_path)
        require(metadata["outputSha256"] == source_hash, "positions changed")
        source = read_jsonl(source_path)
        require(len(source) == metadata["rows"] == metadata["expectedRows"], "positions coverage differs")
        require(len({row["key"] for row in source}) == len(source), "duplicate position occurrence")
        coverage[month] = metadata["coverage"]
        position_inputs.append({"month": month, "outputSha256": source_hash})
        require(len(list(directory.glob(f"scored-{month}-*-of-*.json"))) == 2, "exactly two scored shards required")
        scored = {}
        for shard in range(2):
            path = directory / f"scored-{month}-{shard}-of-2.json"
            meta = json.loads(path.read_text())
            signature = {**expected, "stage": "scored", "shard": shard, "shards": 2, "inputSha256": source_hash,
                         "sourceSha256": frozen["files"]["score.mjs"]}
            require(all(meta.get(key) == value for key, value in signature.items()), "score provenance differs")
            require(meta["outputSha256"] == digest(path.with_suffix(".jsonl")), "score journal changed")
            selected = read_jsonl(path.with_suffix(".jsonl"))
            keys = [row["key"] for row in selected]
            require(keys == [row["key"] for row in source[shard::2]], "scored occurrence order differs")
            require(meta["keysSha256"] == hashlib.sha256("\n".join(keys).encode()).hexdigest(), "score key hash differs")
            require(len(selected) == meta["rows"] == meta["expectedRows"], "scored coverage differs")
            for row in selected:
                require(row["key"] not in scored, "duplicate scored occurrence")
                scored[row["key"]] = row
            completed.append({"stage": "scored", "month": month, "shard": shard, "outputSha256": meta["outputSha256"]})
        for position in source:
            row = scored[position["key"]]
            require(all(row.get(key) == value for key, value in position.items() if key != "times"), "score changed selected readings")
            rows.append(row)
    flatten(rows)
    return rows, coverage, completed, position_inputs


def markdown(report):
    def fmt(item):
        point = "undefined" if item["value"] is None else f"{100 * item['value']:.2f}"
        if item["lo"] is None:
            return f"{point} (interval undefined; {item['undefinedDraws']} missing draws)"
        return f"{point} ({100 * item['lo']:.2f} to {100 * item['hi']:.2f})"
    lines = ["# Tie-break rules: results", "", f"App `{report['app']}`. Lichess rated standard 600+0 games, CC0. July and August 2026 are pooled for train; September is held out.", "",
             f"Intervals use {report['bootstrap']['draws']} shared game resamples per period, seed {report['bootstrap']['seed']}. Every unit and control uses the union of retained games. Any undefined resample makes its interval undefined. Differences are percentage points; shares are percentages. Rules with two units average their unit estimates equally on every draw.", "",
             "## The control", "", "| Period | Positions | Follow first | Break first | Balanced lift |", "|---|---:|---:|---:|---|"]
    for period in ("train", "heldout"):
        c = report["control"][period]
        lines.append(f"| {period} | {c['positions']} | {c['orders'][ORDERS[0]]} | {c['orders'][ORDERS[1]]} | {fmt(c['measures']['balancedLift'])} |")
    lines += ["", f"Control: {report['control']['status']}." + ("" if report["control"]["passed"] else " No rule receives a verdict; the remaining estimates describe."), "",
              "## The rules", "", "| Rule | Train balanced lift | Held-out balanced lift | Verdict | Worth-switching criterion |", "|---|---|---|---|---|"]
    count_notes = []
    for rule, entry in report["rules"].items():
        worth = entry["worthSwitching"]
        label = ("met" if worth["criterionMet"] else "not met") + (" (descriptive only)" if worth["descriptiveOnly"] else "")
        lines.append(f"| {rule} | {fmt(entry['train']['measures']['balancedLift'])} | {fmt(entry['heldout']['measures']['balancedLift'])} | {entry['verdict'] or 'no verdict (control failed)'} | {label} |")
        if not entry["enoughData"]["passed"]:
            count_notes.append(f"Count gate for {rule}: {entry['enoughData']['label']}.")
    lines += ["", *count_notes]
    lines += ["", "## Measures", "", "Units and the reference describe separately. Only a rule's balanced lift decides its verdict after the control and count gates. The break-first lift alone supplies the separate worth-switching criterion.", "",
              "| Kind | Name | Period | Plain lift | Follow-first lift | Break-first lift | Balanced lift | F share when only one sound, balanced | F minus first choice |", "|---|---|---|---|---|---|---|---|---|"]
    fields = ("plainLift", "followFirstLift", "breakFirstLift", "balancedLift", "oneSoundFollowShare", "againstFirst")
    for kind in ("rules", "units"):
        for name, entry in report[kind].items():
            for period in ("train", "heldout"):
                lines.append(f"| {kind} | {name} | {period} | " + " | ".join(fmt(entry[period]["measures"][field]) for field in fields) + " |")
    lines += ["", "## Coverage", "", "| Unit | Month | In situation | Splits | Games with split | Kept | Follow first | Break first |", "|---|---|---:|---:|---:|---:|---:|---:|"]
    for month in MONTHS:
        for unit in UNITS:
            c = report["coverage"][month]["units"][unit]
            lines.append(f"| {unit} | {month} | " + " | ".join(str(c[key]) for key in ("situation", "splits", "gamesWithSplit", "kept", "followFirst", "breakFirst")) + " |")
    lines += ["", "## Unit descriptions", "", "| Unit | Period | Descriptive verdict | P(F) | P(B) | Played F / B / other, follow first | Played F / B / other, break first |", "|---|---|---|---|---|---|---|"]
    for unit, entry in report["units"].items():
        for period in ("train", "heldout"):
            m = entry[period]["measures"]
            played = [" / ".join(fmt(m[f"played:{order}:{label}"]) for label in ("F", "B", "other")) for order in ORDERS]
            lines.append(f"| {unit} | {period} | {entry['descriptiveVerdict'] or 'no rule verdict'} | {fmt(m['probabilityF'])} | {fmt(m['probabilityB'])} | " + " | ".join(played) + " |")
    lines += ["", "## Split descriptions", "", "All registered measures, probabilities and move-played shares for every split cell and both bands are in `rules.json`, with their denominators and undefined-draw counts. The table below gives each cell's balanced lift; no split creates a verdict.", "",
              "| Unit | Period | Split | Cell | Positions | Follow first | Break first | Balanced lift |", "|---|---|---|---|---:|---:|---:|---|"]
    for unit, entry in report["units"].items():
        for period in ("train", "heldout"):
            for field, cells in entry[period]["splits"].items():
                for cell, group in cells.items():
                    lines.append(f"| {unit} | {period} | {field} | {cell} | {group['positions']} | {group['orders'][ORDERS[0]]} | {group['orders'][ORDERS[1]]} | {fmt(group['measures']['balancedLift'])} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args(argv)
    if not args.reviewed:
        parser.error("analysis requires review and a committed freeze before any study outcome is read")
    from freeze import MANIFEST, verify_manifest
    frozen = verify_manifest(require_committed=True, verify_inputs=True)
    require(frozen["datasetKind"] == "tiebreak-rules" and frozen["app"] == APP, "wrong analysis freeze")
    started = time.monotonic()
    manifest_hash = digest(MANIFEST)
    source_inputs = json.loads((PROJECT / frozen["inputs"]["path"]).read_text())
    rows, coverage, completed, position_inputs = load_full(PRIVATE, frozen, manifest_hash, source_inputs)
    report = analyze(rows, coverage)
    report["provenance"] = {"contentManifestSha256": manifest_hash, "inputManifestSha256": frozen["inputs"]["sha256"],
                            "ruleReadmeSha256": frozen["rule"]["sha256"], "analysisSha256": digest(Path(__file__)),
                            "bootstrapSourceSha256": digest(PREDECESSOR), "completedInputs": completed, "positionInputs": position_inputs}
    report["seconds"] = time.monotonic() - started
    for name, value in (("rules.json", json.dumps(report, indent=2, allow_nan=False) + "\n"), ("rules.md", markdown(report))):
        path = PROJECT / "results" / name
        partial = path.with_suffix(path.suffix + ".partial")
        partial.write_text(value); partial.replace(path)
    print(json.dumps({"stage": "analysis", "rules": len(RULES), "units": len(UNITS), "seconds": report["seconds"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
