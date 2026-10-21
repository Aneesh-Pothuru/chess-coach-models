#!/usr/bin/env python3
"""Write July counts/timings and price the full run, without any new referee call.

The scanner must already have completed its July slice. This program reads
aggregate metadata only and hashes journal bytes. It cannot read soundness,
compute a rule measure or select a verdict. Engine cost comes solely from
the predecessor's published operations aggregate.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path

from freeze import APP, LAB, PROJECT, MANIFEST, INPUT_MANIFEST, atomic_json, digest, encode, read_json, require, verify_manifest

UNITS = ("tension", "trades-ahead", "trades-behind", "bishop-for-knight", "knight-for-bishop", "bishop-colour", "trades-level", "hang")
TIMES = ("gamesSeconds", "replaySeconds", "boardSeconds", "entrySeconds", "unitsSeconds", "maiaSeconds", "hangSeconds", "splitSeconds", "rowSeconds", "maiaCalls")
REFERENCE = LAB / "projects/rules-after-check/results/operations.json"
TIMING_MANIFEST = PROJECT / "timing-manifest.json"


def number(value):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0, "invalid timing or count")
    return value


def stamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(result.tzinfo is not None, "timing timestamp lacks timezone")
    return result


def estimate(selection, totals, worker_seconds, reference, month_games):
    coverage = selection["coverage"]
    games = number(coverage["games"])
    require(games > 0 and set(coverage["units"]) == set(UNITS), "timing coverage differs from the rule")
    require(set(month_games) == {"2026-07", "2026-08", "2026-09"}, "full-game month set differs")
    unit_rows = number(selection["unitRows"])
    grouped_rows = number(selection["rows"])
    require(grouped_rows <= unit_rows and unit_rows == sum(coverage["units"][u]["kept"] for u in UNITS), "selection counts differ")
    unit_projection = {}
    for unit in UNITS:
        row = coverage["units"][unit]
        require(row["gamesWithSplit"] <= games and row["kept"] == row["followFirst"] + row["breakFirst"], "unit coverage differs")
        unit_projection[unit] = {month: min(3000, number(row["gamesWithSplit"]) / games * number(count))
                                 for month, count in month_games.items()}
    reference_totals = {name: 0 for name in ("engineSeconds", "newGameSeconds", "bestCalls", "scoreCalls")}
    for month in month_games:
        item = reference["workers"]["scored"][month]
        for name in reference_totals:
            reference_totals[name] += number(item["completedRowTotals"][name])
    searches = reference_totals["bestCalls"] + reference_totals["scoreCalls"]
    require(searches > 0, "reference has no recorded searches")
    mean_search = reference_totals["engineSeconds"] / searches
    full_games = sum(month_games.values())
    scan_seconds = number(worker_seconds) / games * full_games
    projected_units = sum(sum(months.values()) for months in unit_projection.values())
    sharing_ratio = grouped_rows / unit_rows if unit_rows else None
    scenarios = {}
    for name, positions in (("observedJulySharing", projected_units * sharing_ratio if sharing_ratio is not None else None),
                            ("noCrossUnitSharing", projected_units)):
        engine = positions * 3 * mean_search if positions is not None else None
        combined = scan_seconds + engine if engine is not None else None
        scenarios[name] = {"projectedGroupedPositions": positions, "engineWorkerSeconds": engine,
                           "totalWorkerSeconds": combined, "idealTwoWorkerHours": combined / 7200 if combined is not None else None,
                           "dominantStep": "scan" if engine is not None and scan_seconds >= engine else "engine" if engine is not None else None}
    return {"fullGames": full_games, "workers": 2, "scanWorkerSeconds": scan_seconds,
            "scanInstrumentSeconds": {key: number(value) / games * full_games for key, value in totals.items() if key.endswith("Seconds")},
            "unitDrawsByMonth": unit_projection, "projectedUnitRows": projected_units,
            "observedGroupedPositionPerUnitRow": sharing_ratio, "referenceTotals": reference_totals,
            "referenceSearches": searches, "referenceSecondsPerSearch": mean_search,
            "scenarios": scenarios, "tablebaseNetworkSeconds": None, "calendarHours": None}


def stage_times(path):
    # Freeze the completed scan/select prefix, not later appends made when
    # this very report stage exits. Regeneration remains byte-verifiable.
    raw = path.read_bytes(); prefix_length = 0; cursor = 0; starts = {}; rows = {"scan": [], "select": []}
    for line in raw.splitlines(keepends=True):
        cursor += len(line)
        event = json.loads(line)
        stage = event.get("stage")
        if stage not in rows:
            continue
        require(event.get("month") == "2026-07", "timing supervisor read another month")
        key = stage, event.get("attempt")
        if event["event"] == "started":
            require(key not in starts, "duplicate timing stage start")
            starts[key] = event
        elif event["event"] in ("completed", "stopped", "paused"):
            require(key in starts, "timing stage terminal lacks a start")
            begin = starts.pop(key)
            utc = (stamp(event["at"]) - stamp(begin["at"])).total_seconds()
            rows[stage].append({"event": event["event"], "recordedSeconds": number(event["seconds"]), "utcSeconds": number(utc)})
            prefix_length = cursor
    require(all(any(row["event"] == "completed" for row in values) for values in rows.values()),
            "scan or selection has not completed")
    for stage, _attempt in starts:
        rows[stage].append({"event": "interrupted-without-terminal", "recordedSeconds": None, "utcSeconds": None})
    output = {stage: {"attempts": len(values), "stopped": sum(row["event"] == "stopped" for row in values),
                      "scheduledPauses": sum(row["event"] == "paused" for row in values),
                      "unknownAttempts": sum(row["event"] == "interrupted-without-terminal" for row in values),
                      "recordedSeconds": sum(row["recordedSeconds"] for row in values) if all(row["recordedSeconds"] is not None for row in values) else None,
                      "utcSeconds": sum(row["utcSeconds"] for row in values) if all(row["utcSeconds"] is not None for row in values) else None,
                      "knownRecordedSeconds": sum(row["recordedSeconds"] for row in values if row["recordedSeconds"] is not None),
                      "knownUtcSeconds": sum(row["utcSeconds"] for row in values if row["utcSeconds"] is not None)} for stage, values in rows.items()}
    return output, {"path": path.relative_to(LAB).as_posix(), "prefixBytes": prefix_length,
                    "prefixSha256": hashlib.sha256(raw[:prefix_length]).hexdigest()}


def build(limit):
    frozen = verify_manifest(require_committed=False, verify_inputs=True)
    directory = LAB / "private/tiebreak-rules" / f"timing-july-{limit}"
    active = LAB / "private/tiebreak-rules/active-stage.json"
    if active.exists():
        marker = read_json(active)
        require(marker.get("run") != directory.name or marker.get("stage") == "timing",
                "a scan or selection stage is still active")
    metadata, hashes, totals = [], {}, {}
    for shard in range(2):
        path = directory / f"scan-2026-07-{shard}-of-2.json"
        data = read_json(path)
        expected = {"schema": 1, "datasetKind": "tiebreak-rules", "stage": "scan", "app": APP, "month": "2026-07",
                    "run": directory.name, "timing": True, "limit": limit, "shard": shard, "shards": 2,
                    "complete": True, "status": "complete", "contentManifestSha256": digest(MANIFEST),
                    "sourceInputsSha256": digest(INPUT_MANIFEST), "sourceSha256": frozen["files"]["scan.mjs"]}
        require(all(data.get(k) == v for k, v in expected.items()), "July timing scan provenance differs")
        require(data["rows"] == data["expectedRows"] == (limit + 1 - shard) // 2, "July timing game count differs")
        require(digest(path.with_suffix(".jsonl")) == data["outputSha256"], "completed timing journal changed")
        for item in (path, path.with_suffix(".jsonl")):
            hashes[item.relative_to(LAB).as_posix()] = digest(item)
        require(set(data["totals"]).issubset(TIMES), "timing scan contains an unknown instrument field")
        for name, value in data["totals"].items():
            totals[name] = totals.get(name, 0) + number(value)
        metadata.append(data)
    path = directory / "positions-2026-07.json"
    selection = read_json(path)
    expected = {"schema": 1, "datasetKind": "tiebreak-rules", "stage": "positions", "app": APP, "month": "2026-07",
                "run": directory.name, "timing": True, "limit": limit, "complete": True, "status": "complete", "cap": 3000,
                "contentManifestSha256": digest(MANIFEST), "sourceInputsSha256": digest(INPUT_MANIFEST),
                "sourceSha256": frozen["files"]["select.mjs"],
                "inputSha256": hashlib.sha256("\n".join(row["outputSha256"] for row in metadata).encode()).hexdigest()}
    require(all(selection.get(k) == v for k, v in expected.items()), "July timing selection provenance differs")
    require(selection["rows"] == selection["expectedRows"] and selection["coverage"]["games"] == limit,
            "selection or game coverage differs")
    require(digest(path.with_suffix(".jsonl")) == selection["outputSha256"], "timing selection bytes changed")
    for item in (path, path.with_suffix(".jsonl")):
        hashes[item.relative_to(LAB).as_posix()] = digest(item)
    worker_seconds = sum(number(data["workerSeconds"]) for data in metadata)
    inputs = read_json(INPUT_MANIFEST)
    require(digest(REFERENCE) == frozen["predecessorFiles"][REFERENCE.relative_to(LAB).as_posix()], "reference timing changed")
    reference = read_json(REFERENCE)
    timings, event_hash = stage_times(directory / "stage-events.jsonl")
    report = {"schema": 1, "purpose": "Phase-one counts and elapsed timings only. No July move is refereed and no verdict is computed.",
              "app": APP, "month": "2026-07", "run": directory.name, "games": limit,
              "coverage": selection["coverage"], "groupedPositions": selection["rows"], "unitRows": selection["unitRows"],
              "scanWorkerSeconds": worker_seconds, "scanTotals": totals, "selectionSeconds": number(selection["seconds"]),
              "scanStoppedJobs": sum(data["stoppedJobs"] for data in metadata), "stageTimings": timings,
              "estimate": estimate(selection, totals, worker_seconds, reference, {m: data["games"] for m, data in inputs["months"].items()}),
              "provenance": {"contentManifestSha256": digest(MANIFEST), "inputManifestSha256": digest(INPUT_MANIFEST),
                             "generatorSha256": digest(Path(__file__)), "referenceAggregateSha256": digest(REFERENCE),
                             "referenceApp": reference["apps"]["score"], "timingManifest": "timing-manifest.json"}}
    supplement = {"schema": 1, "datasetKind": "tiebreak-rules-timing", "app": APP,
                  "contentManifestSha256": digest(MANIFEST), "sourceSha256": digest(Path(__file__)),
                  "inputs": hashes, "stageEventPrefix": event_hash, "referenceAggregateSha256": digest(REFERENCE)}
    return report, supplement


def markdown(report):
    lines = ["# July timing before scoring", "", f"App `{report['app']}`. The first {report['games']} July games in file order were scanned. "
             "The input is the existing rules-of-thumb stream, verified against its summary before any game was parsed. No new stream download was needed. "
             "Only board readings and Maia-2 ran; no move was scored, no tablebase was queried, and no rule measure or verdict was computed.", "",
             f"The slice has {report['coverage']['plies']} positions, {report['coverage']['positionsEntering']} entering the scan, "
             f"{report['coverage']['positionsInAUnit']} in at least one unit's situation, and {report['coverage']['maiaCalls']} Maia calls. "
             f"The draws retain {report['unitRows']} unit rows in {report['groupedPositions']} distinct game/ply positions. "
             f"{report['coverage']['skippedInitial']} games with their own initial position were skipped.", "",
             "| Unit | Situation positions | Split positions | Games with a split | Kept | Follow first | Break first |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    for unit in UNITS:
        r = report["coverage"]["units"][unit]
        lines.append(f"| {unit} | {r['situation']} | {r['splits']} | {r['gamesWithSplit']} | {r['kept']} | {r['followFirst']} | {r['breakFirst']} |")
    lines += ["", "| Step | Attempts | Stops | Scheduled pauses | Supervisor UTC seconds | Supervisor timer seconds | Summed worker seconds |", "|---|---:|---:|---:|---:|---:|---:|"]
    for stage in ("scan", "select"):
        r = report["stageTimings"][stage]
        worker = f"{report['scanWorkerSeconds']:.3f}" if stage == "scan" else "—"
        utc = f"{r['utcSeconds']:.3f}" if r['utcSeconds'] is not None else f"unknown ({r['knownUtcSeconds']:.3f} known)"
        recorded = f"{r['recordedSeconds']:.3f}" if r['recordedSeconds'] is not None else f"unknown ({r['knownRecordedSeconds']:.3f} known)"
        lines.append(f"| {stage} | {r['attempts']} | {r['stopped']} | {r['scheduledPauses']} | {utc} | {recorded} | {worker} |")
    lines += ["", "| Scanner instrument | Recorded seconds |", "|---|---:|"]
    for name, value in report["scanTotals"].items():
        if name.endswith("Seconds"):
            lines.append(f"| {name} | {value:.3f} |")
    e = report["estimate"]
    lines += ["", f"The scanner's worker timers imply {e['scanWorkerSeconds']/3600:.3f} worker hours for {e['fullGames']} games, "
              "scaling the July slice per game. They include model startup and completed-game work but exclude initial stream decoding and freeze checks. "
              f"The completed slice records {report['scanStoppedJobs']} stopped worker jobs.", "",
              f"Engine cost comes from the prior rules-after-check aggregate: {e['referenceSearches']} best/move searches took "
              f"{e['referenceTotals']['engineSeconds']:.3f} recorded seconds, or {e['referenceSecondsPerSearch']:.6f} seconds per search. "
              "The timer includes engine clearing. This is a prior app/run's timing, not a measurement of the new referee.", "",
              "| Workload assumption | Engine worker hours | Total worker hours | Ideal elapsed hours at two workers | Larger step |",
              "|---|---:|---:|---:|---|"]
    for name, r in e["scenarios"].items():
        if r["totalWorkerSeconds"] is None:
            lines.append(f"| {name} | undefined | undefined | undefined | undefined |")
        else:
            lines.append(f"| {name} | {r['engineWorkerSeconds']/3600:.3f} | {r['totalWorkerSeconds']/3600:.3f} | {r['idealTwoWorkerHours']:.3f} | {r['dominantStep']} |")
    lines += ["", "Each unit's monthly draw count is projected from the July games with a split and capped at 3,000. "
              "The first scenario retains the July ratio of grouped positions to unit rows; the second allows no saving from a position shared by units. "
              "Each projected position is priced at one best search and two move searches, even where a tablebase could replace them. "
              "These are workload scenarios, not runtime bounds: another month's situation rates, sharing and instrument speed can differ.", "",
              "Tablebase network time is unmeasured. The ideal two-worker time assumes balanced workers and excludes selection/analysis, "
              "byte verification, startup differences, retry/restart delays and machine interruptions. Heavy work pauses at 12:59:50 UTC "
              "and resumes at 15:30; calendar duration therefore depends on the launch time. These elapsed timers are not CPU usage, "
              "and UTC and process timers can differ across suspension. A missing terminal event leaves that attempt's time unknown, "
              "with the known subtotal retained; a recovered worker's uncheckpointed failed tail is not reconstructed as zero.", "",
              "No package or model was installed for this timing pass. The existing Maia asset is read through the new app's human model; "
              "model downloads are disabled. `timing-manifest.json` binds the frozen measurement sources, the completed timing metadata "
              "and journal byte hashes, the supervisor's completed-event prefix and these generated reports.", ""]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timing", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args(argv)
    if not args.timing or args.limit is None or not 1 <= args.limit <= 600:
        parser.error("--timing --limit 1..600 is required; this program reads July timing metadata only")
    report, supplement = build(args.limit)
    outputs = {"results/timing.json": encode(report), "results/timing.md": markdown(report).encode()}
    supplement["outputs"] = {name: hashlib.sha256(data).hexdigest() for name, data in outputs.items()}
    if TIMING_MANIFEST.exists():
        require(TIMING_MANIFEST.read_bytes() == encode(supplement), "existing timing supplement differs; review before replacing it")
    for name, data in outputs.items():
        path = PROJECT / name
        temporary = path.with_suffix(path.suffix + ".partial"); temporary.write_bytes(data); temporary.replace(path)
    atomic_json(TIMING_MANIFEST, supplement)
    print(json.dumps({"status": "complete", "games": report["games"], "scanWorkerSeconds": report["scanWorkerSeconds"],
                      "timingManifestSha256": digest(TIMING_MANIFEST)}))


if __name__ == "__main__":
    main()
