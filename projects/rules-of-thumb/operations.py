#!/usr/bin/env python3
"""Write an aggregate operations supplement after the full analysis finishes.

This does not compute chess measures, alter a checkpoint, or change the
frozen experiment. The frozen analyzer validates the measured rows; this
supplement checks its provenance and counts against completed manifests,
then summarizes operational events. Private identifiers and free-form log
messages never become report fields.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
MONTHS = ("2026-07", "2026-08", "2026-09")
RULES = ("active-king", "opposition", "square-rule", "rook-behind-passer", "cut-off-king",
         "outside-passer", "trade-when-ahead", "lucena", "philidor", "open-file",
         "rook-on-the-seventh", "outpost", "pawn-break", "passed-pawn", "worst-piece")
METRICS = ("maiaSeconds", "engineSeconds", "tablebaseSeconds", "rowSeconds", "newGameSeconds",
           "maiaCalls", "maiaBands", "bestCalls", "scoreCalls", "tablebaseCalls",
           "tablebaseUnavailable", "tablebaseRetries", "tablebaseRetrySeconds", "newGameCalls")
SCAN_TIMES = ("seconds", "describeMoveSeconds", "worstPieceSeconds", "splitsSeconds",
              "tradeReaderSeconds", "noteSideSeconds", "backfillSeconds")
STOP_REASONS = {
    "missing tablebase outcome; row remains pending": "tablebase-outcome-unavailable",
    "inexact move score": "inexact-move-score",
    "inexact best score": "inexact-best-score",
    "stop requested: SIGTERM": "requested-sigterm",
    "stop requested: SIGINT": "requested-sigint",
    "scoreMove did not score its requested root": "wrong-engine-root",
}
ENGINE_STOPS = {"inexact-move-score", "inexact-best-score", "wrong-engine-root"}
POWER_WINDOW_SECONDS = 60


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def timestamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(result.tzinfo is not None, "operational timestamp lacks a time zone")
    return result


def elapsed(start, end):
    value = (timestamp(end) - timestamp(start)).total_seconds()
    require(value >= 0, "operational timestamps run backwards")
    return value


def numeric(value):
    require(isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value >= 0, "invalid operational count or duration")
    return value


def durations(values):
    """Keep a missing duration missing while retaining the known subtotal."""
    known = [numeric(value) for value in values if value is not None]
    return {"seconds": sum(known) if len(known) == len(values) else None,
            "knownSeconds": sum(known), "unknownIntervals": len(values) - len(known),
            "intervals": len(values)}


def category(value, allowed):
    return value if value in allowed else "other-or-unrecorded"


def stage_summary(events):
    attempts, extras = {}, defaultdict(Counter)
    for event in events:
        stage = event.get("stage")
        month = event.get("month") or "all"
        require(stage in ("stream", "backfill", "positions", "score", "analysis"), "unknown supervisor stage")
        require(month in (*MONTHS, "all"), "unknown supervisor month")
        kind = event.get("event")
        group = stage, month
        if kind in ("already-complete", "restart-backoff"):
            extras[group][kind] += 1
            if kind == "restart-backoff":
                extras[group]["backoffSeconds"] += numeric(event["seconds"])
            continue
        key = (*group, event.get("attempt"))
        require(key[-1] is not None, "supervisor attempt lacks an identifier")
        if kind == "started":
            require(key not in attempts, "duplicate supervisor attempt")
            timestamp(event["at"])
            attempts[key] = {"start": event["at"], "terminal": None}
        else:
            require(kind in ("completed", "stopped"), "unknown supervisor event")
            require(key in attempts and attempts[key]["terminal"] is None, "unpaired supervisor terminal event")
            attempts[key]["terminal"] = event
    groups = defaultdict(list)
    for (stage, month, _), attempt in attempts.items():
        groups[stage, month].append(attempt)
    result = {}
    for group in sorted(set(groups) | set(extras)):
        stage, month = group
        rows = sorted(groups[group], key=lambda row: timestamp(row["start"]))
        recorded, utc, gaps = [], [], []
        reasons = Counter()
        completed = stopped = unfinished = 0
        previous_end = None
        first = True
        for row in rows:
            if not first:
                gaps.append(elapsed(previous_end, row["start"]) if previous_end else None)
            first = False
            terminal = row["terminal"]
            if terminal is None:
                unfinished += 1
                recorded.append(None)
                utc.append(None)
                previous_end = None
                continue
            known_end = terminal.get("terminationTimeKnown") is not False
            if terminal["event"] == "completed":
                completed += 1
                require(known_end, "completed stage has an unknown termination time")
            else:
                stopped += 1
                reasons[category(terminal.get("stopReason"),
                                 {"reviewer-amendment-sigterm", "signal", "stage-failure"})] += 1
            seconds = terminal.get("seconds")
            require(seconds is not None or not known_end, "known stage termination lacks elapsed time")
            recorded.append(numeric(seconds) if seconds is not None else None)
            utc.append(elapsed(row["start"], terminal["at"]) if known_end else None)
            previous_end = terminal["at"] if known_end else None
        result.setdefault(stage, {})[month] = {
            "attempts": len(rows), "completedJobs": completed, "stoppedJobs": stopped,
            "unfinishedJobs": unfinished, "stopReasons": dict(sorted(reasons.items())),
            "recordedInvocationSeconds": durations(recorded),
            "utcInvocationSeconds": durations(utc), "betweenAttemptUtcSeconds": durations(gaps),
            "firstStartToLastEndUtcSeconds": elapsed(rows[0]["start"], previous_end) if rows and previous_end else None,
            "alreadyCompleteChecks": extras[group]["already-complete"],
            "restartBackoffs": extras[group]["restart-backoff"],
            "restartBackoffSeconds": extras[group]["backoffSeconds"],
        }
    return result


def worker_summary(events, manifest):
    """Reconcile retry loops without exporting their private row keys."""
    counts, stops, retry_status, unavailable_status = Counter(), Counter(), Counter(), Counter()
    recovered_histogram = Counter()
    pending = {}
    recovered_retries = unavailable_retries = unavailable_calls = 0
    interrupted_chains = interrupted_retries = 0
    recovery_markers_after_logged_stop = 0
    engine_stops = []
    running = False
    stopped_terminal_logged = False
    for event in events:
        require(event.get("month") == manifest["month"] and event.get("shard") == manifest["shard"]
                and event.get("shards") == manifest["shards"] and event.get("timing") is False,
                "worker event provenance differs from its manifest")
        kind = event.get("event")
        require(kind in ("job-started", "job-completed", "job-stopped", "stop-requested", "interrupted-job-recovered",
                         "tablebase-retry", "tablebase-recovered", "tablebase-unavailable"), "unknown worker event")
        counts[kind] += 1
        if kind == "interrupted-job-recovered":
            # The scorer recovered a manifest left in 'running'. A stopped
            # event can already be durable: it is logged before the stopped
            # manifest is saved. That recovery marker describes the same
            # logical stop, while its uncheckpointed tail remains unknown.
            if stopped_terminal_logged:
                recovery_markers_after_logged_stop += 1
            else:
                stops["interrupted-before-terminal-event"] += 1
            interrupted_chains += len(pending)
            interrupted_retries += sum(pending.values())
            pending.clear()
            running = False
            stopped_terminal_logged = False
        elif kind == "job-started":
            require(not running, "overlapping worker invocations")
            running = True
            stopped_terminal_logged = False
        elif kind in ("job-completed", "job-stopped"):
            require(running and not pending, "worker terminated with an unmatched retry")
            running = False
            stopped_terminal_logged = kind == "job-stopped"
            if kind == "job-stopped":
                reason = STOP_REASONS.get(event.get("reason"), "other-or-unrecorded")
                stops[reason] += 1
                if reason in ENGINE_STOPS:
                    engine_stops.append({"month": manifest["month"], "at": event["at"]})
        elif kind == "tablebase-retry":
            require(running, "retry outside a worker invocation")
            key = event.get("key")
            require(isinstance(key, str), "retry lacks its private row key")
            pending[key] = pending.get(key, 0) + 1
            require(event["failedAttempt"] == pending[key] and event["nextAttempt"] == pending[key] + 1,
                    "tablebase retry sequence changed")
            retry_status[category(event.get("status"), {"offline", "unsupported", "unknown"})] += 1
        elif kind in ("tablebase-recovered", "tablebase-unavailable"):
            key = event.get("key")
            retries = pending.pop(key, 0)
            attempts = event["attempts"]
            require(type(attempts) is int and attempts == retries + 1, "tablebase terminal attempt count differs")
            if kind == "tablebase-recovered":
                require(retries > 0, "recovery lacks a retry")
                recovered_retries += retries
                recovered_histogram[str(attempts)] += 1
            else:
                unavailable_retries += retries
                unavailable_calls += attempts
                unavailable_status[category(event.get("status"), {"offline", "unsupported", "unknown"})] += 1
    require(not running and not pending, "worker event stream is unfinished")
    interrupted = counts["interrupted-job-recovered"]
    stopped = counts["job-stopped"] + interrupted - recovery_markers_after_logged_stop
    require(counts["job-completed"] >= 1 and stopped == manifest["stoppedJobs"],
            "worker stop counts differ from the completed manifest")
    completed, failed = manifest["totals"], manifest["failedAttemptTotals"]
    retry_totals_match = counts["tablebase-retry"] == completed["tablebaseRetries"] + failed["tablebaseRetries"]
    dispositions_match = (recovered_retries == completed["tablebaseRetries"]
                          and unavailable_retries == failed["tablebaseRetries"])
    unavailable_match = (completed["tablebaseUnavailable"] == recovered_retries
                         and failed["tablebaseUnavailable"] == unavailable_calls)
    if not interrupted:
        require(retry_totals_match, "retry events differ from recorded totals")
        require(dispositions_match, "retry disposition differs from recorded totals")
        require(unavailable_match, "unavailable probe totals do not reconcile")
    # On an abrupt interruption, events and journals can end at different
    # points. Their recorded totals remain separate; no missing calls or
    # seconds are inferred from their difference.
    return {
        "invocations": counts["job-started"], "completedInvocations": counts["job-completed"],
        "stoppedInvocations": stopped, "stopReasons": dict(stops),
        "interruptedInvocationsWithUnknownTailTiming": interrupted,
        "recoveryMarkersAfterLoggedStop": recovery_markers_after_logged_stop,
        "workersWithIncompleteRetryReconciliation": int(not (retry_totals_match and dispositions_match and unavailable_match)),
        "tablebase": {"retryEvents": counts["tablebase-retry"], "retryStatuses": dict(retry_status),
            "recoveredProbes": counts["tablebase-recovered"], "recoveredProbeRetries": recovered_retries,
            "recoveredProbeAttemptCounts": dict(recovered_histogram),
            "terminalUnavailableAttempts": counts["tablebase-unavailable"],
            "terminalUnavailableStatuses": dict(unavailable_status),
            "terminalUnavailableRetries": unavailable_retries, "terminalUnavailableCalls": unavailable_calls,
            "interruptedRetryChains": interrupted_chains, "interruptedChainRetryEvents": interrupted_retries,
            "unrecordedAdditionalProbeAttempts": None if interrupted else 0,
            "finalUnscoredRows": manifest["expectedRows"] - manifest["rows"]},
    }, engine_stops


def sum_workers(reports):
    def merge_dict(parts):
        total = Counter()
        for part in parts:
            total.update(part)
        return dict(sorted(total.items()))
    out = {key: sum(row[key] for row in reports)
           for key in ("invocations", "completedInvocations", "stoppedInvocations",
                       "interruptedInvocationsWithUnknownTailTiming", "recoveryMarkersAfterLoggedStop",
                       "workersWithIncompleteRetryReconciliation")}
    out["stopReasons"] = merge_dict(row["stopReasons"] for row in reports)
    out["tablebase"] = {}
    for key in reports[0]["tablebase"]:
        values = [row["tablebase"][key] for row in reports]
        out["tablebase"][key] = (merge_dict(values) if isinstance(values[0], dict)
                                 else None if any(value is None for value in values) else sum(values))
    return out


def power_summary(power, engine_stops):
    """Only task-stop proximity is public; the personal power timeline is not."""
    result = {"recorded": power is not None, "proximityWindowSeconds": POWER_WINDOW_SECONDS,
              "interpretation": "Temporal coincidence is operational evidence, not a proof of the exact rejected engine flag.",
              "byMonth": {month: {"engineStoppedWorkers": 0, "nearDarkWake": 0, "nearWake": 0,
                                    "nearSleep": 0, "noNearbyRecordedPowerEvent": 0} for month in MONTHS}}
    if power is None:
        result["byMonth"] = None
        return result
    allowed = [(timestamp(event["atLocal"]), event["event"])
               for event in power.get("eventsNearEngineStops", []) if event.get("event") in ("Sleep", "DarkWake", "Wake")]
    for stop in engine_stops:
        group = result["byMonth"][stop["month"]]
        group["engineStoppedWorkers"] += 1
        nearby = {kind for at, kind in allowed if abs((at - timestamp(stop["at"])).total_seconds()) <= POWER_WINDOW_SECONDS}
        group["nearDarkWake"] += "DarkWake" in nearby
        group["nearWake"] += "Wake" in nearby
        group["nearSleep"] += "Sleep" in nearby
        group["noNearbyRecordedPowerEvent"] += not nearby
    return result


def build_report(directory, project=PROJECT, lab=LAB):
    # Import only the existing content verifier; no statistical or chess code runs.
    from freeze import verify_manifest
    frozen = verify_manifest(require_committed=True)
    hashes = {}
    paths = {}

    def read(path, label, lines=False):
        require(path.is_file(), "required completed operational input is absent")
        raw = path.read_bytes()
        hashes[label] = hashlib.sha256(raw).hexdigest()
        paths[label] = path
        return [json.loads(line) for line in raw.splitlines() if line.strip()] if lines else json.loads(raw)

    pin = read(lab / "bridge/chess.json", "app-pin")
    frozen_file = read(project / "phase2-manifest.json", "phase2-manifest")
    require(frozen_file == frozen and frozen.get("schema") == 2 and frozen.get("datasetKind") == "amended",
            "operations require the amended frozen experiment")
    analysis = read(project / "results/rules.json", "full-analysis")
    require(analysis.get("app") == pin["commit"] == frozen["app"] and pin["records"] == frozen["records"],
            "analysis or manifest app provenance differs")
    require(analysis.get("datasetKind") == "amended" and analysis.get("contentManifestSha256") == hashes["phase2-manifest"]
            and analysis.get("ruleReadmeSha256") == frozen["rule"]["sha256"], "full analysis provenance differs")
    require(set(analysis.get("rules", {})) == set(RULES)
            and analysis.get("data", {}).get("train") == list(MONTHS[:2])
            and analysis["data"].get("heldout") == MONTHS[2], "full analysis populations differ")
    scorer_version = frozen["files"]["score.mjs"]
    scanner_version = hashlib.sha256(b"".join((project / file).read_bytes()
                                     for file in ("positions.mjs", "detect.mjs", "backfill.mjs"))).hexdigest()
    require(analysis.get("measurementVersions") == {"streamVersion": frozen["files"]["stream.py"],
            "scannerVersion": scanner_version, "scorerVersion": scorer_version}, "analysis measurement versions differ")
    output = {"schema": 1, "app": pin["commit"], "records": pin["records"], "datasetKind": "amended",
        "purpose": "Operational counts and timings only; no additional chess measures or verdicts.",
        "timingDefinitions": {
            "recorded": "Supervisor seconds use its monotonic clock, as recorded; they are not replaced by UTC intervals.",
            "utc": "Start-to-terminal intervals use the recorded UTC timestamps. Clock changes can also affect these intervals.",
            "gaps": "Between-attempt gaps are separate from invocation time. Stages may overlap, so their sums are not total study wall time.",
            "unknown": "An unknown termination time remains null even when the later audit event has a timestamp.",
            "workers": "Worker seconds and instrument seconds are recorded elapsed times, not CPU usage. Clock behavior during sleep can differ from supervisor timings. Abruptly interrupted tails may have unrecorded work; that time is not invented or treated as zero.",
            "retries": "Recovered failures count failed requests, not missing final scores. A terminal-unavailable attempt leaves a row pending until a later successful invocation.",
        }, "byMonth": {}}
    engine_stops = []
    for month in MONTHS:
        stream = read(directory / f"games-{month}.json", f"stream-{month}")
        scan = read(directory / f"positions-{month}.json", f"positions-{month}")
        for meta in (stream, scan):
            require(meta.get("complete") is True and meta.get("run") == "full"
                    and meta.get("app") == pin["commit"] and meta.get("month") == month,
                    "a required stream or position scan is incomplete")
        require(scan.get("datasetKind") == "amended" and scan["scannerVersion"] == scanner_version
                and stream["streamVersion"] == frozen["files"]["stream.py"], "scan provenance differs")
        require(stream["kept"] == scan["games"] == analysis["data"]["gamesByMonth"][month]
                and scan["positions"] == analysis["data"]["positionsByMonth"][month], "analysis source counts differ")
        manifests, worker_reports = [], []
        score_paths = sorted(directory.glob(f"scored-{month}-*-of-*.json"))
        require(len(score_paths) == 2, "the completed two-worker score manifests are required")
        for path in score_paths:
            score = read(path, path.name)
            require(score.get("complete") is True and score.get("status") == "complete"
                    and score.get("timing") is False and score.get("run") == "full"
                    and score.get("datasetKind") == "amended", "a score worker has not completed")
            require(score["app"] == pin["commit"] and score["month"] == month
                    and score["inputSha256"] == scan["outputSha256"]
                    and score["scorerVersion"] == scorer_version and score["scannerVersion"] == scanner_version,
                    "score provenance differs")
            require(score["shards"] == 2 and score["rows"] == score["expectedRows"], "score coverage is incomplete")
            event_path = path.with_suffix(".events.jsonl")
            worker, stopped = worker_summary(read(event_path, event_path.name, lines=True), score)
            worker_reports.append(worker)
            engine_stops.extend(stopped)
            manifests.append(score)
        require({score["shard"] for score in manifests} == {0, 1}, "score shard layout differs")
        require(sum(score["rows"] for score in manifests) == scan["keptPositions"], "position and score totals differ")
        require(set(scan["kept"]) == set(RULES), "position rules differ")
        for rule in RULES:
            counts = analysis["rules"][rule]["countsByMonth"][month]
            require(counts["retainedPositions"] == counts["scoredPositions"] == scan["kept"][rule],
                    "full analysis coverage differs from completed positions")
        totals = {section: {metric: sum(numeric(score[section][metric]) for score in manifests) for metric in METRICS}
                  for section in ("totals", "failedAttemptTotals")}
        output["byMonth"][month] = {"completedRows": scan["keptPositions"],
            "streamCheckpointedSeconds": numeric(stream["seconds"]),
            "completedAvailabilitySeconds": {field: numeric(scan["timing"][field])
                if scan.get("timing", {}).get(field) is not None else None for field in SCAN_TIMES},
            "scoreWorkerSeconds": sum(numeric(score["workerSeconds"]) for score in manifests),
            "completedRowInstrumentTotals": totals["totals"], "failedAttemptInstrumentTotals": totals["failedAttemptTotals"],
            **sum_workers(worker_reports)}
    output["stages"] = stage_summary(read(directory / "stage-events.jsonl", "stage-events", lines=True))
    power_path = directory / "power-health.json"
    power = read(power_path, "power-health") if power_path.exists() else None
    output["powerEvidence"] = power_summary(power, engine_stops)
    output["analysisSeconds"] = numeric(analysis["seconds"])
    hashes["operations.py"] = digest(project / "operations.py")
    paths["operations.py"] = project / "operations.py"
    # No PID, private path, row key, free-form error or power timestamp is copied.
    output["inputSha256"] = dict(sorted(hashes.items()))
    require(all(digest(paths[label]) == expected for label, expected in hashes.items()),
            "an operational input changed while the supplement was built")
    return output


def markdown(report):
    def number(value):
        return "unknown" if value is None else f"{value:,.3f}" if isinstance(value, float) else str(value)
    lines = ["# Rules of thumb: operations", "",
        f"Written by `operations.py` for the app at `{report['app']}` and records pin `{report['records']}`. "
        "The data are the completed July, August and September full run. This supplement adds no chess measure or verdict.", "",
        "| Month | Completed rows | Score worker seconds | Maia seconds | Engine seconds | Tablebase seconds | Worker stops |",
        "|---|---:|---:|---:|---:|---:|---:|"]
    for month, row in report["byMonth"].items():
        totals = row["completedRowInstrumentTotals"]
        values = [row["completedRows"], row["scoreWorkerSeconds"], totals["maiaSeconds"], totals["engineSeconds"],
                  totals["tablebaseSeconds"], row["stoppedInvocations"]]
        lines.append(f"| {month} | " + " | ".join(map(number, values)) + " |")
    lines += ["", "| Month | Interrupted workers with unknown tail timing | Interrupted retry chains | Workers with incomplete event/manifest reconciliation |",
              "|---|---:|---:|---:|"]
    for month, row in report["byMonth"].items():
        values = [row["interruptedInvocationsWithUnknownTailTiming"], row["tablebase"]["interruptedRetryChains"],
                  row["workersWithIncompleteRetryReconciliation"]]
        lines.append(f"| {month} | " + " | ".join(map(number, values)) + " |")
    lines += ["", "An interrupted retry chain has no recorded terminal outcome for that invocation. Its logged retries are counted, "
              "but any additional unlogged requests remain unknown. Successful events and durable row totals remain separate when an abrupt interruption prevents reconciliation."]
    lines += ["", "Instrument times above cover completed rows. Failed attempts, availability instruments and stream timings are separate in `operations.json`.", "",
        "| Stage | Month | Attempts | Stopped | Recorded invocation seconds | UTC invocation seconds | UTC gaps between attempts |",
        "|---|---|---:|---:|---:|---:|---:|"]
    for stage, months in report["stages"].items():
        for month, row in months.items():
            values = [row["attempts"], row["stoppedJobs"], row["recordedInvocationSeconds"]["seconds"],
                      row["utcInvocationSeconds"]["seconds"], row["betweenAttemptUtcSeconds"]["seconds"]]
            lines.append(f"| {stage} | {month} | " + " | ".join(map(number, values)) + " |")
    lines += ["", *report["timingDefinitions"].values(), "",
        "The intentional reviewer amendment stop is reported separately below. Its unrecorded duration remains unknown; known subtotals and unknown interval counts are retained in `operations.json`.", "",
        "| Scope | Month | Stop reason | Count |", "|---|---|---|---:|"]
    for stage, months in report["stages"].items():
        for month, row in months.items():
            for reason, count in row["stopReasons"].items():
                lines.append(f"| {stage} stage | {month} | {reason} | {count} |")
    for month, row in report["byMonth"].items():
        for reason, count in row["stopReasons"].items():
            lines.append(f"| Score worker | {month} | {reason} | {count} |")
    lines += ["", "| Month | Retry events | Recovered probes | Retries on recovered probes | Terminal-unavailable attempts | Retries on terminal attempts | Final unscored rows |",
              "|---|---:|---:|---:|---:|---:|---:|"]
    for month, row in report["byMonth"].items():
        tb = row["tablebase"]
        values = [tb[key] for key in ("retryEvents", "recoveredProbes", "recoveredProbeRetries", "terminalUnavailableAttempts",
                                      "terminalUnavailableRetries", "finalUnscoredRows")]
        lines.append(f"| {month} | " + " | ".join(map(number, values)) + " |")
    power = report["powerEvidence"]
    if power["recorded"]:
        lines += ["", f"Private power records were compared with engine-stop times within {power['proximityWindowSeconds']} seconds. "
                  "Only counts near study interruptions are reported; the power timeline and personal usage counts stay private.", "",
                  "| Month | Engine worker stops | Near DarkWake | Near Wake | Near Sleep | No nearby recorded power event |",
                  "|---|---:|---:|---:|---:|---:|"]
        for month, row in power["byMonth"].items():
            lines.append(f"| {month} | " + " | ".join(number(row[key]) for key in
                         ("engineStoppedWorkers", "nearDarkWake", "nearWake", "nearSleep", "noNearbyRecordedPowerEvent")) + " |")
        lines += ["", power["interpretation"]]
    else:
        lines += ["", "No private power evidence was recorded; no sleep attribution is made."]
    lines += ["", f"Full analysis elapsed seconds: {number(report['analysisSeconds'])}. "
              "Content hashes of this generator, the frozen measurement manifest, the full analysis and operational inputs are in `operations.json`."]
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", choices=("full",), required=True)
    args = parser.parse_args(argv)
    report = build_report(LAB / "private/rules-of-thumb" / args.run)
    destination = PROJECT / "results"
    for name, content in (("operations.json", json.dumps(report, indent=2, allow_nan=False) + "\n"),
                          ("operations.md", markdown(report))):
        temporary = destination / (name + ".partial")
        temporary.write_text(content)
        temporary.replace(destination / name)
    print("Wrote aggregate operations supplement for the completed full run.")


if __name__ == "__main__":
    main()
