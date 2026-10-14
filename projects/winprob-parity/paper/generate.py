#!/usr/bin/env python3
"""Writes paper/generated.tex for the win% parity paper: every number it prints,
from parity.py's results (the report and the curve every half pawn, whose app
column is the app's own winPercent), the lab's label thresholds
(configs/config.yaml) and the lab's own win% function.

    python projects/winprob-parity/paper/generate.py
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import yaml

from chess_coach_models.winprob import win_percent

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
ROOT = PROJECT.parent.parent


def label(loss: float, candidate: float, blunder: float) -> int:
    """The lab's labels, as its pipeline and scorer compare: 2 blunder, 1 candidate."""
    return 2 if loss > blunder else 1 if loss > candidate else 0


def pawns(cp: int) -> str:
    return f"{cp / 100:+.2f}".replace("-", "$-$").replace("+", "$+$")


def main() -> None:
    report = json.loads((PROJECT / "results" / "parity_winprob.json").read_text())
    thresholds = yaml.safe_load((ROOT / "configs" / "config.yaml").read_text())["thresholds"]
    candidate = float(thresholds["candidate_loss_win_pct"])
    blunder = float(thresholds["blunder_loss_win_pct"])
    clamp = int(thresholds["cp_clamp"])
    shared, past, beyond, mates = report["ranges"]
    max_gap = max(r["max_gap_pp"] for r in report["ranges"])
    # The slope the lab's curve uses, read back from the curve itself.
    slope = -math.log(2 / (1 + (win_percent(100) - 50) / 50) - 1) / 100

    with (PROJECT / "results" / "parity_winprob_curve.csv").open() as handle:
        grid = [(int(r["cp"]), float(r["lab"]), float(r["app"])) for r in csv.DictReader(handle)]

    # Every move from one grid evaluation to another, White to move (Black's
    # moves are the mirrored pairs, which the symmetric grid also holds).
    pairs = differ = blunder_to_candidate = candidate_to_none = 0
    widest = 0.0
    for before, lab_b, app_b in grid:
        for after, lab_a, app_a in grid:
            pairs += 1
            lab_loss, app_loss = lab_b - lab_a, app_b - app_a
            lab_label = label(lab_loss, candidate, blunder)
            app_label = label(app_loss, candidate, blunder)
            if lab_label == app_label:
                continue
            differ += 1
            if lab_label != app_label - 1:
                raise SystemExit(f"{before}->{after}: the lab's label is not one step milder")
            if not (before > clamp or after < -clamp):
                raise SystemExit(f"{before}->{after}: labels differ inside the clamp")
            widest = max(widest, app_loss - lab_loss)
            blunder_to_candidate += app_label == 2
            candidate_to_none += app_label == 1
    if widest > max_gap + 1e-6:
        raise SystemExit(f"a label window of {widest} points is wider than the largest gap")

    # The example: from +15 pawns, the smallest drop the app's curve calls a blunder.
    by_cp = {cp: (lab, app) for cp, lab, app in grid}
    start = 1500
    lab_b, app_b = by_cp[start]
    end = max(cp for cp, _, app in grid if label(app_b - app, candidate, blunder) == 2)
    lab_a, app_a = by_cp[end]
    if label(lab_b - lab_a, candidate, blunder) != 1:
        raise SystemExit("the example's labels do not differ as the paper says")

    grid_info = report["grid"]
    if grid_info["lab_clamp"] != clamp:
        raise SystemExit("parity.py's clamp is not the one configs/config.yaml gives the lab")
    if not report["app_mates_read_as_cp"]:
        raise SystemExit("the app no longer reads mate in n as the paper says")
    # Where the app's curve reads the side ahead as won to within a hundredth of a point.
    won_within = 0.01
    won_at = min(cp for cp, _, app in grid if cp >= 0 and 100 - app < won_within)
    # The figure runs from level to the next five pawns past that point, and its
    # gap panel a little above the largest gap.
    figure_pawns = math.ceil(won_at / 500) * 5
    gap_axis = (math.ceil(max_gap * 10) + 2) / 10

    defs = {
        "AppCommit": f"\\texttt{{{report['chess']['measured_commit'][:7]}}}",
        "GridMinPawns": f"{grid_info['cp_min'] // 100}",
        "GridMaxPawns": f"{grid_info['cp_max'] // 100}",
        "GridStepPawns": f"{grid_info['cp_step'] / 100:g}",
        "MateMax": f"{grid_info['mate_max']}",
        "MateStep": f"{grid_info['mate_step']}",
        "FigurePawns": f"{figure_pawns}",
        "GapAxisMax": f"{gap_axis:g}",
        "AppClampPawns": f"{grid_info['app_clamp'] // 100}",
        "AppClamp": f"{grid_info['app_clamp']}",
        "TolerancePower": f"{round(math.log10(grid_info['tolerance']))}",
        "WonWithin": f"{won_within:g}",
        "WonAtPawns": f"{won_at / 100:g}",
        "CrossLoss": f"{2 * past['lab'] - 100:.2f}",
        "Slope": f"{slope:.8f}",
        "LabClamp": f"{clamp}",
        "LabClampPawns": f"{clamp // 100}",
        "MateCp": f"{thresholds['mate_cp']}",
        "BlunderThreshold": f"{blunder:g}",
        "CandidateThreshold": f"{candidate:g}",
        "SharedPoints": f"{shared['points']}",
        "SharedMaxGap": f"{shared['max_gap_pp']:g}",
        "PastPoints": f"{past['points']:,}",
        "BeyondPoints": f"{beyond['points']}",
        "MatePoints": f"{mates['points']}",
        "AllPoints": f"{sum(r['points'] for r in report['ranges']):,}",
        "MaxGap": f"{max_gap:.2f}",
        "LabCeiling": f"{past['lab']:.2f}",
        "LabFloor": f"{100 - past['lab']:.2f}",
        "SharedAgrees": "agree" if report["shared_range_agrees"] else "disagree",
        "GridPoints": f"{len(grid)}",
        "GridPairs": f"{pairs:,}",
        "GridDiffer": f"{differ:,}",
        "GridBlunderToCandidate": f"{blunder_to_candidate:,}",
        "GridCandidateToNone": f"{candidate_to_none:,}",
        "GridWidest": f"{widest:.2f}",
        "ExampleFrom": pawns(start),
        "ExampleTo": pawns(end),
        "ExampleAppBefore": f"{app_b:.2f}",
        "ExampleLabBefore": f"{lab_b:.2f}",
        "ExampleAfter": f"{app_a:.2f}",
        "ExampleAppLoss": f"{app_b - app_a:.2f}",
        "ExampleLabLoss": f"{lab_b - lab_a:.2f}",
    }
    def at(r: dict) -> str:
        # A zero gap has no place where it falls.
        if r["max_gap_pp"] == 0:
            return "---"
        return r["at"].replace("#", "\\#").replace("+", "$+$").replace("-", "$-$")

    rows = "\n".join(
        f"{r['range'].replace('±', '$\\pm$')} & {r['points']:,} & {r['max_gap_pp']:.4f} & "
        f"{at(r)} & {r['lab']:.4f} & {r['app']:.4f} \\\\"
        for r in report["ranges"]
    )
    table = "\n".join(
        [
            "\\begin{tabular}{lrrlrr}",
            "\\toprule",
            "range & points & largest gap & at & lab & app \\\\",
            "\\midrule",
            rows,
            "\\bottomrule",
            "\\end{tabular}",
        ]
    )
    lines = ["% Written by projects/winprob-parity/paper/generate.py; do not edit by hand.", ""]
    lines += [f"\\newcommand{{\\{name}}}{{{value}}}" for name, value in defs.items()]
    lines += ["\\newcommand{\\ParityTable}{%", table, "}"]
    (HERE / "generated.tex").write_text("\n".join(lines) + "\n")
    print(f"wrote {HERE / 'generated.tex'}")


if __name__ == "__main__":
    main()
