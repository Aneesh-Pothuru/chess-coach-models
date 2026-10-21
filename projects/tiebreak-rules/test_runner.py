#!/usr/bin/env python3
"""Synthetic byte, process, power and cost tests. No real game is parsed."""
from __future__ import annotations

import contextlib
from datetime import datetime
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import freeze
import run as runner
import timing


def stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class FreezeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tiebreak-freeze-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.games = self.root / "games"
        self.games.mkdir()
        for month in freeze.MONTHS:
            raw = self.games / f"games-{month}.jsonl.gz"
            raw.write_bytes(b"\xff\x00not gzip or JSON; the freezer must never decode this\n")
            (self.games / f"games-{month}.json").write_text(json.dumps({"complete": True, "month": month,
                "run": "full", "app": freeze.SOURCE_APP, "cap": 30000, "kept": 30000,
                "outputSha256": freeze.digest(raw)}))

    def test_input_freeze_reads_only_bytes_and_summaries(self):
        result = freeze.input_snapshot(self.games)
        self.assertEqual(len(result["files"]), 6)
        self.assertTrue(all(m["games"] == 30000 for m in result["months"].values()))
        self.assertNotIn("not gzip", json.dumps(result))

    def test_stream_mutation_is_caught_before_parsing(self):
        (self.games / "games-2026-07.jsonl.gz").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "content hash"):
            freeze.input_snapshot(self.games)

    def test_incomplete_source_is_rejected(self):
        path = self.games / "games-2026-07.json"
        data = json.loads(path.read_text()); data["complete"] = False; path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            freeze.input_snapshot(self.games)

    def test_dependency_tree_tracks_actual_bytes(self):
        dependency = self.root / "deps"; dependency.mkdir()
        (dependency / "code.js").write_text("before")
        link = self.root / "link"; link.symlink_to(dependency, target_is_directory=True)
        before = freeze.tree_snapshot(link, self.root)
        (dependency / "code.js").write_text("after")
        after = freeze.tree_snapshot(link, self.root)
        self.assertEqual(before["files"], 1)
        self.assertNotEqual(before["contentSha256"], after["contentSha256"])

    def test_dependency_cycle_rejected_external_link_frozen_without_following(self):
        dependency = self.root / "deps"; dependency.mkdir()
        (dependency / "loop").symlink_to(dependency, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "cycle"):
            freeze.tree_snapshot(dependency, self.root)
        (dependency / "loop").unlink()
        (dependency / "regular.js").write_text("inside")
        (dependency / "outside").symlink_to("/tmp")
        result = freeze.tree_snapshot(dependency, self.root)
        self.assertEqual(result["linkCounts"], {"external": 1})
        self.assertEqual(result["untraversedLinks"]["outside"]["kind"], "external")

    def test_external_link_target_is_never_statted_or_read(self):
        dependency = self.root / "deps"; dependency.mkdir()
        (dependency / "regular.js").write_text("inside")
        outside = self.root.parent / "must-not-be-read-external-fixture"
        (dependency / "outside").symlink_to(outside)
        original_lstat = Path.lstat
        def confined_stat(path, *args, **kwargs):
            self.assertTrue(path.is_relative_to(self.root), f"external stat attempted: {path}")
            return original_lstat(path, *args, **kwargs)
        with patch.object(Path, "lstat", confined_stat), patch.object(freeze, "digest", wraps=freeze.digest) as hashing:
            result = freeze.tree_snapshot(dependency, self.root)
        self.assertTrue(all(call.args[0].is_relative_to(self.root) for call in hashing.call_args_list))
        self.assertNotIn(str(outside), json.dumps(result))
        self.assertEqual(result["linkCounts"]["external"], 1)

    def test_dangling_internal_link_is_bound_by_its_text(self):
        dependency = self.root / "deps"; dependency.mkdir()
        (dependency / "regular.js").write_text("inside")
        link = dependency / "missing"
        link.symlink_to("missing-one")
        before = freeze.tree_snapshot(dependency, self.root)
        self.assertEqual(before["linkCounts"]["dangling-internal"], 1)
        link.unlink(); link.symlink_to("missing-two")
        self.assertNotEqual(before["contentSha256"], freeze.tree_snapshot(dependency, self.root)["contentSha256"])

    def test_required_engine_or_model_asset_cannot_be_external(self):
        asset = self.root / "asset"
        asset.symlink_to("/tmp/unread-external-asset")
        with self.assertRaisesRegex(ValueError, "inside the clone"):
            freeze.confined_digest(asset, self.root)

    def test_parent_step_does_not_hide_an_external_link(self):
        dependency = self.root / "deps"; dependency.mkdir()
        (dependency / "regular.js").write_text("inside")
        (dependency / "outside").symlink_to("/tmp/unread-external-parent")
        (dependency / "indirect").symlink_to("outside/../regular.js")
        result = freeze.tree_snapshot(dependency, self.root)
        self.assertEqual(result["linkCounts"]["external"], 2)
        self.assertEqual(result["files"], 1)

    def test_committed_gate_has_explicit_timing_exception(self):
        saved = {"same": True}
        with patch.object(freeze, "read_json", return_value=saved), patch.object(freeze, "snapshot", return_value=saved), \
                patch.object(freeze, "input_snapshot", return_value=saved), patch.object(freeze, "require_committed_file") as committed:
            freeze.verify_manifest(require_committed=False)
            committed.assert_not_called()
            freeze.verify_manifest()
            self.assertEqual(committed.call_count, 2)
            with patch.object(freeze, "snapshot", return_value={"changed": True}):
                with self.assertRaisesRegex(ValueError, "differs from its freeze"):
                    freeze.verify_manifest(require_committed=False)


class ClockAndPowerTests(unittest.TestCase):
    def tearDown(self):
        runner.STOP.clear(); runner.POWER_DONE.clear()

    def test_cutoff_and_resume_are_utc_half_open(self):
        for value, blocked in (("2026-10-21T12:59:49.999Z", False), ("2026-10-21T12:59:50Z", True),
                               ("2026-10-21T15:29:59.999Z", True), ("2026-10-21T15:30:00Z", False),
                               ("2026-10-21T06:00:00-07:00", True)):
            self.assertEqual(runner.blocked_at(stamp(value)), blocked)
        with self.assertRaises(ValueError):
            runner.blocked_at(datetime(2026, 10, 21, 13))

    def test_blackout_wait_performs_no_stage_work(self):
        runner.STOP.clear()
        with patch.object(runner, "utc_now", side_effect=[stamp("2026-10-21T13:00:00Z")]*2 + [stamp("2026-10-21T15:30:00Z")]), \
                patch.object(runner, "event") as events, patch.object(runner.STOP, "wait", return_value=False):
            runner.await_open_window()
        self.assertEqual([c.args[0]["event"] for c in events.call_args_list], ["blackout-wait", "blackout-ended"])

    def test_ac_and_open_lid_both_required(self):
        for values, safe in (((True, True), True), ((False, True), False), ((True, False), False)):
            with patch.object(runner, "power_reading", return_value={"onAC": values[0], "lidOpen": values[1]}), \
                    patch.object(runner, "record_power"):
                if safe:
                    runner.require_safe_power()
                else:
                    with self.assertRaisesRegex(ValueError, "AC power"):
                        runner.require_safe_power()

    def test_only_bounded_timing_allows_battery_with_open_lid(self):
        self.assertFalse(runner.safe_power({"onAC": False, "lidOpen": True}, False))
        self.assertTrue(runner.safe_power({"onAC": False, "lidOpen": True}, True))
        self.assertFalse(runner.safe_power({"onAC": False, "lidOpen": False}, True))

    def test_unreadable_power_is_not_allowed_as_timing_battery(self):
        for battery, lid in (("unrecognized", '"AppleClamshellState" = No'),
                             ("Now drawing from 'Battery Power'", "missing lid")):
            with patch.object(runner.subprocess, "check_output", side_effect=[battery, lid]):
                with self.assertRaisesRegex(ValueError, "unreadable"):
                    runner.power_reading()

    def test_macos_assertion_is_an_owned_child_not_parent(self):
        entry = runner.PROJECT / "run.py"
        rows = f"100 1 Python {entry} --driver\n101 100 /usr/bin/caffeinate -s -i Python {entry} --driver\n102 1 /usr/bin/caffeinate -s -i unrelated\n"
        self.assertEqual(runner.caffeinate_child(rows, 100), 101)
        with self.assertRaisesRegex(ValueError, "owned caffeinate"):
            runner.caffeinate_child(rows, 999)
        with self.assertRaisesRegex(ValueError, "owned caffeinate"):
            runner.caffeinate_child(rows.replace("-s -i", "-i"), 100)

    def test_loss_of_assertion_stops_even_on_safe_power(self):
        with patch.object(runner.POWER_DONE, "wait", return_value=False), \
                patch.object(runner, "power_reading", return_value={"onAC": True, "lidOpen": True}), \
                patch.object(runner, "record_power"), patch.object(runner, "assertion_alive", return_value=False), \
                patch.object(runner, "event"), patch.object(runner, "request_stop") as stop:
            runner.monitor_power()
        stop.assert_called_once_with("awake-assertion-missing")

    def test_power_monitor_stops_after_ac_loss(self):
        with patch.object(runner.POWER_DONE, "wait", return_value=False), \
                patch.object(runner, "power_reading", return_value={"onAC": False, "lidOpen": True}), \
                patch.object(runner, "record_power"), patch.object(runner, "event"), patch.object(runner, "request_stop") as stop:
            runner.monitor_power()
        stop.assert_called_once_with("power-unsafe")

    def test_missing_power_state_stops_for_review(self):
        with patch.object(runner.POWER_DONE, "wait", return_value=False), \
                patch.object(runner, "power_reading", side_effect=subprocess.TimeoutExpired("pmset", 5)), \
                patch.object(runner, "event"), patch.object(runner, "request_stop") as stop:
            runner.monitor_power()
        stop.assert_called_once_with("power-unsafe")


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tiebreak-runner-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "logs").mkdir()
        runner.STOP.clear(); runner.POWER_DONE.clear(); runner.CHILDREN.clear()
        for name, value in (("DIRECTORY", self.root), ("PRIVATE", self.root), ("LOCK_FD", 101),
                            ("TIMING", False), ("LIMIT", None), ("STOP_REASON", None)):
            p = patch.object(runner, name, value); p.start(); self.addCleanup(p.stop)
        self.addCleanup(runner.STOP.clear)

    def test_full_and_timing_routes(self):
        with patch.object(runner, "run_stage") as stage:
            runner.run_pipeline()
        expected = [pair for m in freeze.MONTHS for pair in (("scan", m), ("select", m))]
        expected += [("score", m) for m in freeze.MONTHS] + [("analysis",), ("examples",)]
        self.assertEqual([c.args for c in stage.call_args_list], expected)
        with patch.object(runner, "TIMING", True), patch.object(runner, "run_stage") as stage:
            runner.run_pipeline()
        self.assertEqual([c.args for c in stage.call_args_list], [("scan", "2026-07"), ("select", "2026-07"), ("timing",)])

    def test_nice_is_applied_once(self):
        for stage in ("scan", "score"):
            command = runner.stage_command(stage, "2026-09")
            self.assertNotEqual(command[0], "nice")
            self.assertEqual(command[-2:], ["--pool", "2"])
            self.assertIn("--reviewed", command)
        self.assertEqual(runner.stage_command("analysis", None)[:3], ["nice", "-n", "10"])
        self.assertEqual(runner.stage_command("select", "2026-09")[:3], ["nice", "-n", "10"])

    def test_timing_command_cannot_score_or_change_month(self):
        with patch.object(runner, "TIMING", True), patch.object(runner, "LIMIT", 300):
            command = runner.stage_command("scan", "2026-07")
            self.assertIn("--timing", command); self.assertNotIn("--reviewed", command)
            with self.assertRaisesRegex(ValueError, "cannot score"):
                runner.stage_command("score", "2026-07")
            with self.assertRaisesRegex(ValueError, "another month"):
                runner.stage_command("scan", "2026-08")

    def test_gate_precedes_any_frozen_input_read(self):
        with patch.object(runner, "verify_manifest") as verify, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                runner.main([])
            with self.assertRaises(SystemExit):
                runner.main(["--timing", "--limit", "601"])
        verify.assert_not_called()

    def stage_context(self, process):
        stack = contextlib.ExitStack()
        for name, value in (("verify_manifest", {"app": freeze.APP}), ("stage_complete", False),
                            ("utc_now", stamp("2026-10-21T16:00:00Z"))):
            stack.enter_context(patch.object(runner, name, return_value=value))
        for name in ("await_open_window", "require_safe_power", "stop_group", "atomic_json", "event"):
            stack.enter_context(patch.object(runner, name))
        popen = stack.enter_context(patch.object(runner.subprocess, "Popen", return_value=process))
        return stack, popen

    def test_stage_detaches_and_logs_without_pipe(self):
        process = Mock(pid=99991, wait=Mock(return_value=0))
        context, popen = self.stage_context(process)
        with context:
            runner.run_stage("scan", "2026-09")
        kwargs = popen.call_args.kwargs
        self.assertTrue(kwargs["start_new_session"])
        self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
        self.assertEqual(kwargs["pass_fds"], (101,))
        self.assertTrue(kwargs["stdout"].name.startswith(str(self.root / "logs")))
        self.assertTrue(kwargs["env"]["CHESS_DIR"].endswith(freeze.APP))

    def test_ordinary_stage_failure_does_not_auto_retry(self):
        process = Mock(pid=99991, wait=Mock(return_value=1))
        context, popen = self.stage_context(process)
        with context:
            with self.assertRaisesRegex(RuntimeError, "review"):
                runner.run_stage("score", "2026-09")
        self.assertEqual(popen.call_count, 1)

    def test_scheduled_exit_resumes_same_stage(self):
        process = Mock(pid=99991, wait=Mock(side_effect=[75, 0]))
        context, popen = self.stage_context(process)
        with context:
            runner.run_stage("scan", "2026-09")
        self.assertEqual(popen.call_count, 2)

    def test_orphan_group_refuses_launch_without_killing(self):
        (self.root / "active-stage.json").write_text(json.dumps({"pgid": 99991}))
        with patch.object(runner.os, "killpg") as signal_group:
            with self.assertRaisesRegex(RuntimeError, "previous stage"):
                runner.require_no_orphans()
        signal_group.assert_called_once_with(99991, 0)

    def test_group_shutdown_escalates_after_grace(self):
        with patch.object(runner.os, "killpg") as signal_group, \
                patch.object(runner.time, "monotonic", side_effect=[0, 4]), \
                patch.object(runner, "utc_now", return_value=stamp("2026-10-21T16:00:00Z")):
            runner.stop_group(99991)
        self.assertEqual([c.args[1] for c in signal_group.call_args_list], [runner.signal.SIGTERM, runner.signal.SIGKILL])


class TimingTests(unittest.TestCase):
    def fixture(self):
        coverage = {"games": 100, "units": {u: {"gamesWithSplit": 20, "kept": 20,
                                               "followFirst": 10, "breakFirst": 10} for u in timing.UNITS}}
        selection = {"coverage": coverage, "unitRows": 160, "rows": 80}
        reference = {"workers": {"scored": {m: {"completedRowTotals": {"engineSeconds": 100, "newGameSeconds": 10,
                         "bestCalls": 100, "scoreCalls": 100}} for m in freeze.MONTHS}}}
        return selection, reference

    def test_cost_caps_units_and_keeps_engine_reference_separate(self):
        selection, reference = self.fixture()
        result = timing.estimate(selection, {"maiaSeconds": 80}, 100, reference, {m: 30000 for m in freeze.MONTHS})
        self.assertEqual(result["projectedUnitRows"], 8 * 3000 * 3)
        self.assertEqual(result["referenceSecondsPerSearch"], 0.5)
        self.assertEqual(result["scenarios"]["observedJulySharing"]["projectedGroupedPositions"], 36000)
        self.assertEqual(result["scanWorkerSeconds"], 90000)
        self.assertIsNone(result["tablebaseNetworkSeconds"])
        self.assertIsNone(result["calendarHours"])

    def test_zero_draws_keep_sharing_undefined(self):
        selection, reference = self.fixture()
        selection["unitRows"] = selection["rows"] = 0
        for row in selection["coverage"]["units"].values():
            row.update(gamesWithSplit=0, kept=0, followFirst=0, breakFirst=0)
        result = timing.estimate(selection, {}, 100, reference, {m: 30000 for m in freeze.MONTHS})
        self.assertIsNone(result["observedGroupedPositionPerUnitRow"])
        self.assertIsNone(result["scenarios"]["observedJulySharing"]["totalWorkerSeconds"])

    def test_cost_refuses_incomplete_coverage(self):
        selection, reference = self.fixture()
        selection["coverage"]["units"].pop("hang")
        with self.assertRaisesRegex(ValueError, "coverage"):
            timing.estimate(selection, {}, 100, reference, {m: 30000 for m in freeze.MONTHS})

    def test_completed_event_prefix_ignores_report_stage_appends(self):
        with tempfile.TemporaryDirectory(prefix="tiebreak-stage-times-", dir="/tmp") as directory:
            path = Path(directory) / "events.jsonl"
            events = []
            for index, stage in enumerate(("scan", "select")):
                events += [{"event": "started", "stage": stage, "month": "2026-07", "attempt": stage,
                            "at": f"2026-01-01T00:00:{index*10:02d}Z"},
                           {"event": "completed", "stage": stage, "month": "2026-07", "attempt": stage,
                            "at": f"2026-01-01T00:00:{index*10+5:02d}Z", "seconds": 5}]
            path.write_text("".join(json.dumps(e) + "\n" for e in events))
            with patch.object(timing, "LAB", Path(directory)):
                before = timing.stage_times(path)
                with path.open("a") as out:
                    out.write(json.dumps({"event": "started", "stage": "timing", "at": "2026-01-01T00:00:20Z"}) + "\n")
                self.assertEqual(before, timing.stage_times(path))

    def test_resumed_missing_terminal_preserves_unknown_seconds(self):
        with tempfile.TemporaryDirectory(prefix="tiebreak-stage-times-", dir="/tmp") as directory:
            path = Path(directory) / "events.jsonl"
            events = [{"event": "started", "stage": "scan", "month": "2026-07", "attempt": "old", "at": "2026-01-01T00:00:00Z"}]
            for index, stage in enumerate(("scan", "select")):
                events += [{"event": "started", "stage": stage, "month": "2026-07", "attempt": stage,
                            "at": f"2026-01-01T00:00:{index*10+10:02d}Z"},
                           {"event": "completed", "stage": stage, "month": "2026-07", "attempt": stage,
                            "at": f"2026-01-01T00:00:{index*10+15:02d}Z", "seconds": 5}]
            path.write_text("".join(json.dumps(e) + "\n" for e in events))
            with patch.object(timing, "LAB", Path(directory)):
                result, _ = timing.stage_times(path)
            self.assertIsNone(result["scan"]["utcSeconds"])
            self.assertEqual(result["scan"]["knownUtcSeconds"], 5)
            self.assertEqual(result["scan"]["unknownAttempts"], 1)


if __name__ == "__main__":
    unittest.main()
