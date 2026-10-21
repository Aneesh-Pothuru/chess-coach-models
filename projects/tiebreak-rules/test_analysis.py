#!/usr/bin/env python3
"""Synthetic rows only. Never open a study game, position or score journal."""
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import analyze as A
import numpy as np


def row(game="synthetic-a", month="2026-09", units=("tension",), order="follow-first", sound=(True, False), band=1300, **overrides):
    first, second = "a2a3", "b2b3"
    f, b = (first, second) if order == "follow-first" else (second, first)
    result = {"datasetKind": "tiebreak-rules", "key": f"{month}:{game}:8", "month": month, "game": game,
              "gameIndex": 0, "ply": 8, "fen": "synthetic-not-used-by-analysis", "mover": "w", "band": band, "opponentBand": 1500,
              "played": first, "legalMoves": [first, second, "c2c3"], "M1": first, "M2": second, "p1": .4, "p2": .2,
              "units": [{"unit": unit, "F": f, "B": b, "stratum": order, "probabilities": {"F": .4 if f == first else .2, "B": .4 if b == first else .2},
                         "splits": {"close": True, "band": band, "phase": "opening", "tensionCentral": True if unit == "tension" else None,
                                    "tradePiece": "n" if unit in A.TRADE_UNITS else None}} for unit in units],
              "sound": {f: sound[0], b: sound[1]}, "times": {}}
    result.update(overrides)
    return result


def coverage(rows):
    result = {month: {"games": 10, "skippedInitial": 0, "plies": 100, "positionsEntering": 10,
                      "positionsInAUnit": 10, "positionsInARule": 10, "maiaCalls": 10, "units": {}} for month in A.MONTHS}
    flat = A.flatten(rows)
    for month in A.MONTHS:
        for unit in A.UNITS:
            selected = [r for r in flat if r["month"] == month and r["unit"] == unit]
            n = len(selected)
            result[month]["units"][unit] = {"situation": n + 2, "splits": n + 1, "gamesWithSplit": n,
                                           "kept": n, "followFirst": sum(r["stratum"] == "follow-first" for r in selected),
                                           "breakFirst": sum(r["stratum"] == "break-first" for r in selected)}
    return result


class BootstrapTests(unittest.TestCase):
    def test_one_undefined_draw_invalidates_whole_interval(self):
        out = A.interval(.5, [.25, .75, np.nan])
        self.assertEqual(out, {"value": .5, "lo": None, "hi": None, "validDraws": 2, "undefinedDraws": 1})

    def test_complete_interval_matches_registered_percentiles(self):
        out = A.interval(.5, [0, .25, .5, .75, 1])
        self.assertEqual((out["lo"], out["hi"]), (.025, .975))

    def test_equal_unit_means_not_pooled_rows_or_interval_endpoints(self):
        p, samples = A.mean_estimates([(1., np.array([1., 0., np.nan])), (0., np.array([0., 1., 1.]))])
        self.assertEqual(p, .5)
        np.testing.assert_equal(samples, [.5, .5, np.nan])
        self.assertEqual(A.interval(p, samples)["undefinedDraws"], 1)

    def test_union_draws_match_actual_predecessor_for_adversarial_month_order(self):
        rows = [row("synthetic-z-july", "2026-07", ("tension", "hang")), row("synthetic-a-august", "2026-08", ("trades-ahead",)),
                row("synthetic-b-july", "2026-07", ("bishop-colour",))]
        flat = A.flatten(rows); boot = A.PeriodBootstrap(flat, draws=17)
        direct = A.original.GameBootstrap([r["month"] + ":" + r["game"] for r in flat], 17, 20261021)
        np.testing.assert_array_equal(boot.boot.weights, direct.weights)
        np.testing.assert_array_equal(boot.boot.gi, direct.gi)
        self.assertEqual(boot.boot.games, 3)
        self.assertEqual(boot.boot.gi[0], boot.boot.gi[1])

    def test_unit_uses_union_weights_even_for_games_present_only_in_another_unit(self):
        flat = A.flatten([row("synthetic-a"), row("synthetic-b", units=("hang",))])
        b = A.PeriodBootstrap(flat, draws=100)
        _, estimates = b.estimates(b.base["tension"])
        empty_draws = (b.boot.weights[:, b.boot.gi[0]] == 0)
        np.testing.assert_array_equal(np.isnan(estimates["plainLift"][1]), empty_draws)
        self.assertGreater(empty_draws.sum(), 0)

    def test_balanced_lift_and_one_sound_share_are_mean_of_orders(self):
        rows = [row(f"synthetic-f{i}", sound=(True, False)) for i in range(3)]
        rows += [row("synthetic-b", order="break-first", sound=(False, True))]
        b = A.PeriodBootstrap(A.flatten(rows), draws=25)
        counts, e = b.estimates(b.base["tension"])
        self.assertEqual(e["plainLift"][0], .5)
        self.assertEqual(e["balancedLift"][0], 0)
        self.assertEqual(e["oneSoundFollowShare"][0], .5)
        self.assertEqual(e["againstFirst"][0], -.25)
        self.assertEqual(counts["orders"], {"follow-first": 3, "break-first": 1})
        for name, (point, draws) in e.items():
            self.assertEqual(len(draws), 25, name)

    def test_exactly_one_sound_excludes_both_sound_and_neither(self):
        rows = [row("synthetic-a", sound=(True, False)), row("synthetic-b", sound=(True, True)),
                row("synthetic-c", order="break-first", sound=(False, True)), row("synthetic-d", order="break-first", sound=(False, False))]
        counts, e = A.PeriodBootstrap(A.flatten(rows), 16).estimates(np.ones(4, dtype=bool))
        self.assertEqual(counts["oneSoundPositions"], 2)
        self.assertEqual(e["oneSoundFollowShare"][0], .5)

    def test_played_shares_and_probabilities_have_correct_order_denominators(self):
        rows = [row("synthetic-a"), row("synthetic-b", played="c2c3"), row("synthetic-c", order="break-first")]
        b = A.PeriodBootstrap(A.flatten(rows), 16); _, e = b.estimates(b.base["tension"])
        self.assertEqual(e["played:follow-first:F"][0], .5)
        self.assertEqual(e["played:follow-first:other"][0], .5)
        self.assertEqual(e["played:break-first:B"][0], 1)
        self.assertAlmostEqual(e["probabilityF"][0], 1/3)

    def test_empty_union_and_split_remain_undefined(self):
        b = A.PeriodBootstrap([], 7)
        group, _ = b.group(b.base["tension"])
        self.assertEqual(group["positions"], 0)
        for item in group["measures"].values():
            self.assertEqual(item, {"value": None, "lo": None, "hi": None, "validDraws": 0, "undefinedDraws": 7})


class RuleTests(unittest.TestCase):
    def setUp(self):
        self.held = {u: {"positions": 300, "orders": {"follow-first": 100, "break-first": 200}} for u in A.UNITS}
        self.pos = {"value": .1, "lo": .01, "hi": .2}
        self.neg = {"value": -.1, "lo": -.2, "hi": -.01}

    def test_exact_count_boundaries_and_every_mirrored_half(self):
        self.assertTrue(A.enough_data(A.RULES["trades-development"], self.held)["passed"])
        self.held["trades-behind"]["orders"]["follow-first"] = 99
        out = A.enough_data(A.RULES["trades-development"], self.held)
        self.assertFalse(out["passed"])
        self.assertEqual(out["failures"], [{"unit": "trades-behind", "population": "follow-first", "n": 99, "required": 100}])
        self.assertIn("trades-behind follow-first 99", out["label"])

    def test_count_failures_show_all_denominators(self):
        self.held["hang"] = {"positions": 20, "orders": {"follow-first": 9, "break-first": 11}}
        out = A.enough_data(("hang",), self.held)
        self.assertEqual(len(out["failures"]), 3)

    def test_control_precedes_counts_and_lift(self):
        enough = {"passed": False, "label": "not enough data (n=synthetic)"}
        self.assertEqual(A.decide(self.pos, self.pos, enough, False), (None, "control failed"))
        self.assertEqual(A.decide(self.pos, self.pos, enough, True), (enough["label"], "not enough data"))

    def test_verdict_boundaries_and_period_disagreement(self):
        enough = {"passed": True}
        self.assertEqual(A.decide(self.pos, self.pos, enough, True)[0], "breaks the tie")
        self.assertEqual(A.decide(self.neg, self.neg, enough, True)[0], "misleads")
        for before, after in [(self.pos, self.neg), (self.pos, {"lo": 0, "hi": .2}), (self.pos, {"lo": None, "hi": None})]:
            self.assertEqual(A.decide(before, after, enough, True)[0], "does no better than Maia-2's order")

    def test_full_synthetic_analysis_pools_train_preserves_control_and_descriptions(self):
        rows = [row(f"synthetic-{m}-{i}", m, A.UNITS, order=A.ORDERS[i % 2], sound=(True, False), band=A.BANDS[i % 2]) for m in A.MONTHS for i in range(4)]
        result = A.analyze(rows, coverage(rows), draws=12)
        self.assertFalse(result["control"]["passed"])
        self.assertEqual(result["units"]["hang"]["train"]["positions"], 8)
        self.assertEqual(result["counts"]["unionGamesByPeriod"], {"train": 8, "heldout": 4})
        self.assertEqual(set(result["units"]), set(A.UNITS))
        self.assertEqual(set(result["rules"]), set(A.RULES))
        for item in result["rules"].values():
            self.assertIsNone(item["verdict"])
            self.assertTrue(item["worthSwitching"]["descriptiveOnly"])
        self.assertIn("opening", result["units"]["tension"]["heldout"]["splits"]["phase"])
        self.assertIn("tradePiece", result["units"]["bishop-for-knight"]["heldout"]["splits"])
        encoded = json.dumps(result, allow_nan=False)
        self.assertNotIn("synthetic-2026", encoded)
        self.assertNotIn("_bandEstimates", encoded)
        self.assertIn("No rule receives a verdict", A.markdown(result))

    def test_control_is_computed_before_unit_reports(self):
        rows = [row(f"synthetic-{m}", m, A.UNITS) for m in A.MONTHS]
        seen = []
        group, unit = A.PeriodBootstrap.group, A.PeriodBootstrap.unit
        def trace_group(boot, mask):
            seen.append("group")
            return group(boot, mask)
        def trace_unit(boot, name):
            self.assertEqual(seen[:2], ["group", "group"])
            seen.append("unit")
            return unit(boot, name)
        with patch.object(A.PeriodBootstrap, "group", trace_group), patch.object(A.PeriodBootstrap, "unit", trace_unit):
            A.analyze(rows, coverage(rows), draws=5)

    def test_sufficient_positive_control_opens_actual_rule_gate(self):
        rows = [row(f"synthetic-{m}-{i}", m, A.UNITS, order=A.ORDERS[i % 2], band=A.BANDS[i % 2])
                for m in A.MONTHS for i in range(300 if m == A.HELDOUT else 30)]
        result = A.analyze(rows, coverage(rows), draws=16)
        self.assertTrue(result["control"]["passed"])
        for item in result["rules"].values():
            self.assertEqual(item["verdict"], "breaks the tie")
            self.assertEqual(item["worthSwitching"], {"criterionMet": True, "descriptiveOnly": False})
        self.assertIsNone(result["units"][A.REFERENCE]["descriptiveVerdict"])

    def test_mirrored_rule_averages_units_equally_despite_unequal_counts(self):
        rows = [row(f"synthetic-{m}-{u}-{i}", m, (u,), order=A.ORDERS[i % 2], sound=sound)
                for m in A.MONTHS for u, n, sound in [("trades-ahead", 8, (True, False)), ("trades-behind", 2, (False, True))]
                for i in range(n)]
        result = A.analyze(rows, coverage(rows), draws=8)
        for period in ('train', 'heldout'):
            self.assertEqual(result['rules']['trades-development'][period]['measures']['plainLift']['value'], 0)
            self.assertEqual(result['rules']['trades-development'][period]['measures']['balancedLift']['value'], 0)

    def test_bad_paired_readings_and_duplicate_game_unit_fail(self):
        bad = row(); bad["units"][0]["stratum"] = "break-first"
        with self.assertRaises(ValueError): A.flatten([bad])
        bad = row(); bad["sound"]["a2a3"] = 1
        with self.assertRaises(ValueError): A.flatten([bad])
        with self.assertRaises(ValueError): A.flatten([row(), row(ply=10, key="2026-09:synthetic-a:10")])

    def test_foreign_counts_and_missing_cells_fail(self):
        rows = [row()]; c = coverage(rows); c["2026-09"]["units"]["tension"]["kept"] = 0
        with self.assertRaises(ValueError): A.analyze(rows, c, draws=3)
        bad = row(); bad["units"][0]["splits"]["phase"] = None
        with self.assertRaises(ValueError): A.flatten([bad])


class LoaderTests(unittest.TestCase):
    def fixture(self, directory):
        frozen = {"app": A.APP, "inputs": {"sha256": "input-hash"}, "files": {"select.mjs": "select-hash", "score.mjs": "score-hash", "scan.mjs": "scan-hash"}}
        source_inputs = {"months": {month: {"games": 2, "outputSha256": "games-hash"} for month in A.MONTHS}}
        for month in A.MONTHS:
            source = [row(f"synthetic-{month}-{i}", month, A.UNITS, order=A.ORDERS[i % 2], gameIndex=i) for i in range(2)]
            for r in source: r.pop("sound")
            path = directory/f"positions-{month}.jsonl"
            path.write_text("".join(json.dumps(r)+"\n" for r in source))
            common = {"schema": 1, "datasetKind": "tiebreak-rules", "run": "full", "month": month, "app": A.APP,
                      "contentManifestSha256": "manifest-hash", "sourceInputsSha256": "input-hash", "complete": True, "status": "complete", "timing": False, "limit": None}
            scan_hashes = []
            for shard in (0,1):
                scan=directory/f'scan-{month}-{shard}-of-2.jsonl';scan.write_text(json.dumps({'synthetic':'not parsed'})+'\n')
                scan_hashes.append(A.digest(scan))
                scan.with_suffix('.json').write_text(json.dumps({**common, 'stage':'scan','shard':shard,'shards':2,
                    'sourceSha256':'scan-hash','inputSha256':'games-hash','rows':1,'expectedRows':1,'outputSha256':scan_hashes[-1]}))
            complete = [dict(r, sound={r['M1']:True,r['M2']:False}) for r in source]
            meta = {**common, "stage": "positions", "sourceSha256": "select-hash", "rows": 2, "expectedRows": 2,
                    "outputSha256": A.digest(path), "coverage": coverage(complete)[month],
                    "inputSha256":hashlib.sha256('\n'.join(scan_hashes).encode()).hexdigest()}
            path.with_suffix('.json').write_text(json.dumps(meta))
            for shard in (0,1):
                out=directory/f"scored-{month}-{shard}-of-2.jsonl"; selected=complete[shard::2]
                out.write_text(''.join(json.dumps(r)+'\n' for r in selected))
                metadata={**common,"stage":"scored","shard":shard,"shards":2,"inputSha256":meta['outputSha256'],
                          "sourceSha256":"score-hash","rows":1,"expectedRows":1,"outputSha256":A.digest(out),
                          "keysSha256":hashlib.sha256('\n'.join(r['key'] for r in selected).encode()).hexdigest()}
                out.with_suffix('.json').write_text(json.dumps(metadata))
        return frozen, source_inputs

    def test_complete_loader_preserves_source_order_and_hash_bindings(self):
        with tempfile.TemporaryDirectory(prefix='tiebreak-synthetic-') as temp:
            p=Path(temp);f,source=self.fixture(p);rows,c,inputs,positions=A.load_full(p,f,'manifest-hash',source)
            self.assertEqual(len(rows),6);self.assertEqual(len(inputs),6);self.assertEqual(len(positions),3)
            self.assertEqual([r['gameIndex'] for r in rows],[0,1,0,1,0,1])

    def test_loader_rejects_incomplete_wrong_app_hash_and_coverage(self):
        for field,value in [('complete',False),('app','wrong'),('outputSha256','wrong'),('rows',0),('keysSha256','wrong')]:
            with self.subTest(field=field), tempfile.TemporaryDirectory(prefix='tiebreak-synthetic-') as temp:
                p=Path(temp);f,source=self.fixture(p);path=p/'scored-2026-09-0-of-2.json';m=json.loads(path.read_text());m[field]=value;path.write_text(json.dumps(m))
                with self.assertRaises(ValueError):A.load_full(p,f,'manifest-hash',source)

    def test_changed_scan_or_selection_chain_is_rejected_before_rows(self):
        for changed in ('scan-bytes','selection-chain','scan-count'):
            with self.subTest(changed=changed), tempfile.TemporaryDirectory(prefix='tiebreak-synthetic-') as temp:
                p=Path(temp);f,source=self.fixture(p)
                if changed=='scan-bytes':(p/'scan-2026-07-0-of-2.jsonl').write_text('changed\n')
                else:
                    path=p/('positions-2026-07.json' if changed=='selection-chain' else 'scan-2026-07-0-of-2.json')
                    data=json.loads(path.read_text());data['inputSha256' if changed=='selection-chain' else 'rows']='wrong';path.write_text(json.dumps(data))
                with self.assertRaises(ValueError),patch.object(A,'read_jsonl',side_effect=AssertionError('must verify source first')):
                    A.load_full(p,f,'manifest-hash',source)

    def test_gate_precedes_freeze_and_loading(self):
        with patch.object(A,'load_full',side_effect=AssertionError('must not read')), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):A.main([])

    def test_committed_freeze_precedes_loading(self):
        fake=types.SimpleNamespace(MANIFEST=Path('/tmp/synthetic-unused'),verify_manifest=lambda **kwargs: (_ for _ in ()).throw(RuntimeError('freeze refused')))
        with patch.dict('sys.modules',{'freeze':fake}),patch.object(A,'load_full',side_effect=AssertionError('must not read')):
            with self.assertRaisesRegex(RuntimeError,'freeze refused'):A.main(['--reviewed'])


if __name__ == '__main__':
    unittest.main()
