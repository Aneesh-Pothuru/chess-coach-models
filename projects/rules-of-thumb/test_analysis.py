#!/usr/bin/env python3
"""Synthetic only. This test suite never reads private games or scores."""
from __future__ import annotations

from copy import deepcopy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

import numpy as np

SPEC = importlib.util.spec_from_file_location("rules_analysis", Path(__file__).with_name("analyze.py"))
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)


def estimate(value, lo=None, hi=None):
    return {"value": value, "lo": lo, "hi": hi}


def row(i=0, month="2026-07", rule="open-file", bad=False, band=1300, **splits):
    return {
        "datasetKind": "amended",
        "game": f"synthetic-{month}-{i}", "month": month, "rule": rule,
        "band": band, "opponentBand": 1300, "R": "a1a2", "N": "a1a2", "A": "a1a2",
        "ruleMoves": ["a1a2"], "fen": "synthetic", "ply": 30,
        "sound": {"R": not bad, "N": not bad, "A": not bad}, "probabilityRAtHisBand": .25,
        "splits": {"opponentThreat": False, "material": "level", "phase": "middlegame",
                   "forcing": False, "kingDanger": False, **splits},
    }


def manifest(month, games=0):
    available = {"positions": games, "rules": {rule: games if rule == "open-file" else 0 for rule in A.RULES}}
    empty = {"positions": 0, "rules": {rule: 0 for rule in A.RULES}}
    def comparison(counts):
        return {
            "rules": {rule: {"originalGainPositions": counts.get(rule, 0), "amendedPositions": counts.get(rule, 0),
                             "gainedPositions": 0, "lostPositions": 0} for rule in A.ORIGINAL_RULES},
            "noteSideFilter": {rule: {"rawNotePositions": 0, "sideFilteredPositions": 0, "removedPositions": 0,
                                     "rawNoteMoves": 0, "sideFilteredMoves": 0}
                               for rule in ("lucena", "philidor")},
        }
    amendments = comparison(available["rules"])
    amendments["byBand"] = {"1300": comparison(available["rules"]), "1500": comparison(empty["rules"])}
    return {"app": "synthetic-app", "month": month, "complete": True, "run": "full", "datasetKind": "amended",
            "games": games, "positions": games, "kept": dict(available["rules"]),
            "amendmentComparison": amendments,
            "availability": {"all": available, "byBand": {"1300": deepcopy(available), "1500": empty}}}


class BootstrapTests(unittest.TestCase):
    def test_fixed_seed_and_fixed_number_of_games(self):
        first = A.GameBootstrap(["a", "b", "c"], draws=30, seed=11)
        second = A.GameBootstrap(["a", "b", "c"], draws=30, seed=11)
        np.testing.assert_array_equal(first.weights, second.weights)
        np.testing.assert_array_equal(first.weights.sum(axis=1), np.full(30, 3))
        self.assertTrue(np.any(first.weights > 1))

    def test_clustered_rows_use_the_same_multiplicity(self):
        boot = A.GameBootstrap(["a", "a", "b"], draws=50, seed=17)
        point, draws = boot.mean(np.array([0., 1., 0.]))
        self.assertEqual(point, 1 / 3)
        expected = boot.weights[:, 0] / (2 * boot.weights[:, 0] + boot.weights[:, 1])
        np.testing.assert_array_equal(draws, expected)

    def test_paired_identical_moves_have_exact_zero_lift(self):
        rows = [row(i, bad=i % 3 == 0) for i in range(12)]
        output = A.summarize_period(rows, draws=50)
        self.assertEqual(output["lift"]["value"], 0)
        self.assertEqual(output["lift"]["lo"], 0)
        self.assertEqual(output["lift"]["hi"], 0)

    def test_percentile_and_empty_draws(self):
        output = A.interval(5, [0., 10., np.nan])
        self.assertEqual((output["lo"], output["hi"]), (.25, 9.75))
        self.assertEqual(output["undefinedDraws"], 1)
        self.assertEqual(output["validDraws"], 2)
        output = A.interval(None, [np.nan, np.nan])
        self.assertIsNone(output["lo"])
        self.assertIsNone(output["value"])

    def test_band_difference_uses_shared_draws(self):
        rows = [row(i, band=1300 if i < 6 else 1500) for i in range(12)]
        for item in rows[:6]:
            item["A"] = "b1b2"
        output = A.summarize_period(rows, draws=100)
        difference = output["adoptionDifferenceAboveMinusHis"]
        self.assertEqual(difference["value"], 1)
        self.assertEqual(difference["lo"], 1)
        self.assertEqual(difference["hi"], 1)

    def test_no_data_yields_null_and_no_failure(self):
        output = A.summarize_period([], draws=10)
        self.assertEqual(output["positions"], 0)
        self.assertIsNone(output["lift"]["value"])
        self.assertFalse(A.failure_condition(output["lift"], output["lift"]))


class RuleTests(unittest.TestCase):
    def test_verdict_requires_both_periods_and_strict_endpoints(self):
        up = estimate(.2, .1, .3)
        down = estimate(-.2, -.3, -.1)
        zero = estimate(.1, 0, .2)
        self.assertEqual(A.verdict(up, up, 300), "Teach it")
        self.assertEqual(A.verdict(down, down, 300), "It misleads")
        self.assertEqual(A.verdict(up, down, 300), "No better than the natural move")
        self.assertEqual(A.verdict(up, zero, 300), "No better than the natural move")
        self.assertEqual(A.verdict(up, up, 299), "not enough data (n=299)")
        self.assertEqual(A.verdict(down, down, 0), "not enough data (n=0)")

    def test_step_up_requires_both_intervals(self):
        self.assertTrue(A.step_up(estimate(.2, .1, .3), estimate(.1, .01, .2)))
        self.assertFalse(A.step_up(estimate(.2, .1, .3), estimate(.1, 0, .2)))
        self.assertFalse(A.step_up(estimate(.2, .1, .3), estimate(None)))

    def test_failure_threshold_is_inclusive_and_interval_strict(self):
        at = estimate(-.1, -.2, -.01)
        self.assertTrue(A.failure_condition(at, at))
        self.assertTrue(A.failure_condition(estimate(.8 - .9, -.2, -.01), at))
        self.assertFalse(A.failure_condition(estimate(-.09999, -.2, -.01), at))
        self.assertFalse(A.failure_condition(estimate(-.2, -.4, 0), at))
        self.assertFalse(A.failure_condition(estimate(None), at))

    def test_material_cell_compares_with_both_other_cells(self):
        rows = [row(0, bad=True, material="behind"), row(1, bad=False, material="level"),
                row(2, bad=True, material="ahead")]
        output = A.summarize_period(rows, draws=30)
        behind = output["splits"]["material"]["behind"]
        self.assertEqual((behind["positions"], behind["restPositions"]), (1, 2))
        self.assertEqual(behind["difference"]["value"], -.5)

    def test_report_includes_every_rule_and_pools_train_months(self):
        rows = [row(0), row(0, month="2026-08"), row(0, month="2026-09")]
        manifests = [manifest(month, 1) for month in A.MONTHS]
        output = A.analyze(rows, manifests, "synthetic-app", draws=20)
        self.assertEqual(list(output["rules"]), list(A.RULES))
        self.assertEqual(len(output["rules"]), 15)
        self.assertNotIn("bishop-pair", output["rules"])
        self.assertNotIn("king-shelter", output["rules"])
        self.assertEqual(output["rules"]["open-file"]["train"]["positions"], 2)
        self.assertEqual(output["rules"]["open-file"]["heldout"]["positions"], 1)
        self.assertEqual(output["rules"]["open-file"]["countsByMonth"]["2026-07"]["scoredPositions"], 1)
        self.assertEqual(output["rules"]["active-king"]["verdict"], "not enough data (n=0)")
        # The export contains only aggregates: no synthetic game ids or FENs.
        text = json.dumps(output, allow_nan=False)
        self.assertNotIn("synthetic-2026", text)
        self.assertNotIn('"fen"', text)
        self.assertIn("open-file", A.markdown(output))

    def test_old_datasets_and_removed_rules_cannot_be_analyzed(self):
        rows = [row()]
        manifests = [manifest(month, 1) for month in A.MONTHS]
        for kind in ("literal", "alternative", None):
            rows[0]["datasetKind"] = kind
            with self.assertRaisesRegex(ValueError, "amended"):
                A.analyze(rows, manifests, "synthetic-app", draws=10)
        rows[0]["datasetKind"] = "amended"
        for kind in ("literal", "alternative", None):
            manifests[1]["datasetKind"] = kind
            with self.assertRaisesRegex(ValueError, "amended"):
                A.analyze(rows, manifests, "synthetic-app", draws=10)
        manifests[1]["datasetKind"] = "amended"
        for rule in ("bishop-pair", "king-shelter"):
            rows[0]["rule"] = rule
            with self.assertRaisesRegex(ValueError, "removed"):
                A.analyze(rows, manifests, "synthetic-app", draws=10)


class TreeTests(unittest.TestCase):
    def test_depth_two_categorical_tree(self):
        rows = []
        for i in range(24):
            danger, forcing = (i % 2 == 0), (i % 3 == 0)
            rows.append(row(i, bad=danger or forcing, kingDanger=danger, forcing=forcing))
        tree = A.fit_tree(rows)
        self.assertTrue(all(A.predict_tree(tree, item) == (not item["sound"]["R"]) for item in rows))
        def depth(node):
            return 0 if "feature" not in node else 1 + max(depth(node["yes"]), depth(node["no"]))
        self.assertEqual(depth(tree), 2)
        self.assertEqual(tree, A.fit_tree(list(reversed(rows))))

    def test_empty_and_tied_leaves(self):
        self.assertIsNone(A.predict_tree(A.fit_tree([]), row()))
        tree = A.fit_tree([row(0, bad=True), row(1)])
        self.assertFalse(tree["predictUnsound"])
        self.assertNotIn("feature", tree)

    def test_tree_uses_only_train(self):
        train = [row(0, bad=True), row(1, bad=True)]
        heldout = [row(2, month="2026-09"), row(3, month="2026-09")]
        output = A.tree_report(train, heldout, draws=20)
        self.assertTrue(output["tree"]["predictUnsound"])
        self.assertEqual(output["heldoutAccuracy"]["value"], 0)


class GateTests(unittest.TestCase):
    def test_command_requires_phase_two_before_reading_inputs(self):
        command = [sys.executable, str(Path(__file__).with_name("analyze.py")), "--run", "full"]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("analysis is disabled in phase 1", result.stderr)

    def test_committed_content_manifest_checked_before_private_data(self):
        verifier = mock.Mock(side_effect=ValueError("content manifest is not committed"))
        with mock.patch.dict(sys.modules, {"freeze": SimpleNamespace(verify_manifest=verifier)}):
            with mock.patch.object(A, "load_full") as loader:
                with self.assertRaisesRegex(ValueError, "not committed"):
                    A.main(["--run", "full", "--phase2-reviewed"])
                loader.assert_not_called()
        verifier.assert_called_once_with(require_committed=True)

    def build_synthetic_full(self, directory):
        versions = A.measurement_versions()
        for month in A.MONTHS:
            item = row(0, month=month)
            item.update(evidence={"syntheticTrace": "not needed by analysis"}, times={"seconds": 1})
            data = json.dumps(item) + "\n"
            compressed = gzip.compress(data.encode())
            (directory / f"positions-{month}.jsonl.gz").write_bytes(compressed)
            source_bytes = gzip.compress((json.dumps({"id": item["game"]}) + "\n").encode())
            (directory / f"games-{month}.jsonl.gz").write_bytes(source_bytes)
            scan = manifest(month, 1)
            scan.update(inputSha256=hashlib.sha256(source_bytes).hexdigest(), outputSha256=hashlib.sha256(compressed).hexdigest(),
                        capPerRule=4000, keptPositions=1, scannerVersion=versions["scannerVersion"])
            (directory / f"positions-{month}.json").write_text(json.dumps(scan))
            stream = {"month": month, "complete": True, "run": "full", "app": "synthetic-app", "kept": 1, "cap": 30000, "eof": True,
                      "streamVersion": versions["streamVersion"]}
            (directory / f"games-{month}.json").write_text(json.dumps(stream))
            (directory / f"scored-{month}-0-of-1.jsonl").write_text(data)
            signature = {"month": month, "complete": True, "run": "full", "timing": False, "app": "synthetic-app",
                         "datasetKind": "amended",
                         "shard": 0, "shards": 1, "rows": 1, "expectedRows": 1,
                         "scorerVersion": versions["scorerVersion"],
                         "inputSha256": hashlib.sha256(compressed).hexdigest(),
                         "keysSha256": hashlib.sha256(":".join(A.row_key(item)).encode()).hexdigest()}
            (directory / f"scored-{month}-0-of-1.json").write_text(json.dumps(signature))

    def test_complete_synthetic_input_loads_and_missing_row_refuses(self):
        with tempfile.TemporaryDirectory(prefix="rules-analysis-") as temp:
            directory = Path(temp)
            self.build_synthetic_full(directory)
            rows, manifests = A.load_full(directory, "synthetic-app")
            self.assertEqual(len(rows), 3)
            self.assertEqual(len(manifests), 3)
            self.assertTrue(all("evidence" not in item and "times" not in item for item in rows))
            (directory / "scored-2026-09-0-of-1.jsonl").write_text("")
            with self.assertRaisesRegex(ValueError, "row count mismatch"):
                A.load_full(directory, "synthetic-app")

    def test_partial_or_timing_manifest_refuses(self):
        for alteration in ({"complete": False}, {"timing": True}, {"app": "other"}):
            with tempfile.TemporaryDirectory(prefix="rules-analysis-") as temp:
                directory = Path(temp)
                self.build_synthetic_full(directory)
                path = directory / "scored-2026-09-0-of-1.json"
                value = json.loads(path.read_text())
                value.update(alteration)
                path.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    A.load_full(directory, "synthetic-app")

    def test_repeated_game_rule_refuses(self):
        with tempfile.TemporaryDirectory(prefix="rules-analysis-") as temp:
            directory = Path(temp)
            self.build_synthetic_full(directory)
            path = directory / "positions-2026-07.jsonl.gz"
            data = gzip.decompress(path.read_bytes())
            path.write_bytes(gzip.compress(data + data))
            with self.assertRaisesRegex(ValueError, "repeated game/rule"):
                A.load_full(directory, "synthetic-app")

    def test_input_and_cap_changes_refuse(self):
        for name, field, value in (("positions", "outputSha256", "changed"), ("positions", "capPerRule", 3999),
                                   ("games", "cap", 300), ("games", "eof", False)):
            with tempfile.TemporaryDirectory(prefix="rules-analysis-") as temp:
                directory = Path(temp)
                self.build_synthetic_full(directory)
                path = directory / f"{name}-2026-07.json"
                content = json.loads(path.read_text())
                content[field] = value
                path.write_text(json.dumps(content))
                with self.assertRaises(ValueError):
                    A.load_full(directory, "synthetic-app")

    def test_changed_measurement_code_refuses(self):
        for name, field in (("positions", "scannerVersion"), ("games", "streamVersion"), ("scored", "scorerVersion")):
            with tempfile.TemporaryDirectory(prefix="rules-analysis-") as temp:
                directory = Path(temp)
                self.build_synthetic_full(directory)
                suffix = "-0-of-1" if name == "scored" else ""
                path = directory / f"{name}-2026-09{suffix}.json"
                content = json.loads(path.read_text())
                content[field] = "old-code"
                path.write_text(json.dumps(content))
                with self.assertRaisesRegex(ValueError, "code changed"):
                    A.load_full(directory, "synthetic-app")

    def test_alternative_manifests_and_scored_rows_refuse(self):
        for target in ("positions", "scored", "scored-row"):
            with tempfile.TemporaryDirectory(prefix="rules-analysis-") as temp:
                directory = Path(temp)
                self.build_synthetic_full(directory)
                name = {"positions": "positions-2026-07.json", "scored": "scored-2026-07-0-of-1.json",
                        "scored-row": "scored-2026-07-0-of-1.jsonl"}[target]
                path = directory / name
                content = json.loads(path.read_text())
                content["datasetKind"] = "alternative"
                path.write_text(json.dumps(content) + "\n")
                with self.assertRaisesRegex(ValueError, "non-amended"):
                    A.load_full(directory, "synthetic-app")


class OperationalTests(unittest.TestCase):
    def test_prior_reviewer_stop_keeps_unknown_duration_and_backfill_time(self):
        events = [
            {"stage": "positions", "month": "2026-07", "attempt": "old", "event": "started"},
            {"stage": "positions", "month": "2026-07", "attempt": "old", "event": "stopped", "seconds": None,
             "stopReason": "reviewer-amendment-sigterm", "exitCode": -15, "terminationTimeKnown": False},
            {"stage": "positions", "month": "2026-07", "attempt": "new", "event": "started"},
            {"stage": "positions", "month": "2026-07", "attempt": "new", "event": "completed", "seconds": 20},
            {"stage": "backfill", "month": "2026-07", "attempt": "backfill", "event": "started"},
            {"stage": "backfill", "month": "2026-07", "attempt": "backfill", "event": "completed", "seconds": 30},
        ]
        result = A.stage_attempts(events)
        stopped = result["positions"]["2026-07"]
        self.assertEqual(stopped["stoppedJobs"], 1)
        self.assertEqual(stopped["unknownStoppedDurations"], 1)
        self.assertEqual(stopped["stopReasonCounts"], {"reviewer-amendment-sigterm": 1})
        self.assertIsNone(stopped["stoppedSeconds"])
        self.assertIsNone(stopped["cumulativeFinishedInvocationSeconds"])
        self.assertEqual(stopped["knownFinishedInvocationSeconds"], 20)
        self.assertEqual(result["backfill"]["2026-07"]["cumulativeFinishedInvocationSeconds"], 30)

    def test_stop_reasons_cannot_export_uncontrolled_text(self):
        events = [{"stage": "score", "month": "2026-07", "attempt": "x", "event": "started"},
                  {"stage": "score", "month": "2026-07", "attempt": "x", "event": "stopped", "seconds": 1,
                   "stopReason": "a private worker detail"}]
        result = A.stage_attempts(events)
        self.assertEqual(result["score"]["2026-07"]["stopReasonCounts"], {"other-or-unrecorded": 1})
        self.assertNotIn("private", json.dumps(result))

    def test_stopped_then_completed_attempts_and_backoffs(self):
        events = [
            {"stage": "stream", "month": "2026-07", "attempt": "first", "event": "started"},
            {"stage": "stream", "month": "2026-07", "attempt": "first", "event": "stopped", "seconds": 10, "exitCode": 1},
            {"stage": "stream", "month": "2026-07", "event": "restart-backoff", "seconds": 5},
            {"stage": "stream", "month": "2026-07", "attempt": "second", "event": "started"},
            {"stage": "stream", "month": "2026-07", "attempt": "second", "event": "completed", "seconds": 20, "exitCode": 0},
            {"stage": "stream", "month": "2026-07", "event": "already-complete"},
            {"stage": "analysis", "month": None, "attempt": "current", "event": "started"},
        ]
        report = A.stage_attempts(events)
        stream = report["stream"]["2026-07"]
        self.assertEqual((stream["attempts"], stream["stoppedJobs"], stream["completedJobs"], stream["unfinishedJobs"]), (2, 1, 1, 0))
        self.assertEqual(stream["cumulativeFinishedInvocationSeconds"], 30)
        self.assertEqual(stream["restartBackoffs"], 1)
        self.assertEqual(stream["restartBackoffSeconds"], 5)
        self.assertEqual(stream["alreadyCompleteChecks"], 1)
        self.assertNotIn("analysis", report)
        self.assertNotIn("first", json.dumps(report))

    def test_missing_events_and_metrics_are_unknown_not_zero(self):
        self.assertIsNone(A.stage_attempts(None))
        self.assertIsNone(A.sum_reported([{"seconds": 1}, {}], "seconds"))
        self.assertEqual(A.sum_reported([{"seconds": 1}, {"seconds": 2}], "seconds"), 3)

    def test_completed_and_failed_work_stay_separate(self):
        stream = {"kept": 1, "seconds": 3, "gamesRead": 4}
        scan = {"timing": {"seconds": 10, "describeMoveSeconds": 8, "backfillSeconds": 5, "describeMoveCallsReused": 12},
                "wallSeconds": 6, "describeMoveCalls": 12, "migration": {"backfilledGames": 2, "backfilledPositions": 10}}
        scores = [
            {"rows": 2, "workerSeconds": 30, "totals": {"engineSeconds": 20, "tablebaseRetries": 1},
             "failedAttemptTotals": {"engineSeconds": 4, "tablebaseRetries": 2}},
            {"rows": 3, "workerSeconds": 40, "totals": {"engineSeconds": 25, "tablebaseRetries": 0},
             "failedAttemptTotals": {"engineSeconds": 0, "tablebaseRetries": 0}},
        ]
        report = A.stage_totals(stream, scan, scores)
        self.assertEqual(report["score"]["cumulativeWorkerSeconds"], 70)
        self.assertEqual(report["score"]["completedRowTotals"]["engineSeconds"], 45)
        self.assertEqual(report["score"]["failedAttemptTotals"]["engineSeconds"], 4)
        self.assertEqual(report["score"]["failedAttemptTotals"]["tablebaseRetries"], 2)
        self.assertEqual(report["positions"]["migration"]["backfilledGames"], 2)
        self.assertEqual(report["positions"]["completedGameTiming"]["backfillSeconds"], 5)

    def test_reused_attempt_identifier_refuses(self):
        event = {"stage": "score", "month": "2026-09", "attempt": "same", "event": "started"}
        with self.assertRaisesRegex(ValueError, "reused"):
            A.stage_attempts([event, event])


class AmendmentTests(unittest.TestCase):
    def test_amendment_gains_losses_and_side_filter_counts(self):
        manifests = [manifest(month, 10) for month in A.MONTHS]
        first = manifests[0]
        groups = [first["amendmentComparison"], first["amendmentComparison"]["byBand"]["1300"]]
        for group in groups:
            group["rules"]["outside-passer"] = {"originalGainPositions": 0, "amendedPositions": 4, "gainedPositions": 4, "lostPositions": 0}
            group["rules"]["bishop-pair"] = {"originalGainPositions": 2, "amendedPositions": 0, "gainedPositions": 0, "lostPositions": 2}
            group["rules"]["lucena"] = {"originalGainPositions": 0, "amendedPositions": 1, "gainedPositions": 1, "lostPositions": 0}
            group["noteSideFilter"]["lucena"] = {"rawNotePositions": 3, "sideFilteredPositions": 1, "removedPositions": 2,
                                                  "rawNoteMoves": 5, "sideFilteredMoves": 2}
        for available in (first["availability"]["all"], first["availability"]["byBand"]["1300"]):
            available["rules"]["outside-passer"] = 4
            available["rules"]["lucena"] = 1
        result = A.amendment_report(manifests)
        self.assertEqual(result["all"]["rules"]["outside-passer"]["gainedPositions"], 4)
        self.assertEqual(result["all"]["rules"]["bishop-pair"]["lostPositions"], 2)
        self.assertEqual(result["train"]["noteSideFilter"]["lucena"]["removedPositions"], 2)
        self.assertEqual(result["train"]["noteSideFilter"]["lucena"]["removedMoves"], 3)
        self.assertEqual(result["heldout"]["noteSideFilter"]["lucena"]["removedPositions"], 0)
        self.assertEqual(result["removedFromScoring"], ["bishop-pair", "king-shelter"])
        first["amendmentComparison"]["rules"]["outside-passer"]["gainedPositions"] += 1
        with self.assertRaisesRegex(ValueError, "reconcile"):
            A.amendment_report(manifests)

    def test_side_filter_report_must_match_active_availability(self):
        manifests = [manifest(month, 10) for month in A.MONTHS]
        manifests[0]["amendmentComparison"]["noteSideFilter"]["lucena"] = {
            "rawNotePositions": 2, "sideFilteredPositions": 1, "removedPositions": 1,
            "rawNoteMoves": 2, "sideFilteredMoves": 1}
        with self.assertRaisesRegex(ValueError, "differs"):
            A.amendment_report(manifests)

if __name__ == "__main__":
    unittest.main()
