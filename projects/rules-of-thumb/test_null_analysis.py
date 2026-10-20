#!/usr/bin/env python3
"""Synthetic tests only; no private games, readings or addition measures."""
from __future__ import annotations

from copy import deepcopy
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

import numpy as np
import analyze_null as A


def row(index=0, month="2026-07", rule="open-file", band=1300,
        sound_r=True, sound_n=False, sound_r0=False, **extra):
    return {
        "datasetKind": "null-addition",
        "month": month, "game": f"synthetic-{month}-{index}", "rule": rule,
        "band": band, "opponentBand": 1300,
        "R": "a1a2", "N": "b1b2", "A": "c1c2", "R0": "d1d2",
        "sound": {"R": sound_r, "N": sound_n, "A": False, "R0": sound_r0},
        "ruleMoves": ["a1a2"], "k": 1, "sampledMoves": ["d1d2"],
        "source": "engine", "bestChanged": False, **extra,
    }


def prior(rows):
    return {
        "app": "synthetic-app", "datasetKind": "amended",
        "data": {"source": "synthetic", "license": "CC0",
                 "train": list(A.MONTHS[:2]), "heldout": A.MONTHS[2]},
        "rules": {rule: {
            "verdict": "unchanged synthetic verdict",
            "countsByMonth": {month: {
                "scoredPositions": sum(item["month"] == month and item["rule"] == rule
                                       for item in rows)}
                for month in A.MONTHS},
        } for rule in A.RULES},
    }


def estimate(value, lo, hi):
    return {"value": value, "lo": lo, "hi": hi}


class MeasureTests(unittest.TestCase):
    def test_paired_differences_use_the_original_game_bootstrap(self):
        rows = [row(i, sound_r=i % 2 == 0, sound_n=i % 3 == 0,
                    sound_r0=i % 4 == 0) for i in range(12)]
        output = A.summarize_period(rows, draws=60)
        boot = A.original.GameBootstrap(
            [item["month"] + ":" + item["game"] for item in rows], 60, A.SEED)
        expected_null = boot.summary(
            np.asarray([item["sound"]["R0"] for item in rows], dtype=float) -
            np.asarray([item["sound"]["N"] for item in rows], dtype=float))
        expected_content = boot.summary(
            np.asarray([item["sound"]["R"] for item in rows], dtype=float) -
            np.asarray([item["sound"]["R0"] for item in rows], dtype=float))
        self.assertEqual(output["nullLift"], expected_null)
        self.assertEqual(output["content"], expected_content)
        self.assertEqual(output, A.summarize_period(rows, draws=60))

    def test_same_game_rows_share_multiplicity(self):
        rows = [row(0), row(0, sound_r=False), row(1, sound_r=False)]
        output = A.summarize_period(rows, draws=40)
        boot = A.original.GameBootstrap(
            [item["month"] + ":" + item["game"] for item in rows], 40, A.SEED)
        samples = boot.weights[:, 0] / (2 * boot.weights[:, 0] + boot.weights[:, 1])
        self.assertEqual(output["content"], A.original.interval(1 / 3, samples))
        self.assertEqual(output["games"], 2)

    def test_identical_paired_soundness_has_exact_zero_intervals(self):
        rows = [row(i, sound_r=i % 2 == 0, sound_n=i % 2 == 0,
                    sound_r0=i % 2 == 0) for i in range(12)]
        output = A.summarize_period(rows, draws=30)
        for field in ("nullLift", "content"):
            self.assertEqual(tuple(output[field][key] for key in ("value", "lo", "hi")),
                             (0, 0, 0))

    def test_conditional_lift_excludes_identity_rows(self):
        rows = [row(0, R="b1b2", sound_r=True, sound_n=True),
                row(1, sound_r=False, sound_n=True),
                row(2, sound_r=False, sound_n=True, band=1500)]
        output = A.summarize_period(rows, draws=50)
        conditional = output["liftWhenRDiffersFromN"]
        self.assertEqual(conditional["positions"], 2)
        self.assertEqual(tuple(conditional["lift"][key] for key in ("value", "lo", "hi")),
                         (-1, -1, -1))
        self.assertAlmostEqual(output["shareRIsN"]["value"], 1 / 3)
        self.assertEqual(output["soundnessR0ByBand"]["1500"]["positions"], 1)

    def test_identity_and_band_masks_share_the_same_draws(self):
        rows = [row(0, R0="b1b2", source="stored-move", bestChanged=None),
                row(1, band=1500, sound_r0=True)]
        output = A.summarize_period(rows, draws=60)
        boot = A.original.GameBootstrap(
            [item["month"] + ":" + item["game"] for item in rows], 60, A.SEED)
        self.assertEqual(output["shareR0IsN"], boot.summary([1., 0.]))
        self.assertEqual(output["soundnessR0ByBand"]["1500"]["soundness"],
                         boot.summary([0., 1.], [False, True]))
        self.assertGreater(output["soundnessR0ByBand"]["1500"]["soundness"]["undefinedDraws"], 0)

    def test_no_different_moves_or_empty_bands_are_undefined(self):
        rows = [row(i, R="b1b2", sound_r=True, sound_n=True) for i in range(5)]
        output = A.summarize_period(rows, draws=30)
        self.assertIsNone(output["liftWhenRDiffersFromN"]["lift"]["value"])
        self.assertEqual(output["liftWhenRDiffersFromN"]["lift"]["undefinedDraws"], 30)
        self.assertIsNone(output["soundnessR0ByBand"]["1500"]["soundness"]["value"])
        self.assertIsNone(A.summarize_period([], draws=30)["nullLift"]["value"])

    def test_best_change_denominator_contains_only_fresh_searches(self):
        rows = [row(0, bestChanged=True), row(1),
                row(2, source="tablebase", bestChanged=None),
                row(3, source="stored-move", R0="b1b2", bestChanged=None)]
        self.assertEqual(A.searched_best(rows), {"searches": 2, "changed": 1, "share": .5})
        self.assertEqual(A.searched_best(rows[2:]), {"searches": 0, "changed": 0, "share": None})


class ReadingTests(unittest.TestCase):
    def test_content_requires_strict_intervals_in_both_periods(self):
        up, down, zero = estimate(.2, .1, .3), estimate(-.2, -.3, -.1), estimate(.1, 0, .2)
        missing = estimate(None, None, None)
        self.assertEqual(A.content_reading(up, up), "points to better moves than chance")
        self.assertEqual(A.content_reading(down, down), "points to worse moves than chance")
        for before, after in ((up, down), (up, zero), (missing, up), (up, missing)):
            self.assertEqual(A.content_reading(before, after), "no differently from chance")

    def test_train_pools_months_and_preserves_the_original_verdict(self):
        rows = [row(0), row(0, month="2026-08")]
        rows += [row(i, month="2026-09") for i in range(300)]
        output = A.analyze(rows, prior(rows), "synthetic-app", draws=20)
        result = output["rules"]["open-file"]
        self.assertEqual((result["train"]["positions"], result["heldout"]["positions"]), (2, 300))
        self.assertEqual(result["reading"], "points to better moves than chance")
        self.assertEqual(result["originalVerdict"], "unchanged synthetic verdict")
        self.assertEqual(result["countsByMonth"]["2026-08"], 1)
        self.assertEqual(len(output["excludedRules"]), 14)
        serialized = json.dumps(output, allow_nan=False)
        for private in ('"game":', '"fen":', "synthetic-2026", '"R0":', '"key":'):
            self.assertNotIn(private, serialized)
        self.assertIn("open-file", A.markdown(output))
        self.assertIn("These readings change no preregistered verdict", A.markdown(output))

    def test_under_300_is_left_out_before_any_summary(self):
        rows = [row(i, month="2026-09") for i in range(299)]
        with mock.patch.object(A, "summarize_period") as summarize:
            output = A.analyze(rows, prior(rows), "synthetic-app", draws=20)
            summarize.assert_not_called()
        self.assertEqual(output["rules"], {})
        self.assertEqual(output["excludedRules"]["open-file"]["heldoutPositions"], 299)
        self.assertNotIn("content", output["excludedRules"]["open-file"])

    def test_missing_or_changed_original_coverage_refuses(self):
        rows = [row(0)]
        expected = prior(rows)
        expected["rules"]["open-file"]["countsByMonth"]["2026-07"]["scoredPositions"] += 1
        with self.assertRaisesRegex(ValueError, "coverage"):
            A.analyze(rows, expected, "synthetic-app", draws=10)
        with self.assertRaisesRegex(ValueError, "provenance"):
            A.analyze(rows, prior(rows), "different-app", draws=10)

    def test_duplicate_unknown_source_and_inconsistent_reuse_refuse(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            A.validate_rows([row(0), row(0)])
        for altered, message in (
            (row(source="other"), "source"),
            (row(bestChanged=None), "indicator"),
            (row(source="stored-move", bestChanged=None), "match"),
            (row(R0="a1a2"), "inconsistent"),
            (row(R0="a1a2", sound_r0=True), "repeats"),
            (row(source="tablebase", bestChanged=True), "indicator"),
        ):
            with self.assertRaisesRegex(ValueError, message):
                A.validate_rows([altered])


class LoaderTests(unittest.TestCase):
    def build(self, directory):
        source_dir, null_dir = directory / "full", directory / "null"
        source_dir.mkdir()
        null_dir.mkdir()
        (directory / "null-score.mjs").write_text("synthetic source\n")
        originals = []
        for month in A.MONTHS:
            items = [row(index, month=month) for index in range(2)]
            sources = []
            for item in items:
                item["key"] = A.key_text(item)
                source = deepcopy(item)
                source["sound"].pop("R0")
                originals.append(source)
                sources.append(source)
            positions = gzip.compress("".join(json.dumps(source) + "\n" for source in sources).encode())
            (source_dir / f"positions-{month}.jsonl.gz").write_bytes(positions)
            for shard, item in enumerate(items):
                journal = null_dir / f"scored-{month}-{shard}-of-2.jsonl"
                journal.write_text(json.dumps(item) + "\n")
                manifest = {
                    "complete": True, "status": "complete", "run": "full", "datasetKind": "null-addition",
                    "app": "synthetic-app", "month": month, "shard": shard, "shards": 2,
                    "rows": 1, "expectedRows": 1, "additionManifestSha256": "synthetic-freeze",
                    "inputSha256": hashlib.sha256(positions).hexdigest(),
                    "scorerVersion": A.sha256(directory / "null-score.mjs"),
                    "keysSha256": hashlib.sha256(item["key"].encode()).hexdigest(),
                    "outputSha256": A.sha256(journal),
                    "workerSeconds": 1, "stoppedJobs": 0, "totals": {"engineSeconds": .5},
                }
                journal.with_suffix(".json").write_text(json.dumps(manifest))
        return originals, source_dir, null_dir

    def load(self, directory, originals, source_dir, null_dir):
        with mock.patch.object(A, "PROJECT", directory):
            return A.load_null(null_dir, originals, "synthetic-app",
                               "synthetic-freeze", source_dir)

    def test_complete_coverage_loads_with_only_aggregation_fields(self):
        with tempfile.TemporaryDirectory(prefix="rules-null-test-") as name:
            directory = Path(name)
            originals, source_dir, null_dir = self.build(directory)
            rows, manifests = self.load(directory, originals, source_dir, null_dir)
            self.assertEqual((len(rows), len(manifests)), (6, 6))
            self.assertNotIn("key", rows[0])
            self.assertEqual(rows[0]["sound"]["R0"], False)

    def test_incomplete_wrong_freeze_changed_journal_and_worker_limit_refuse(self):
        for field, value, message in (
            ("complete", False, "incomplete"),
            ("status", "running", "incomplete"),
            ("additionManifestSha256", "other", "manifest changed"),
            ("scorerVersion", "other", "scorer code"),
            ("inputSha256", "other", "positions changed"),
            ("keysSha256", "other", "keys changed"),
            ("outputSha256", "other", "journal changed"),
            ("expectedRows", 2, "expected row"),
            ("rows", 0, "row count"),
            ("shards", 3, "layouts"),
            ("datasetKind", "amended", "dataset"),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory(prefix="rules-null-test-") as name:
                directory = Path(name)
                originals, source_dir, null_dir = self.build(directory)
                path = null_dir / "scored-2026-09-0-of-2.json"
                manifest = json.loads(path.read_text())
                manifest[field] = value
                path.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, message):
                    self.load(directory, originals, source_dir, null_dir)

    def test_changed_original_move_and_soundness_refuse(self):
        for field, value, message in (
            ("R", "h1h2", "original reading"),
            ("sound", {"R": False, "N": False, "A": False, "R0": False}, "soundness"),
            ("datasetKind", "amended", "row dataset"),
            ("k", 2, "subset size"),
            ("sampledMoves", ["b1b2"], "subset is missing"),
            ("sampledMoves", ["d1d2", "d1d2"], "subset is missing"),
        ):
            with tempfile.TemporaryDirectory(prefix="rules-null-test-") as name:
                directory = Path(name)
                originals, source_dir, null_dir = self.build(directory)
                path = null_dir / "scored-2026-09-0-of-2.jsonl"
                item = json.loads(path.read_text())
                item[field] = value
                path.write_text(json.dumps(item) + "\n")
                meta_path = path.with_suffix(".json")
                manifest = json.loads(meta_path.read_text())
                manifest["outputSha256"] = A.sha256(path)
                meta_path.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, message):
                    self.load(directory, originals, source_dir, null_dir)

    def test_one_shard_layout_cannot_replace_the_frozen_layout(self):
        with tempfile.TemporaryDirectory(prefix="rules-null-test-") as name:
            directory = Path(name)
            originals, source_dir, null_dir = self.build(directory)
            for path in null_dir.glob("scored-2026-09-*.json"):
                manifest = json.loads(path.read_text())
                manifest["shards"] = 1
                path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "two-shard layout"):
                self.load(directory, originals, source_dir, null_dir)

    def test_missing_shard_and_missing_month_refuse(self):
        with tempfile.TemporaryDirectory(prefix="rules-null-test-") as name:
            directory = Path(name)
            originals, source_dir, null_dir = self.build(directory)
            path = null_dir / "scored-2026-09-0-of-2.json"
            path.unlink()
            with self.assertRaisesRegex(ValueError, "missing or duplicate"):
                self.load(directory, originals, source_dir, null_dir)
            (null_dir / "scored-2026-09-1-of-2.json").unlink()
            with self.assertRaisesRegex(ValueError, "no null score"):
                self.load(directory, originals, source_dir, null_dir)

    def test_missing_operational_metrics_stay_unknown(self):
        report = A.operation_totals([{"month": "2026-07", "rows": 2, "workerSeconds": 3,
                                     "totals": {"engineSeconds": 2}}])
        self.assertEqual(report["2026-07"]["cumulativeWorkerSeconds"], 3)
        self.assertIsNone(report["2026-07"]["stoppedWorkerJobs"])
        self.assertEqual(report["2026-07"]["completedRowTotals"]["engineSeconds"], 2)
        self.assertIsNone(report["2026-07"]["failedAttemptTotals"]["engineSeconds"])


class GateTests(unittest.TestCase):
    def test_no_review_stops_before_reading_inputs(self):
        result = subprocess.run([sys.executable, str(Path(A.__file__))],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires the reviewed addition", result.stderr)

    def test_committed_addition_checked_before_private_data(self):
        verifier = mock.Mock(side_effect=ValueError("addition manifest is not committed"))
        with mock.patch.dict(sys.modules, {"freeze_null": SimpleNamespace(verify_manifest=verifier)}):
            with mock.patch.object(A.original, "load_full") as loader:
                with self.assertRaisesRegex(ValueError, "not committed"):
                    A.main(["--reviewed"])
                loader.assert_not_called()
        verifier.assert_called_once_with(require_committed=True)


if __name__ == "__main__":
    unittest.main()
