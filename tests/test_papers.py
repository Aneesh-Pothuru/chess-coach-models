"""The paper tooling's own rules: how a number prints, what a switch takes out, and which words a name has.

These need no dataset and no trained run. What a paper draws from a model's
records and closer look is checked in ``test_lab_pipeline.py``, on runs it
trains.
"""

from __future__ import annotations

from importlib import import_module

import pytest

from chess_coach_models import data, paths, tasks
from chess_coach_models.encode.hand import GROUPS, group_of
from chess_coach_models.evals import analysis
from chess_coach_models.papers import build, changes, charts, glossary, overview, sources, tex


MODELS = sorted(path.parent.name for path in paths.models().glob("*/task.yaml"))


def test_a_number_prints_at_a_paper_s_precision():
    assert tex.count(1127915) == "1{,}127{,}915"
    assert tex.fixed(-0.25, 1) == "$-$0.2" and tex.fixed(0.25, 2, sign=True) == "+0.25"
    # A value that rounds to nothing carries no minus sign.
    assert tex.fixed(-0.0004, 2) == "0.00" and tex.fixed(-0.0004, 2, sign=True) == "+0.00"
    assert tex.score(0.42374) == "0.4237" and tex.score(1.5) == "1.500" and tex.score(1234.56) == "1234.6"
    assert tex.sig(24.678) == "24.68" and tex.sig(0.0044432) == "0.004443" and tex.sig(0) == "0"
    assert tex.sig(0.0581, 3, sign=True) == "+0.0581"
    assert tex.percent(0.1234) == "12.3" and tex.percent(0.5, 0) == "50"
    assert tex.plain(0.0006) == "0.0006" and tex.plain(1024) == "1{,}024"
    assert tex.duration(45) == "45 s" and tex.duration(600) == "10 min" and tex.duration(9000) == "2.5 h"
    for helper in (tex.count, tex.fixed, tex.score, tex.sig, tex.percent):
        assert helper(None) == "n/a" and helper(float("nan")) == "n/a"


def test_a_value_and_its_interval_share_one_precision():
    assert tex.trio(0.0113649, 0.00892226, 0.0136922) == ("+0.01136", "+0.00892", "+0.01369")
    assert tex.trio(-0.00048, -0.00129, 0.00037) == ("$-$0.000480", "$-$0.001290", "+0.000370")
    assert tex.trio(12.3, None, 14.0) == ("n/a", "n/a", "n/a")


def test_a_count_reads_as_prose_says_it():
    assert tex.word(0) == "zero" and tex.word(12) == "twelve" and tex.word(13) == "13"
    assert tex.of(4, 4, "networks") == "all four networks" and tex.of(2, 2, "networks") == "both networks"
    assert tex.of(0, 4, "networks") == "none of the four networks" and tex.of(0, 2, "runs") == "neither of the two runs"
    assert tex.of(1, 4, "networks") == "one of the four networks"
    assert tex.of(1, 1, "network") == "the one network" and tex.of(0, 1, "network") == "not the one network"


def test_text_from_a_file_is_escaped_and_a_key_is_made_plain():
    assert tex.esc("<1100 & 50%_x") == r"\textless{}1100 \& 50\%\_x"
    assert tex.key("slice", "clock", "<30", "engine-curve", "said") == "slice.clock.-30.engine-curve.said"
    assert tex.key("grid", "rating-win", "2000+", "80+") == "grid.rating-win.2000+.80+"
    assert tex.code("the column `win_before`, times 0.01") == r"the column \texttt{win\_before}, times 0.01"


def test_a_value_is_set_once_and_a_block_once():
    out = tex.Generated("a test")
    out.set("best.score", "0.4235")
    out.set("best.score", "0.4235")
    with pytest.raises(ValueError, match="set twice"):
        out.set("best.score", "0.4237")
    with pytest.raises(ValueError, match="not a value key"):
        out.set("best score", "0.4235")
    out.block("leaderboard", "a table")
    with pytest.raises(ValueError, match="written twice"):
        out.block("leaderboard", "another")
    with pytest.raises(ValueError, match="not a plain file name"):
        out.block("Leader_board", "a table")


def test_only_what_the_prose_reads_is_written(tmp_path):
    prose = r"The best run scores \V{best.score} (\block{leaderboard}), and \examples{examples-typical}{Three}{fig:typical}."
    assert tex.used_keys(prose) == {"best.score"}
    assert tex.used_blocks(prose) == {"leaderboard", "examples-typical"}
    out = tex.Generated("a test")
    for name in ("best.score", "floor.score"):
        out.set(name, "0.5")
    for name in ("leaderboard", "examples-typical", "curves"):
        out.block(name, f"the block {name}")
    (tmp_path / "stale.tex").write_text("left by an earlier run")
    out.write(tmp_path, keys=tex.used_keys(prose), blocks=tex.used_blocks(prose), flags=["\\looktrue"])
    assert sorted(path.name for path in tmp_path.iterdir()) == ["examples-typical.tex", "leaderboard.tex", "values.tex"]
    values = (tmp_path / "values.tex").read_text()
    assert "\\looktrue" in values and "\\setvalue{best.score}{0.5}" in values and "floor.score" not in values


def test_a_switch_that_is_off_takes_its_side_of_the_prose_out():
    prose = r"a \iflook b \ifpairs c \else d \fi e \else f \fi g"
    assert build.firm(prose, {"look": True, "pairs": True}).split() == ["a", "b", "c", "e", "g"]
    assert build.firm(prose, {"look": True, "pairs": False}).split() == ["a", "b", "d", "e", "g"]
    assert build.firm(prose, {"look": False, "pairs": True}).split() == ["a", "f", "g"]
    # A conditional that is no switch of the lab's keeps both its sides, inside a switch or out of one.
    other = r"a \ifdim x \else y \fi \ifgames z \fi"
    assert build.firm(other, {"games": False}).split() == ["a", "x", "y"]
    assert build.firm(other, {"games": True}).split() == ["a", "x", "y", "z"]
    assert r"\V{gone}" not in build.firm(r"\ifvariants\else \V{gone} \fi", {"variants": True})


def test_a_run_that_changes_another_is_drawn_as_that_run():
    assert charts.family("transformer-medium-hand-long") == "transformer-medium-hand"
    assert charts.family("transformer-medium-long") == "transformer-medium"
    assert charts.variant("transformer-medium-hand-pretrained") == "pretrained"
    assert charts.family("gbm-hand-no-first-move") == "gbm-hand" and charts.variant("gbm-hand-no-first-move") == "no-first-move"
    assert charts.family("something-new") == "something-new" and charts.variant("something-new") == ""
    assert charts.run_colour("transformer-medium-hand-long") == charts.run_colour("transformer-medium-hand")
    assert charts.run_dash("transformer-medium-hand") is None
    dashes = {charts.run_dash(f"transformer-medium-{added}") for added in ("long", "pretrained", "half")}
    assert len(dashes) == 3 and None not in dashes


def test_every_run_of_every_model_has_a_colour_of_its_own_family():
    for model in MODELS:
        for config in paths.configs(model).glob("*.yaml"):
            assert charts.family(config.stem) in charts.RUN_COLOURS, f"{model}/{config.stem} would be drawn in grey"
            assert charts.family(config.stem) in charts.RUN_MARKS


def test_a_grid_of_differences_is_two_colours_that_meet_in_grey():
    cells = [[(-0.2, "$-$0.20"), (0.0, "+0.00"), (0.1, "+0.10"), (None, "")]]
    drawn = charts.grid(["row"], ["a", "b", "c", "d"], cells, row_title="Rows", column_title="Columns", low=-0.2, high=0.2, centre=0.0)
    fills = [line.split("fill=")[1].split(",")[0] for line in drawn.splitlines() if "fill=" in line]
    assert fills == ["labBlue!70!labGrid", "labBlue!0!labGrid", "labOrange!35!labGrid", "white"]
    # Without a centre the grid is one colour from light to dark.
    plain = charts.grid(["row"], ["a", "b"], [[(0.0, "0"), (1.0, "1")]], row_title="Rows", column_title="Columns", low=0.0, high=1.0)
    assert "labOrange" not in plain and "labBlue!8!white" in plain and "labBlue!90!white" in plain


def test_rows_in_groups_stand_under_their_group_s_name_on_one_axis():
    drawn = charts.grouped_intervals(
        [
            ("first model", [("gbm-hand", 1.0, 0.5, 1.5, "labBlue"), ("constant", None, None, None, "labGrey")]),
            ("second model", [("gbm-hand", -2.0, -3.0, -1.0, "labBlue")]),
        ],
        xlabel="Gain",
        reference=0.0,
        reference_label="reference",
    )
    # A slot for each group's name and for each row, a row with nothing measured among them.
    assert "ytick={0,1,2,3,4}" in drawn
    labels = drawn.split("yticklabels={")[1].splitlines()[0]
    assert labels.index("first model") < labels.index("constant") < labels.index("second model")
    assert drawn.count("\\addplot[only marks") == 2 and "(axis cs:-3,4) -- (axis cs:-1,4)" in drawn
    assert "(axis cs:0,-0.6) -- (axis cs:0,4.6)" in drawn and "{reference}" in drawn


def test_a_run_keeps_its_lane_colour_and_mark_from_strip_to_strip():
    drawn = charts.strips(
        [("first-model", [("gbm-context", 40.0), ("transformer-small", 101.0)]), ("second-model", [("gbm-context", 65.0)])],
        xlabel="Share",
        marks=[(0.0, "floor"), (100.0, "reference")],
        order=["transformer-small", "gbm-context"],
    )
    small, context = [line for line in drawn.splitlines() if line.startswith("\\addplot")]
    # Strips are 0.9 apart here, and a run sits the same way off the middle of each.
    assert "(101,-0.1)" in small and "(40,0.1) (65,1)" in context
    assert charts.run_colour("gbm-context") in context and f"mark={charts.run_mark('gbm-context')}" in context
    assert charts.run_colour("transformer-small") in small and charts.run_mark("transformer-small") != charts.run_mark("gbm-context")
    assert drawn.count("\\addlegendentry") == 2 and "{floor}" in drawn and "{reference}" in drawn
    # Without an order a run takes its lane where it first appears.
    plain = charts.strips([("one-model", [("gbm-context", 1.0), ("transformer-small", 2.0)])], xlabel="Share")
    assert plain.index("{gbm-context}") < plain.index("{transformer-small}")


def test_two_runs_differ_in_the_settings_one_changes_or_in_the_learner():
    body = {"kind": "net", "body": "transformer", "dim": 256, "depth": 8}
    plain = {"config": {"learner": body, "train": {"epochs": 12, "lr": 0.0006}}}
    longer = {"config": {"learner": {**body, "features": "hand"}, "train": {"epochs": 24, "lr": 0.0006}}}
    trees = {"config": {"learner": {"kind": "gbm", "features": "hand"}}}
    assert changes.changed(longer, plain) == [("learner", "features"), ("train", "epochs")]
    assert changes.changed(plain, plain) == []
    assert changes.changed(longer, trees) is None and changes.differs(longer, trees) == "another learner"


def _record(name, learner, score, primary, gain=None, **config):
    record = {"run": name, "config": {"learner": learner, **config}, "test": {primary: {"value": score}}}
    if gain is not None:
        amount, low, high = gain
        record["gain"] = {"gain": amount, "low": low, "high": high, "beyond_noise": low > 0 or high < 0}
    return record


def _sources(model, runs, look=None):
    return sources.Sources(model, False, tasks.get(model), runs, [], {}, {}, look, (), ())


def test_the_lab_s_one_scale_is_the_reference_s_step_from_the_floor():
    # An error, where lower is better: the floor at 500, the reference at 300, so a step of 200.
    primary = tasks.get("puzzle-difficulty").primary
    runs = [
        _record("transformer-small", {"kind": "net", "body": "transformer"}, 280.0, primary, gain=(20.0, 10.0, 30.0)),
        _record("gbm-hand", {"kind": "gbm", "features": "hand"}, 300.0, primary),
        _record("gbm-context", {"kind": "gbm", "features": "context"}, 420.0, primary, gain=(-120.0, -130.0, -110.0)),
        _record("constant", {"kind": "constant"}, 500.0, primary),
    ]
    src = _sources("puzzle-difficulty", runs)
    assert src.task.lower_is_better and overview.step(src) == 200.0
    assert [overview.share(src, run) for run in runs] == [110.0, 100.0, 40.0, 0.0]
    assert overview.on_step(src, runs[0]["gain"]) == (10.0, 5.0, 15.0)
    assert overview.context_run(src) is runs[2]
    # The reference over the trees that read no hand feature is a pair of every model: where no closer
    # look measured it, the trees' record holds it from the other side.
    (pair,) = overview.pairs(src)
    assert (pair["run"], pair["over"], pair["gain"], pair["low"], pair["high"]) == ("gbm-hand", "gbm-context", 120.0, 110.0, 130.0)
    assert pair["kind"] == ("hand", "The hand features") and pair["learner"] == "gbm" and pair["beyond_noise"]
    # A reference that is no better than the floor is no step to measure by.
    runs[1]["test"][primary]["value"] = 500.0
    assert overview.step(src) is None and overview.share(src, runs[0]) is None
    assert overview.on_step(src, runs[0]["gain"]) is None


def test_the_one_scale_reads_a_score_where_higher_is_better_the_same_way():
    task = tasks.get("blunder-hazard")
    assert not task.lower_is_better
    runs = [
        _record("transformer-small", {"kind": "net", "body": "transformer"}, 0.30, task.primary, gain=(0.05, -0.01, 0.11)),
        _record("gbm-hand", {"kind": "gbm", "features": "hand"}, 0.25, task.primary),
        _record("constant", {"kind": "constant"}, 0.05, task.primary),
    ]
    src = _sources("blunder-hazard", runs)
    assert overview.step(src) == pytest.approx(0.2)
    assert overview.share(src, runs[0]) == pytest.approx(125.0)
    assert overview.on_step(src, runs[0]["gain"]) == pytest.approx((25.0, -5.0, 55.0))
    lab = overview.Lab({"blunder-hazard": src}, {}, {})
    # A gain whose interval holds zero is level with the reference, however large it is.
    assert overview._verdicts(lab, lambda one: one.networks[0]) == ([], ["blunder-hazard"], [])
    assert overview.pairs(src) == [] and not any(overview.switches(lab).values())
    assert set(overview.switches(lab)) == {"waiting", "changehand", "changeepochs", "changestart", "games", "features"}


def _longer(model, gain):
    """A model whose larger transformer was trained again with twice the epochs, and the pair its closer look measured."""
    primary = tasks.get(model).primary
    body = {"kind": "net", "body": "transformer", "dim": 256, "depth": 8}
    better = -1.0 if tasks.get(model).lower_is_better else 1.0
    runs = [
        _record("transformer-medium-long", body, 10.0 + 3 * better, primary, train={"epochs": 24}),
        _record("transformer-medium", body, 10.0 + 2 * better, primary, train={"epochs": 12}),
        _record("gbm-hand", {"kind": "gbm", "features": "hand"}, 10.0 + better, primary),
        _record("gbm-context", {"kind": "gbm", "features": "context"}, 10.0 + 0.5 * better, primary, gain=(-0.5, -0.6, -0.4)),
        _record("constant", {"kind": "constant"}, 10.0, primary),
    ]
    amount, low, high = gain
    pair = {"run": "transformer-medium-long", "over": "transformer-medium", "gain": amount, "low": low, "high": high, "beyond_noise": low > 0 or high < 0}
    return _sources(model, runs, look={"pairs": [pair]})


def test_one_change_is_read_model_by_model_by_the_run_it_was_made_in():
    lab = overview.Lab(
        {"blunder-hazard": _longer("blunder-hazard", (0.1, -0.2, 0.4)), "puzzle-difficulty": _longer("puzzle-difficulty", (0.3, 0.1, 0.5))},
        {},
        {},
    )
    # The kinds come in one order whatever a model's files list first: the hand features under the trees, then the epochs.
    assert list(overview.kinds(lab)) == [("hand", "gbm"), ("epochs", "net")]
    found = overview.by_base(lab)
    assert list(found) == ["hand", "epochs"] and list(found["epochs"]) == ["transformer-medium"]
    assert list(found["epochs"]["transformer-medium"]) == ["blunder-hazard", "puzzle-difficulty"]
    switches = overview.switches(lab)
    assert switches["changehand"] and switches["changeepochs"] and not switches["changestart"]
    table = overview.changes_table(lab)
    assert "\\textbf{More epochs}" in table and "over \\run{transformer-medium}" in table and "over \\run{gbm-context}" in table
    # A step of 1 in both models, so a gain of 0.3 is thirty hundredths of it, and only the gain beyond the noise is bold.
    assert "\\textbf{+30.0} & +10.0 to +50.0" in table and "& +10.0 & $-$20.0 to +40.0" in table
    assert overview._tally(["puzzle-difficulty"], ["blunder-hazard"], []) == (
        "better beyond the noise in one of the two models (puzzle difficulty) and inside the noise in one of the two models (blunder hazard)"
    )
    assert overview._tally([], ["think-time"], []) == "inside the noise in the one model (think time)"


def test_a_card_s_question_is_read_up_to_its_question_mark(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "ROOT", tmp_path)
    card = tmp_path / "models" / "some-model" / "README.md"
    card.parent.mkdir(parents=True)
    assert overview.question("some-model") == ""
    card.write_text("# Some model\n\n**The question.** How hard is this\n[tactic](../other/) for people? A rating says.\n", encoding="utf-8")
    assert overview.question("some-model") == "How hard is this tactic for people?"


@pytest.mark.parametrize("model", MODELS)
def test_every_model_s_card_opens_with_its_question(model):
    assert overview.question(model).endswith("?")


def test_a_name_and_a_count_read_as_the_lab_s_prose_says_them():
    assert overview.said("puzzle-difficulty-unsolved") == "puzzle difficulty unsolved"
    assert overview._listed([]) == "none" and overview._listed(["one", "two", "three"]) == "one, two and three"
    assert overview._of(1, 1, "pair") == "the one pair" and overview._of(2, 5, "model") == "two of the five models"


@pytest.mark.parametrize("model", MODELS)
def test_the_glossary_has_words_for_every_name_a_paper_can_show(model):
    task = tasks.get(model)
    recipe = data.recipe(task.dataset)
    builder = import_module(f"chess_coach_models.data.{data.BUILDERS[recipe['builder']]}")
    plan = analysis.plan(model)
    marks = [name for name in builder.MARKS if task.marks is None or name in task.marks]
    hand = [name for name in builder.HAND if task.hand is None or group_of(name) in task.hand]
    shown = [task.label, *task.context, *hand, *plan.get("describe", []), *plan.get("examples", {}).get("show", [])]
    assert [name for name in shown if name not in glossary.COLUMNS] == []
    assert [name for name in marks if name not in glossary.MARKS] == []
    for name in shown:
        label, sentence = glossary.COLUMNS[name]
        assert label and sentence.endswith(".")
        assert glossary.title(name)[0] == label[0].upper()


def test_the_glossary_has_words_for_every_group_of_hand_features():
    assert set(GROUPS) <= set(glossary.GROUPS)
    assert glossary.GROUP_FEATURES is GROUPS
