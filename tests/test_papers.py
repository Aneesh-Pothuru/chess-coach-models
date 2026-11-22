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


def test_a_run_of_another_body_or_size_is_drawn_as_the_run_its_config_changes():
    import yaml

    assert charts.family("hybrid-medium-hand") == "transformer-medium-hand" and charts.variant("hybrid-medium-hand") == "hybrid"
    assert charts.run_colour("conv-medium") == charts.run_colour("transformer-medium")
    assert charts.family("conv-small") == "conv-small" and charts.variant("conv-small") == ""
    seen = set()
    for model in MODELS:
        for config in paths.configs(model).glob("*.yaml"):
            if config.stem in charts.CHANGED:
                assert yaml.safe_load(config.read_text())["base"] == charts.CHANGED[config.stem][0], f"{model}/{config.stem}"
                seen.add(config.stem)
    assert seen == set(charts.CHANGED)
    # In one figure a run and the runs that change it share a colour and a mark, so each change has a line of its own.
    words = ["long", "pretrained", "attacks", *{change for _, change in charts.CHANGED.values()}]
    dashes = [charts.VARIANT_DASHES[word] for word in words]
    assert len(set(dashes)) == len(dashes) and charts.OTHER_DASH not in dashes


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


def test_a_block_that_is_one_table_or_one_picture_is_drawn_no_wider_than_the_text():
    table = tex.tabular("lr", ["Run", "Score"], [["a", "1"]])
    fitted = tex.fit(table)
    assert fitted.startswith("\\fit{%\n\\begin{tabular}") and fitted.endswith("\\end{tabular}%\n}")
    assert tex.fit(fitted) == fitted
    # A table that already has the text's width, a block of several things and plain words are left as they are.
    wide = tex.tabular("Lr", ["Run", "Score"], [["a", "1"]], width="\\textwidth")
    several = table + "\n\n" + table
    assert tex.fit(wide) == wide and tex.fit(several) == several and tex.fit("words alone") == "words alone"
    # Every block a paper is given goes through it, and the preamble has the command it is wrapped in.
    out = tex.Generated("a test")
    out.block("one", table)
    out.block("several", several)
    assert out.files == {"one": fitted, "several": several}
    assert "\\newcommand{\\fit}[1]" in (paths.ROOT / "papers" / "preamble.tex").read_text(encoding="utf-8")


def test_a_level_far_from_every_series_is_inside_the_axis():
    # pgfplots takes an axis's limits from its plots, and a level is drawn. Two runs that end one epoch a
    # fraction of a point apart, forty points from the level, once put the level metres off the page.
    one = charts.Series("a", [(1, 501.686)])
    two = charts.Series("b", [(1, 501.886)])
    drawn = charts.lines([one, two], xlabel="Epoch", ylabel="RMSE", level=(460.148, "reference", "labOrange"))
    held = [line for line in drawn.splitlines() if line.startswith("\\addplot[draw=none") and "forget plot" in line]
    assert held == ["\\addplot[draw=none, mark=none, forget plot] coordinates {(1,460.148)};"]
    assert drawn.index(held[0]) < drawn.index("\\draw[labOrange")
    assert "draw=none" not in charts.lines([one, two], xlabel="Epoch", ylabel="RMSE")


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
    # Two networks of different bodies or sizes differ in that, and a table says it.
    tower = {"config": {"learner": {"kind": "net", "body": "conv", "dim": 192, "depth": 10, "squeeze": 4}, "train": plain["config"]["train"]}}
    large = {"config": {"learner": {**body, "dim": 384, "depth": 12}, "train": plain["config"]["train"]}}
    told = {"config": {"learner": {**body, "attacks": True}, "train": plain["config"]["train"]}}
    blind = {"config": {"learner": {**body, "geometry": False}, "train": plain["config"]["train"]}}
    assert changes.differs(tower, plain) == "its body is a convolutional tower for a transformer"
    assert changes.differs(large, plain) == "12 layers of width 384 for 8 of width 256"
    assert changes.differs(told, plain) == "its attention is told what each piece attacks"
    assert changes.differs(blind, plain) == "its attention is not told the offsets between squares"


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
    assert set(overview.switches(lab)) == {"waiting", "changehand", "changeepochs", "changestart", "games", "features", "studies", "more"}


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


def test_a_run_that_was_filed_keeps_its_pair_and_its_place_beside_the_run_it_changed():
    tried = _longer("puzzle-difficulty", (0.1, -0.2, 0.4))
    longer, base = tried.runs[0], tried.runs[1]
    assert tried.variants(base) == [longer] and tried.filed == []
    table, written = changes.pairs_table(tried), tex.Generated("a test")
    changes.values(tried, written)
    assert "transformer-\\allowbreak medium-\\allowbreak long" in table and written.values["pairs.count"] == "one"

    # Filed: its record names the run it changed and its study, no leaderboard ranks it, and its pair names the study.
    primary = tried.task.primary
    longer["config"].update(base="transformer-medium", study="epochs")
    half = _record("gbm-hand-half", {"kind": "gbm", "features": "hand"}, 9.5, primary, base="gbm-hand", study="games", data={"train_share": 0.5})
    pairs = [
        {**tried.look["pairs"][0], "study": "epochs"},
        {"run": "gbm-hand-half", "over": "gbm-hand", "study": "games", "gain": -0.5, "low": -0.6, "high": -0.4, "beyond_noise": True},
    ]
    filed = sources.Sources(tried.model, False, tried.task, tried.runs[1:], [longer, half], {}, {}, {"pairs": pairs}, (), ())
    assert filed.filed == [longer] and filed.variants(base) == [longer] and filed.run("transformer-medium-long") is None
    # Its pair stands with the other pairs, as before; a run of the games study has a table of its own.
    assert changes.pairs_table(filed) == table
    written = tex.Generated("a test")
    changes.values(filed, written)
    assert written.values["pairs.count"] == "one" and written.values["study.epochs.runs"] == "one"
    assert written.values["pair.transformer-medium-long.transformer-medium.verdict"] == "inside the noise"
    # And the lab still reads it as what more epochs are worth in this model.
    (measured,) = [one for one in overview.pairs(filed) if one["kind"] == ("epochs", "More epochs")]
    assert (measured["run"], measured["over"], measured["gain"]) == ("transformer-medium-long", "transformer-medium", 0.1)


def test_a_run_on_a_larger_build_is_read_by_how_many_of_the_games_it_was_given():
    # A share of the training games, or a multiple of them, as a table and a sentence say it.
    assert [changes.share_words(share) for share in (4.0, 2.0, 0.5, 0.25)] == ["four times", "twice", "half", "a quarter"]
    assert changes.share_words(3.0) == "3 times" and changes.share_words(0.1) == "10\\%"
    assert changes.games_words(0.25) == "a quarter of the training games" and changes.games_words(2.0) == "twice the training games"
    assert changes.games_words(1.0, "the games") == "all the games" and changes.games_words(1.93) == "1.93 times the training games"

    primary = tasks.get("puzzle-difficulty").primary
    trees, body = {"kind": "gbm", "features": "hand"}, {"kind": "net", "body": "transformer", "dim": 256, "depth": 8}
    schedule, larger = {"epochs": 12, "patience": 3}, {"train_on": "puzzles-all"}

    def trained(name, rows, learner=trees, build=None, valid=None, score=300.0, **config):
        record = {**_record(name, learner, score, primary, **config), "train_rows": rows}
        if build is not None:
            record["train_dataset"] = {"dataset": build}
        if valid is not None:
            record["valid"] = {primary: valid}
        return record

    on = "puzzles-all-v1"
    runs = [
        trained("gbm-hand-quadruple", 4030, build=on, valid=7.0, base="gbm-hand", data=larger),
        trained("gbm-hand-double", 1960, build=on, base="gbm-hand", data={**larger, "train_share": 0.5}),
        trained("gbm-hand", 1000, valid=8.0),
        # A network on the larger build goes through it less often, which is part of the same change.
        trained("transformer-medium-double", 2010, body, on, base="transformer-medium", data=larger, train={"epochs": 6, "patience": 2}),
        # One that also changes its body changes two things, and is no run of the games study.
        trained("transformer-medium-wide", 2010, {**body, "dim": 384}, on, base="transformer-medium", data=larger, train=schedule),
        trained("transformer-medium", 1000, body, train=schedule),
        trained("constant", 1000, {"kind": "constant"}, score=500.0),
    ]
    studies = [
        trained("gbm-hand-half", 500, valid=9.0, base="gbm-hand", study="games", data={"train_share": 0.5}),
        # A run on more games that was tried and filed under the study stays where it stood.
        trained("gbm-hand-triple", 3300, build=on, valid=9.0, base="gbm-hand", study="games", data={**larger, "train_share": 0.8}),
    ]
    known = {run["run"]: run for run in [*runs, *studies]}
    # The multiple is read from the rows the two runs trained on, and taken to a round one within a twentieth.
    assert changes.multiple(known["gbm-hand-quadruple"], known["gbm-hand"]) == 4.0
    assert changes.multiple(known["gbm-hand-double"], known["gbm-hand"]) == 2.0
    assert changes.multiple(known["gbm-hand-triple"], known["gbm-hand"]) == 3.3
    assert changes.multiple(known["gbm-hand-half"], known["gbm-hand"]) is None

    def pair(run, over, gain, low, high, **more):
        return {"run": run, "over": over, "gain": gain, "low": low, "high": high, "beyond_noise": low > 0 or high < 0, **more}

    look = {
        "pairs": [
            pair("gbm-hand-quadruple", "gbm-hand", 0.4, 0.2, 0.6),
            pair("gbm-hand-double", "gbm-hand", 0.1, -0.1, 0.3),
            pair("gbm-hand-triple", "gbm-hand", -0.3, -0.5, -0.1, study="games"),
            pair("gbm-hand-half", "gbm-hand", -0.5, -0.6, -0.4, study="games"),
            pair("transformer-medium-double", "transformer-medium", 0.2, 0.1, 0.3),
        ]
    }
    src = sources.Sources("puzzle-difficulty", False, tasks.get("puzzle-difficulty"), runs, studies, {}, {}, look, (), ())
    found = {base: [(share, run["run"]) for share, run in found] for base, found in changes.games_runs(src).items()}
    # The reference's runs first, each from the most games to the fewest.
    assert list(found) == ["gbm-hand", "transformer-medium"]
    assert found["gbm-hand"] == [(4.0, "gbm-hand-quadruple"), (3.3, "gbm-hand-triple"), (2.0, "gbm-hand-double"), (0.5, "gbm-hand-half")]
    assert found["transformer-medium"] == [(2.0, "transformer-medium-double")]
    assert [(base, share, run["run"]) for base, share, run, _ in changes.more(src)] == [
        ("gbm-hand", 4.0, "gbm-hand-quadruple"),
        ("gbm-hand", 3.3, "gbm-hand-triple"),
        ("gbm-hand", 2.0, "gbm-hand-double"),
        ("transformer-medium", 2.0, "transformer-medium-double"),
    ]
    assert changes.differs(known["gbm-hand-double"], known["gbm-hand"]) == (
        "trains on twice the training games, from the larger build \\texttt{puzzles-all}"
    )
    assert changes.differs(known["transformer-medium-double"], known["transformer-medium"]) == (
        "trains on twice the training games, from the larger build \\texttt{puzzles-all}; 6 epochs for 12; 2 epochs of patience for 3"
    )

    written = tex.Generated("a test")
    changes.values(src, written)
    said = written.values
    # The study's own count is of the runs on fewer games; the runs on more are counted apart.
    assert said["study.games.gbm-hand.runs"] == "one"
    assert (said["more.gbm-hand.runs"], said["more.gbm-hand.better"], said["more.gbm-hand.worse"], said["more.gbm-hand.level"]) == (
        "three",
        "one",
        "one",
        "one",
    )
    assert said["more.gbm-hand.most"] == "four times" and "quadruple" in said["more.gbm-hand.most.run"]
    assert said["more.gbm-hand.most.rows"] == tex.count(4030) and said["more.gbm-hand.most.verdict"] == "better beyond the noise"
    # Puzzle difficulty is an error, so the lower valid score is the better one, and both halves of the rule hold.
    assert said["more.gbm-hand.most.kept"] == said["pair.gbm-hand-quadruple.gbm-hand.kept"] == "kept"
    # A run on more games was a candidate even after it is filed; a run on fewer never was.
    assert said["pair.gbm-hand-triple.gbm-hand.kept"] == "not kept" and "pair.gbm-hand-half.gbm-hand.kept" not in said
    assert said["more.transformer-medium.runs"] == "one" and "more.transformer-medium.most.kept" not in said

    # The table has the runs on more games above the run on all of them, and the runs on fewer below it.
    table = changes.games_table(src)
    order = [table.index(f"{sources.run_cell(name)} &") for name in ("gbm-hand-quadruple", "gbm-hand-triple", "gbm-hand-double", "gbm-hand", "gbm-hand-half")]
    assert order == sorted(order) and "& four times &" in table and "& 3.3 times &" in table and "& half &" in table
    # A run changed only by runs on more games has no curve to stand on, so it is among the pairs.
    assert sources.run_cell("transformer-medium-double") not in table
    assert sources.run_cell("transformer-medium-double") in changes.pairs_table(src)
    # A run on a larger build has a longer epoch than the run it changes, so the two share no epoch axis.
    assert src.variants(known["transformer-medium"]) == []

    lab = overview.Lab({"puzzle-difficulty": src}, {}, {})
    assert {base: list(parts) for base, parts in overview.games(lab).items()} == {"gbm-hand": [4.0, 3.3, 2.0, 0.5], "transformer-medium": [2.0]}
    assert overview.switches(lab)["more"]
    # The lab draws the pairs on fewer games and the pairs on more as two figures: together they outgrow a page.
    fewer, more = overview.games_figure(lab), overview.games_figure(lab, more=True)
    assert "gbm-hand on half of the games" in fewer and "times the games" not in fewer and "twice the games" not in fewer
    assert "gbm-hand on four times the games" in more and "transformer-medium on twice the games" in more and "half of the games" not in more
    assert "left of the line is worse" in fewer and "right of the line is better" in more


def test_a_change_is_kept_only_when_both_halves_of_the_rule_hold():
    def said(gain, valid):
        """What a paper says of a longer run whose valid score is ``valid`` beside the 8.0 of the run it changed."""
        tried = _longer("puzzle-difficulty", gain)
        tried.runs[0]["valid"], tried.runs[1]["valid"] = {tried.task.primary: valid}, {tried.task.primary: 8.0}
        written = tex.Generated("a test")
        changes.values(tried, written)
        return {key.rsplit(".", 1)[-1]: value for key, value in written.values.items() if key.endswith((".kept", "valid.verdict"))}

    # Puzzle difficulty is an error, so the lower valid score is the better one.
    assert said((0.3, 0.1, 0.5), 7.0) == {"verdict": "better", "kept": "kept"}
    # Better on the valid rows and inside the noise on the test rows: not kept.
    assert said((0.1, -0.2, 0.4), 7.0) == {"verdict": "better", "kept": "not kept"}
    # Beyond the noise on the test rows and no better on the valid rows: not kept either.
    assert said((0.3, 0.1, 0.5), 9.0) == {"verdict": "no better", "kept": "not kept"}
    # Worse beyond the noise is not kept, whatever the valid rows say.
    assert said((-0.3, -0.5, -0.1), 7.0)["kept"] == "not kept"
    # A run that names no valid score has no verdict by the rule.
    tried, written = _longer("puzzle-difficulty", (0.3, 0.1, 0.5)), tex.Generated("a test")
    changes.values(tried, written)
    assert not [key for key in written.values if key.endswith(".kept")]


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
    # A task that predicts squares names marks as its label: the builder's own, with a mark's words.
    predicted = [] if isinstance(task.label, str) else list(task.label)
    columns = [] if predicted else [task.label]
    # Where a row is a sequence of positions, the numbers of each position a network reads.
    steps = [name for name in getattr(builder, "STEPS", ()) if task.steps is None or name in task.steps]
    shown = [*columns, *task.context, *hand, *steps, *plan.get("describe", []), *plan.get("examples", {}).get("show", [])]
    assert [name for name in shown if name not in glossary.COLUMNS] == []
    assert [name for name in [*marks, *predicted] if name not in glossary.MARKS] == []
    assert [name for name in predicted if name not in builder.MARKS] == []
    for name in shown:
        label, sentence = glossary.COLUMNS[name]
        assert label and sentence.endswith(".")
        assert glossary.title(name)[0] == label[0].upper()


def test_the_glossary_has_words_for_every_group_of_hand_features():
    assert set(GROUPS) <= set(glossary.GROUPS)
    assert glossary.GROUP_FEATURES is GROUPS
