"""Synthetic addition-freeze and process tests; no real null metric is read."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import freeze_null as freeze
import run_null as runner


class RuleTests(unittest.TestCase):
    def test_removal_recovers_original_bytes_and_files_section_is_outside_rule(self):
        original = b"# Original\n\n## Who runs it\nOriginal ending.\n\n"
        addition = freeze.ADDITION + b"New fixed addition.\n\n"
        raw = original.replace(freeze.FOLLOWING, addition + freeze.FOLLOWING) + b"## Files\nLater commands.\n"
        result = freeze.rule_parts(raw)
        self.assertEqual(result["originalRuleSha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(result["additionSha256"], hashlib.sha256(addition).hexdigest())
        self.assertEqual(result, freeze.rule_parts(raw.replace(b"Later commands.", b"Changed commands.")))

    def test_ambiguous_or_missing_addition_is_rejected(self):
        for raw in (b"## Files\n", freeze.ADDITION * 2 + freeze.FOLLOWING + b"## Files\n",
                    freeze.FOLLOWING + freeze.ADDITION + b"## Files\n"):
            with self.assertRaises(ValueError):
                freeze.rule_parts(raw)


class FreezeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="rules-null-freeze-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.lab = Path(self.temp.name)
        self.project = self.lab / "projects/rules-of-thumb"
        self.directory = self.lab / "private/rules-of-thumb/full"
        (self.project / "results").mkdir(parents=True)
        self.directory.mkdir(parents=True)
        original_rule = b"# Original rule\n\n## Who runs it\nOriginal ending.\n\n"
        addition = freeze.ADDITION + b"Fixed null addition.\n\n"
        (self.project / "README.md").write_bytes(original_rule.replace(freeze.FOLLOWING, addition + freeze.FOLLOWING) + b"## Files\n")
        (self.project / "old.mjs").write_text("old source")
        self.original = {"schema": 2, "datasetKind": "amended", "app": "original-app", "records": "original-records",
                         "files": {"old.mjs": freeze.digest(self.project / "old.mjs"), "score.mjs": "placeholder"},
                         "rule": {"sha256": hashlib.sha256(original_rule).hexdigest()}}
        (self.project / "score.mjs").write_text("old scorer")
        self.original["files"]["score.mjs"] = freeze.digest(self.project / "score.mjs")
        (self.project / "stream.py").write_text("old streamer")
        self.original["files"]["stream.py"] = freeze.digest(self.project / "stream.py")
        self.write(self.project / "phase2-manifest.json", self.original)
        for name in freeze.ORIGINAL_EXTRA:
            path = self.project / name
            if not path.exists():
                path.write_text("old aggregate or operations source")
        result = {"app": "original-app", "datasetKind": "amended",
                  "contentManifestSha256": freeze.digest(self.project / "phase2-manifest.json"),
                  "ruleReadmeSha256": self.original["rule"]["sha256"],
                  "rules": {"synthetic": {"countsByMonth": {month: {"scoredPositions": 2} for month in freeze.MONTHS}}}}
        self.write(self.project / "results/rules.json", result)
        for name in freeze.NEW_FILES:
            (self.project / name).write_text("new synthetic source")
        # A later bridge pin must not govern this addition.
        (self.lab / "bridge").mkdir()
        self.write(self.lab / "bridge/chess.json", {"commit": "later-app", "records": "later-records"})
        for month in freeze.MONTHS:
            games = self.directory / f"games-{month}.jsonl.gz"
            games.write_bytes(b"synthetic compact games")
            self.write(self.directory / f"games-{month}.json", {"complete": True, "run": "full", "app": "original-app",
                "month": month, "streamVersion": self.original["files"]["stream.py"], "kept": 30,
                "outputSha256": freeze.digest(games)})
            raw = self.directory / f"positions-{month}.jsonl.gz"
            raw.write_bytes(b"synthetic compact positions")
            common = {"complete": True, "run": "full", "datasetKind": "amended", "app": "original-app", "month": month}
            self.write(self.directory / f"positions-{month}.json", {**common, "games": 30, "keptPositions": 2, "outputSha256": freeze.digest(raw)})
            for shard in (0, 1):
                path = self.directory / f"scored-{month}-{shard}-of-2.json"
                self.write(path, {**common, "status": "complete", "timing": False, "shards": 2, "shard": shard,
                    "rows": 1, "expectedRows": 1, "inputSha256": freeze.digest(raw),
                    "scorerVersion": self.original["files"]["score.mjs"]})
                path.with_suffix(".jsonl").write_text('{"synthetic":true}\n')
        for shard in (0, 1):
            self.write(self.directory / f"tablebase-{shard}-of-2.json", {})

    def write(self, path, value):
        path.write_text(json.dumps(value))

    def test_freeze_uses_original_pin_and_hashes_private_inputs_without_identifiers(self):
        inputs = freeze.input_snapshot(self.project, self.directory)
        self.write(self.project / "null-input-manifest.json", inputs)
        result = freeze.snapshot(self.project)
        self.assertEqual(result["app"], "original-app")
        self.assertEqual(result["records"], "original-records")
        self.assertEqual(len(inputs["files"]), 26)
        self.assertTrue(all(len(value) == 64 for value in inputs["files"].values()))
        self.assertIn("results/rules.json", result["originalFiles"])
        self.assertIn("null-score.mjs", result["newFiles"])
        self.assertNotIn("later-app", json.dumps(result))

    def test_changed_original_rule_or_source_is_rejected(self):
        path = self.project / "old.mjs"
        path.write_text("changed")
        with self.assertRaisesRegex(ValueError, "source changed"):
            freeze.original_snapshot(self.project)
        path.write_text("old source")
        path = self.project / "README.md"
        path.write_text(path.read_text().replace("Original ending.", "Changed ending."))
        with self.assertRaisesRegex(ValueError, "original rule"):
            freeze.original_snapshot(self.project)

    def test_incomplete_original_score_cannot_be_frozen(self):
        path = self.directory / "scored-2026-09-0-of-2.json"
        meta = json.loads(path.read_text())
        meta["complete"] = False
        self.write(path, meta)
        with self.assertRaisesRegex(ValueError, "incomplete"):
            freeze.input_snapshot(self.project, self.directory)

    def test_manifest_verification_checks_committed_files_and_input_snapshot(self):
        inputs = freeze.input_snapshot(self.project, self.directory)
        self.write(self.project / "null-input-manifest.json", inputs)
        saved = freeze.snapshot(self.project)
        self.write(self.project / "null-manifest.json", saved)
        with patch.object(freeze, "MANIFEST", self.project / "null-manifest.json"), \
                patch.object(freeze, "INPUT_MANIFEST", self.project / "null-input-manifest.json"), \
                patch.object(freeze, "snapshot", return_value=saved), \
                patch.object(freeze, "input_snapshot", return_value=inputs) as check_inputs, \
                patch.object(freeze, "require_committed_file") as committed:
            self.assertEqual(freeze.verify_manifest(), saved)
            self.assertEqual(committed.call_count, 2)
            check_inputs.assert_called_once()
            with patch.object(freeze, "input_snapshot", return_value={"changed": True}):
                with self.assertRaisesRegex(ValueError, "private input changed"):
                    freeze.verify_manifest()


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="rules-null-runner-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        (self.directory / "logs").mkdir()
        self.manifest = self.directory / "null-manifest.json"
        self.manifest.write_text("synthetic content manifest")
        self.frozen = {"app": "original-app", "records": "original-records", "newFiles": {"null-score.mjs": "scorer-content"}}
        for name, value in (("DIRECTORY", self.directory), ("MANIFEST", self.manifest)):
            patcher = patch.object(runner, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        runner.STOP.clear()
        runner.CHILDREN.clear()
        runner.SIGNAL_RECEIVED = False
        runner.RUN_LOCK_FD = None
        self.addCleanup(runner.STOP.clear)
        self.addCleanup(runner.CHILDREN.clear)

    def test_month_order_then_analysis_and_examples(self):
        with patch.object(runner, "run_stage") as stage:
            runner.run_pipeline()
        self.assertEqual([call.args for call in stage.call_args_list],
                         [("score", "2026-09"), ("score", "2026-07"), ("score", "2026-08"), ("analysis",), ("examples",)])

    def test_detached_driver_has_own_session_and_file_output(self):
        captured = {}
        class Process:
            pid = 12345
            def poll(self):
                return None
        def launch(command, **kwargs):
            captured.update(command=command, **kwargs)
            kwargs["stdout"].write(b"driver output\n")
            runner.atomic_json(self.directory / "driver.json", {"pid": Process.pid, "status": "running"})
            return Process()
        with patch.object(runner.subprocess, "Popen", side_effect=launch), \
                patch.object(runner, "LAB", self.directory), contextlib.redirect_stdout(io.StringIO()):
            runner.launch_detached()
        self.assertTrue(captured["start_new_session"])
        self.assertTrue(captured["close_fds"])
        self.assertEqual(captured["stdin"], runner.subprocess.DEVNULL)
        self.assertEqual(captured["stderr"], runner.subprocess.STDOUT)
        self.assertNotIn("--detach", captured["command"])
        self.assertNotIn("nice", captured["command"])
        self.assertEqual(next((self.directory / "logs").glob("driver-*.log")).read_text(), "driver output\n")

    def test_stage_failure_cleans_group_and_does_not_retry(self):
        class Process:
            pid = 12345
            def wait(self, **_kwargs):
                return 9
        with patch.object(runner, "verify_manifest", return_value=self.frozen), \
                patch.object(runner, "score_complete", return_value=False), \
                patch.object(runner.subprocess, "Popen", return_value=Process()) as launch, \
                patch.object(runner, "stop_group") as stop_group, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError):
                runner.run_stage("score", "2026-09")
        command = launch.call_args.args[0]
        self.assertNotIn("nice", command)
        self.assertEqual(command[-2:], ["--pool", "2"])
        self.assertEqual(launch.call_args.kwargs["env"]["CHESS_DIR"], str(runner.LAB / ".cache/chess/original-app"))
        self.assertTrue(launch.call_args.kwargs["start_new_session"])
        self.assertEqual(launch.call_count, 1)
        stop_group.assert_called_once_with(Process.pid)
        events = [json.loads(line) for line in (self.directory / "stage-events.jsonl").read_text().splitlines()]
        self.assertEqual([row["event"] for row in events], ["started", "stopped"])
        self.assertEqual(events[-1]["stopReason"], "stage-failure")
        self.assertFalse(runner.CHILDREN)

    def test_signal_cleans_active_group_before_waiting_for_exit(self):
        class Process:
            pid = 12345
            calls = 0
            def wait(self, **_kwargs):
                self.calls += 1
                if self.calls == 1:
                    runner.STOP.set()
                    runner.SIGNAL_RECEIVED = True
                    raise runner.subprocess.TimeoutExpired("synthetic", .5)
                return -15
        with patch.object(runner, "verify_manifest", return_value=self.frozen), \
                patch.object(runner, "score_complete", return_value=False), \
                patch.object(runner.subprocess, "Popen", return_value=Process()), \
                patch.object(runner, "stop_group") as stop_group, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(InterruptedError):
                runner.run_stage("score", "2026-09")
        self.assertGreaterEqual(stop_group.call_count, 1)
        self.assertFalse(runner.CHILDREN)

    def test_complete_shard_requires_matching_frozen_addition(self):
        for shard in (0, 1):
            path = self.directory / f"scored-2026-09-{shard}-of-2.json"
            path.with_suffix(".jsonl").write_text("{}\n")
            meta = {"complete": True, "datasetKind": "null-addition", "app": "original-app", "month": "2026-09",
                    "shard": shard, "shards": 2, "status": "complete", "scorerVersion": "scorer-content",
                    "additionManifestSha256": freeze.digest(self.manifest), "rows": 1, "expectedRows": 1,
                    "outputSha256": freeze.digest(path.with_suffix(".jsonl"))}
            path.write_text(json.dumps(meta))
        self.assertTrue(runner.score_complete("2026-09", self.frozen))
        path.write_text(json.dumps({**meta, "app": "later-current-pin"}))
        with self.assertRaisesRegex(ValueError, "provenance"):
            runner.score_complete("2026-09", self.frozen)

    def test_stage_parent_inherits_lock_descriptor(self):
        class Process:
            pid = 12345
            def wait(self, **_kwargs):
                return 0
        runner.RUN_LOCK_FD = 123
        with patch.object(runner, "verify_manifest", return_value=self.frozen), \
                patch.object(runner, "score_complete", return_value=False), \
                patch.object(runner.subprocess, "Popen", return_value=Process()) as launch, \
                contextlib.redirect_stdout(io.StringIO()):
            runner.run_stage("analysis")
        self.assertEqual(launch.call_args.kwargs["pass_fds"], (123,))
        self.assertEqual(launch.call_args.args[0][:3], ["nice", "-n", "10"])
        runner.RUN_LOCK_FD = None

    def test_adjusted_driver_priority_is_rejected_before_verification(self):
        with patch.object(runner.os, "getpriority", return_value=10), \
                patch.object(runner, "verify_manifest") as verify, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                runner.main(["--reviewed"])
        verify.assert_not_called()


if __name__ == "__main__":
    unittest.main()
