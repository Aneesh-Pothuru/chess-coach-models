#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from chess_coach_models.config import load_config, project_path


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _pct(value: float) -> str:
    return f"{100 * value:.1f}%"


def _metric_table(metrics: dict, model_names: list[str]) -> str:
    rows = [
        "| Band | Model | N | Base rate | ROC-AUC | PR-AUC | Brier |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    order = ["overall", "<1100", "1100-1400", "1400-1700", "1700-2000", "2000+"]
    labels = {
        "lightgbm": "LightGBM",
        "constant_base_rate": "Constant",
        "abs_eval": "Absolute-eval baseline",
    }
    for band in order:
        if band not in metrics:
            continue
        for model in model_names:
            values = metrics[band][model]
            rows.append(
                f"| {band} | {labels.get(model, model)} | {values['n']:,} | "
                f"{_pct(values['base_rate'])} | {values['roc_auc']:.3f} | "
                f"{values['pr_auc']:.3f} | {values['brier_score']:.3f} |"
            )
    return "\n".join(rows)


def _plot_calibration(v0: dict, output: Path) -> None:
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([0, 1], [0, 1], "--", color="#777777", label="Perfect")
    colors = {
        "lightgbm": "#1f77b4",
        "abs_eval": "#ff7f0e",
        "constant_base_rate": "#2ca02c",
    }
    labels = {
        "lightgbm": "LightGBM",
        "abs_eval": "Absolute-eval baseline",
        "constant_base_rate": "Constant",
    }
    for name, values in v0["calibration"].items():
        ax.plot(
            values["mean_predicted"],
            values["observed_fraction"],
            marker="o",
            label=labels[name],
            color=colors[name],
        )
    ax.set(xlabel="Mean predicted probability", ylabel="Observed blunder rate")
    ax.set_title("Hazard calibration — held-out games")
    ax.legend()
    ax.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(output, dpi=160)
    plt.close(fig)


def _plot_importance(csv_path: Path, output: Path) -> None:
    frame = pd.read_csv(csv_path).head(12).sort_values("importance_gain")
    fig, ax = plt.subplots(figsize=(7.2, 5.2))
    ax.barh(frame["feature"], frame["importance_gain"], color="#4c78a8")
    ax.set(xlabel="LightGBM gain", title="Blunder-hazard feature importance")
    ax.grid(axis="x", alpha=0.2)
    fig.tight_layout()
    fig.savefig(output, dpi=160)
    plt.close(fig)


def _scorer_report(
    config: dict, maia: dict, samples: dict, benchmark: dict | None
) -> str:
    smoke_positions = maia.get("smoke_positions", maia["positions"])
    smoke_rows = [
        "| Band | N | Top-1 move match |",
        "|---|---:|---:|",
    ]
    for band, values in maia["move_match_by_band"].items():
        smoke_rows.append(
            f"| {band} | {values['n']:,} | {_pct(values['top1_move_match_accuracy'])} |"
        )
    smoke_accuracy = maia.get(
        "overall_top1_move_match_accuracy",
        sum(
            row["n"] * row["top1_move_match_accuracy"]
            for row in maia["move_match_by_band"].values()
        )
        / max(1, smoke_positions),
    )
    smoke_rows.append(
        f"| **Overall** | **{smoke_positions:,}** | **{_pct(smoke_accuracy)}** |"
    )
    candidate_rows = [
        "| Game | Ply | Move | Objective cost | Punishing reply | At band | At +200 |",
        "|---|---:|---|---:|---|---:|---:|",
    ]
    for game in samples["games"]:
        label = f"{game.get('white')}–{game.get('black')}"
        if not game["candidates"]:
            candidate_rows.append(
                f"| {label} | — | _No >10 Win% move_ | — | — | — | — |"
            )
            continue
        for candidate in game["candidates"]:
            at_band = candidate["punishment_probability_at_band"]
            stronger = candidate["punishment_probability_plus_200"]
            candidate_rows.append(
                f"| {label} | {candidate['ply']} | {candidate['move_san']} | "
                f"{candidate['objective_cost_win_pct']:.1f} Win% | "
                f"`{candidate['punishing_reply_uci']}` | "
                f"{_pct(at_band) if at_band is not None else 'n/a'} | "
                f"{_pct(stronger) if stronger is not None else 'n/a'} |"
            )
    if len(candidate_rows) == 2:
        candidate_rows.append("| _No >10 Win% candidates_ | | | | | | |")
    return "\n".join(
        [
            "# Model 1: Graded-opponent scorer",
            "",
            "The scorer uses Stockfish MultiPV for objective cost and Maia2 for the probability that the best refutation is found. Probabilities are evaluated at the target band and at a hypothetical opponent 200 Elo stronger.",
            "",
            "## Maia2 move-match smoke test",
            "",
            "\n".join(smoke_rows),
            "",
            f"These {smoke_positions:,} positions come only from held-out games in a capped, band-balanced smoke test on {maia['device']}. It is not a training-independent benchmark: April 2019 lies inside the released Maia2 training window (May 2018 – November 2023)."
            + (
                " See [maia_benchmark.md](maia_benchmark.md) for the training-independent benchmark."
                if benchmark is not None
                else ""
            ),
            f"The nominal ≥50% smoke expectation is **{'met' if smoke_accuracy >= 0.5 else 'not met'}** overall; band non-monotonicity is retained rather than smoothed away.",
            "",
            "## Three sample games",
            "",
            "\n".join(candidate_rows),
            "",
            "A large objective cost with low punishment probability is the product's “bad but likely unpunished here” case. High probability at both levels is immediately coachable.",
            "",
            "## Limitations",
            "",
            "- The punishing reply is Stockfish's top reply at the configured short time budget.",
            "- Maia2 ratings are Lichess Glicko-2; no chess.com conversion is claimed.",
            "- Tactical mate positions can saturate the win-probability formula.",
        ]
    ) + "\n"


def _band_ci_text(block: dict) -> str:
    return (
        f"{_pct(block['top1_move_match_accuracy'])} "
        f"({_pct(block['wilson95_low'])}–{_pct(block['wilson95_high'])})"
    )


def _benchmark_report(config: dict, benchmark: dict, smoke: dict) -> str:
    protocol = benchmark["protocol"]
    sampling = benchmark.get("sampling", {})
    band_order = [str(band["name"]) for band in config["rating_bands"]]
    bands = benchmark["move_match_by_band"]
    overall = benchmark["overall"]

    result_rows = [
        "| Band | Moves | Games | Top-1 accuracy (Wilson 95% CI) | Cluster-bootstrap 95% CI | Mean top-1 prob |",
        "|---|---:|---:|---|---|---:|",
    ]
    for name in band_order:
        block = bands[name]
        result_rows.append(
            f"| {name} | {block['n']:,} | {block['games']:,} | "
            f"{_band_ci_text(block)} | "
            f"{_pct(block['cluster_bootstrap95_low'])}–{_pct(block['cluster_bootstrap95_high'])} | "
            f"{block['mean_maia_top1_probability']:.3f} |"
        )
    result_rows.append(
        f"| **Overall** | **{overall['n']:,}** | | **{_band_ci_text(overall)}** | | "
        f"{overall['mean_maia_top1_probability']:.3f} |"
    )

    smoke_rows = [
        "| Band | Independent benchmark | 2019-04 smoke | Difference |",
        "|---|---:|---:|---:|",
    ]
    for name in band_order:
        smoke_block = smoke["move_match_by_band"].get(name)
        if smoke_block is None:
            continue
        delta = (
            bands[name]["top1_move_match_accuracy"]
            - smoke_block["top1_move_match_accuracy"]
        )
        smoke_rows.append(
            f"| {name} | {_pct(bands[name]['top1_move_match_accuracy'])} | "
            f"{_pct(smoke_block['top1_move_match_accuracy'])} | {100 * delta:+.1f} pp |"
        )

    accuracies = [bands[name]["top1_move_match_accuracy"] for name in band_order]
    monotonic = all(a <= b for a, b in zip(accuracies, accuracies[1:]))
    separated = []
    for left, right in zip(band_order, band_order[1:]):
        if bands[left]["wilson95_high"] < bands[right]["wilson95_low"]:
            separated.append(f"{left} < {right}")
        elif bands[right]["wilson95_high"] < bands[left]["wilson95_low"]:
            separated.append(f"{left} > {right}")
    trend_text = (
        "monotonically increasing with rating"
        if monotonic
        else "not monotonically increasing with rating"
    )
    separation_text = (
        "Adjacent bands whose Wilson intervals do not overlap: "
        + "; ".join(separated)
        + "."
        if separated
        else "No adjacent band pair is separated at the 95% level."
    )
    smoke_acc = {
        name: smoke["move_match_by_band"][name]["top1_move_match_accuracy"]
        for name in band_order
        if name in smoke.get("move_match_by_band", {})
    }
    dip_sentences = []
    for index, name in enumerate(band_order[1:-1], start=1):
        left, right = band_order[index - 1], band_order[index + 1]
        if not {name, left, right} <= smoke_acc.keys():
            continue
        smoke_depth = min(smoke_acc[left], smoke_acc[right]) - smoke_acc[name]
        if smoke_depth <= 0:
            continue
        bench_depth = min(accuracies[index - 1], accuracies[index + 1]) - accuracies[index]
        neighbors_overlap = (
            bands[name]["wilson95_high"] >= bands[left]["wilson95_low"]
            and bands[name]["wilson95_high"] >= bands[right]["wilson95_low"]
        )
        if bench_depth <= 0:
            dip_sentences.append(
                f"The smoke test's {100 * smoke_depth:.1f} pp local minimum at {name} "
                "does not reproduce here."
            )
        elif neighbors_overlap:
            dip_sentences.append(
                f"The smoke test's {100 * smoke_depth:.1f} pp local minimum at {name} "
                f"shrinks to a statistically insignificant {100 * bench_depth:.1f} pp."
            )
        else:
            dip_sentences.append(
                f"The smoke test's local minimum at {name} persists "
                f"({100 * bench_depth:.1f} pp below its neighbors)."
            )
    confidences = [
        bands[name]["mean_maia_top1_probability"] for name in band_order
    ]
    if all(a <= b for a, b in zip(confidences, confidences[1:])):
        dip_sentences.append(
            "Maia2's mean top-1 confidence rises monotonically with band "
            f"({confidences[0]:.3f} → {confidences[-1]:.3f})."
        )
    trend_paragraph = " ".join(
        [f"The band trend is {trend_text}.", separation_text, *dip_sentences]
    )

    bucket_rows = [
        "| Band | Plies 11–20 | Plies 21–40 | Plies 41+ | ≤10 pieces | 11–20 pieces | 21–32 pieces |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name in band_order:
        block = bands[name]
        ply = block["by_ply_bucket"]
        pieces = block["by_piece_bucket"]
        bucket_rows.append(
            f"| {name} | "
            + " | ".join(
                _pct(ply[bucket]["top1_move_match_accuracy"])
                for bucket in ("11-20", "21-40", "41+")
            )
            + " | "
            + " | ".join(
                _pct(pieces[bucket]["top1_move_match_accuracy"])
                for bucket in ("<=10", "11-20", "21-32")
            )
            + " |"
        )

    paper_reference = {"<1600": 51.72, "1600-2000": 54.15, ">2000": 53.87}
    paper_rows = [
        "| Skill group | This benchmark | Maia2 paper (Dec 2023 Cross-skill) |",
        "|---|---|---:|",
    ]
    for group, published in paper_reference.items():
        block = benchmark.get("paper_skill_groups", {}).get(group)
        if block is None or block["n"] == 0:
            continue
        paper_rows.append(
            f"| {group} | {_band_ci_text(block)} (n={block['n']:,}) | {published:.2f}% |"
        )

    return "\n".join(
        [
            "# Independent Maia2 move-match benchmark",
            "",
            f"Maia2 (`{protocol['model_type']}` weights, {protocol['device']}) was evaluated on "
            f"{overall['n']:,} moves sampled from Lichess {protocol['month']} rated "
            f"{protocol['speed']} games. The released Maia2 weights were trained on "
            "Lichess rapid games from May 2018 through November 2023, excluding "
            "December 2019 (Tang et al., NeurIPS 2024; CSSLab/maia2 training configs), "
            "and were published in October 2024 without subsequent retraining. "
            f"Lichess {protocol['month']} therefore cannot overlap the training data — "
            "unlike the committed 2019-04 smoke test, whose month sits inside the "
            "training window.",
            "",
            "## Protocol",
            "",
            f"- Only rated standard {protocol['speed']} games with two banded ratings qualify.",
            f"- The first {protocol['min_ply'] - 1} plies of each game are excluded, and so is any "
            f"position where either player has under {protocol['min_clock_seconds']:.0f} seconds on "
            "the clock, following the published Maia2 evaluation filters.",
            f"- Each player contributes at most {protocol['max_moves_per_game']} moves per game; a seeded "
            f"per-band reservoir (seed {protocol['seed']}) samples "
            f"{protocol['moves_per_band_target']:,} moves per band from "
            f"{sampling.get('games_seen', 0):,} streamed games.",
            "- Maia2 is conditioned on the actual ratings of both players, not band midpoints.",
            "- The evaluated checkpoint is the October 2024 `rapid_model.pt` release "
            "(SHA-256 `65aae8465eed…e267e997`, matching the CSSLab/maia2 integrity pin), "
            "which has never been retrained.",
            "",
            "## Results",
            "",
            "\n".join(result_rows),
            "",
            trend_paragraph,
            "",
            "## Comparison with the published Maia2 figures",
            "",
            "\n".join(paper_rows),
            "",
            "The paper's Cross-skill Testset uses December 2023 games with its own "
            "sampling, and its natural rating mix differs from this band-balanced "
            "sample (each band contributes equally here, which overweights low "
            "ratings inside the <1600 group). The comparison is directional, not "
            "exact.",
            "",
            "## Comparison with the 2019-04 smoke test",
            "",
            "\n".join(smoke_rows),
            "",
            "The smoke test drew from eval-annotated games only (analysis-requested "
            "selection bias), included plies 2–10, applied no clock filter, and mixed "
            "all time controls. Differences between the columns therefore reflect "
            "protocol as well as data-overlap effects; the independent benchmark is "
            "the number to quote.",
            "",
            "## Accuracy by game phase",
            "",
            "\n".join(bucket_rows),
            "",
            "## Limitations",
            "",
            "- Wilson intervals treat moves as independent; moves from one game are "
            "correlated, which is why the game-clustered bootstrap interval is also "
            "reported.",
            "- The sample covers the leading portion of the month's chronological "
            "dump (the first hours after 00:00 UTC on the 1st), matching the main "
            "pipeline's streaming protocol; time zones active at that hour are "
            "over-represented.",
            "- Games involving BOT-titled accounts are excluded.",
            "- Lichess ratings are Glicko-2; no chess.com mapping is claimed (issue #2).",
        ]
    ) + "\n"


def _hazard_report(
    v0: dict, v1: dict | None, v0_matched: dict | None
) -> str:
    overall = v0["metrics"]["overall"]
    success = overall["lightgbm"]["pr_auc"] > overall["abs_eval"]["pr_auc"]
    parts = [
        "# Model 2: Blunder-hazard classifier",
        "",
        f"The v0 LightGBM was trained on {v0['positions']:,} positions from {v0['games']:,} games. Splits are deterministic by game, so no position from a game appears in more than one split.",
        "",
        "## v0 held-out metrics",
        "",
        _metric_table(
            v0["metrics"], ["lightgbm", "abs_eval", "constant_base_rate"]
        ),
        "",
        f"Success bar (LightGBM PR-AUC > |eval| PR-AUC): **{'PASS' if success else 'NOT MET'}** "
        f"({overall['lightgbm']['pr_auc']:.3f} vs {overall['abs_eval']['pr_auc']:.3f}).",
        "",
        "![Calibration](hazard_calibration.png)",
        "",
        "![Feature importance](hazard_feature_importance.png)",
    ]
    if v1 is not None:
        v1_overall = v1["metrics"]["overall"]
        matched_text = ""
        if v0_matched is not None:
            matched_pr = v0_matched["metrics"]["overall"]["lightgbm"]["pr_auc"]
            matched_text = (
                f"The matched hand-feature model scores {matched_pr:.3f}, "
                f"for a Maia-feature delta of {v1_overall['lightgbm']['pr_auc'] - matched_pr:+.3f}."
            )
        parts.extend(
            [
                "",
                "## Maia2-feature v1",
                "",
                _metric_table(
                    v1["metrics"], ["lightgbm", "abs_eval", "constant_base_rate"]
                ),
                "",
                f"On the capped Maia2 subset, v1 PR-AUC is {v1_overall['lightgbm']['pr_auc']:.3f}. "
                f"{matched_text} The deployed product hook remains v0 because it is trained on much more data and avoids runtime Maia inference.",
            ]
        )
    parts.extend(
        [
            "",
            "## Feature definition and limitations",
            "",
            "- The hanging-piece count is a fast static-exchange proxy: attacked pieces whose cheapest attacker costs less, or which are undefended.",
            f"- The local run caps labels at {v0['positions']:,} and Maia2 features at "
            f"{v1['positions'] if v1 is not None else 0:,} positions.",
            "- Lichess analysis availability is not random; results characterize the sampled annotated games.",
            "- The absolute-eval baseline is calibrated on training games, while its ranking signal remains |eval| alone.",
        ]
    )
    return "\n".join(parts) + "\n"


def _summary_report(
    config: dict,
    v0: dict,
    v1: dict | None,
    maia: dict,
    repertoire: dict,
    gambits: dict,
    benchmark: dict | None,
) -> str:
    overall = v0["metrics"]["overall"]
    smoke_positions = maia.get("smoke_positions", maia["positions"])
    counts = {
        band: sum(len(section) for section in sections.values())
        for band, sections in repertoire["bands"].items()
    }
    surprises = []
    for band, rows in gambits.items():
        if rows:
            top = next(
                (
                    row
                    for row in rows
                    if row["score_lift_pct"] > 0
                    and row["engine_eval_cp_white_after_8_plies"] is not None
                    and row["engine_eval_cp_white_after_8_plies"] < 0
                ),
                rows[0],
            )
            engine_value = top["engine_eval_cp_white_after_8_plies"]
            engine_text = (
                f"{engine_value:+.0f} cp for White"
                if engine_value is not None
                else "unavailable"
            )
            surprises.append(
                f"- In {band}, **{top['opening']}** scored {top['score_lift_pct']:+.1f} points above the band average across N={top['n']:,}; its short-line engine eval was {engine_text}."
            )
    if not surprises:
        surprises.append("- No gambit family cleared the N=50 sanity threshold in this capped stream.")
    return "\n".join(
        [
            "# Chess coach models: evaluation summary",
            "",
            f"All results use a seeded stream from Lichess {config['data']['month']} on Apple Silicon. Real data and model binaries are intentionally uncommitted.",
            "",
            "| Model | Primary result | Status |",
            "|---|---|---|",
            f"| Graded-opponent scorer | Maia smoke: {smoke_positions:,} held-out positions on {maia['device']} | Runnable |",
            *(
                [
                    f"| Maia2 independent benchmark | Top-1 {100 * benchmark['overall']['top1_move_match_accuracy']:.1f}% "
                    f"on {benchmark['overall']['n']:,} moves from {benchmark['protocol']['month']} rated "
                    f"{benchmark['protocol']['speed']} | Training-independent |"
                ]
                if benchmark is not None
                else []
            ),
            f"| Blunder hazard v0 | PR-AUC {overall['lightgbm']['pr_auc']:.3f} vs absolute-eval {overall['abs_eval']['pr_auc']:.3f} | {'Pass' if overall['lightgbm']['pr_auc'] > overall['abs_eval']['pr_auc'] else 'Below success bar'} |",
            f"| Repertoire optimizer | Strict-N recommendations: {counts.get('<1100', 0)} / {counts.get('1100-1400', 0)} | Runnable |",
            "",
            "## Notable findings",
            "",
            *surprises[:3],
            "",
            "## Scope decisions",
            "",
            "- v0 ships as the hazard API because it runs everywhere without Maia2 inference.",
            "- v1 is retained and reported, but only a capped subset carries Maia2 and Stockfish-best-move features.",
            "- The neural-head stretch model was not run: on this laptop-sized sample, LightGBM is the higher-value use of compute and remains the product model.",
            "- Repertoire output never lowers the configured N≥2,000 rule; sections can contain fewer than five rows when the local stream cannot support five honest recommendations.",
        ]
    ) + "\n"


def _update_readme(
    readme: Path, v0: dict, maia: dict, repertoire: dict, benchmark: dict | None
) -> None:
    text = readme.read_text(encoding="utf-8")
    overall = v0["metrics"]["overall"]
    smoke_positions = maia.get("smoke_positions", maia["positions"])
    counts = {
        band: sum(len(section) for section in sections.values())
        for band, sections in repertoire["bands"].items()
    }
    benchmark_rows = []
    if benchmark is not None:
        bench_overall = benchmark["overall"]
        benchmark_rows.append(
            f"| Maia2 independent benchmark | Top-1 {100 * bench_overall['top1_move_match_accuracy']:.1f}% "
            f"(95% CI {100 * bench_overall['wilson95_low']:.1f}–{100 * bench_overall['wilson95_high']:.1f}%) "
            f"on {bench_overall['n']:,} {benchmark['protocol']['month']} rated "
            f"{benchmark['protocol']['speed']} moves |"
        )
    block = "\n".join(
        [
            "<!-- RESULTS_START -->",
            "| Model | Result |",
            "|---|---|",
            f"| Graded-opponent scorer | Maia2 smoke on {smoke_positions:,} held-out positions; sample PGN annotation complete |",
            *benchmark_rows,
            f"| Blunder hazard v0 | PR-AUC {overall['lightgbm']['pr_auc']:.3f} vs absolute-eval baseline {overall['abs_eval']['pr_auc']:.3f}; Brier {overall['lightgbm']['brier_score']:.3f} |",
            f"| Repertoire optimizer | {counts.get('<1100', 0)} strict-N rows below 1100; {counts.get('1100-1400', 0)} at 1100–1400 |",
            "<!-- RESULTS_END -->",
        ]
    )
    if "<!-- RESULTS_START -->" in text:
        before = text.split("<!-- RESULTS_START -->", 1)[0]
        after = text.split("<!-- RESULTS_END -->", 1)[1]
        text = before + block + after
    else:
        text += "\n## Results\n\n" + block + "\n"
    readme.write_text(text, encoding="utf-8")


def _append_repertoire_findings(
    reports: Path, repertoire: dict, gambits: dict
) -> None:
    slugs = {"<1100": "lt1100", "1100-1400": "1100-1400"}
    for band, sections in repertoire["bands"].items():
        path = reports / f"repertoire_{slugs[band]}.md"
        total = sum(len(rows) for rows in sections.values())
        all_rows = [row for rows in sections.values() for row in rows]
        best = max(all_rows, key=lambda row: row["score_pct"]) if all_rows else None
        gambit_rows = gambits.get(band, [])
        practical = next(
            (
                row
                for row in gambit_rows
                if row["score_lift_pct"] > 0
                and row["engine_eval_cp_white_after_8_plies"] is not None
                and row["engine_eval_cp_white_after_8_plies"] < 0
            ),
            gambit_rows[0] if gambit_rows else None,
        )
        findings = [
            "<!-- FINDINGS_START -->",
            "",
            "## Sanity checks and surprises",
            "",
            f"- {total} lines clear the strict N≥2,000 threshold across the three sections; no sub-threshold line is promoted.",
        ]
        if best is not None:
            findings.append(
                f"- The highest-scoring eligible line is **{best['line_san']}** at {best['score_pct']:.1f}% "
                f"(N={best['n']:,}, 95% CI {best['wilson_low_pct']:.1f}–{best['wilson_high_pct']:.1f}%)."
            )
        if practical is not None:
            engine_value = practical["engine_eval_cp_white_after_8_plies"]
            engine_text = (
                f"{engine_value:+.0f} cp"
                if engine_value is not None
                else "not available"
            )
            findings.append(
                f"- Gambit check: **{practical['opening']}** scores {practical['score_lift_pct']:+.1f} points "
                f"above the band average (N={practical['n']:,}) while its representative eight-ply line evaluates at {engine_text} for White."
            )
        findings.append("<!-- FINDINGS_END -->")
        current = path.read_text(encoding="utf-8")
        if "<!-- FINDINGS_START -->" in current:
            current = current.split("<!-- FINDINGS_START -->", 1)[0].rstrip() + "\n\n"
        path.write_text(current + "\n".join(findings) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/config.yaml")
    args = parser.parse_args()
    config = load_config(args.config)
    reports = project_path(config, "reports")
    v0 = _read_json(reports / "hazard_metrics.json")
    v1_path = reports / "hazard_metrics_v1_maia.json"
    v1 = _read_json(v1_path) if v1_path.exists() else None
    matched_path = reports / "hazard_metrics_v0_matched.json"
    v0_matched = _read_json(matched_path) if matched_path.exists() else None
    maia = _read_json(reports / "maia_smoke_metrics.json")
    samples = _read_json(reports / "scorer_samples.json")
    repertoire = _read_json(reports / "repertoire.json")
    gambits = _read_json(reports / "gambit_sanity.json")
    benchmark_path = project_path(config, config["maia_benchmark"]["metrics_path"])
    benchmark = _read_json(benchmark_path) if benchmark_path.exists() else None

    _plot_calibration(v0, reports / "hazard_calibration.png")
    _plot_importance(
        reports / "hazard_feature_importance.csv",
        reports / "hazard_feature_importance.png",
    )
    (reports / "graded_opponent.md").write_text(
        _scorer_report(config, maia, samples, benchmark), encoding="utf-8"
    )
    (reports / "blunder_hazard.md").write_text(
        _hazard_report(v0, v1, v0_matched), encoding="utf-8"
    )
    if benchmark is not None:
        (reports / "maia_benchmark.md").write_text(
            _benchmark_report(config, benchmark, maia), encoding="utf-8"
        )
    (reports / "SUMMARY.md").write_text(
        _summary_report(config, v0, v1, maia, repertoire, gambits, benchmark),
        encoding="utf-8",
    )
    _append_repertoire_findings(reports, repertoire, gambits)
    _update_readme(
        project_path(config, "README.md"), v0, maia, repertoire, benchmark
    )
    print("Generated reports and README results table.")


if __name__ == "__main__":
    main()
