#!/usr/bin/env python3
"""Summarize the completed run without reading a position or changing its freeze.

From the lab root:
  .venv/bin/python projects/rules-after-check/test_operations.py
  nice -n 10 .venv/bin/python projects/rules-after-check/operations.py --write-manifest
  nice -n 10 .venv/bin/python projects/rules-after-check/operations.py

The first generation writes a separate supplement manifest. Later generation
requires its hashes to match. The original measurement manifest is read only.
Private journals are hashed as bytes; only metadata and operational logs are
parsed. No chess measures or verdicts are computed here.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re

from freeze import LAB, PROJECT, MANIFEST, MONTHS, digest, verify_manifest

PRIVATE = LAB / "private/rules-after-check"
SUPPLEMENT = PROJECT / "operations-manifest.json"
STAGES = ("checked", "scored", "analysis", "examples")
METRICS = ("positionSeconds", "safetySeconds", "splitSeconds", "positionCalls", "safetyCalls", "legalMoves",
           "maiaSeconds", "engineSeconds", "tablebaseSeconds", "newGameSeconds", "rowSeconds", "maiaCalls",
           "maiaBands", "bestCalls", "scoreCalls", "tablebaseCalls", "tablebaseRetries", "tablebaseUnavailable",
           "tablebaseRetrySeconds", "newGameCalls", "storedProbeReads", "reusedMoves", "newSearches")
REASONS = {"stop requested: SIGTERM": "requested-sigterm", "stop requested: SIGINT": "requested-sigint",
           "scheduled UTC blackout": "scheduled-blackout", "inexact move score": "inexact-move-score",
           "inexact best score": "inexact-best-score"}
POWER_LINE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})\s+(Sleep|DarkWake|Wake)\s+")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(path.read_text())


def read_events(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def timestamp(value):
    at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(at.tzinfo is not None, "timestamp lacks a timezone")
    return at.astimezone(timezone.utc)


def seconds(start, end):
    value = (timestamp(end) - timestamp(start)).total_seconds()
    require(value >= 0, "operational timestamps run backwards")
    return value


def number(value):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0, "invalid operational number")
    return value


def duration(values):
    known = [number(x) for x in values if x is not None]
    return {"seconds": sum(known) if len(known) == len(values) else None,
            "knownSeconds": sum(known), "unknownIntervals": len(values) - len(known)}


def stage_summary(events):
    attempts, extras, global_counts = {}, defaultdict(Counter), Counter()
    for event in events:
        timestamp(event["at"])
        kind = event["event"]
        if kind in ("blackout-wait", "blackout-ended"):
            global_counts[kind] += 1
            continue
        stage, month = event["stage"], event.get("month") or "all"
        require(stage in STAGES and month in (*MONTHS, "all"), "unknown stage or month")
        group = stage, month
        if kind in ("already-complete", "blackout-stop-requested"):
            extras[group][kind] += 1
            continue
        key = (*group, event["attempt"])
        if kind == "started":
            require(key not in attempts, "duplicate stage start")
            attempts[key] = [event, None]
        else:
            require(kind in ("completed", "stopped", "paused") and key in attempts
                    and attempts[key][1] is None, "unpaired stage terminal")
            attempts[key][1] = event
    groups = defaultdict(list)
    for (stage, month, _), pair in attempts.items():
        groups[stage, month].append(pair)
    output = {}
    for group in sorted(set(groups) | set(extras)):
        rows = sorted(groups[group], key=lambda pair: timestamp(pair[0]["at"]))
        timers, utc, gaps, counts, reasons = [], [], [], Counter(), Counter()
        previous_end = None
        for i, (start, end) in enumerate(rows):
            if i:
                gaps.append(seconds(previous_end, start["at"]) if previous_end else None)
            if end is None:
                counts["unfinished"] += 1
                timers.append(None); utc.append(None); previous_end = None
                continue
            counts[end["event"]] += 1
            require((end["exitCode"] == 0) == (end["event"] == "completed"), "stage exit and status disagree")
            reason = end.get("stopReason")
            if end["event"] != "completed":
                reasons[reason if reason in ("scheduled-blackout", "signal", "stage-failure") else "other-or-unrecorded"] += 1
            timers.append(number(end["seconds"]))
            utc.append(seconds(start["at"], end["at"]))
            previous_end = end["at"]
        a, b = duration(timers), duration(utc)
        output.setdefault(group[0], {})[group[1]] = {
            "attempts": len(rows), "completed": counts["completed"], "stopped": counts["stopped"],
            "scheduledPauses": counts["paused"], "unfinished": counts["unfinished"],
            "stopReasons": dict(sorted(reasons.items())), "recordedStageSeconds": a, "utcStageSeconds": b,
            "utcMinusRecordedSeconds": b["seconds"] - a["seconds"] if a["seconds"] is not None and b["seconds"] is not None else None,
            "betweenAttemptUtcSeconds": duration(gaps),
            "firstStartToLastEndUtcSeconds": seconds(rows[0][0]["at"], previous_end) if rows and previous_end else None,
            "alreadyCompleteChecks": extras[group]["already-complete"],
            "blackoutStopRequests": extras[group]["blackout-stop-requested"],
        }
    return {"stages": output, "blackoutWaits": global_counts["blackout-wait"], "blackoutEnds": global_counts["blackout-ended"]}


def reason_category(reason):
    # Never pass through an engine error, which can contain private position text.
    if reason in REASONS:
        return REASONS[reason]
    if isinstance(reason, str) and "blackout" in reason:
        return "scheduled-blackout"
    return "other-or-unrecorded"


def worker_summary(events, meta):
    counts, reasons = Counter(), Counter()
    running = terminal_stop = terminal_unknown = False
    unknown_tails = duplicate_markers = 0
    for event in events:
        timestamp(event["at"])
        kind = event["event"]
        require(kind in ("job-started", "job-stopped", "job-completed", "stop-requested", "interrupted-job-recovered"),
                "unknown worker event")
        counts[kind] += 1
        if kind == "interrupted-job-recovered":
            # job-stopped is written before the stopped checkpoint. A kill
            # between them leaves one stop with both kinds of evidence.
            if terminal_stop:
                duplicate_markers += 1
            else:
                reasons["interrupted-before-terminal-event"] += 1
            unknown_tails += int(not terminal_unknown)
            running = terminal_stop = terminal_unknown = False
        elif kind == "job-started":
            require(not running, "overlapping worker invocations")
            running, terminal_stop, terminal_unknown = True, False, False
        elif kind in ("job-stopped", "job-completed"):
            require(running, "worker terminal without start")
            running, terminal_stop = False, kind == "job-stopped"
            if terminal_stop:
                reasons[reason_category(event.get("reason"))] += 1
                if event.get("times") is None:
                    unknown_tails += 1
                    terminal_unknown = True
    # A complete checkpoint is saved before job-completed is appended. If
    # killed in that gap, completion is valid but the terminal event is absent.
    missing_terminal = int(running)
    logical_stops = counts["job-stopped"] + counts["interrupted-job-recovered"] - duplicate_markers
    require(meta["stoppedJobs"] == logical_stops, "worker stop count does not reconcile")
    return {"starts": counts["job-started"], "completedEvents": counts["job-completed"],
            "stoppedJobs": logical_stops, "stopReasons": dict(sorted(reasons.items())),
            "stopRequests": counts["stop-requested"], "recoveryMarkers": counts["interrupted-job-recovered"],
            "recoveryMarkersAfterLoggedStop": duplicate_markers, "unknownFailedTails": unknown_tails,
            "missingCompletionEvents": missing_terminal}


def parse_power(texts):
    # Category must immediately follow the timestamp. Text such as an
    # assertion named "Video Wake" or a planned "Wake Requests" is excluded.
    events = set()
    for text in texts:
        for line in text.splitlines():
            match = POWER_LINE.match(line)
            if match:
                if match[2] == "Wake" and line[match.end():].startswith("Requests"):
                    continue
                at = datetime.strptime(match[1], "%Y-%m-%d %H:%M:%S %z").astimezone(timezone.utc)
                events.add((at, match[2]))
    return sorted(events)


def sleep_summary(events, start, end):
    left, right = timestamp(start), timestamp(end)
    require(left <= right, "invalid sleep window")
    counts = Counter(kind for at, kind in events if left <= at <= right)
    # Keep the immediately preceding state to distinguish an awake boundary
    # from a sleep that began outside the run. Do not publish that timeline.
    preceding = [(at, kind) for at, kind in events if at < left]
    asleep = preceding[-1][1] == "Sleep" if preceding else None
    begun = left if asleep else None
    known, clipped_left, clipped_right, unknown = 0.0, int(asleep is True), 0, int(asleep is None)
    for at, kind in events:
        if not left <= at <= right:
            continue
        if kind == "Sleep":
            if not asleep:
                begun = at
            asleep = True
        else:
            if asleep and begun is not None:
                known += (at - begun).total_seconds()
            asleep, begun = False, None
    if asleep:
        known += (right - begun).total_seconds()
        clipped_right = 1
    return {"sleepEvents": counts["Sleep"], "darkWakeEvents": counts["DarkWake"], "wakeEvents": counts["Wake"],
            "knownSleepSecondsWithinRun": known, "sleepIntervalsClippedAtStart": clipped_left,
            "sleepIntervalsClippedAtEnd": clipped_right, "unknownInitialState": bool(unknown)}


def battery_reading(text):
    source = re.search(r"Now drawing from '(AC Power|Battery Power)'", text)
    percentage = re.search(r"\b(\d{1,3})%;", text)
    value = int(percentage[1]) if percentage else None
    require(value is None or 0 <= value <= 100, "invalid battery percentage")
    return {"source": source[1] if source else "unknown", "percent": value}


def snapshot_summary(rows, start, end):
    left, right = timestamp(start), timestamp(end)
    ordered = sorted(rows, key=lambda row: timestamp(row["at"]))
    require(ordered and timestamp(ordered[0]["at"]) <= left and timestamp(ordered[-1]["at"]) >= right,
            "power snapshots do not enclose the driver run")
    inside = [row for row in ordered if left <= timestamp(row["at"]) <= right]
    prior = max((row for row in ordered if timestamp(row["at"]) <= left), key=lambda row: timestamp(row["at"]))
    after = min((row for row in ordered if timestamp(row["at"]) >= right), key=lambda row: timestamp(row["at"]))
    selected = [prior, *[row for row in inside if left < timestamp(row["at"]) < right], after]
    transitions, samples, closed, unknown_lid = [], [], 0, 0
    previous = None
    for row in selected:
        read = battery_reading(row["battery"])
        samples.append(read)
        lid = re.search(r'"AppleClamshellState"\s*=\s*(Yes|No)', row["lid"])
        closed += int(lid is not None and lid[1] == "Yes")
        unknown_lid += int(lid is None)
        if previous and read["source"] != previous[1]["source"]:
            a = max(left, timestamp(previous[0]["at"])); b = min(right, timestamp(row["at"]))
            if a <= b:
                transitions.append({"from": previous[1]["source"], "to": read["source"],
                                    "earliestSecondsAfterStart": (a - left).total_seconds(),
                                    "latestSecondsAfterStart": (b - left).total_seconds(),
                                    "bracketSeconds": (b - a).total_seconds()})
        previous = row, read
    percentages = [r["percent"] for r in samples if r["percent"] is not None]
    return {"snapshotsInsideRun": len(inside), "boundarySnapshots": 2, "sourceTransitions": transitions,
            "startBoundary": samples[0], "endBoundary": samples[-1],
            "lowestObservedBatteryPercent": min(percentages) if percentages else None,
            "closedLidObservations": closed, "unknownLidObservations": unknown_lid,
            "unknownPowerSourceObservations": sum(r["source"] == "unknown" for r in samples)}


def assertion_summary(text):
    header = text.split("Listed by owning process:", 1)[0]
    output = {}
    for name in ("PreventSystemSleep", "PreventUserIdleSystemSleep"):
        match = re.search(rf"^\s*{name}\s+([01])\s*$", header, re.MULTILINE)
        output[name] = int(match[1]) if match else None
    return output


def guard_summary(launch, log, operator, driver, stages, worker_events):
    require(hashlib.sha256(launch["source"].encode()).hexdigest() == launch["sourceSha256"], "guard source hash differs")
    require(launch["driverPid"] == driver["pid"], "guard targets a different driver")
    requests = [e for e in operator if e["event"] == "low-battery-stop-requested"]
    worker_signals = [e for e in worker_events if e["event"] == "stop-requested" and e.get("signal") == "SIGTERM"]
    signal_stops = [e for e in stages if e.get("event") == "stopped" and e.get("stopReason") == "signal"]
    # Matching later signal evidence supports propagation, but does not prove
    # the sender. An operator may independently send the same signal.
    propagated = sum(any(timestamp(e["at"]) >= timestamp(r["at"]) for e in worker_signals + signal_stops) for r in requests)
    log_lines = [line for line in log.splitlines() if line.strip()]
    errors = sum(not line.startswith("{") and line != "Battery guard finished." for line in log_lines)
    return {"thresholdPercent": number(launch["thresholdPercent"]),
            "deployedSecondsAfterRunStart": seconds(driver["startedAt"], launch["at"]),
            "pollSeconds": 30, "stopRequests": len(requests), "requestsWithLaterSignalEvidence": propagated,
            "requestsWithoutDeliveryEvidence": len(requests) - propagated,
            "normalExitMessage": "Battery guard finished." in log_lines, "unclassifiedLogLines": errors,
            "sourceSha256": launch["sourceSha256"], "deliveryCausalityEstablished": False}


def aggregate_workers(pairs):
    combined = {"rows": sum(meta["rows"] for meta, _ in pairs),
                "workerSeconds": sum(number(meta["workerSeconds"]) for meta, _ in pairs),
                "completedRowTotals": {}, "failedAttemptTotals": {}}
    for source, target in (("totals", "completedRowTotals"), ("failedAttemptTotals", "failedAttemptTotals")):
        for key in METRICS:
            values = [meta[source].get(key) for meta, _ in pairs]
            if any(v is not None for v in values):
                combined[target][key] = sum(number(v) for v in values if v is not None) if all(v is not None for v in values) else None
    reports = [worker_summary(events, meta) for meta, events in pairs]
    for key in reports[0]:
        if key == "stopReasons":
            counts = Counter()
            for report in reports:
                counts.update(report[key])
            combined[key] = dict(sorted(counts.items()))
        else:
            combined[key] = sum(report[key] for report in reports)
    return combined


def encode(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def build():
    frozen = verify_manifest(require_committed=True, verify_inputs=True)
    directory, power = PRIVATE / "full", PRIVATE / "power"
    evidence = {}
    def track(path):
        evidence[path.relative_to(LAB).as_posix()] = digest(path)
        return path
    driver = read_json(track(directory / "driver.json"))
    window = read_json(track(power / "window.json"))
    require(driver["status"] == "complete" and window["status"] == "finished" and window["driverStatus"] == "complete",
            "driver or power capture is incomplete")
    require(window["driverPid"] == driver["pid"] and timestamp(window["startedAt"]) <= timestamp(driver["startedAt"])
            and timestamp(window["finishedAt"]) >= timestamp(driver["finishedAt"]), "power window does not enclose the driver")
    require(driver["contentManifestSha256"] == digest(MANIFEST) and driver["apps"] == frozen["apps"], "driver freeze differs")
    require(not (directory / "active-stage.json").exists(), "an active stage marker remains")
    stage_events = read_events(track(directory / "stage-events.jsonl"))
    require(all(timestamp(driver["startedAt"]) <= timestamp(e["at"]) <= timestamp(driver["finishedAt"])
                for e in stage_events), "stage events span more than this driver invocation; preserve and define the run windows first")
    supervisor = stage_summary(stage_events)
    expected_groups = {(stage, month) for stage in ("checked", "scored") for month in MONTHS} | {("analysis", "all"), ("examples", "all")}
    require({(stage, month) for stage, months in supervisor["stages"].items() for month in months} == expected_groups,
            "supervisor stage coverage differs")
    for months in supervisor["stages"].values():
        for stage in months.values():
            require(stage["completed"] >= 1 and stage["unfinished"] == 0, "a stage has no complete terminal event")
    analysis = read_json(track(PROJECT / "results/rules.json"))
    track(PROJECT / "results/rules.md")
    examples = read_json(track(PROJECT / "results/examples.json"))
    track(PROJECT / "results/examples.md")
    require(analysis["apps"] == frozen["apps"] and analysis["provenance"]["contentManifestSha256"] == digest(MANIFEST)
            and analysis["provenance"]["inputManifestSha256"] == frozen["inputs"]["sha256"]
            and analysis["provenance"]["analysisSha256"] == frozen["files"]["analyze.py"], "analysis provenance differs")
    require(examples["provenance"]["manifestSha256"] == digest(MANIFEST)
            and examples["provenance"]["analysisSha256"] == digest(PROJECT / "results/rules.json"), "examples provenance differs")
    workers, completed, metas, all_events = {}, [], {}, []
    for stage in ("checked", "scored"):
        workers[stage] = {}
        for month in MONTHS:
            pairs = []
            for shard in range(2):
                path = directory / f"{stage}-{month}-{shard}-of-2.json"
                meta = read_json(track(path)); metas[stage, month, shard] = meta
                expected = {"schema": 1, "datasetKind": "rules-after-check", "stage": stage, "month": month,
                            "shard": shard, "shards": 2, "run": "full", "status": "complete", "complete": True,
                            "boardApp": frozen["boardApp"], "refereeApp": frozen["refereeApp"], "records": frozen["records"],
                            "contentManifestSha256": digest(MANIFEST), "sourceInputsSha256": frozen["inputs"]["sha256"],
                            "sourceSha256": frozen["files"]["board.mjs" if stage == "checked" else "score.mjs"]}
                require(all(meta.get(k) == v for k, v in expected.items()), "a completed shard has different provenance")
                require(type(meta["rows"]) is int and meta["rows"] == meta["expectedRows"], "shard row coverage differs")
                track(path.with_suffix(".jsonl"))
                require(evidence[path.with_suffix(".jsonl").relative_to(LAB).as_posix()] == meta["outputSha256"], "completed journal changed")
                if stage == "scored":
                    board_hash = hashlib.sha256("\n".join(metas["checked", month, s]["outputSha256"] for s in range(2)).encode()).hexdigest()
                    require(meta["boardInputSha256"] == board_hash and meta["keysSha256"] == metas["checked", month, shard]["keysSha256"], "score/board join differs")
                completed.append({"stage": stage, "month": month, "shard": shard, "outputSha256": meta["outputSha256"]})
                events = read_events(track(path.with_suffix(".events.jsonl"))); all_events.extend(events)
                pairs.append((meta, events))
            aggregate = aggregate_workers(pairs)
            original = analysis["operations"][stage][month]
            for key in ("rows", "workerSeconds", "stoppedJobs"):
                require(aggregate[key] == original[key], "analysis operational totals differ")
            for key in ("completedRowTotals", "failedAttemptTotals"):
                require(all(original[key].get(k) == v for k, v in aggregate[key].items() if k in original[key]), "analysis instrument totals differ")
            workers[stage][month] = aggregate
    key = lambda item: (item["stage"], item["month"], item["shard"])
    require(sorted(completed, key=key) == sorted(analysis["provenance"]["completedInputs"], key=key), "analysis completed journal bindings differ")
    snapshot_rows = read_events(track(power / "snapshots.jsonl"))
    operators = read_events(track(power / "operator-events.jsonl"))
    before = track(power / "before.log").read_text(); after = track(power / "after.log").read_text()
    assertions = track(power / "assertions-before.log").read_text()
    guard = read_json(track(power / "guard-launch.json")); guard_log = track(power / "guard.log").read_text()
    require("time.sleep(30)" in guard["source"], "guard polling interval differs from this supplement")
    track(power / "assertion-process.json")
    sleep = sleep_summary(parse_power([before, after]), driver["startedAt"], driver["finishedAt"])
    power_summary = {"scope": "driver start through completion; wrapper capture supplies enclosing evidence",
                     **sleep, **snapshot_summary(snapshot_rows, driver["startedAt"], driver["finishedAt"]),
                     "requestedAssertions": {"PreventSystemSleep": True, "PreventUserIdleSystemSleep": True},
                     "effectiveSystemFlagsBeforeRun": assertion_summary(assertions),
                     "effectiveSystemFlagsAtAcLossObservation": [assertion_summary(e["assertions"]) for e in operators if e["event"] == "ac-power-lost-observed"],
                     "guard": guard_summary(guard, guard_log, operators, driver, stage_events, all_events)}
    require(window["assertion"] == "caffeinate -s -i", "power assertion request differs")
    manifest = {"schema": 1, "datasetKind": "rules-after-check-operations", "apps": frozen["apps"],
                "measurementManifestSha256": digest(MANIFEST), "inputManifestSha256": frozen["inputs"]["sha256"],
                "sources": {name: digest(PROJECT / name) for name in ("operations.py", "test_operations.py")},
                "evidence": dict(sorted(evidence.items()))}
    output = {"schema": 1, "datasetKind": "rules-after-check-operations", "apps": frozen["apps"],
              "provenance": {"measurementManifestSha256": digest(MANIFEST),
                             "operationsManifestSha256": hashlib.sha256(encode(manifest)).hexdigest(),
                             "analysisSha256": digest(PROJECT / "results/rules.json"), "completedJournalHashesVerified": len(completed),
                             "originalInputFilesVerified": len(read_json(PROJECT / "input-manifest.json")["files"])},
              "run": {"startedAt": driver["startedAt"], "finishedAt": driver["finishedAt"],
                      "elapsedUtcSeconds": seconds(driver["startedAt"], driver["finishedAt"]), "status": driver["status"]},
              **supervisor, "workers": workers, "power": power_summary}
    return manifest, output


def markdown(report):
    lines = ["# Operations for rules after the check", "",
             f"Check app `{report['apps']['check']}`. Referee app `{report['apps']['score']}`. Records `{report['apps']['records']}`.", "",
             "The data are the inherited July, August and September Lichess rows in run `full`. "
             "This supplement reports execution only. The registered statistical control and its effect on verdicts are in `rules.md`; a failed statistical control is not an execution failure.", "",
             f"The driver completed in {report['run']['elapsedUtcSeconds'] / 3600:.3f} UTC hours. "
             f"All {report['provenance']['completedJournalHashesVerified']} completed journals and {report['provenance']['originalInputFilesVerified']} original input files match their byte hashes. The original measurement freeze is unchanged.", "",
             "| Stage | Month | Rows | UTC seconds | Python stage seconds | Worker seconds | Stops / pauses |",
             "|---|---|---:|---:|---:|---:|---:|"]
    for stage in STAGES:
        for month, item in report["stages"][stage].items():
            worker = report["workers"].get(stage, {}).get(month)
            lines.append(f"| {stage} | {month} | {worker['rows'] if worker else '—'} | {item['utcStageSeconds']['seconds']:.3f} | {item['recordedStageSeconds']['seconds']:.3f} | {worker['workerSeconds']:.3f} | {item['stopped']} / {item['scheduledPauses']} |" if worker else
                         f"| {stage} | {month} | — | {item['utcStageSeconds']['seconds']:.3f} | {item['recordedStageSeconds']['seconds']:.3f} | — | {item['stopped']} / {item['scheduledPauses']} |")
    lines += ["", "The UTC interval comes from supervisor timestamps. The Python timer uses `time.monotonic()`. Their small signed differences are retained in JSON. Neither is CPU time. Stage timers include startup and cleanup but exclude the driver's preceding source check. Gaps between attempts are reported separately; no time is silently assigned to an unrecorded interval.", "",
              "Worker seconds sum the two shard checkpoint timers. They exclude initial input joins and byte verification. Their timers use Node `performance.now()`, not the Python timer. Completed row times and failed attempt totals stay separate. A missing failed tail stays unknown. Instrument times are elapsed calls, not CPU time; engine seconds already include `newGameSeconds`.", "",
              "| Month | Board reading seconds | Safety seconds | Split seconds | Maia seconds | Engine seconds | Stored-probe seconds |",
              "|---|---:|---:|---:|---:|---:|---:|"]
    for month in sorted(MONTHS):
        b = report["workers"]["checked"][month]["completedRowTotals"]
        s = report["workers"]["scored"][month]["completedRowTotals"]
        lines.append(f"| {month} | {b['positionSeconds']:.3f} | {b['safetySeconds']:.3f} | {b['splitSeconds']:.3f} | {s['maiaSeconds']:.3f} | {s['engineSeconds']:.3f} | {s['tablebaseSeconds']:.3f} |")
    all_workers = [item for months in report["workers"].values() for item in months.values()]
    stops = sum(item["stoppedJobs"] for item in all_workers)
    recoveries = sum(item["recoveryMarkers"] for item in all_workers)
    unknown = sum(item["unknownFailedTails"] for item in all_workers)
    calls = sum(item["completedRowTotals"].get("tablebaseCalls", 0) for item in all_workers)
    retries = sum(item["completedRowTotals"].get("tablebaseRetries", 0) for item in all_workers)
    gaps = sum(item["betweenAttemptUtcSeconds"]["knownSeconds"] for months in report["stages"].values() for item in months.values())
    lines += ["", f"The worker manifests record {stops} stops, {recoveries} interrupted-job recovery markers and {unknown} unknown failed tails. "
              f"There were {report['blackoutWaits']} scheduled blackout waits and {gaps:.3f} known seconds between attempts of the same stage. "
              f"The scorer made {calls} tablebase network calls and {retries} retries. Stored-probe seconds measure local use of the inherited evidence."]
    power = report["power"]
    lines += ["", f"Within the driver run, the power log records {power['sleepEvents']} Sleep, {power['darkWakeEvents']} DarkWake and {power['wakeEvents']} Wake events. "
              f"Known sleep intervals overlap the run by {power['knownSleepSecondsWithinRun']:.3f} seconds. "
              "Events outside the run are used only to establish boundary state; their timeline is not published. Sleep ends at the first DarkWake or Wake, so a maintenance wake is not counted as sleep.", "",
              f"The capture has {power['snapshotsInsideRun']} battery/lid snapshots inside the run plus enclosing boundary snapshots. "
              f"The boundary battery readings are {power['startBoundary']['percent']}% and {power['endBoundary']['percent']}%; the lowest observed reading is {power['lowestObservedBatteryPercent']}%. "
              f"There are {power['closedLidObservations']} closed-lid observations. These samples do not establish the state at every instant."]
    for change in power["sourceTransitions"]:
        lines += ["", f"The observed change from {change['from']} to {change['to']} falls between {change['earliestSecondsAfterStart'] / 60:.3f} and {change['latestSecondsAfterStart'] / 60:.3f} minutes after driver start, a {change['bracketSeconds']:.3f}-second bracket. The later operator observation is not the disconnect time."]
    initial = power["effectiveSystemFlagsBeforeRun"]
    lines += ["", "The wrapper requested both system-sleep and idle-system-sleep assertions with `caffeinate -s -i`, and kept the assertion process running through driver completion. "
              f"The initial sampled system-wide flags were {initial['PreventSystemSleep']} and {initial['PreventUserIdleSystemSleep']}, respectively."]
    for flags in power["effectiveSystemFlagsAtAcLossObservation"]:
        lines[-1] += f" At the AC-loss observation they were {flags['PreventSystemSleep']} and {flags['PreventUserIdleSystemSleep']}."
    lines[-1] += " A requested assertion is not the same as an effective system-wide flag. Other processes may also contribute to those flags; no continuous effectiveness is inferred."
    guard = power["guard"]
    lines += ["", f"A separate battery guard was deployed {guard['deployedSecondsAfterRunStart'] / 60:.3f} minutes after driver start. "
              f"It checked every {guard['pollSeconds']} seconds and would request SIGTERM at {guard['thresholdPercent']}% or below on battery. "
              f"It logged {guard['stopRequests']} stop requests, {guard['requestsWithLaterSignalEvidence']} with later signal evidence, and {guard['requestsWithoutDeliveryEvidence']} without delivery evidence. "
              f"Its normal-exit message was {'present' if guard['normalExitMessage'] else 'absent'}; {guard['unclassifiedLogLines']} log lines were unclassified. "
              "A request is written before sending the signal, so a logged request alone would not prove delivery. The guard did not cover the earlier part of the run.", "",
              "The supplement's separate `operations-manifest.json` binds these sources, the original freeze, completed reports, metadata, journal byte hashes and private operational evidence. It does not replace the measurement freeze. To reproduce from the lab root:", "",
              "```bash", ".venv/bin/python projects/rules-after-check/test_operations.py",
              "nice -n 10 .venv/bin/python projects/rules-after-check/operations.py", "```", "",
              "The first generation used `--write-manifest`. Subsequent generation verifies the existing supplement manifest. No study row is parsed and no chess measure is recomputed.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-manifest", action="store_true")
    args = parser.parse_args()
    manifest, report = build()
    if args.write_manifest:
        require(not SUPPLEMENT.exists() or SUPPLEMENT.read_bytes() == encode(manifest), "existing supplement manifest differs")
        SUPPLEMENT.write_bytes(encode(manifest))
    else:
        require(SUPPLEMENT.read_bytes() == encode(manifest), "supplement source or evidence changed")
    (PROJECT / "results/operations.json").write_bytes(encode(report))
    (PROJECT / "results/operations.md").write_text(markdown(report))
    print(json.dumps({"status": "complete", "manifestSha256": digest(SUPPLEMENT),
                      "operationsSha256": digest(PROJECT / "results/operations.json"),
                      "utcSeconds": report["run"]["elapsedUtcSeconds"]}))


if __name__ == "__main__":
    main()
