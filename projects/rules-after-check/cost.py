#!/usr/bin/env python3
"""Price the later run from predecessor public timings, without reading rows."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]
PREDECESSOR = LAB / "projects/rules-of-thumb"
MONTHS = ("2026-07", "2026-08", "2026-09")
WORKERS = 2
MAX_NEW_MOVES = 3


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def number(value):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0,
            "the predecessor operation value is missing or invalid")
    return value


def estimate(source):
    """Only operational fields of an existing aggregate enter this estimate."""
    by_month = source["operations"]["byMonth"]
    require(set(by_month) == set(MONTHS), "the predecessor month set changed")
    months = {}
    for month in MONTHS:
        item = by_month[month]
        require(item["workers"] == WORKERS, "the predecessor did not use two workers")
        completed = item["completedRowTotals"]
        months[month] = {"rows": number(item["completedRows"]),
                         "workerSeconds": number(item["cumulativeWorkerSeconds"]),
                         "stoppedWorkerJobs": number(item["stoppedWorkerJobs"]),
                         **{key: number(completed[key]) for key in
                            ("maiaSeconds", "engineSeconds", "newGameSeconds", "tablebaseSeconds", "bestCalls", "scoreCalls")},
                         "failedEngineSeconds": number(item["failedAttemptTotals"]["engineSeconds"])}
    totals = {key: sum(item[key] for item in months.values()) for key in next(iter(months.values()))}
    require(totals["rows"] > 0 and totals["bestCalls"] > 0 and totals["bestCalls"] == totals["scoreCalls"],
            "the reference is not one best and one move search per fresh referee")
    require(totals["workerSeconds"] >= totals["engineSeconds"] and totals["failedEngineSeconds"] == 0,
            "the reference worker/engine accounting changed")
    non_engine = totals["workerSeconds"] - totals["engineSeconds"]
    search_calls = totals["bestCalls"] + totals["scoreCalls"]
    mean_search = totals["engineSeconds"] / search_calls
    # This is a deliberately broad scenario, not a bound: every old row is
    # treated as eligible and requiring one best plus three new move searches.
    # It even retains old rows belonging to rules excluded from this study.
    cases = {
        "predecessorReference": totals["workerSeconds"],
        "threeNewMovesAtPredecessorFreshSearchShare": non_engine + mean_search * totals["bestCalls"] * (1 + MAX_NEW_MOVES),
        "threeNewMovesAtEveryPredecessorRow": non_engine + mean_search * totals["rows"] * (1 + MAX_NEW_MOVES),
    }
    return {"referenceByMonth": months, "referenceTotals": totals,
            "assumptions": {"workers": WORKERS, "maximumNewMovesPerPosition": MAX_NEW_MOVES,
                            "referenceSearchCalls": search_calls, "meanRecordedSecondsPerSearch": mean_search,
                            "retainedNonEngineWorkerSeconds": non_engine},
            "scenarios": {name: {"workerSeconds": seconds, "workerHours": seconds / 3600,
                                  "idealTwoWorkerElapsedHours": seconds / WORKERS / 3600}
                          for name, seconds in cases.items()},
            "newBoardPassSeconds": None, "wholeRunElapsedHours": None}


def markdown(report):
    lines = ["# Cost before reading a position", "",
             "This estimate uses the completed rules-of-thumb null run's public operation totals. "
             "It reads no private row and measures no new position.", "",
             "| Reference month | Rows | Worker hours | Maia hours | Engine hours |", "|---|---:|---:|---:|---:|"]
    for month, row in report["referenceByMonth"].items():
        lines.append(f"| {month} | {row['rows']:,} | {row['workerSeconds']/3600:.3f} | {row['maiaSeconds']/3600:.3f} | {row['engineSeconds']/3600:.3f} |")
    labels = {"predecessorReference": "Predecessor reference",
              "threeNewMovesAtPredecessorFreshSearchShare": "Three new moves, predecessor fresh-search share",
              "threeNewMovesAtEveryPredecessorRow": "Three new moves, every predecessor row"}
    lines += ["", "| Scoring scenario | Worker hours | Ideal elapsed hours at two workers |", "|---|---:|---:|"]
    for name, row in report["scenarios"].items():
        lines.append(f"| {labels[name]} | {row['workerHours']:.3f} | {row['idealTwoWorkerElapsedHours']:.3f} |")
    a = report["assumptions"]
    lines += ["", f"The reference contains {a['referenceSearchCalls']:,} fixed-budget searches. "
              f"Their average recorded time is {a['meanRecordedSecondsPerSearch']:.6f} seconds, "
              "including engine clearing inside that timer. The scenarios retain the reference's "
              "non-engine worker time and price one best search plus up to three new move searches at that average.", "",
              "The every-row scenario includes all predecessor rows, even its excluded rules, and assumes no saved "
              "move or tablebase probe avoids a search. It is a conservative scenario, not a runtime bound. "
              "The new quiet share, safe-move counts and reuse rate have not been read.", "",
              "The board pass calls the app's check on every legal move. Its cost is unmeasured. "
              "No whole-run duration or claim that one step dominates is available before that pass is timed.", "",
              "These are elapsed worker and instrument timers, not CPU time. They include waiting, and the "
              "supervisor and worker clocks can behave differently across machine suspension. The large September "
              "Maia total is retained as recorded. Worker-hours divided by two assumes balanced workers and adds "
              "neither board processing nor the daily blackout, restart overhead or later machine pauses.", "",
              "Heavy work stops at 12:59:50 UTC, ten seconds before the 13:00–15:30 blackout. "
              "The supervisor allows up to three seconds for shutdown, then kills the stage group. "
              "It resumes from the checkpoint at or after 15:30 UTC. Calendar time depends on the start time.", "",
              f"The scoring app is `{report['apps']['score']}`; the board app is `{report['apps']['check']}`. "
              f"The records pin is `{report['apps']['records']}`. No package is installed for this estimate.", "",
              "The numbers come from `projects/rules-of-thumb/results/null.json`, "
              "`operations.byMonth`: `cumulativeWorkerSeconds`, `completedRowTotals` and `failedAttemptTotals`. "
              "That analysis copied the private null shard manifests' `workerSeconds`, `totals`, "
              "`failedAttemptTotals` and `stoppedJobs`. Its source paths are listed in `cost.json`. "
              "This generator does not open those private manifests or logs.", ""]
    return "\n".join(lines)


def main():
    path = PREDECESSOR / "results/null.json"
    source = json.loads(path.read_text())
    pins = json.loads((PROJECT / "app-pins.json").read_text())
    require(source["app"] == pins["score"] and source["records"] == pins["records"], "reference pins differ")
    require(source["provenance"]["additionManifestSha256"] == digest(PREDECESSOR / "null-manifest.json"),
            "the predecessor report is not bound to its frozen run")
    report = {"schema": 1, "purpose": "Phase-one operational estimate only; no new row or chess measure is read.",
              "apps": {key: pins[key] for key in ("check", "score", "records")}, **estimate(source),
              "provenance": {"sourceAggregate": "projects/rules-of-thumb/results/null.json",
                             "sourceAggregateSha256": digest(path),
                             "sourceNullManifestSha256": digest(PREDECESSOR / "null-manifest.json"),
                             "ruleReadmeSha256": digest(PROJECT / "README.md"),
                             "appPinsSha256": digest(PROJECT / "app-pins.json"),
                             "generatorSha256": digest(Path(__file__))},
              "referenceMetadataPaths": [f"private/rules-of-thumb/null/scored-{month}-{shard}-of-2.json"
                                         for month in MONTHS for shard in range(2)],
              "referenceStageEventPath": "private/rules-of-thumb/null/stage-events.jsonl",
              "referenceWorkerEventPattern": "private/rules-of-thumb/null/scored-<month>-<shard>-of-2.events.jsonl",
              "unmeasured": ["new board-pass runtime", "new quiet and safe-move population", "new move reuse rate"],
              "timingCaveats": ["Elapsed timers are not CPU usage.", "Supervisor and worker clocks can differ across machine suspension.",
                                "An ideal two-worker duration excludes board work, the blackout, resumes and machine interruptions."]}
    destination = PROJECT / "results"
    destination.mkdir(exist_ok=True)
    for name, text in (("cost.json", json.dumps(report, indent=2, allow_nan=False) + "\n"), ("cost.md", markdown(report))):
        temporary = destination / (name + ".partial")
        temporary.write_text(text)
        temporary.replace(destination / name)
    print("Wrote cost from predecessor public operation totals; no private row was read.")


if __name__ == "__main__":
    main()
