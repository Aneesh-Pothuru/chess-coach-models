"""Synthetic timing, privacy and completion gates; no study outcomes are read."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import operations as op


def stage_event(event, attempt="one", at="2026-10-18T00:00:00+00:00", **extra):
    return {"stage": "score", "month": "2026-07", "event": event,
            "attempt": attempt, "at": at, **extra}


def worker_event(event, **extra):
    return {"month": "2026-07", "shard": 0, "shards": 2,
            "timing": False, "event": event, "at": "2026-10-18T00:00:00+00:00", **extra}


def worker_manifest():
    return {"month": "2026-07", "shard": 0, "shards": 2, "stoppedJobs": 0,
            "rows": 1, "expectedRows": 1,
            "totals": {"tablebaseRetries": 0, "tablebaseUnavailable": 0},
            "failedAttemptTotals": {"tablebaseRetries": 0, "tablebaseUnavailable": 0}}


class TimingTests(unittest.TestCase):
    def test_recorded_and_utc_intervals_and_gaps_are_separate(self):
        events = [stage_event("started"), stage_event("stopped", at="2026-10-18T01:00:00+00:00",
                    seconds=30, stopReason="stage-failure"),
                  stage_event("started", "two", "2026-10-18T02:00:00+00:00"),
                  stage_event("completed", "two", "2026-10-18T02:00:10+00:00", seconds=9)]
        result = op.stage_summary(events)["score"]["2026-07"]
        self.assertEqual(result["recordedInvocationSeconds"]["seconds"], 39)
        self.assertEqual(result["utcInvocationSeconds"]["seconds"], 3610)
        self.assertEqual(result["betweenAttemptUtcSeconds"]["seconds"], 3600)
        self.assertEqual(result["firstStartToLastEndUtcSeconds"], 7210)

    def test_unknown_reviewer_stop_does_not_use_audit_timestamp(self):
        events = [stage_event("started"), stage_event("stopped", at="2026-10-18T01:00:00+00:00",
                    seconds=None, terminationTimeKnown=False, stopReason="reviewer-amendment-sigterm"),
                  stage_event("started", "two", "2026-10-18T02:00:00+00:00"),
                  stage_event("completed", "two", "2026-10-18T02:00:10+00:00", seconds=9)]
        result = op.stage_summary(events)["score"]["2026-07"]
        self.assertIsNone(result["recordedInvocationSeconds"]["seconds"])
        self.assertEqual(result["recordedInvocationSeconds"]["knownSeconds"], 9)
        self.assertIsNone(result["utcInvocationSeconds"]["seconds"])
        self.assertIsNone(result["betweenAttemptUtcSeconds"]["seconds"])
        self.assertEqual(result["stopReasons"], {"reviewer-amendment-sigterm": 1})

    def test_unfinished_attempt_remains_unknown(self):
        result = op.stage_summary([stage_event("started")])["score"]["2026-07"]
        self.assertEqual(result["unfinishedJobs"], 1)
        self.assertIsNone(result["utcInvocationSeconds"]["seconds"])

    def test_free_form_stage_reason_is_not_exported(self):
        events = [stage_event("started"), stage_event("stopped", seconds=0, stopReason="secret-row-key")]
        self.assertNotIn("secret-row-key", json.dumps(op.stage_summary(events)))


class WorkerTests(unittest.TestCase):
    def test_recovered_and_terminal_failures_stay_separate(self):
        events = [worker_event("job-started"),
                  worker_event("tablebase-retry", key="private-row-one", failedAttempt=1, nextAttempt=2, status="offline"),
                  worker_event("tablebase-unavailable", key="private-row-one", attempts=2, status="offline"),
                  worker_event("job-stopped", reason="missing tablebase outcome; row remains pending"),
                  worker_event("job-started"),
                  worker_event("tablebase-retry", key="private-row-one", failedAttempt=1, nextAttempt=2, status="unsupported"),
                  worker_event("tablebase-recovered", key="private-row-one", attempts=2),
                  worker_event("job-completed")]
        meta = worker_manifest()
        meta.update(stoppedJobs=1, totals={"tablebaseRetries": 1, "tablebaseUnavailable": 1},
                    failedAttemptTotals={"tablebaseRetries": 1, "tablebaseUnavailable": 2})
        result, stops = op.worker_summary(events, meta)
        self.assertEqual(result["tablebase"]["retryEvents"], 2)
        self.assertEqual(result["tablebase"]["recoveredProbes"], 1)
        self.assertEqual(result["tablebase"]["terminalUnavailableAttempts"], 1)
        self.assertEqual(result["tablebase"]["finalUnscoredRows"], 0)
        self.assertEqual(stops, [])
        self.assertNotIn("private-row", json.dumps(result))

    def test_unknown_messages_and_statuses_are_redacted(self):
        events = [worker_event("job-started"),
                  worker_event("tablebase-retry", key="secret-key", failedAttempt=1, nextAttempt=2, status="secret-status"),
                  worker_event("tablebase-recovered", key="secret-key", attempts=2),
                  worker_event("job-stopped", reason="secret-FEN-and-game"),
                  worker_event("job-started"), worker_event("job-completed")]
        meta = worker_manifest()
        meta["stoppedJobs"] = 1
        meta["totals"] = {"tablebaseRetries": 1, "tablebaseUnavailable": 1}
        result, _ = op.worker_summary(events, meta)
        self.assertNotIn("secret", json.dumps(result))
        self.assertEqual(result["stopReasons"], {"other-or-unrecorded": 1})

    def test_unmatched_retry_and_changed_totals_fail(self):
        with self.assertRaises(ValueError):
            op.worker_summary([worker_event("job-started"), worker_event("tablebase-retry", key="private",
                failedAttempt=1, nextAttempt=2, status="offline"), worker_event("job-completed")], worker_manifest())
        meta = worker_manifest()
        meta["totals"]["tablebaseRetries"] = 1
        with self.assertRaises(ValueError):
            op.worker_summary([worker_event("job-started"), worker_event("job-completed")], meta)

    def test_interrupted_retry_chain_has_unknown_tail_not_a_failed_probe(self):
        events = [worker_event("job-started"),
                  worker_event("tablebase-retry", key="private-tail", failedAttempt=1, nextAttempt=2, status="offline"),
                  worker_event("interrupted-job-recovered"),
                  worker_event("job-started"), worker_event("job-completed")]
        meta = worker_manifest()
        meta["stoppedJobs"] = 1
        result, _ = op.worker_summary(events, meta)
        self.assertEqual(result["stoppedInvocations"], 1)
        self.assertEqual(result["interruptedInvocationsWithUnknownTailTiming"], 1)
        self.assertEqual(result["tablebase"]["interruptedRetryChains"], 1)
        self.assertEqual(result["tablebase"]["interruptedChainRetryEvents"], 1)
        self.assertEqual(result["tablebase"]["terminalUnavailableAttempts"], 0)
        self.assertIsNone(result["tablebase"]["unrecordedAdditionalProbeAttempts"])
        self.assertEqual(result["workersWithIncompleteRetryReconciliation"], 1)
        self.assertNotIn("private-tail", json.dumps(result))
        self.assertIsNone(op.sum_workers([result, result])["tablebase"]["unrecordedAdditionalProbeAttempts"])

    def test_recovered_event_before_interruption_need_not_be_durable_row(self):
        events = [worker_event("job-started"),
                  worker_event("tablebase-retry", key="private-tail", failedAttempt=1, nextAttempt=2, status="offline"),
                  worker_event("tablebase-recovered", key="private-tail", attempts=2),
                  worker_event("interrupted-job-recovered"),
                  worker_event("job-started"), worker_event("job-completed")]
        meta = worker_manifest()
        meta["stoppedJobs"] = 1
        result, _ = op.worker_summary(events, meta)
        self.assertEqual(result["tablebase"]["recoveredProbes"], 1)
        self.assertEqual(result["tablebase"]["interruptedRetryChains"], 0)
        self.assertEqual(result["workersWithIncompleteRetryReconciliation"], 1)

    def test_stop_event_before_manifest_save_is_one_logical_stop(self):
        # score.mjs logs job-stopped before saving its stopped manifest. If
        # interrupted between those writes, resume reads the old 'running'
        # manifest and emits a recovery marker for this same invocation.
        events = [worker_event("job-started"),
                  worker_event("job-stopped", reason="inexact best score"),
                  worker_event("interrupted-job-recovered"),
                  worker_event("job-started"), worker_event("job-completed")]
        meta = worker_manifest()
        meta["stoppedJobs"] = 1
        result, engine_stops = op.worker_summary(events, meta)
        self.assertEqual(result["invocations"], 2)
        self.assertEqual(result["stoppedInvocations"], 1)
        self.assertEqual(result["completedInvocations"], 1)
        self.assertEqual(result["stopReasons"], {"inexact-best-score": 1})
        self.assertEqual(result["recoveryMarkersAfterLoggedStop"], 1)
        self.assertEqual(result["interruptedInvocationsWithUnknownTailTiming"], 1)
        self.assertEqual(len(engine_stops), 1)
        self.assertIsNone(result["tablebase"]["unrecordedAdditionalProbeAttempts"])


class PowerTests(unittest.TestCase):
    def test_only_proximity_counts_are_exported(self):
        source = {"eventsNearEngineStops": [
            {"atLocal": "2026-10-18 17:00:00 -0700", "event": "DarkWake", "reason": "secret-reason"},
            {"atLocal": "2026-10-18 16:00:00 -0700", "event": "Sleep"}],
            "sleepReasonsOnOctober19": {"secret-day-total": 1000}, "lastFullWake": "secret-timestamp"}
        result = op.power_summary(source, [{"month": "2026-07", "at": "2026-10-19T00:00:30Z"}])
        self.assertEqual(result["byMonth"]["2026-07"]["nearDarkWake"], 1)
        self.assertEqual(result["byMonth"]["2026-07"]["nearSleep"], 0)
        serialized = json.dumps(result)
        self.assertNotIn("secret", serialized)
        self.assertNotIn("2026-10-18", serialized)
        self.assertNotIn("1000", serialized)

    def test_absent_power_evidence_is_not_zero_evidence(self):
        result = op.power_summary(None, [])
        self.assertFalse(result["recorded"])
        self.assertIsNone(result["byMonth"])

    def test_full_wake_is_distinct_from_dark_wake(self):
        source = {"eventsNearEngineStops": [
            {"atLocal": "2030-01-02 12:00:00 -0700", "event": "Sleep"},
            {"atLocal": "2030-01-02 13:10:00 -0700", "event": "Wake"}]}
        stops = [{"month": "2026-09", "at": "2030-01-02T20:10:01Z"},
                 {"month": "2026-09", "at": "2030-01-02T20:10:03Z"}]
        result = op.power_summary(source, stops)["byMonth"]["2026-09"]
        self.assertEqual(result["engineStoppedWorkers"], 2)
        self.assertEqual(result["nearWake"], 2)
        self.assertEqual(result["nearDarkWake"], 0)
        self.assertEqual(result["nearSleep"], 0)
        self.assertEqual(result["noNearbyRecordedPowerEvent"], 0)


class CompletionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.lab = Path(self.temp.name)
        self.project = self.lab / "projects/rules-of-thumb"
        self.private = self.lab / "private/rules-of-thumb/full"
        (self.project / "results").mkdir(parents=True)
        self.private.mkdir(parents=True)
        (self.lab / "bridge").mkdir()
        self.frozen = {"schema": 2, "datasetKind": "amended", "app": "app-pin", "records": "records-pin",
                       "rule": {"sha256": "rule-content"}, "files": {"score.mjs": "scorer-content", "stream.py": "stream-content"}}
        self.write(self.lab / "bridge/chess.json", {"commit": "app-pin", "records": "records-pin"})
        self.write(self.project / "phase2-manifest.json", self.frozen)
        for name in ("operations.py", "positions.mjs", "detect.mjs", "backfill.mjs"):
            (self.project / name).write_text("synthetic-file")
        self.scanner = hashlib.sha256(b"synthetic-file" * 3).hexdigest()
        self.analysis = {"app": "app-pin", "datasetKind": "amended", "contentManifestSha256": op.digest(self.project / "phase2-manifest.json"),
            "ruleReadmeSha256": "rule-content", "measurementVersions": {"streamVersion": "stream-content", "scannerVersion": self.scanner,
                "scorerVersion": "scorer-content"}, "data": {"train": list(op.MONTHS[:2]), "heldout": op.MONTHS[2],
                "gamesByMonth": {m: 30 for m in op.MONTHS}, "positionsByMonth": {m: 100 for m in op.MONTHS}}, "seconds": 1,
            "rules": {r: {"countsByMonth": {m: {"retainedPositions": 1, "scoredPositions": 1} for m in op.MONTHS}} for r in op.RULES}}
        self.write(self.project / "results/rules.json", self.analysis)
        for month in op.MONTHS:
            common = {"complete": True, "run": "full", "app": "app-pin", "month": month}
            self.write(self.private / f"games-{month}.json", {**common, "kept": 30, "seconds": 2, "streamVersion": "stream-content"})
            self.write(self.private / f"positions-{month}.json", {**common, "datasetKind": "amended", "scannerVersion": self.scanner,
                "games": 30, "positions": 100, "keptPositions": 15, "kept": {r: 1 for r in op.RULES}, "outputSha256": "positions-content"})
            for shard in (0, 1):
                meta = {**common, "status": "complete", "timing": False, "datasetKind": "amended", "inputSha256": "positions-content",
                        "scorerVersion": "scorer-content", "scannerVersion": self.scanner, "shards": 2, "shard": shard,
                        "rows": 8 - shard, "expectedRows": 8 - shard, "stoppedJobs": 0, "workerSeconds": 10,
                        "totals": {k: 0 for k in op.METRICS}, "failedAttemptTotals": {k: 0 for k in op.METRICS}}
                self.write(self.private / f"scored-{month}-{shard}-of-2.json", meta)
                events = [worker_event("job-started", month=month, shard=shard), worker_event("job-completed", month=month, shard=shard)]
                (self.private / f"scored-{month}-{shard}-of-2.events.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
        (self.private / "stage-events.jsonl").write_text("")

    def write(self, path, data):
        path.write_text(json.dumps(data))

    def build(self):
        with patch("freeze.verify_manifest", return_value=self.frozen):
            return op.build_report(self.private, self.project, self.lab)

    def test_complete_metadata_produces_only_aggregate_supplement(self):
        result = self.build()
        self.assertEqual(result["byMonth"]["2026-07"]["completedRows"], 15)
        self.assertIn("operations.py", result["inputSha256"])
        self.assertNotIn("rules", result)
        self.assertFalse((self.project / "results/operations.json").exists())
        self.assertIn("operations.json", op.markdown(result))

    def test_missing_analysis_and_incomplete_score_are_rejected(self):
        path = self.project / "results/rules.json"
        path.unlink()
        with self.assertRaisesRegex(ValueError, "absent"):
            self.build()
        self.write(path, self.analysis)
        path = self.private / "scored-2026-09-1-of-2.json"
        meta = json.loads(path.read_text())
        meta["complete"] = False
        self.write(path, meta)
        with self.assertRaisesRegex(ValueError, "has not completed"):
            self.build()
        self.assertFalse((self.project / "results/operations.json").exists())

    def test_changed_analysis_hash_and_counts_are_rejected(self):
        self.analysis["contentManifestSha256"] = "wrong"
        self.write(self.project / "results/rules.json", self.analysis)
        with self.assertRaisesRegex(ValueError, "provenance differs"):
            self.build()
        self.analysis["contentManifestSha256"] = op.digest(self.project / "phase2-manifest.json")
        self.analysis["rules"]["lucena"]["countsByMonth"]["2026-09"]["scoredPositions"] = 0
        self.write(self.project / "results/rules.json", self.analysis)
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.build()


if __name__ == "__main__":
    unittest.main()
