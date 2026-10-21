#!/usr/bin/env python3
"""Synthetic tests only; no study journals or instruments are read."""
import hashlib
import json
import unittest

from operations import (aggregate_workers, assertion_summary, battery_reading, duration, guard_summary,
                        parse_power, reason_category, sleep_summary, snapshot_summary, stage_summary,
                        worker_summary)


def event(kind, second=0, **fields):
    return {"event": kind, "at": f"2026-01-01T00:00:{second:02d}+00:00", **fields}


def stage(kind, second=0, attempt="one", **fields):
    return event(kind, second, stage="scored", month="2026-09", attempt=attempt, **fields)


def snapshot(second, source="AC Power", percent=90, lid="No"):
    return {"at": f"2026-01-01T00:00:{second:02d}+00:00",
            "battery": f"Now drawing from '{source}'\n -InternalBattery-0 {percent}%; discharging;",
            "lid": f'"AppleClamshellState" = {lid}'}


class OperationsTests(unittest.TestCase):
    def test_stage_clocks_are_distinct_and_signed(self):
        result = stage_summary([stage("started"), stage("completed", 10, seconds=10.2, exitCode=0)])
        row = result["stages"]["scored"]["2026-09"]
        self.assertAlmostEqual(row["utcMinusRecordedSeconds"], -0.2)
        self.assertEqual(row["betweenAttemptUtcSeconds"]["seconds"], 0)

    def test_blackout_pause_and_restart_gap(self):
        events = [stage("started"), stage("blackout-stop-requested", 2),
                  stage("paused", 3, seconds=3, exitCode=75, stopReason="scheduled-blackout"),
                  event("blackout-wait", 3), event("blackout-ended", 20),
                  stage("started", 20, attempt="two"), stage("completed", 25, attempt="two", seconds=5, exitCode=0)]
        result = stage_summary(events); row = result["stages"]["scored"]["2026-09"]
        self.assertEqual((row["scheduledPauses"], row["stopped"], row["blackoutStopRequests"]), (1, 0, 1))
        self.assertEqual(row["betweenAttemptUtcSeconds"]["seconds"], 17)
        self.assertEqual(row["recordedStageSeconds"]["seconds"], 8)

    def test_cutoff_request_can_precede_success(self):
        events = [stage("started"), stage("blackout-stop-requested", 1), stage("completed", 2, seconds=2, exitCode=0)]
        row = stage_summary(events)["stages"]["scored"]["2026-09"]
        self.assertEqual((row["completed"], row["scheduledPauses"]), (1, 0))

    def test_missing_stage_tail_is_unknown(self):
        row = stage_summary([stage("started")])["stages"]["scored"]["2026-09"]
        self.assertIsNone(row["utcStageSeconds"]["seconds"])
        self.assertEqual(row["utcStageSeconds"]["unknownIntervals"], 1)

    def test_bad_stage_pairs_fail(self):
        with self.assertRaises(ValueError):
            stage_summary([stage("completed", 1, seconds=1, exitCode=0)])

    def test_worker_clean_completion(self):
        result = worker_summary([event("job-started"), event("job-completed", 1)], {"stoppedJobs": 0})
        self.assertEqual(result["stoppedJobs"], 0)
        self.assertEqual(result["missingCompletionEvents"], 0)

    def test_worker_hard_kill_recovery(self):
        events = [event("job-started"), event("interrupted-job-recovered", 2),
                  event("job-started", 3), event("job-completed", 4)]
        result = worker_summary(events, {"stoppedJobs": 1})
        self.assertEqual(result["unknownFailedTails"], 1)
        self.assertEqual(result["stopReasons"], {"interrupted-before-terminal-event": 1})

    def test_logged_stop_then_kill_counts_once(self):
        events = [event("job-started"), event("job-stopped", 1, reason="inexact move score", times={"engineSeconds": 1}),
                  event("interrupted-job-recovered", 2), event("job-started", 3), event("job-completed", 4)]
        result = worker_summary(events, {"stoppedJobs": 1})
        self.assertEqual(result["recoveryMarkersAfterLoggedStop"], 1)
        self.assertEqual(result["unknownFailedTails"], 1)

    def test_same_unknown_failed_tail_not_counted_twice(self):
        events = [event("job-started"), event("job-stopped", 1, reason="private secret", times=None),
                  event("interrupted-job-recovered", 2), event("job-started", 3), event("job-completed", 4)]
        result = worker_summary(events, {"stoppedJobs": 1})
        self.assertEqual(result["unknownFailedTails"], 1)
        self.assertNotIn("private secret", json.dumps(result))

    def test_restart_resets_duplicate_marker_state(self):
        events = [event("job-started"), event("job-stopped", 1, reason="inexact best score", times={}),
                  event("job-started", 2), event("interrupted-job-recovered", 3),
                  event("job-started", 4), event("job-completed", 5)]
        result = worker_summary(events, {"stoppedJobs": 2})
        self.assertEqual(result["recoveryMarkersAfterLoggedStop"], 0)
        self.assertEqual(result["stoppedJobs"], 2)

    def test_completed_checkpoint_missing_terminal_event(self):
        result = worker_summary([event("job-started")], {"stoppedJobs": 0})
        self.assertEqual(result["missingCompletionEvents"], 1)

    def test_failed_totals_missing_stay_missing(self):
        meta = {"rows": 1, "workerSeconds": 2, "totals": {"rowSeconds": 1}, "failedAttemptTotals": {}, "stoppedJobs": 0}
        events = [event("job-started"), event("job-completed", 2)]
        result = aggregate_workers([(meta, events), (meta, events)])
        self.assertEqual(result["failedAttemptTotals"], {})
        self.assertEqual(result["workerSeconds"], 4)

    def test_unknown_time_is_not_zero(self):
        self.assertEqual(duration([2, None]), {"seconds": None, "knownSeconds": 2, "unknownIntervals": 1})

    def test_power_categories_and_dedup(self):
        text = "2025-12-31 16:00:00 -0800 Sleep  entering sleep\n2025-12-31 16:00:02 -0800 Wake  wake\n"
        text += "2025-12-31 16:00:03 -0800 Wake Requests  planned\n2025-12-31 16:00:04 -0800 Assertions  Video Wake\n"
        self.assertEqual(len(parse_power([text, text])), 2)

    def test_sleep_clipped_at_both_boundaries(self):
        parsed = parse_power(["2026-01-01 00:00:00 +0000 Sleep  sleep\n2026-01-01 00:00:20 +0000 Wake  awake\n"])
        result = sleep_summary(parsed, "2026-01-01T00:00:05Z", "2026-01-01T00:00:10Z")
        self.assertEqual(result["knownSleepSecondsWithinRun"], 5)
        self.assertEqual((result["sleepIntervalsClippedAtStart"], result["sleepIntervalsClippedAtEnd"]), (1, 1))
        self.assertEqual(result["sleepEvents"], 0)

    def test_darkwake_ends_sleep(self):
        text = "2026-01-01 00:00:00 +0000 Wake  awake\n2026-01-01 00:00:03 +0000 Sleep  sleep\n2026-01-01 00:00:07 +0000 DarkWake  maintenance\n2026-01-01 00:00:10 +0000 Wake  awake\n"
        result = sleep_summary(parse_power([text]), "2026-01-01T00:00:01Z", "2026-01-01T00:00:12Z")
        self.assertEqual(result["knownSleepSecondsWithinRun"], 4)
        self.assertFalse(result["unknownInitialState"])

    def test_no_power_history_preserves_unknown_initial_state(self):
        result = sleep_summary([], "2026-01-01T00:00:01Z", "2026-01-01T00:00:12Z")
        self.assertTrue(result["unknownInitialState"])

    def test_ac_loss_is_a_bracket(self):
        rows = [snapshot(0), snapshot(10), snapshot(20, "Battery Power", 80), snapshot(30, "Battery Power", 79)]
        result = snapshot_summary(rows, "2026-01-01T00:00:05Z", "2026-01-01T00:00:25Z")
        change = result["sourceTransitions"][0]
        self.assertEqual((change["earliestSecondsAfterStart"], change["latestSecondsAfterStart"]), (5, 15))
        self.assertEqual(result["closedLidObservations"], 0)

    def test_assertion_request_is_not_effective_system_flag(self):
        text = "Assertion status system-wide:\n PreventSystemSleep 0\n PreventUserIdleSystemSleep 1\nListed by owning process:\n pid 4(caffeinate) PreventSystemSleep 1\n"
        self.assertEqual(assertion_summary(text), {"PreventSystemSleep": 0, "PreventUserIdleSystemSleep": 1})

    def test_guard_request_alone_does_not_prove_delivery(self):
        source = "synthetic"
        launch = {"source": source, "sourceSha256": hashlib.sha256(source.encode()).hexdigest(), "driverPid": 7,
                  "at": "2026-01-01T00:00:10Z", "thresholdPercent": 30}
        driver = {"pid": 7, "startedAt": "2026-01-01T00:00:00Z"}
        result = guard_summary(launch, "", [event("low-battery-stop-requested", 20)], driver, [], [])
        self.assertEqual(result["requestsWithoutDeliveryEvidence"], 1)
        self.assertFalse(result["deliveryCausalityEstablished"])

    def test_guard_signal_evidence_is_not_sender_proof(self):
        source = "synthetic"
        launch = {"source": source, "sourceSha256": hashlib.sha256(source.encode()).hexdigest(), "driverPid": 7,
                  "at": "2026-01-01T00:00:10Z", "thresholdPercent": 30}
        driver = {"pid": 7, "startedAt": "2026-01-01T00:00:00Z"}
        result = guard_summary(launch, "", [event("low-battery-stop-requested", 20)], driver,
                               [stage("stopped", 21, stopReason="signal")], [])
        self.assertEqual(result["requestsWithLaterSignalEvidence"], 1)
        self.assertFalse(result["deliveryCausalityEstablished"])

    def test_unknown_reason_never_passes_through(self):
        self.assertEqual(reason_category("private-position-token"), "other-or-unrecorded")
        self.assertEqual(battery_reading("unknown"), {"source": "unknown", "percent": None})


if __name__ == "__main__":
    unittest.main()
