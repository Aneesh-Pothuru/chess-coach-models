"""Synthetic process and byte-hash tests. No game or position row is read."""
from __future__ import annotations

import contextlib
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import freeze
import run as runner
import cost


def stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class InputFreezeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="after-check-inputs-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "old"
        self.private = self.root / "private"
        self.project.mkdir()
        for name in ("full", "null"):
            (self.private / name).mkdir(parents=True)
        self.write(self.project / "phase2-manifest.json", {"files": {"score.mjs": "original-source"}})
        self.write(self.project / "null-manifest.json", {"newFiles": {"null-score.mjs": "null-source"}})
        null_hash = freeze.digest(self.project / "null-manifest.json")
        originals = {}
        # Deliberately undecodable and invalid as both gzip and JSON. The
        # freezer must consume only these byte streams, never their rows.
        opaque = b"\xff\x00these are not parseable rows\n"
        for month in freeze.MONTHS:
            for kind in ("games", "positions"):
                raw = self.private / "full" / f"{kind}-{month}.jsonl.gz"
                raw.write_bytes(opaque)
                self.write(raw.with_name(f"{kind}-{month}.json"), {"complete": True,
                    "datasetKind": "amended", "app": freeze.REFEREE_APP, "run": "full", "keptPositions": 4})
            position_hash = freeze.digest(self.private / "full" / f"positions-{month}.jsonl.gz")
            for shard in range(2):
                name = f"scored-{month}-{shard}-of-2.json"
                common = {"complete": True, "status": "complete", "app": freeze.REFEREE_APP,
                          "run": "full", "month": month, "shard": shard, "shards": 2,
                          "inputSha256": position_hash, "rows": 2, "expectedRows": 2, "keysSha256": "synthetic-keys"}
                self.write(self.private / "full" / name, {**common, "datasetKind": "amended", "scorerVersion": "original-source"})
                (self.private / "full" / name).with_suffix(".jsonl").write_bytes(opaque)
                journal = (self.private / "null" / name).with_suffix(".jsonl")
                journal.write_bytes(opaque)
                self.write(self.private / "null" / name, {**common, "datasetKind": "null-addition",
                    "scorerVersion": "null-source", "additionManifestSha256": null_hash,
                    "outputSha256": freeze.digest(journal)})
        for shard in range(2):
            (self.private / "full" / f"tablebase-{shard}-of-2.json").write_bytes(opaque)
        for path in (self.private / "full").iterdir():
            originals[path.name] = freeze.digest(path)
        self.write(self.project / "null-input-manifest.json", {"app": freeze.REFEREE_APP,
                   "records": freeze.RECORDS, "files": originals})

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value))

    def test_all_inputs_hashed_without_decoding_any_rows(self):
        result = freeze.input_snapshot(self.project, self.private)
        self.assertEqual(len(result["files"]), 38)
        self.assertTrue(all(len(value) == 64 for value in result["files"].values()))
        self.assertNotIn("not parseable", json.dumps(result))

    def test_mutation_and_incomplete_null_shard_refuse_freeze(self):
        path = self.private / "null/scored-2026-09-0-of-2.json"
        meta = json.loads(path.read_text())
        meta["complete"] = False
        self.write(path, meta)
        with self.assertRaisesRegex(ValueError, "incomplete"):
            freeze.input_snapshot(self.project, self.private)
        meta["complete"] = True
        self.write(path, meta)
        path.with_suffix(".jsonl").write_bytes(b"changed bytes")
        with self.assertRaisesRegex(ValueError, "completed null journal changed"):
            freeze.input_snapshot(self.project, self.private)

    def test_frozen_original_bytes_cannot_change(self):
        (self.private / "full/positions-2026-09.jsonl.gz").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "original private input changed"):
            freeze.input_snapshot(self.project, self.private)

    def test_rule_sources_and_committed_manifests_gate_verification(self):
        saved = {"synthetic": True}
        with patch.object(freeze, "read_json", return_value=saved), \
                patch.object(freeze, "snapshot", return_value=saved), \
                patch.object(freeze, "input_snapshot", return_value=saved), \
                patch.object(freeze, "require_committed_file") as committed:
            self.assertEqual(freeze.verify_manifest(), saved)
            self.assertEqual(committed.call_count, 2)
            with patch.object(freeze, "snapshot", return_value={"changed": True}):
                with self.assertRaisesRegex(ValueError, "differs from its freeze"):
                    freeze.verify_manifest()
            with patch.object(freeze, "input_snapshot", return_value={"changed": True}):
                with self.assertRaisesRegex(ValueError, "private input changed"):
                    freeze.verify_manifest()

    def test_answer_check_is_read_only_and_does_not_call_old_freezer(self):
        with patch.object(freeze.subprocess, "run", return_value=Mock(returncode=0)) as command:
            freeze.check_predecessor_answer(self.project)
        args = command.call_args.args[0]
        self.assertEqual(Path(args[-1]).name, "answer_check.py")
        self.assertNotIn("--write", args)
        with patch.object(freeze.subprocess, "run", return_value=Mock(returncode=1)):
            with self.assertRaisesRegex(ValueError, "frozen-rule"):
                freeze.check_predecessor_answer(self.project)

    def test_both_apps_must_share_one_installed_tree_and_identical_lock(self):
        check = self.root / ".cache/chess" / freeze.BOARD_APP
        score = self.root / ".cache/chess" / freeze.REFEREE_APP
        check.mkdir(parents=True); score.mkdir(parents=True)
        for directory in (check, score):
            (directory / "package-lock.json").write_text("same lock")
        (score / "node_modules").mkdir()
        (check / "node_modules").symlink_to(score / "node_modules", target_is_directory=True)
        self.assertTrue(freeze.dependency_snapshot(self.root)["shared"])
        (check / "node_modules").unlink(); (check / "node_modules").mkdir()
        with self.assertRaisesRegex(ValueError, "must share"):
            freeze.dependency_snapshot(self.root)
        (check / "package-lock.json").write_text("different lock")
        with self.assertRaisesRegex(ValueError, "locks differ"):
            freeze.dependency_snapshot(self.root)


class ClockTests(unittest.TestCase):
    def test_cutoff_and_release_are_utc_and_half_open(self):
        for text, blocked in (("2026-10-23T12:59:49.999999Z", False),
                              ("2026-10-23T12:59:50Z", True),
                              ("2026-10-23T13:00:00Z", True),
                              ("2026-10-23T15:29:59.999999Z", True),
                              ("2026-10-23T15:30:00Z", False),
                              ("2026-10-23T06:30:00-07:00", True)):
            self.assertEqual(runner.blocked_at(stamp(text)), blocked)
        with self.assertRaises(ValueError):
            runner.blocked_at(datetime(2026, 10, 23, 13))

    def test_wait_does_no_work_until_resume_and_preserves_stop(self):
        runner.STOP.clear()
        with patch.object(runner, "utc_now", side_effect=[stamp("2026-10-23T13:00:00Z")]*2 + [stamp("2026-10-23T15:30:00Z")]), \
                patch.object(runner, "event") as events, patch.object(runner.STOP, "wait", return_value=False) as wait:
            runner.await_open_window()
        wait.assert_called_once_with(timeout=0.5)
        self.assertEqual([call.args[0]["event"] for call in events.call_args_list], ["blackout-wait", "blackout-ended"])
        with patch.object(runner, "utc_now", return_value=stamp("2026-10-23T13:00:00Z")), \
                patch.object(runner, "event"), patch.object(runner.STOP, "wait", return_value=True):
            with self.assertRaises(InterruptedError):
                runner.await_open_window()


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="after-check-runner-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        (self.directory / "logs").mkdir()
        self.manifest = self.directory / "manifest.json"
        self.manifest.write_text("synthetic manifest")
        self.frozen = {"boardApp": "check-app", "refereeApp": "score-app", "records": "records",
                       "apps": {"check": "check-app", "score": "score-app", "records": "records"},
                       "inputs": {"sha256": "input-hash"}, "files": {"board.mjs": "board-hash", "score.mjs": "score-hash"}}
        runner.STOP.clear(); runner.CHILDREN.clear()
        self.addCleanup(runner.STOP.clear)
        for name, value in (("DIRECTORY", self.directory), ("MANIFEST", self.manifest),
                            ("SIGNAL_RECEIVED", False), ("RUN_LOCK_FD", 123)):
            p = patch.object(runner, name, value); p.start(); self.addCleanup(p.stop)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__(); self.addCleanup(self.output.__exit__, None, None, None)

    def process(self, code=0):
        return Mock(pid=8123, wait=Mock(return_value=code))

    def stage_patches(self, process):
        stack = contextlib.ExitStack()
        stack.enter_context(patch.object(runner, "verify_manifest", return_value=self.frozen))
        stack.enter_context(patch.object(runner, "stage_complete", return_value=False))
        stack.enter_context(patch.object(runner, "await_open_window"))
        stack.enter_context(patch.object(runner, "stop_group"))
        stack.enter_context(patch.object(runner, "utc_now", return_value=stamp("2026-10-23T16:00:00Z")))
        popen = stack.enter_context(patch.object(runner.subprocess, "Popen", return_value=process))
        return stack, popen

    def test_pipeline_order(self):
        with patch.object(runner, "run_stage") as run:
            runner.run_pipeline()
        self.assertEqual([call.args for call in run.call_args_list],
            [(stage, month) for stage in ("checked", "scored") for month in runner.MONTHS] + [("analysis",), ("examples",)])

    def test_board_binding_and_detached_two_workers_without_nested_nice(self):
        stack, popen = self.stage_patches(self.process())
        with stack:
            runner.run_stage("checked", "2026-09")
        command = popen.call_args.args[0]
        self.assertNotEqual(command[0], "nice")
        self.assertEqual(command[-4:], ["--month", "2026-09", "--pool", "2"])
        kwargs = popen.call_args.kwargs
        self.assertTrue(kwargs["start_new_session"])
        self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
        self.assertEqual(kwargs["stderr"], subprocess.STDOUT)
        self.assertEqual(kwargs["pass_fds"], (123,))
        self.assertTrue(kwargs["env"]["CHESS_DIR"].endswith("/check-app"))
        self.assertTrue(kwargs["stdout"].name.startswith(str(self.directory / "logs")))

    def test_analysis_is_nice_ten_and_uses_referee_pin(self):
        stack, popen = self.stage_patches(self.process())
        with stack:
            runner.run_stage("analysis")
        self.assertEqual(popen.call_args.args[0][:3], ["nice", "-n", "10"])
        self.assertTrue(popen.call_args.kwargs["env"]["CHESS_DIR"].endswith("/score-app"))

    def test_ordinary_stage_failure_stops_and_never_retries(self):
        stack, popen = self.stage_patches(self.process(1))
        with stack, patch.object(runner, "stop_group") as stop:
            with self.assertRaisesRegex(RuntimeError, "stage stopped"):
                runner.run_stage("scored", "2026-09")
        popen.assert_called_once(); stop.assert_called_once_with(8123)
        events = [json.loads(line) for line in (self.directory / "stage-events.jsonl").read_text().splitlines()]
        self.assertEqual(events[-1]["event"], "stopped")
        self.assertEqual(events[-1]["stopReason"], "stage-failure")

    def test_scheduled_worker_exit_restarts_same_stage_after_wait(self):
        stack, popen = self.stage_patches(self.process())
        with stack, patch.object(runner, "stop_group"):
            popen.side_effect = [self.process(75), self.process(0)]
            runner.run_stage("scored", "2026-09")
        self.assertEqual(popen.call_count, 2)
        events = [json.loads(line) for line in (self.directory / "stage-events.jsonl").read_text().splitlines()]
        self.assertEqual([e["event"] for e in events], ["started", "paused", "started", "completed"])
        self.assertEqual(events[1]["stopReason"], "scheduled-blackout")

    def test_supervisor_stops_already_running_group_at_cutoff(self):
        stack, popen = self.stage_patches(self.process())
        with stack, patch.object(runner, "stop_group") as stop, patch.object(runner, "blocked_at", side_effect=[False, True, False, False]):
            popen.side_effect = [self.process(-15), self.process(0)]
            runner.run_stage("checked", "2026-09")
        self.assertGreaterEqual(stop.call_count, 1)
        events = [json.loads(line) for line in (self.directory / "stage-events.jsonl").read_text().splitlines()]
        self.assertIn("blackout-stop-requested", [e["event"] for e in events])
        self.assertEqual([e["event"] for e in events if e["event"] in ("paused", "completed")], ["paused", "completed"])

    def test_completed_stage_requires_hashes_and_matching_provenance(self):
        for shard in range(2):
            path = self.directory / f"checked-2026-09-{shard}-of-2.json"
            path.with_suffix(".jsonl").write_bytes(b"synthetic bytes\n")
            meta = {"complete": True, "schema": 1, "datasetKind": "rules-after-check", "stage": "checked",
                    "status": "complete", "run": "full", "month": "2026-09", "shard": shard, "shards": 2,
                    "boardApp": "check-app", "refereeApp": "score-app", "records": "records",
                    "contentManifestSha256": runner.file_hash(self.manifest), "sourceInputsSha256": "input-hash",
                    "sourceSha256": "board-hash", "rows": 2, "expectedRows": 2, "keysSha256": "keys",
                    "outputSha256": runner.file_hash(path.with_suffix(".jsonl"))}
            path.write_text(json.dumps(meta))
        self.assertTrue(runner.stage_complete("checked", "2026-09", self.frozen))
        path.with_suffix(".jsonl").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "journal content changed"):
            runner.stage_complete("checked", "2026-09", self.frozen)

    def test_phase_one_gate_precedes_any_verification_or_private_state(self):
        with patch.object(runner, "verify_manifest") as verify, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                runner.main([])
        verify.assert_not_called()

    def test_nice_driver_is_rejected_before_work(self):
        with patch.object(runner, "verify_manifest") as verify, patch.object(runner.os, "getpriority", return_value=10), \
                contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                runner.main(["--reviewed"])
        verify.assert_not_called()

    def test_driver_launch_is_detached_to_files_at_normal_priority(self):
        process = Mock(pid=9123)
        (self.directory / "driver.json").write_text(json.dumps({"pid": 9123, "status": "running"}))
        with patch.object(runner.subprocess, "Popen", return_value=process) as popen, patch.object(runner, "LAB", self.directory):
            runner.launch_detached()
        args, kwargs = popen.call_args
        self.assertNotIn("nice", args[0])
        self.assertEqual(args[0][-1], "--reviewed")
        self.assertTrue(kwargs["start_new_session"])
        self.assertTrue(kwargs["close_fds"])
        self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
        self.assertEqual(kwargs["stderr"], subprocess.STDOUT)
        self.assertTrue(kwargs["stdout"].name.startswith(str(self.directory / "logs")))

    def test_stop_group_escalates_within_grace(self):
        with patch.object(runner.os, "killpg") as kill, patch.object(runner.time, "monotonic", side_effect=[0, 4]), \
                patch.object(runner, "utc_now", return_value=stamp("2026-10-23T12:59:50Z")):
            runner.stop_group(1234)
        self.assertEqual([call.args[1] for call in kill.call_args_list], [runner.signal.SIGTERM, runner.signal.SIGKILL])

    def test_recorded_live_process_group_prevents_duplicate_launch(self):
        (self.directory / "active-stage.json").write_text(json.dumps({"pgid": 9988}))
        with patch.object(runner.os, "killpg") as kill, patch.object(runner.subprocess, "check_output") as ps:
            with self.assertRaisesRegex(RuntimeError, "process group is still alive"):
                runner.require_no_orphans()
        kill.assert_called_once_with(9988, 0)
        ps.assert_not_called()

    def test_unmarked_project_worker_is_refused_but_unrelated_study_is_ignored(self):
        command = f"9988 node {runner.PROJECT / 'score.mjs'} --shard 0/2\n"
        with patch.object(runner.subprocess, "check_output", return_value=command):
            with self.assertRaisesRegex(RuntimeError, "stage process is still alive"):
                runner.require_no_orphans()
        with patch.object(runner.subprocess, "check_output", return_value="9988 node /tmp/synthetic-other-study/score.mjs\n"):
            runner.require_no_orphans()

    def test_dead_group_marker_allows_a_clean_resume(self):
        (self.directory / "active-stage.json").write_text(json.dumps({"pgid": 9988}))
        with patch.object(runner.os, "killpg", side_effect=ProcessLookupError), \
                patch.object(runner.subprocess, "check_output", return_value=""):
            runner.require_no_orphans()


class CostTests(unittest.TestCase):
    def source(self):
        item = {"workers": 2, "completedRows": 10, "cumulativeWorkerSeconds": 100, "stoppedWorkerJobs": 0,
                "completedRowTotals": {"maiaSeconds": 20, "engineSeconds": 60, "newGameSeconds": 1,
                                       "tablebaseSeconds": .2, "bestCalls": 5, "scoreCalls": 5},
                "failedAttemptTotals": {"engineSeconds": 0}}
        return {"operations": {"byMonth": {month: dict(item) for month in cost.MONTHS}}}

    def test_conservative_case_prices_four_searches_per_old_row_without_new_rate(self):
        result = cost.estimate(self.source())
        self.assertEqual(result["referenceTotals"]["rows"], 30)
        self.assertEqual(result["assumptions"]["meanRecordedSecondsPerSearch"], 6)
        self.assertEqual(result["scenarios"]["predecessorReference"]["workerSeconds"], 300)
        self.assertEqual(result["scenarios"]["threeNewMovesAtPredecessorFreshSearchShare"]["workerSeconds"], 480)
        self.assertEqual(result["scenarios"]["threeNewMovesAtEveryPredecessorRow"]["workerSeconds"], 840)
        self.assertIsNone(result["newBoardPassSeconds"])
        self.assertIsNone(result["wholeRunElapsedHours"])

    def test_missing_timing_and_changed_search_shape_do_not_become_zero(self):
        source = self.source()
        source["operations"]["byMonth"][cost.MONTHS[0]]["cumulativeWorkerSeconds"] = None
        with self.assertRaises(ValueError):
            cost.estimate(source)
        source = self.source()
        source["operations"]["byMonth"][cost.MONTHS[0]]["completedRowTotals"]["scoreCalls"] = 6
        with self.assertRaisesRegex(ValueError, "one best and one move"):
            cost.estimate(source)


if __name__ == "__main__":
    unittest.main()
