#!/usr/bin/env python3
"""Parity: the lab's win% against the app's, on the app's pinned commit.

The lab labels moves with Lichess's curve clamped at ±1000 cp and reads every
mate as the clamp; the app clamps at ±10000 and reads mate in n as
±(10000 − 10n). Within ±1000 cp the two must agree exactly, and this fails if
they do not. Past it they part by design, and this measures by how much,
so a label the lab trains on is known to mean the same thing in the app, or
known not to.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from chess_coach_models.bridge import chess_commit, chess_dir, load_pin, run_eval
from chess_coach_models.config import load_config
from chess_coach_models.winprob import eval_to_cp, win_percent


HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "app.mts"
LAB_CLAMP = 1_000
APP_CLAMP = 10_000
# The app reads mate in n as the evaluation ±(APP_CLAMP − MATE_STEP·n); main() checks it.
MATE_STEP = 10
# Python's and Node's exp may differ in the last bit.
TOLERANCE = 1e-9


def largest_gap(name: str, points: list[str], lab: list[float], app: list[float]) -> dict:
    gaps = [abs(a - b) for a, b in zip(lab, app)]
    worst = max(range(len(gaps)), key=gaps.__getitem__)
    return {
        "range": name,
        "points": len(points),
        "max_gap_pp": round(gaps[worst], 6),
        "at": points[worst],
        "lab": round(lab[worst], 6),
        "app": round(app[worst], 6),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=HERE / "results" / "parity_winprob")
    args = parser.parse_args()

    cps = list(range(-12_000, 12_001, 10))
    mates = [n for m in range(1, 31) for n in (m, -m)]
    mate_cps = [(APP_CLAMP - MATE_STEP * abs(n)) * (1 if n > 0 else -1) for n in mates]
    directory = chess_dir()
    app = run_eval(SCRIPT, {"cp": cps + mate_cps, "mate": mates}, directory)
    app_mate_cps = app["cp"][len(cps):]
    app["cp"] = app["cp"][: len(cps)]
    mates_read_as_cp = all(abs(a - b) <= TOLERANCE for a, b in zip(app["mate"], app_mate_cps))
    lab_cp = [win_percent(cp) for cp in cps]
    lab_mate = [win_percent(eval_to_cp(f"#{mate}")) for mate in mates]

    def cp_range(name: str, keep) -> dict:
        idx = [i for i, cp in enumerate(cps) if keep(abs(cp))]
        return largest_gap(
            name,
            [f"{cps[i]:+d} cp" for i in idx],
            [lab_cp[i] for i in idx],
            [app["cp"][i] for i in idx],
        )

    ranges = [
        cp_range(f"within ±{LAB_CLAMP} cp", lambda a: a <= LAB_CLAMP),
        cp_range(f"±{LAB_CLAMP} to ±{APP_CLAMP} cp", lambda a: LAB_CLAMP < a <= APP_CLAMP),
        cp_range(f"beyond ±{APP_CLAMP} cp", lambda a: a > APP_CLAMP),
        largest_gap(
            f"mate in 1 to {max(mates)}",
            [f"#{mate:+d}" for mate in mates],
            lab_mate,
            app["mate"],
        ),
    ]
    pin = load_pin()
    measured = chess_commit(directory)
    shared_agrees = all(
        abs(lab_cp[i] - app["cp"][i]) <= TOLERANCE
        for i, cp in enumerate(cps)
        if abs(cp) <= LAB_CLAMP
    )
    report = {
        "eval": "parity-winprob",
        "grid": {
            "cp_min": cps[0],
            "cp_max": cps[-1],
            "cp_step": cps[1] - cps[0],
            "mate_max": max(mates),
            "lab_clamp": LAB_CLAMP,
            "app_clamp": APP_CLAMP,
            "mate_step": MATE_STEP,
            "tolerance": TOLERANCE,
        },
        "chess": {
            "repo": pin["repo"],
            "pinned_commit": pin["commit"],
            "measured_commit": measured,
            "matches_pin": measured == pin["commit"],
        },
        "shared_range_agrees": shared_agrees,
        "app_mates_read_as_cp": mates_read_as_cp,
        "ranges": ranges,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(report, indent=2, ensure_ascii=False)
    args.out.with_suffix(".json").write_text(text + "\n")
    args.out.with_suffix(".md").write_text(render(report))
    # White's win% every half pawn, for the paper's figure and its label check.
    curve = ["cp,lab,app"] + [
        f"{cp},{lab_cp[i]:.6f},{app['cp'][i]:.6f}"
        for i, cp in enumerate(cps)
        if cp % 50 == 0
    ]
    args.out.with_name(args.out.name + "_curve.csv").write_text("\n".join(curve) + "\n")
    print(text)
    return 0 if shared_agrees else 1


def render(report: dict) -> str:
    chess = report["chess"]
    commit = (chess["measured_commit"] or "unknown")[:7]
    source = "the pinned commit" if chess["matches_pin"] else "not the pinned commit"
    rows = [
        f"| {r['range']} | {r['points']:,} | {r['max_gap_pp']:.4f} | {r['at']} "
        f"| {r['lab']:.4f} | {r['app']:.4f} |"
        for r in report["ranges"]
    ]
    past = report["ranges"][1]
    thresholds = load_config()["thresholds"]
    clamp = f"±{report['grid']['lab_clamp']} cp"
    verdict = (
        f"Within {clamp} the lab and the app compute the same curve."
        if report["shared_range_agrees"]
        else f"Within {clamp} the lab and the app disagree: the curves themselves differ."
    )
    return "\n".join(
        [
            "# Parity: win% in the lab and in the app",
            "",
            f"App commit `{commit}` ({source}), generated by "
            "`projects/winprob-parity/parity.py`. White's win%, in percentage points.",
            "",
            "| Range | Points | Largest gap | At | Lab | App |",
            "|---|---|---|---|---|---|",
            *rows,
            "",
            f"{verdict} Past it the lab holds every evaluation, mates included, at "
            f"{past['lab']:.2f}% (or its mirror) while the app goes on towards 100%. "
            "The lab's blunder and candidate labels (a loss over "
            f"{thresholds['blunder_loss_win_pct']:g} and over {thresholds['candidate_loss_win_pct']:g} "
            "points) are computed on the clamped curve, so a move whose evaluation "
            f"passes {clamp} can lose up to {past['max_gap_pp']:.2f} points less in "
            "the lab than in the app (twice that if it crosses from one side to the "
            "other), enough to flip a label near either threshold. Which clamp a "
            "ported model should use is a decision for its port; this report only "
            "says where the two part.",
            "",
        ]
    )


if __name__ == "__main__":
    sys.exit(main())
