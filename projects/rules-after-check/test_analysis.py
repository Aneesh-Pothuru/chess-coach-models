#!/usr/bin/env python3
"""Synthetic-only checks. No study position or private journal is opened."""
from __future__ import annotations

from copy import deepcopy
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

SPEC = importlib.util.spec_from_file_location("after_check_analysis", Path(__file__).with_name("analyze.py"))
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)
import numpy as np


def row(index=0, month="2026-07", rule="open-file", quiet=True, eligible=True,
        original_r_passes=False, sound_r=False, sound_rs=True, sound_ns=False,
        sound_n=True, sound_r0s=False, **extra):
    safe = ["e1e2", "f1f2", "g1g2"] + (["a1a2"] if original_r_passes else [])
    return {
        "datasetKind": "rules-after-check", "month": month,
        "game": f"synthetic-{month}-{index}", "rule": rule, "band": 1300, "opponentBand": 1500,
        "quiet": quiet, "safeMoves": safe, "safeRuleMoves": ["e1e2"] if eligible else [],
        "originalRPasses": original_r_passes, "R": "a1a2", "N": "b1b2", "A": "c1c2", "R0": "d1d2",
        "Rs": "e1e2" if eligible else None, "Ns": "f1f2" if eligible else None,
        "R0s": "g1g2" if eligible else None,
        "sound": {"R": sound_r, "N": sound_n, "A": False, "R0": False,
                  "Rs": sound_rs if eligible else None, "Ns": sound_ns if eligible else None,
                  "R0s": sound_r0s if eligible else None},
        "splits": {"material": "level", "phase": "middlegame", "forcing": False if eligible else None,
                   "kingDanger": False},
        "freshSearch": eligible, **({"freshBestChanged": False} if eligible else {}), **extra,
    }


def counts(rows):
    return {rule: {month: sum(item["rule"] == rule and item["month"] == month for item in rows)
                   for month in A.MONTHS} for rule in A.RULES}


def estimate(value, lo, hi):
    return {"value": value, "lo": lo, "hi": hi}


APPS = {"check": "synthetic-check-app", "score": "synthetic-score-app", "records": "synthetic-records"}


class MeasureTests(unittest.TestCase):
    def test_bootstrap_is_the_predecessor_instrument_with_fixed_seed(self):
        rows = [row(i, sound_rs=i % 2 == 0, sound_ns=i % 3 == 0) for i in range(12)]
        output = A.summarize_period(rows, draws=40)
        boot = A.original.GameBootstrap([item["month"] + ":" + item["game"] for item in rows], 40, 20261018)
        expected = boot.summary(np.asarray([item["sound"]["Rs"] for item in rows], dtype=float)
                                - np.asarray([item["sound"]["Ns"] for item in rows], dtype=float))
        self.assertEqual(output["primary"]["lift"], expected)
        self.assertEqual(output, A.summarize_period(rows, draws=40))

    def test_pooled_month_game_order_matches_predecessor_decision_measures(self):
        # Chronological and lexical game order deliberately disagree. The
        # original decision analysis prefixes month before sorting games;
        # raw IDs would assign these same random weights to different rows.
        rows = [row(0, month="2026-07", game="synthetic-z-july"),
                row(1, month="2026-08", game="synthetic-a-august", sound_rs=False),
                row(2, month="2026-07", game="synthetic-b-july"),
                row(3, month="2026-08", game="synthetic-y-august", sound_rs=False)]
        inherited = deepcopy(rows)
        for item in inherited:
            item["splits"]["opponentThreat"] = False
            item["probabilityRAtHisBand"] = .5
        constructor = A.original.GameBootstrap
        with mock.patch.object(A.original, "GameBootstrap", wraps=constructor) as captured:
            A.original.summarize_period(inherited, draws=40)
        captured.assert_called_once()
        predecessor_boot = constructor(*captured.call_args.args, **captured.call_args.kwargs)
        actual_boot = A.bootstrap_for(rows, draws=40)
        np.testing.assert_array_equal(actual_boot.weights[:, actual_boot.gi],
                                      predecessor_boot.weights[:, predecessor_boot.gi])
        raw_id_boot = constructor([item["game"] for item in rows], 40, A.SEED)
        self.assertTrue(np.any(actual_boot.weights[:, actual_boot.gi] != raw_id_boot.weights[:, raw_id_boot.gi]))
        expected_lift = predecessor_boot.summary([1., 0., 1., 0.])
        self.assertEqual(A.summarize_period(rows, draws=40)["primary"]["lift"], expected_lift)

    def test_coverage_and_comparison_denominators_are_distinct(self):
        rows = [row(0), row(1, eligible=False),
                row(2, quiet=False, sound_rs=False, sound_ns=True), row(3, quiet=False, eligible=False)]
        output = A.summarize_period(rows, draws=40)
        coverage = output["coverage"]
        self.assertEqual((output["retainedPositions"], coverage["quietPositions"],
                          coverage["quietWithoutSafeRulePositions"]), (4, 2, 1))
        self.assertEqual(coverage["quietShare"]["value"], .5)
        self.assertEqual(coverage["safeRuleShareAmongQuiet"]["value"], .5)
        self.assertEqual(coverage["safeRuleShareAll"]["value"], .5)
        self.assertEqual(output["primary"]["positions"], 1)
        self.assertEqual(output["primary"]["lift"]["value"], 1)
        self.assertEqual(output["allEligible"]["positions"], 2)
        self.assertEqual(output["allEligible"]["lift"]["value"], 0)
        self.assertEqual(output["primary"]["naturalAfterCheckMinusBefore"]["value"], -1)

    def test_all_measures_share_one_bootstrap_over_retained_games(self):
        rows = [row(0), row(1, quiet=False), row(2, eligible=False)]
        real = A.original.GameBootstrap
        with mock.patch.object(A.original, "GameBootstrap", wraps=real) as constructor:
            output = A.summarize_period(rows, draws=40)
        constructor.assert_called_once()
        self.assertEqual(len(constructor.call_args.args[0]), 3)
        self.assertEqual(output["primary"]["positions"], 1)
        self.assertGreater(output["primary"]["lift"]["undefinedDraws"], 0)

    def test_pooled_control_clusters_games_across_rule_rows(self):
        rows = [row(0, rule="open-file"), row(0, rule="active-king", sound_rs=False),
                row(1, rule="open-file", sound_rs=False)]
        A.validate_rows(rows)
        output = A.control_period(rows, draws=60)
        boot = A.bootstrap_for(rows, draws=60)
        expected = boot.weights[:, 0] / (2 * boot.weights[:, 0] + boot.weights[:, 1])
        self.assertEqual(output["lift"], A.original.interval(1 / 3, expected))
        self.assertEqual((output["positions"], output["games"], output["retainedGames"]), (3, 2, 2))

    def test_control_mask_requires_quiet_failed_original_and_nonempty_SR(self):
        rows = [row(0), row(1, quiet=False, sound_rs=False),
                row(2, original_r_passes=True, sound_rs=False), row(3, eligible=False)]
        output = A.control_period(rows, draws=60)
        self.assertEqual(output["positions"], 1)
        self.assertEqual(output["lift"]["value"], 1)
        self.assertGreater(output["lift"]["undefinedDraws"], 0)

    def test_move_identities_and_conditional_lift_use_the_eligible_mask(self):
        same = row(0)
        same.update(Rs="f1f2", safeRuleMoves=["f1f2"])
        same["sound"]["Rs"] = same["sound"]["Ns"]
        kept = row(1)
        output = A.summarize_period([same, kept, row(2, eligible=False)], draws=50)
        conditional = output["primary"]["liftWhereRsDiffersFromNs"]
        self.assertEqual((conditional["positions"], conditional["lift"]["value"]), (1, 1))
        self.assertEqual(output["primary"]["lift"]["value"], .5)
        self.assertEqual(output["primary"]["shareRsIsR"]["value"], 0)

    def test_identical_soundness_is_zero_and_empty_ratios_stay_undefined(self):
        rows = [row(i, sound_rs=i % 2 == 0, sound_ns=i % 2 == 0) for i in range(8)]
        output = A.summarize_period(rows, draws=30)
        self.assertEqual(tuple(output["primary"]["lift"][key] for key in ("value", "lo", "hi")), (0, 0, 0))
        for rows in ([], [row(0, quiet=False, eligible=False)]):
            empty = A.summarize_period(rows, draws=30)
            self.assertIsNone(empty["primary"]["lift"]["value"])
            self.assertEqual(empty["primary"]["lift"]["undefinedDraws"], 30)
            self.assertIsNone(empty["coverage"]["safeRuleShareAmongQuiet"]["value"])

    def test_splits_are_primary_lifts_and_do_not_retain_opponent_threat(self):
        primary = row(0)
        primary["splits"].update(material="ahead", forcing=True)
        nonquiet = row(1, quiet=False, sound_rs=False)
        nonquiet["splits"].update(material="behind", forcing=False)
        out = A.summarize_period([primary, nonquiet], draws=40)
        self.assertEqual(set(out["splits"]), {"material", "phase", "forcing", "kingDanger"})
        self.assertEqual(out["splits"]["material"]["ahead"]["positions"], 1)
        self.assertEqual(out["splits"]["material"]["behind"]["positions"], 0)
        self.assertEqual(out["splits"]["forcing"]["true"]["lift"]["value"], 1)
        self.assertIsNone(out["splits"]["forcing"]["false"]["lift"]["value"])

    def test_best_change_share_counts_positions_not_moves_and_respects_population(self):
        rows = [row(0, freshBestChanged=True), row(1, quiet=False),
                row(2, freshSearch=False, freshBestChanged=None), row(3, eligible=False)]
        out = A.summarize_period(rows, draws=30)
        self.assertEqual(out["primary"]["freshBestDiffersFromStored"], {"positions": 1, "changed": 1, "share": 1})
        self.assertEqual(out["allEligible"]["freshBestDiffersFromStored"], {"positions": 2, "changed": 1, "share": .5})


class DecisionTests(unittest.TestCase):
    def test_control_precedes_sparse_gate_and_strict_two_period_endpoints(self):
        up, down, touching = estimate(.2, .1, .3), estimate(-.2, -.3, -.1), estimate(.1, 0, .2)
        self.assertEqual(A.verdict(up, up, 300, True), ("holds after the check", None))
        self.assertEqual(A.verdict(down, down, 300, True), ("misleads after the check", None))
        self.assertEqual(A.verdict(up, touching, 300, True), ("does no better than the natural move", None))
        self.assertEqual(A.verdict(up, down, 300, True), ("does no better than the natural move", None))
        self.assertEqual(A.verdict(up, up, 299, True), ("not enough data (n=299)", "not enough data"))
        for n in (0, 299, 300):
            self.assertEqual(A.verdict(up, up, n, False), (None, "control failed"))

    def test_control_failure_withholds_all_verdicts_even_if_primary_lift_is_positive(self):
        rows = [row(0, sound_r=True)] + [row(i, month="2026-09", sound_r=True) for i in range(300)]
        output = A.analyze(rows, counts(rows), APPS, draws=20)
        self.assertFalse(output["control"]["passed"])
        self.assertEqual(output["rules"]["open-file"]["heldout"]["primary"]["lift"]["value"], 1)
        self.assertTrue(all(item["verdict"] is None and item["verdictReason"] == "control failed"
                            for item in output["rules"].values()))

    def test_control_is_computed_first_train_is_pooled_and_original_counts_are_not_caps(self):
        rows = [row(0), row(0, month="2026-08")] + [row(i, month="2026-09") for i in range(300)]
        events = []
        control, summary = A.control_period, A.summarize_period
        def record_control(*args, **kwargs):
            events.append("control")
            return control(*args, **kwargs)
        def record_summary(*args, **kwargs):
            events.append("summary")
            return summary(*args, **kwargs)
        with mock.patch.object(A, "control_period", side_effect=record_control), mock.patch.object(A, "summarize_period", side_effect=record_summary):
            output = A.analyze(rows, counts(rows), APPS, draws=20)
        self.assertEqual(events[:3], ["control", "control", "summary"])
        self.assertTrue(output["control"]["passed"])
        item = output["rules"]["open-file"]
        self.assertEqual(item["train"]["primary"]["positions"], 2)
        self.assertEqual(item["heldout"]["primary"]["positions"], 300)
        self.assertEqual(item["verdict"], "holds after the check")
        self.assertEqual(len(output["rules"]), 13)
        self.assertNotIn("lucena", output["rules"])
        self.assertNotIn("philidor", output["rules"])
        public = json.dumps(output, allow_nan=False)
        for fragment in ('"game":', '"fen":', 'synthetic-2026', '"safeMoves":', '"key":'):
            self.assertNotIn(fragment, public)
        self.assertIn("holds after the check", A.markdown(output))

    def test_malformed_coverage_or_alias_readings_refuse(self):
        rows = [row(0)]
        bad_counts = counts(rows)
        bad_counts["open-file"]["2026-07"] += 1
        with self.assertRaisesRegex(ValueError, "inherited rows"):
            A.analyze(rows, bad_counts, APPS, draws=10)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            A.validate_rows(rows * 2)
        alias = row(0)
        alias["Rs"] = alias["N"]
        alias["safeMoves"].append(alias["N"])
        alias["safeRuleMoves"] = [alias["N"]]
        alias["sound"]["Rs"] = False
        with self.assertRaisesRegex(ValueError, "matching move"):
            A.validate_rows([alias])
        for alteration, message in (({"safeRuleMoves": ["a7a8q"]}, "does not pass"),
                                    ({"originalRPasses": True}, "disagrees"),
                                    ({"freshBestChanged": None}, "best-change")):
            with self.assertRaisesRegex(ValueError, message):
                A.validate_rows([row(**alteration)])
        invalid_empty = row(eligible=False)
        invalid_empty["Ns"] = "f1f2"
        with self.assertRaisesRegex(ValueError, "empty safe rule"):
            A.validate_rows([invalid_empty])


class LoaderTests(unittest.TestCase):
    def build(self, directory):
        frozen = {"boardApp": APPS["check"], "refereeApp": APPS["score"], "records": APPS["records"],
                  "files": {"board.mjs": "synthetic-board-code", "score.mjs": "synthetic-score-code"},
                  "inputs": {"sha256": "synthetic-input-freeze"}}
        source_rows = [row(i, month=month) for month in A.MONTHS for i in range(2)]
        inherited = counts(source_rows)
        for month in A.MONTHS:
            checked_hashes = []
            for stage in ("checked", "scored"):
                for shard in range(2):
                    item = row(shard, month=month)
                    item["key"] = A.key_text(item)
                    path = directory / f"{stage}-{month}-{shard}-of-2.jsonl"
                    path.write_text(json.dumps(item) + "\n")
                    meta = {"schema": 1, "datasetKind": "rules-after-check", "stage": stage,
                            "month": month, "shard": shard, "shards": 2, "run": "full",
                            "boardApp": APPS["check"], "refereeApp": APPS["score"], "records": APPS["records"],
                            "contentManifestSha256": "synthetic-freeze", "sourceInputsSha256": frozen["inputs"]["sha256"],
                            "sourceSha256": frozen["files"]["board.mjs" if stage == "checked" else "score.mjs"],
                            "keysSha256": hashlib.sha256(item["key"].encode()).hexdigest(),
                            "rows": 1, "expectedRows": 1, "complete": True, "status": "complete",
                            "outputSha256": A.digest(path)}
                    if stage == "checked":
                        checked_hashes.append(meta["outputSha256"])
                    else:
                        meta["boardInputSha256"] = hashlib.sha256("\n".join(checked_hashes).encode()).hexdigest()
                    path.with_suffix(".json").write_text(json.dumps(meta))
        return frozen, inherited

    def test_complete_synthetic_coverage_loads_and_private_traces_are_not_carried(self):
        with tempfile.TemporaryDirectory(prefix="after-check-analysis-test-") as temp:
            directory = Path(temp)
            frozen, inherited = self.build(directory)
            rows, manifests = A.load_full(directory, frozen, "synthetic-freeze", inherited)
            self.assertEqual((len(rows), len(manifests)), (6, 12))
            self.assertNotIn("key", rows[0])
            self.assertNotIn("evidence", rows[0])

    def test_incomplete_wrong_app_freeze_source_or_output_refuses(self):
        for field, value, message in (
            ("complete", False, "incomplete"), ("status", "running", "incomplete"),
            ("shards", 1, "layout"), ("boardApp", "other", "provenance"),
            ("contentManifestSha256", "other", "content freeze"),
            ("sourceInputsSha256", "other", "input freeze"),
            ("sourceSha256", "other", "source code"),
            ("outputSha256", "other", "content changed"),
            ("boardInputSha256", "other", "different checked"),
            ("keysSha256", "other", "keys changed"),
            ("rows", 0, "row count"),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory(prefix="after-check-analysis-test-") as temp:
                directory = Path(temp)
                frozen, inherited = self.build(directory)
                path = directory / "scored-2026-09-0-of-2.json"
                meta = json.loads(path.read_text()); meta[field] = value
                path.write_text(json.dumps(meta))
                with self.assertRaisesRegex(ValueError, message):
                    A.load_full(directory, frozen, "synthetic-freeze", inherited)

    def test_changed_board_reading_and_missing_shard_refuse(self):
        with tempfile.TemporaryDirectory(prefix="after-check-analysis-test-") as temp:
            directory = Path(temp)
            frozen, inherited = self.build(directory)
            path = directory / "scored-2026-09-0-of-2.jsonl"
            item = json.loads(path.read_text()); item["quiet"] = False
            path.write_text(json.dumps(item) + "\n")
            meta_path = path.with_suffix(".json"); meta = json.loads(meta_path.read_text())
            meta["outputSha256"] = A.digest(path); meta_path.write_text(json.dumps(meta))
            with self.assertRaisesRegex(ValueError, "changed a stored board"):
                A.load_full(directory, frozen, "synthetic-freeze", inherited)
            meta_path.unlink()
            with self.assertRaisesRegex(ValueError, "exactly two"):
                A.load_full(directory, frozen, "synthetic-freeze", inherited)

    def test_incomplete_line_is_not_repaired(self):
        with tempfile.TemporaryDirectory(prefix="after-check-analysis-test-") as temp:
            path = Path(temp) / "synthetic.jsonl"
            contents = '{"synthetic": true}\n{"partial":'
            path.write_text(contents)
            with self.assertRaisesRegex(ValueError, "incomplete final"):
                A.read_jsonl(path)
            self.assertEqual(path.read_text(), contents)

    def test_missing_operational_times_are_unknown_not_zero(self):
        output = A.operation_totals([{"stage": "checked", "month": "2026-07", "rows": 1,
                                      "workerSeconds": 2, "totals": {"positionSeconds": 1, "safetySeconds": .5,
                                      "splitSeconds": .25, "positionCalls": 1, "safetyCalls": 20, "legalMoves": 20}}])
        self.assertEqual(output["checked"]["2026-07"]["workerSeconds"], 2)
        for field, expected in (("positionSeconds", 1), ("safetySeconds", .5), ("splitSeconds", .25),
                                ("positionCalls", 1), ("safetyCalls", 20), ("legalMoves", 20)):
            self.assertEqual(output["checked"]["2026-07"]["completedRowTotals"][field], expected)
        self.assertIsNone(output["checked"]["2026-07"]["stoppedJobs"])
        self.assertIsNone(output["checked"]["2026-07"]["failedAttemptTotals"]["positionSeconds"])


class GateTests(unittest.TestCase):
    def test_default_command_stops_before_freeze_or_any_position_read(self):
        result = subprocess.run([sys.executable, str(Path(A.__file__))], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("disabled in phase one", result.stderr)

    def test_committed_sources_and_inputs_are_verified_before_any_loader(self):
        verifier = mock.Mock(side_effect=ValueError("reviewed content is not committed"))
        with mock.patch.dict(sys.modules, {"freeze": SimpleNamespace(verify_manifest=verifier, MANIFEST=Path("synthetic.json"))}):
            with mock.patch.object(A, "load_full") as loader:
                with self.assertRaisesRegex(ValueError, "not committed"):
                    A.main(["--reviewed"])
                loader.assert_not_called()
        verifier.assert_called_once_with(require_committed=True, verify_inputs=True)


if __name__ == "__main__":
    unittest.main()
