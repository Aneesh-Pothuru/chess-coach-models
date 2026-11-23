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
from chess_coach_models.encode.moves import MOVE_HAND, MOVE_PLAIN
from chess_coach_models.encode.squares import SQUARE_HAND, SQUARE_PLAIN
from chess_coach_models.evals import analysis, leaderboard
from chess_coach_models.papers import boards, build, changes, charts, closer, glossary, overview, results, sources, tex


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
    assert tex.code("the column `win_before`, times 0.01") == r"the column \code{win\_before}, times 0.01"


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
    assert tex.used_blocks(r"\longblock{pairs}{Runs set against each other}{tab:pairs}") == {"pairs"}
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
    # A run that changes one thing in such a run is drawn with it: the same family, and both words for its change.
    assert charts.family("conv-medium-hand-pretrained") == "transformer-medium-hand"
    assert charts.variant("conv-medium-hand-pretrained") == "tower-pretrained" and charts.variant("conv-medium-hand-seed1") == "tower-seed1"
    assert charts.family("conv-medium-pretrained") == "transformer-medium" and charts.variant("transformer-large-hand") == "large"
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


def test_a_two_way_table_prints_a_quantity_below_ten_to_two_decimals():
    # An expected score lies between zero and one: whole numbers would print every cell as 0 or 1.
    assert closer._cell_decimals(False, [0.09, 0.488, 0.901]) == 2
    # A rating keeps whole numbers, and a share in percent or a time in seconds keeps its tenth.
    assert closer._cell_decimals(False, [812.4, 1523.0, 2210.6]) == 0
    assert closer._cell_decimals(True, [3.4, 41.0]) == 1 and closer._cell_decimals(True, [0.2, 0.9]) == 1
    src = sources.read("practical-chances")
    one = next(grid for grid in src.look["grids"] if grid["key"] == "rating-win")
    drawn = closer.grid_figures(src, one)["grid-rating-win"]
    cells = [line.rsplit("{", 1)[1].rstrip("};") for line in drawn.splitlines() if "minimum width" in line]
    assert cells and all(len(cell.split(".")[-1]) == 2 for cell in cells if cell)


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


def test_rows_in_panels_have_a_scale_each_and_share_a_page_in_columns():
    def rows(count, at):
        return [(f"run-{index}", at + index, at + index - 0.5, at + index + 0.5, "labBlue") for index in range(count)]

    drawn = charts.interval_panels([("first", rows(6, 0.0)), ("second", rows(2, 100.0)), ("third", rows(3, -50.0))], xlabel="Gain", reference=0.0)
    # A picture a group, with the group's name over its rows, on the scale the group's own rows span.
    pictures = drawn.split("\\begin{tikzpicture}[trim axis right]")[1:]
    assert len(pictures) == 3 and all("scale only axis" in picture for picture in pictures)
    assert "xmin=-1.1, xmax=6.1" in pictures[0] and "xmin=-10.15, xmax=111.65" in pictures[1] and "xmin=-55.55, xmax=5.05" in pictures[2]
    assert ["ytick={0,1,2,3,4,5,6}" in pictures[0], "ytick={0,1,2}" in pictures[1], "ytick={0,1,2,3}" in pictures[2]] == [True] * 3
    assert all(picture.count("\\addplot[only marks") == count for picture, count in zip(pictures, (6, 2, 3)))
    # The line every row is read against stands in each panel, under the group's name.
    assert "(axis cs:0,0.4) -- (axis cs:0,6.6)" in pictures[0] and "(axis cs:0,0.4) -- (axis cs:0,2.6)" in pictures[1]
    # Two columns as even as whole panels allow, in their order, and the scale named once under them.
    left, right = drawn.split("\\hfill")
    assert drawn.count("\\begin{minipage}") == 2 and "first" in left and "second" in right and "third" in right
    assert left.count("\\begin{tikzpicture}") == 1 and drawn.rstrip().endswith("Gain}")
    # One group stands alone in the middle of the page.
    alone = charts.interval_panels([("first", rows(2, 0.0)), ("empty", [])], xlabel="Gain")
    assert alone.count("\\begin{minipage}") == 1 and "\\centering" in alone and "empty" not in alone

    def heights(figure):
        return [float(line.split("height=")[1].split("cm")[0]) for line in figure.splitlines() if "height=" in line]

    # More rows than a page holds at their usual height are set closer, and a column's panels then fit it.
    roomy, tight = [(f"model {index}", rows(4, 0.0)) for index in range(4)], [(f"model {index}", rows(12, 0.0)) for index in range(8)]
    assert heights(charts.interval_panels(roomy, xlabel="Gain")) == [pytest.approx(5 * 0.34)] * 4
    close = heights(charts.interval_panels(tight, xlabel="Gain"))
    assert len(close) == 8 and max(close) < 13 * 0.34 and sum(close[:4]) + 4 * 0.75 <= charts.TALLEST + 0.05
    # Rows that would have to run into each other are refused: the figure has to be split.
    with pytest.raises(ValueError, match="split the figure"):
        charts.interval_panels([(f"model {index}", rows(40, 0.0)) for index in range(4)], xlabel="Gain")

    # A column gives its longest name its room and the scale the rest: short names leave the scale its
    # full five centimetres, long ones are set smaller, and names no size can fit beside a scale are refused.
    def named(letters):
        return [("first", [("n" * letters, 1.0, 0.5, 1.5, "labBlue")]), ("second", rows(2, 0.0))]

    assert "width=142.0pt" in drawn and "\\fontsize{7}{8}" in drawn
    usual, long = charts.interval_panels(named(34), xlabel="Gain"), charts.interval_panels(named(42), xlabel="Gain")
    assert "width=84.3pt" in usual and "\\fontsize{7}{8}" in usual
    assert "width=76.6pt" in long and "\\fontsize{6}{7}" in long
    with pytest.raises(ValueError, match="split the figure"):
        charts.interval_panels(named(60), xlabel="Gain")
    assert heights(charts.grouped_intervals([("one", rows(20, 0.0))], xlabel="Gain")) == [pytest.approx(21 * 0.42 + 1.7)]
    assert heights(charts.grouped_intervals([("one", rows(50, 0.0))], xlabel="Gain")) == [pytest.approx(charts.TALLEST, abs=0.01)]
    with pytest.raises(ValueError, match="split the figure"):
        charts.grouped_intervals([("one", rows(70, 0.0))], xlabel="Gain")


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


def test_a_table_with_a_row_for_every_change_may_run_over_pages():
    rows = [["a", "1"], ["b", "2"]]
    table = tex.tabular("Lr", ["Run", "Score"], rows, width="\\textwidth", pages=True)
    lines = table.splitlines()
    assert lines[0] == "\\begin{xltabular}{\\textwidth}{Lr}" and lines[-1] == "\\end{xltabular}"
    # Its head is set again on each page, a rule closes each page, and the last one closes on the caption.
    head, body = lines[1 : lines.index("\\endlastfoot") + 1], lines[lines.index("\\endlastfoot") + 1 : -1]
    assert head == [
        "\\toprule",
        "Run & Score \\\\",
        "\\midrule",
        "\\endhead",
        "\\bottomrule",
        "\\endfoot",
        "\\bottomrule",
        "\\lablongcaption",
        "\\endlastfoot",
    ]
    assert body == ["a & 1 \\\\", "b & 2 \\\\"]
    # A line of group names still goes over its head, and it is left at the text's width.
    assert "\\toprule\n & Gain \\\\\n\\cmidrule(lr){2-2}\nRun & Score" in tex.grouped(table, ["", "Gain"], [(2, 2)])
    assert tex.fit(table) == table
    with pytest.raises(ValueError, match="given its width"):
        tex.tabular("lr", ["Run", "Score"], rows, pages=True)
    # The preamble has what places it, and the caption it sets under its last row.
    preamble = (paths.ROOT / "papers" / "preamble.tex").read_text(encoding="utf-8")
    assert "\\newcommand{\\longblock}[3]" in preamble and "\\newcommand{\\lablongcaption}{}" in preamble


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


def test_an_axis_of_hundreds_prints_no_more_decimals_than_its_ticks_have():
    # The axis style prints four decimals and pgf holds about seven digits: a tick at 246 came out as 246.0001.
    narrow = charts.Series("a", [(0, 246.993), (1, 244.613), (2, 242.707)])
    drawn = charts.lines([narrow], xlabel="Games", ylabel="MAE", tick_labels=["a quarter", "half", "all"])
    assert "yticklabel style={/pgf/number format/precision=2}" in drawn and "xticklabel style" not in drawn
    wide = charts.Series("b", [(800.0, 812.0), (2400.0, 2391.0)])
    ratings = charts.lines([wide], xlabel="Said", ylabel="Rating", diagonal=True)
    assert "yticklabel style={/pgf/number format/precision=0}" in ratings
    assert "xticklabel style={/pgf/number format/precision=0}" in ratings
    small = charts.Series("c", [(1, 0.0142), (2, 0.0155)])
    assert "number format" not in charts.lines([small], xlabel="Epoch", ylabel="Log loss")
    scores = charts.intervals([("run", 204.1, 200.2, 208.2), ("other", 242.7, 238.3, 247.2)], xlabel="MAE")
    assert "xticklabel style={/pgf/number format/precision=1}" in scores
    assert "number format" not in charts.intervals([("run", 0.47, 0.46, 0.48)], xlabel="First right")


def test_a_narrow_axis_of_small_numbers_sets_its_ticks_as_far_apart_as_their_labels_are_wide():
    # pgfplots stepped half a page of gains by 0.002, and the labels (-0.014, -0.012) ran into one another.
    gains = [("first move", -0.0133, -0.01438, -0.01216), ("passed pawns", -0.00013, -0.00069, 0.00041)]
    narrow = charts.intervals(gains, xlabel="Gain in log loss", reference=0.0, width="0.5\\textwidth")
    assert "xtick distance=0.005" in narrow
    # The same gains across the page, and an axis of short labels, keep the steps pgfplots takes by itself.
    assert "xtick distance" not in charts.intervals(gains, xlabel="Gain in log loss", reference=0.0, width="0.95\\textwidth")
    scores = [("run", 204.1, 200.2, 208.2), ("other", 242.7, 238.3, 247.2)]
    assert "xtick distance" not in charts.intervals(scores, xlabel="MAE", width="0.5\\textwidth")
    # The steps pgfplots was seen to take: 0.002 for these gains on half the page and across it, 10 for the scores.
    assert charts._own_step(0.01715, 0.5 * charts.TEXT_WIDTH - 45) == pytest.approx(0.002)
    assert charts._own_step(0.01715, 0.95 * charts.TEXT_WIDTH - 45) == pytest.approx(0.002)
    assert charts._own_step(55.0, 0.5 * charts.TEXT_WIDTH - 45) == pytest.approx(10.0)
    assert charts._own_step(0.053, 0.62 * charts.TEXT_WIDTH - 45) == pytest.approx(0.01)
    groups = [("Rating", [("low", -0.0133, -0.01438, -0.01216, "labBlue"), ("high", -0.00013, -0.00069, 0.00041, "labBlue")])]
    assert "xtick distance=0.005" in charts.grouped_intervals(groups, xlabel="Gain", reference=0.0, width="0.5\\textwidth")


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


def test_strips_share_a_lane_between_runs_that_never_meet_and_stand_no_taller_than_a_page():
    ladder = ["transformer-small", "gbm-context"]
    rows = [
        ("first-model", [("transformer-small", 110.0), ("gbm-context", 40.0), ("engine-curve", 80.0), ("elo-gap", -5.0)]),
        ("second-model", [("transformer-small", 105.0), ("gbm-context", 60.0), ("maia2", 136.0)]),
        ("third-model", [("transformer-small", 102.0), ("gbm-context", 35.0), ("puzzle-rating", 30.0)]),
    ]
    order = [*ladder, "engine-curve", "elo-gap", "maia2", "puzzle-rating"]
    lanes = charts.strip_lanes(rows, order)
    # The two formulas of one strip stand apart, and the formulas of other strips take the first of their lanes.
    assert lanes == {"transformer-small": 0, "gbm-context": 1, "engine-curve": 2, "elo-gap": 3, "maia2": 2, "puzzle-rating": 2}
    drawn = charts.strips(rows, xlabel="Share", order=order)
    # Four lanes and not six: a strip is 1.3 high, and a run in the third lane sits 0.1 under its middle.
    lines = drawn.splitlines()
    published = lines[next(index for index, line in enumerate(lines) if line.startswith("\\addlegendentry") and "maia2" in line) - 1]
    assert "(136,1.4)" in published and "mark size=2.4pt" in published and "height=5.80cm" in drawn
    # The published model has a mark no run of the ladder or formula has, since it stands in a strip with them.
    others = [run for run in charts.RUN_MARKS if run != "maia2"]
    assert f"mark={charts.run_mark('maia2')}," in published and charts.run_mark("maia2") not in {charts.run_mark(run) for run in others}
    # Strips that would outgrow a page move closer, marks and lanes alike, and keep to the page.
    many = [(f"model-{index}", points) for index in range(15) for _, points in rows[:1]]
    squeezed = charts.strips(many, xlabel="Share", order=order)
    assert f"height={charts.TALLEST_STRIPS + 1.9:.2f}cm" in squeezed and "mark size=2.4pt" not in squeezed
    with pytest.raises(ValueError, match="two figures"):
        charts.strips([(f"model-{index}", points) for index in range(30) for _, points in rows[:1]], xlabel="Share", order=order)


def test_two_runs_differ_in_the_settings_one_changes_or_in_the_learner():
    body = {"kind": "net", "body": "transformer", "dim": 256, "depth": 8}
    plain = {"config": {"learner": body, "train": {"epochs": 12, "lr": 0.0006}}}
    longer = {"config": {"learner": {**body, "features": "hand"}, "train": {"epochs": 24, "lr": 0.0006}}}
    trees = {"config": {"learner": {"kind": "gbm", "features": "hand"}}}
    assert changes.changed(longer, plain) == [("learner", "features"), ("train", "epochs")]
    assert changes.changed(plain, plain) == []
    assert changes.changed(longer, trees) is None and changes.differs(longer, trees) == "a different model class"
    # Two networks of different bodies or sizes differ in that, and a table says it.
    tower = {"config": {"learner": {"kind": "net", "body": "conv", "dim": 192, "depth": 10, "squeeze": 4}, "train": plain["config"]["train"]}}
    large = {"config": {"learner": {**body, "dim": 384, "depth": 12}, "train": plain["config"]["train"]}}
    told = {"config": {"learner": {**body, "attacks": True}, "train": plain["config"]["train"]}}
    blind = {"config": {"learner": {**body, "geometry": False}, "train": plain["config"]["train"]}}
    assert changes.differs(tower, plain) == "ResNet encoder in place of the transformer"
    assert changes.differs(large, plain) == "12 layers of width 384 in place of 8 of width 256"
    # What they differ in beside their shape is said after it: a tower at the rate a tower takes.
    faster = {"config": {"learner": tower["config"]["learner"], "train": {"epochs": 12, "lr": 0.002}}}
    assert changes.beside_shape(tower, plain) == [] and changes.beside_shape(faster, plain) == [("train", "lr")]
    assert changes.differs(faster, plain) == "ResNet encoder in place of the transformer; 0.002 peak learning rate in place of 0.0006"
    assert changes.differs(told, plain) == "with attack-aware attention bias"
    assert changes.differs(blind, plain) == "without relative position bias"


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
    assert pair["kind"] == "hand" and pair["learner"] == "gbm" and pair["beyond_noise"]
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
    # Blunder hazard has its paper, so no switch is on: not the one for a model without one either.
    assert overview.pairs(src) == [] and not any(overview.switches(lab).values())
    assert set(overview.switches(lab)) == {
        "waiting", "changehand", "changeepochs", "changestart", "changeattacks", "changegeometry", "changeconv", "changehybrid",
        "changelarger", "shapes", "games", "features", "studies", "more", "splitapart", "bodies", "answersets", "answersquares",
        "answertags", "answermoves", "rowsequences", "paperless",
    }  # fmt: skip
    # A model the lab has for its body stands with every model and in no comparison of them.
    lender = _sources("puzzle-difficulty", [_record("gbm-hand", {"kind": "gbm", "features": "hand"}, 1.0, "rmse")])
    both = overview.Lab({"blunder-hazard": src}, {}, {}, {"puzzle-difficulty": lender})
    assert list(both.every) == ["blunder-hazard", "puzzle-difficulty"] and overview.switches(both)["bodies"]
    assert overview._verdicts(both, lambda one: one.networks[0]) == ([], ["blunder-hazard"], [])


def test_each_other_kind_of_model_has_a_switch_of_its_own_in_the_lab_s_paper(tmp_path, monkeypatch):
    kinds = ("answersets", "answersquares", "answertags", "answermoves", "rowsequences")

    def lab_of(*names, steps=()):
        models = {}
        for name in names:
            task = tasks.get(name)
            runs = [_record("gbm-hand", {"kind": "gbm", "features": "hand"}, 0.5, task.primary)]
            models[name] = sources.Sources(name, False, task, runs, [], {}, {}, None, (), (), steps)
        return overview.Lab(models, {}, {})

    def on(*names, steps=()):
        switches = overview.switches(lab_of(*names, steps=steps))
        return {kind for kind in kinds if switches[kind]}

    assert on("puzzle-difficulty") == set()
    assert on("where-to-look") == {"answersets", "answersquares"}
    assert on("puzzle-themes") == {"answersets", "answertags"}
    assert on("human-move") == {"answermoves"}
    assert on("game-rating", steps=("ply",)) == {"rowsequences"}
    assert on("puzzle-difficulty", "where-to-look", "puzzle-themes", "human-move") == set(kinds) - {"rowsequences"}
    # A model with no prose of its own is named, so the lab's paper never sends a reader to a paper that is not there.
    both, alone = lab_of("puzzle-difficulty", "where-to-look"), lab_of("puzzle-difficulty")
    monkeypatch.setattr(paths, "ROOT", tmp_path)
    assert overview.paperless(both) == ["puzzle-difficulty", "where-to-look"] and overview.switches(both)["paperless"]
    paths.paper("puzzle-difficulty").mkdir(parents=True)
    (paths.paper("puzzle-difficulty") / "paper.tex").write_text("its prose", encoding="utf-8")
    assert overview.paperless(both) == ["where-to-look"] and overview.switches(both)["paperless"]
    assert not overview.switches(alone)["paperless"]


def test_a_model_of_tags_gives_each_tag_by_itself_and_one_of_moves_how_many_a_row_has():
    task = tasks.get("puzzle-themes")
    each = {
        "fork": {"rows": 40, "share": 0.4, "pr_auc": 0.8, "roc_auc": 0.9},
        "pin": {"rows": 10, "share": 0.1, "pr_auc": 0.2, "roc_auc": 0.6},
        "zugzwang": {"rows": 0, "share": 0.0, "pr_auc": float("nan"), "roc_auc": float("nan")},
    }
    worse = {name: {**row, "roc_auc": row["roc_auc"] - 0.1} for name, row in each.items()}
    best = {**_record("transformer-small", {"kind": "net", "body": "transformer"}, 0.7, task.primary), "test_by_candidate": each}
    reference = {**_record("gbm-hand", {"kind": "gbm", "features": "hand"}, 0.6, task.primary), "test_by_candidate": worse}
    src = _sources("puzzle-themes", [best, reference])
    # The most common tag first, the best run's two columns and then the reference's.
    lines = [line for line in results.candidates_table(src).splitlines() if line.startswith("\\texttt")]
    assert [line.split(" & ")[0] for line in lines] == ["\\texttt{fork}", "\\texttt{pin}", "\\texttt{zugzwang}"]
    assert lines[0] == "\\texttt{fork} & 40 & 40.0\\% & 0.800 & 0.900 & 0.800 & 0.800 \\\\"
    # A tag no test row carries has nothing to be told from, and is the best or the worst told of none.
    assert lines[2] == "\\texttt{zugzwang} & 0 & 0.0\\% & n/a & n/a & n/a & n/a \\\\"
    out = tex.Generated("a test")
    results.candidate_values(src, out)
    assert out.values["candidates.run"] == "\\run{transformer-small}"
    assert (out.values["candidates.common.name"], out.values["candidates.common.share"]) == ("\\texttt{fork}", "40.0")
    assert (out.values["candidates.rare.name"], out.values["candidates.rare.rows"]) == ("\\texttt{zugzwang}", "0")
    assert (out.values["candidates.roc.most.name"], out.values["candidates.roc.most"]) == ("\\texttt{fork}", "0.90")
    assert (out.values["candidates.roc.least.name"], out.values["candidates.roc.least"]) == ("\\texttt{pin}", "0.60")
    # The stricter of the table's two areas has its best and its worst told too.
    assert (out.values["candidates.pr.most.name"], out.values["candidates.pr.most"]) == ("\\texttt{fork}", "0.80")
    assert (out.values["candidates.pr.least.name"], out.values["candidates.pr.least.share"]) == ("\\texttt{pin}", "10.0")
    # Two tags are told at all, so there are not three to name as the worst told.
    assert "candidates.pr.weakest.names" not in out.values
    # The reference shares the best run's precision-recall areas here, so the lead is nothing for every tag.
    assert (out.values["candidates.pr.lead.most.best"], out.values["candidates.pr.lead.most.reference"]) == ("0.80", "0.80")
    more = {
        **each,
        "skewer": {"rows": 8, "share": 0.08, "pr_auc": 0.5, "roc_auc": 0.7},
        "mate": {"rows": 6, "share": 0.06, "pr_auc": 0.9, "roc_auc": 0.8},
    }
    behind = {name: {**row, "pr_auc": row["pr_auc"] - (0.4 if name == "mate" else 0.1)} for name, row in more.items()}
    src, out = _sources("puzzle-themes", [{**best, "test_by_candidate": more}, {**reference, "test_by_candidate": behind}]), tex.Generated("a test")
    results.candidate_values(src, out)
    assert out.values["candidates.pr.weakest.names"] == "\\texttt{pin}, \\texttt{skewer} and \\texttt{fork}"
    assert (out.values["candidates.pr.weakest.count"], out.values["candidates.pr.weakest.highest"]) == ("three", "0.80")
    lead = [out.values[f"candidates.pr.lead.most.{part}"] for part in ("name", "best", "reference")]
    assert lead == ["\\texttt{mate}", "0.90", "0.50"] and out.values["candidates.pr.lead.least.name"] != "\\texttt{mate}"
    # The reference is not set beside itself.
    assert results.candidates_table(_sources("puzzle-themes", [reference])).count("ROC-AUC") == 1
    # A model of moves says how many a test row has, and has no table of them.
    moves = {**_record("maia2", {"kind": "maia2"}, 0.5, "top1"), "test_candidates": {"mean": 31.46, "most": 79}}
    src, out = _sources("human-move", [moves]), tex.Generated("a test")
    results.candidate_values(src, out)
    assert out.values == {"candidates.mean": "31.5", "candidates.most": "79"} and results.candidates_table(src) is None
    # A model of one number a row has neither.
    plain, out = _sources("puzzle-difficulty", [_record("gbm-hand", {"kind": "gbm", "features": "hand"}, 300.0, "rmse")]), tex.Generated("a test")
    results.candidate_values(plain, out)
    assert out.values == {} and results.candidates_table(plain) is None


def test_a_study_s_runs_stand_by_band_under_the_run_they_change():
    def banded(name, learner, scores, **config):
        by_band = {band: {"top1": value, "rows": 10} for band, value in scores.items()}
        return {**_record(name, learner, 0.5, "top1", **config), "test_by_band": by_band}

    published = banded("maia2", {"kind": "maia2"}, {"<1100": 0.46, "1100-1400": 0.51})
    trees = banded("gbm-hand", {"kind": "gbm", "features": "hand"}, {"<1100": 0.4, "1100-1400": 0.41})
    blind = banded("maia2-one-rating", {"kind": "maia2"}, {"<1100": 0.44, "1100-1400": 0.5}, base="maia2", study="ratings")
    half = banded("gbm-hand-half", {"kind": "gbm", "features": "hand"}, {"<1100": 0.39}, base="gbm-hand", study="games")
    unscored = {**_record("gbm-hand-quarter", {"kind": "gbm", "features": "hand"}, 0.3, "top1", base="gbm-hand", study="games")}
    src = sources.Sources("human-move", False, tasks.get("human-move"), [published, trees], [blind, half, unscored], {}, {}, None, (), ())
    lines = results.studies_bands_table(src).splitlines()
    rows = [line for line in lines if "\\run{" in line]
    # A changed run stands under the run it changed, the groups in the leaderboard's order with space between them.
    assert rows == [
        "\\run{maia2} & 0.4600 & 0.5100 \\\\",
        "\\quad \\run{maia2-one-rating} & 0.4400 & 0.5000 \\\\",
        "\\run{gbm-hand} & 0.4000 & 0.4100 \\\\",
        "\\quad \\run{gbm-hand-half} & 0.3900 & n/a \\\\",
    ]
    assert lines[lines.index(rows[2]) - 1] == "\\addlinespace" and lines.count("\\addlinespace") == 1
    assert "test examples & 10 & 10" in results.studies_bands_table(src)
    # A model with no study run scored by band has no such table.
    assert results.studies_bands_table(sources.Sources("human-move", False, tasks.get("human-move"), [published, trees], [unscored], {}, {}, None, (), ())) is None


def test_a_table_by_band_keeps_one_precision_on_both_sides_of_a_hundred():
    def banded(name, learner, scores):
        by_band = {band: {"mae": value, "rows": 10} for band, value in scores.items()}
        return {**_record(name, learner, 300.0, "mae"), "test_by_band": by_band}

    runs = [
        banded("gbm-hand", {"kind": "gbm", "features": "hand"}, {"<1100": 438.72, "1400-1700": 73.014}),
        banded("constant", {"kind": "constant"}, {"<1100": 600.24, "1400-1700": 72.233}),
    ]
    src = _sources("game-rating", runs)
    assert results.band_digits(src) == 1
    table = results.bands_table(src)
    assert "\\run{gbm-hand} & 438.7 & 73.0 \\\\" in table and "\\run{constant} & 600.2 & 72.2 \\\\" in table
    # Scores that are all under a hundred, or all under one, keep the decimals a score has anywhere.
    for run in runs:
        run["test_by_band"] = {band: {"mae": entry["mae"] / 1000.0, "rows": 10} for band, entry in run["test_by_band"].items()}
    assert results.band_digits(src) == 4 and "0.4387 & 0.0730" in results.bands_table(src)
    assert tex.score(73.014) == "73.014" and tex.score(73.014, digits=1) == "73.0" and tex.score(None, digits=1) == "n/a"


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
    assert "\\textbf{Twice the training epochs}" in table and "over \\run{transformer-medium}" in table and "over \\run{gbm-context}" in table
    # A step of 1 in both models, so a gain of 0.3 is thirty hundredths of it, and only the gain beyond the noise is bold.
    assert "\\textbf{+30.0} & +10.0 to +50.0" in table and "& +10.0 & $-$20.0 to +40.0" in table
    assert overview._tally(["puzzle-difficulty"], ["blunder-hazard"], []) == (
        "significantly better in one of the two tasks (puzzle difficulty) and not significantly different in one of the two tasks (blunder hazard)"
    )
    assert overview._tally([], ["think-time"], []) == "not significantly different in the one task (think time)"


def test_a_change_made_in_more_runs_than_a_table_sets_side_by_side_goes_on_under_itself(monkeypatch):
    primary = tasks.get("puzzle-difficulty").primary
    board = {"kind": "net", "body": "transformer", "dim": 256, "depth": 8}
    hand = {**board, "features": "hand"}
    runs = [
        _record("transformer-medium-hand-long", hand, 6.0, primary, train={"epochs": 24}),
        _record("transformer-medium-hand", hand, 7.0, primary, train={"epochs": 12}),
        _record("transformer-medium-long", board, 7.5, primary, train={"epochs": 24}),
        _record("transformer-medium", board, 8.0, primary, train={"epochs": 12}),
        _record("gbm-hand", {"kind": "gbm", "features": "hand"}, 9.0, primary),
        _record("constant", {"kind": "constant"}, 10.0, primary),
    ]
    pairs = [
        {"run": "transformer-medium-long", "over": "transformer-medium", "gain": 0.3, "low": 0.1, "high": 0.5, "beyond_noise": True},
        {"run": "transformer-medium-hand-long", "over": "transformer-medium-hand", "gain": 0.1, "low": -0.2, "high": 0.4, "beyond_noise": False},
    ]
    lab = overview.Lab({"puzzle-difficulty": _sources("puzzle-difficulty", runs, look={"pairs": pairs})}, {}, {})
    assert list(overview.by_base(lab)["epochs"]) == ["transformer-medium", "transformer-medium-hand"]
    # Both runs the epochs were changed in fit side by side: one row of the model under one line of heads.
    wide = overview.changes_table(lab).splitlines()
    assert "Task & Gain & 95\\% CI & Gain & 95\\% CI \\\\" in wide
    assert " & \\multicolumn{2}{c}{over \\run{transformer-medium}} & \\multicolumn{2}{c}{over \\run{transformer-medium-hand}} \\\\" in wide
    assert "Puzzle difficulty & \\textbf{+30.0} & +10.0 to +50.0 & +10.0 & $-$20.0 to +40.0 \\\\" in wide
    # A table that holds one run across names the second under the first, each with the model's row of its own.
    monkeypatch.setattr(overview, "ACROSS", 1)
    narrow = overview.changes_table(lab).splitlines()
    assert "Task & Gain & 95\\% CI \\\\" in narrow and "\\multicolumn{3}{l}{\\textbf{Twice the training epochs}} \\\\" in narrow
    first = narrow.index(" & \\multicolumn{2}{c}{over \\run{transformer-medium}} \\\\")
    second = narrow.index(" & \\multicolumn{2}{c}{over \\run{transformer-medium-hand}} \\\\")
    assert narrow[first + 1] == "Puzzle difficulty & \\textbf{+30.0} & +10.0 to +50.0 \\\\" and second == first + 2
    assert narrow[second + 1] == "Puzzle difficulty & +10.0 & $-$20.0 to +40.0 \\\\"


def _shaped(model, gains):
    """A model whose larger transformer with hand features was set against networks of other shapes, and the
    pairs its closer look measured: ``gains`` has each changed run's paired gain over that transformer."""
    primary = tasks.get(model).primary
    body = {"kind": "net", "body": "transformer", "dim": 256, "depth": 8, "features": "hand"}
    shapes = {
        "transformer-medium-hand": (body, 6_500_000),
        "conv-medium-hand": ({**body, "body": "conv", "dim": 192, "depth": 10, "squeeze": 4}, 6_900_000),
        "hybrid-medium-hand": ({**body, "body": "hybrid", "convs": 2, "depth": 5}, 6_600_000),
        "transformer-large-hand": ({**body, "dim": 384, "depth": 12}, 21_000_000),
        "transformer-medium-hand-attacks": ({**body, "attacks": True}, 6_500_256),
        "transformer-medium-hand-no-geometry": ({**body, "geometry": False}, 6_400_000),
    }
    better = -1.0 if tasks.get(model).lower_is_better else 1.0
    runs = [_record(name, learner, 10.0 + 2 * better, primary, train={"epochs": 12}) for name, (learner, _) in shapes.items()]
    for run, (_, parameters) in zip(runs, shapes.values()):
        run["learner"] = {"parameters": parameters}
    runs += [
        _record("gbm-hand", {"kind": "gbm", "features": "hand"}, 10.0 + better, primary),
        _record("constant", {"kind": "constant"}, 10.0, primary),
    ]
    pairs = [
        {"run": name, "over": "transformer-medium-hand", "gain": amount, "low": low, "high": high, "beyond_noise": low > 0 or high < 0}
        for name, (amount, low, high) in gains.items()
    ]
    return _sources(model, runs, look={"pairs": pairs})


def test_a_network_of_another_shape_is_a_kind_of_change_with_a_table_of_its_own():
    level, ahead, behind = (0.1, -0.2, 0.4), (0.3, 0.1, 0.5), (-0.3, -0.5, -0.1)
    names = ("conv-medium-hand", "hybrid-medium-hand", "transformer-large-hand", "transformer-medium-hand-attacks", "transformer-medium-hand-no-geometry")
    one = _shaped("puzzle-difficulty", dict(zip(names, (behind, level, ahead, ahead, behind))))
    other = _shaped("blunder-hazard", {"conv-medium-hand": level, "transformer-medium-hand-attacks": level})
    base = one.run("transformer-medium-hand")
    kinds = {name: changes.kind(one.run(name), base) for name in names}
    assert kinds == {
        "conv-medium-hand": "conv",
        "hybrid-medium-hand": "hybrid",
        "transformer-large-hand": "larger",
        "transformer-medium-hand-attacks": "attacks",
        "transformer-medium-hand-no-geometry": "geometry",
    }
    assert set(kinds.values()) == set(changes.SHAPES) and set(changes.SHAPES) < set(overview.TITLES)
    # The other way round is no kind the lab reads model by model: a transformer for a tower, a smaller net.
    assert changes.kind(base, one.run("conv-medium-hand")) is None and changes.kind(base, one.run("transformer-large-hand")) is None
    assert changes.kind(one.run("hybrid-medium-hand"), one.run("conv-medium-hand")) is None
    assert changes.kind(one.run("conv-medium-hand"), one.run("gbm-hand")) is None
    # A tower trained at the rate a tower takes is still a tower for the transformer. One given more epochs
    # as well differs in more than its shape, and is of no kind.
    tower = one.run("conv-medium-hand")
    at_its_rate = {**tower, "config": {**tower["config"], "train": {"epochs": 12, "lr": 0.002}}}
    longer = {**tower, "config": {**tower["config"], "train": {"epochs": 24}}}
    assert changes.kind(at_its_rate, base) == "conv" and changes.kind(longer, base) is None

    lab = overview.Lab({"blunder-hazard": other, "puzzle-difficulty": one}, {}, {})
    order = list(changes.SHAPES)
    assert order == ["conv", "hybrid", "larger", "attacks", "geometry"]
    assert list(overview.kinds(lab)) == [(key, "net") for key in order]
    switches = overview.switches(lab)
    assert switches["shapes"] and all(switches[f"change{key}"] for key in order)
    assert not switches["changehand"] and not switches["changeepochs"] and not switches["changestart"]
    # The shapes have a table and a figure of their own, and the table of the other changes holds none of them.
    assert overview.changes_table(lab) is None and overview.changes_figure(lab) is None
    table = overview.changes_table(lab, changes.SHAPES)
    assert all(f"\\textbf{{{overview.TITLES[key]}}}" in table for key in order)
    assert table.count("over \\run{transformer-medium-hand}") == len(order)
    # A step of 1 in both models: thirty hundredths of it ahead, and a model with no pair of a kind has no row there.
    assert "Puzzle difficulty & \\textbf{+30.0} & +10.0 to +50.0" in table
    assert "Blunder hazard & +10.0 & $-$20.0 to +40.0" in table
    assert table.count("Blunder hazard") == 2 and table.count("Puzzle difficulty") == len(order)
    figure = overview.changes_figure(lab, changes.SHAPES)
    assert "ResNet in place of the transformer (neural network)" in figure
    # What a shape is worth is read model by model as any change is, by the run it was made in.
    found, written = overview.by_base(lab), tex.Generated("a test")
    assert list(found) == order and all(list(bases) == ["transformer-medium-hand"] for bases in found.values())
    for key in ("conv", "larger"):
        overview._across(lab, written, f"lab.change.{key}.over.transformer-medium-hand", found[key]["transformer-medium-hand"])
    assert written.values["lab.change.conv.over.transformer-medium-hand.said"] == (
        "not significantly different in one of the two tasks (blunder hazard) and significantly worse in one of the two tasks (puzzle difficulty)"
    )
    assert written.values["lab.change.larger.over.transformer-medium-hand.said"] == "significantly better in the one task (puzzle difficulty)"
    # The shapes as a whole: the models where none of them leaves the noise, and in how many one of them is
    # the best run. A list of no model is not set, so a sentence that names its models cannot be built.
    overview.shapes_values(lab, written)
    assert written.values["lab.shapes.models.count"] == "two"
    assert written.values["lab.shapes.models.names"] == "blunder hazard and puzzle difficulty"
    assert written.values["lab.shapes.still.of"] == "one of the two tasks" and written.values["lab.shapes.still.names"] == "blunder hazard"
    assert written.values["lab.shapes.best.of"] == "neither of the two tasks" and "lab.shapes.best.names" not in written.values
    # A lab with no pair of these kinds asks for none of what is said of them.
    plain = overview.Lab({"puzzle-difficulty": _longer("puzzle-difficulty", level)}, {}, {})
    assert not overview.switches(plain)["shapes"] and overview.changes_table(plain, changes.SHAPES) is None
    unshaped = tex.Generated("a test")
    overview.shapes_values(plain, unshaped)
    assert not unshaped.values


def test_a_model_s_paper_draws_a_run_of_another_shape_in_a_panel_of_its_own():
    src = _shaped("puzzle-difficulty", {})
    primary = src.task.primary
    networks = [run for run in src.runs if run["config"]["learner"]["kind"] == "net"]
    longer = _record("transformer-medium-hand-long", networks[0]["config"]["learner"], 7.9, primary, base="transformer-medium-hand", train={"epochs": 24})
    longer["learner"] = {"parameters": 6_500_000}
    src.runs.append(longer)
    for index, run in enumerate([*networks, longer]):
        run["learner"]["history"] = [{"epoch": epoch, f"valid_{primary}": 300.0 - 10 * epoch - index} for epoch in (1, 2, 3)]
    src.run("gbm-hand")["valid"] = {primary: 280.0}
    base = src.run("transformer-medium-hand")
    assert [run["run"] for run in src.ladder] == ["transformer-medium-hand"]
    assert {run["run"] for run in src.variants(base)} == {run["run"] for run in [*networks[1:], longer]}

    # The run that changed how the network is trained shares the network's panel, and no shape is in it.
    trained = changes.variants_figure(src)
    assert trained.count("\\nextgroupplot") == 1 and trained.count("\\addplot") == 2
    assert "{\\texttt{transformer-medium-hand-long}}" in trained and "conv-medium-hand" not in trained
    # Each shape has a panel beside the network, two panels a row, in the order of the kinds.
    shaped = changes.shapes_figure(src)
    names = ["conv-medium-hand", "hybrid-medium-hand", "transformer-large-hand", "transformer-medium-hand-attacks", "transformer-medium-hand-no-geometry"]
    assert shaped.count("\\nextgroupplot") == 5 and shaped.count("\\addplot") == 10
    assert shaped.count("\\addlegendentry{\\texttt{transformer-medium-hand}}") == 5 and "transformer-medium-hand-long" not in shaped
    places = [shaped.index(f"\\addlegendentry{{\\texttt{{{name}}}}}") for name in names]
    assert places == sorted(places)
    assert "group size=2 by 3" in shaped and "vertical sep" in shaped and "xlabels at=edge bottom" in shaped
    # Two shapes never share a way of breaking a line, and a panel names the reference's level once.
    dashes = [charts.run_dash(name) for name in names]
    assert None not in dashes and len(set(dashes)) == len(names) and charts.OTHER_DASH not in dashes
    assert shaped.count("{\\run{gbm-hand}}") == 1

    out = tex.Generated("a test")
    changes.blocks(src, out)
    assert {"variants", "shapes"} <= set(out.files)
    # A model with no run of another shape has no such figure, and its other figure is as it was.
    plain = _shaped("puzzle-difficulty", {})
    plain.runs[:] = [run for run in plain.runs if run["run"] in ("transformer-medium-hand", "gbm-hand", "constant")] + [longer]
    plain.run("transformer-medium-hand")["learner"]["history"] = base["learner"]["history"]
    plain.run("gbm-hand")["valid"] = {primary: 280.0}
    assert changes.shapes_figure(plain) is None and changes.variants_figure(plain) == trained


def test_an_example_s_board_shows_the_move_its_row_is_about():
    grey, blue, orange = boards.CONTEXT, boards.SUBJECT, boards.OTHER
    # A position of a game: the opponent's last move, and the move that was played there.
    position = {"last_move": "b2b4", "move": "f5f4"}
    assert closer._arrows(position) == [("b2b4", grey), ("f5f4", blue)] and closer._subject(position) == ("Played", "f5f4")
    # A tactic: its setup, the first move of its line, and what was played where that was another move.
    tactic = {"setup": "b2b4", "line": "f5f4 g1f2", "played": "d3b4"}
    assert closer._arrows(tactic) == [("b2b4", grey), ("d3b4", orange), ("f5f4", blue)] and closer._subject(tactic) is None
    assert closer._arrows({**tactic, "played": "f5f4"}) == [("b2b4", grey), ("f5f4", blue)]
    # A game: the board is the position before the player's costliest move, and that move is the one shown.
    game = {"last_move": "b2b4", "worst_move": "f5f4"}
    assert closer._arrows(game) == [("b2b4", grey), ("f5f4", blue)]
    assert closer._subject(game) == ("The player's most costly move", "f5f4")
    assert set(closer.READ_MOVES) <= set(closer.SUBJECT_MOVES)


def test_a_paper_of_a_row_that_is_a_sequence_names_each_position_s_numbers_and_the_layers_over_them():
    from dataclasses import replace

    # A row of one position has its context numbers and no others, so its paper has no table of them.
    one = sources.read("think-time")
    assert not one.sequence and results.steps_table(one) is None
    assert build.switches(one, tex.Generated("a test"))["sequence"] is False
    # A row that is a sequence: the numbers its task lets a network read of each position, in a table of their own.
    game = replace(one, steps=("ply", "log_spent"))
    assert game.sequence and build.switches(game, tex.Generated("a test"))["sequence"] is True
    table = results.steps_table(game)
    assert "\\texttt{ply}" in table and "\\texttt{log\\_spent}" in table and glossary.says("log_spent") in table
    # A network over a game names the layers that read its positions in order, as its config does, and a
    # network of one position names none.
    tower = {"kind": "net", "body": "conv", "dim": 96, "depth": 6}
    over = {"run": "over", "config": {"learner": {**tower, "over": {"depth": 2, "heads": 4}}}, "task": {"kind": "regression"}}
    plain = {"run": "plain", "config": {"learner": tower}, "task": {"kind": "regression"}}
    assert (results._over(over, "depth"), results._over(over, "heads")) == ("2", "4")
    assert results._over(plain, "depth") == "" == results._over(plain, "heads")
    words = leaderboard.learner_words(plain)
    assert leaderboard.learner_words(over) == f"{words} for each position, then 2 transformer layers over the positions in order"
    one_layer = {**over, "config": {"learner": {**tower, "over": {"depth": 1}}}}
    assert leaderboard.learner_words(one_layer).endswith("then 1 transformer layer over the positions in order")


def test_a_described_number_below_zero_has_a_real_minus_sign():
    assert closer._plain_number(-41.0) == "$-$41" and closer._plain_number(457.0) == "457" and closer._plain_number(0.0) == "0"
    assert closer._plain_number(-0.5) == "$-$0.500" and closer._plain_number(12345.0) == "12{,}345"


def test_panels_fill_rows_when_they_are_given_columns():
    one = charts.Series("one", [(1, 1.0), (2, 2.0)])
    row = charts.panels([[one], [one], [one]], xlabel="Epoch", ylabel="Score")
    assert "group size=3 by 1" in row and "vertical sep" not in row and "xlabels at" not in row
    grid = charts.panels([[one], [one], [one]], xlabel="Epoch", ylabel="Score", columns=2)
    assert "group size=2 by 2" in grid and "vertical sep=1.9cm, xlabels at=edge bottom" in grid
    # Fewer panels than columns are one row of that many.
    assert "group size=1 by 1" in charts.panels([[one]], xlabel="Epoch", ylabel="Score", columns=2)


def test_every_switch_a_build_sets_is_one_the_preamble_declares():
    import re

    declared = set(re.findall(r"\\newif\\if([a-z]+)", (paths.ROOT / "papers" / "preamble.tex").read_text(encoding="utf-8")))
    src = _longer("puzzle-difficulty", (0.1, -0.2, 0.4))
    assert set(overview.switches(overview.Lab({"puzzle-difficulty": src}, {}, {}))) <= declared
    assert set(build.switches(src, tex.Generated("a test"))) <= declared


def test_a_model_s_paper_has_a_switch_for_each_kind_of_change_it_measured():
    level, ahead, behind = (0.1, -0.2, 0.4), (0.3, 0.1, 0.5), (-0.3, -0.5, -0.1)
    shaped = _shaped("puzzle-difficulty", {"conv-medium-hand": behind, "transformer-medium-hand-attacks": ahead})
    assert changes.kinds(shaped) == {"conv", "attacks"}
    on = build.switches(shaped, tex.Generated("a test"))
    assert on["changeconv"] and on["changeattacks"] and not on["changehybrid"] and not on["changeepochs"]
    # A kind is every kind a pair can be of, in the order a paper lists them, and each has its switch.
    assert changes.KINDS == ("hand", "epochs", "start", "attacks", "geometry", "conv", "hybrid", "larger")
    assert all(f"change{name}" in on for name in changes.KINDS)
    # The trees on the context features alone are a run some models have and others do not.
    longer = _longer("puzzle-difficulty", level)
    assert changes.kinds(longer) == {"epochs"}
    assert build.switches(longer, tex.Generated("a test"))["contextgbdt"] and not on["contextgbdt"]


def test_the_pairs_stand_by_the_kind_of_their_change_in_the_order_a_paper_lists_the_kinds():
    ahead, behind = (0.3, 0.1, 0.5), (-0.3, -0.5, -0.1)
    names = ("transformer-large-hand", "hybrid-medium-hand", "conv-medium-hand", "transformer-medium-hand-no-geometry", "transformer-medium-hand-attacks")
    table = changes.pairs_table(_shaped("puzzle-difficulty", dict(zip(names, (behind, behind, ahead, behind, ahead)))))
    listed = ("transformer-medium-hand-attacks", "transformer-medium-hand-no-geometry", "conv-medium-hand", "hybrid-medium-hand", "transformer-large-hand")
    places = [table.index(f"\\run{{{name}}} &") for name in listed]
    assert places == sorted(places)


def test_a_hand_feature_the_task_gives_as_context_is_counted_once():
    task = tasks.get("puzzle-difficulty")
    assert "solver_moves" in task.context and "solver_moves" in GROUPS["line"]
    hand = ("material_count", "solver_moves", "line_quiet", "ends_in_mate")
    src = sources.Sources("puzzle-difficulty", False, task, [], [], {}, {}, None, (), hand)
    # A run that leaves the line's group out keeps the context feature, so it loses two features, not three.
    assert src.extra == ["material_count", "line_quiet", "ends_in_mate"]
    assert src.group_size("line") == 2 and src.group_size("material") == 1 and src.group_size("kings") == 0


def test_a_plan_s_titles_stand_in_place_of_the_ones_an_analysis_was_written_with():
    look = {
        "slices": [{"key": "band", "title": "Old band"}, {"key": "moves", "title": "Old moves"}, {"key": "themes", "title": "Theme"}],
        "grids": [{"key": "moves-pieces", "rows": {"title": "Old rows"}, "columns": {"title": "Old columns"}}],
        "shown": {"slices": [{"key": "band", "title": "Old band"}, {"key": "moves", "title": "Old moves"}]},
    }
    plan = {
        "band": {"title": "Puzzle rating"},
        "slices": [{"key": "moves", "title": "Solution length"}],
        "grids": [{"key": "moves-pieces", "rows": {"title": "Solution length"}, "columns": {"column": "phase_piece_count"}}],
    }
    read = sources.retitled(look, plan)
    assert [one["title"] for one in read["slices"]] == ["Puzzle rating", "Solution length", "Theme"]
    assert read["grids"][0]["rows"]["title"] == "Solution length" and read["grids"][0]["columns"]["title"] == "Old columns"
    assert [one["title"] for one in read["shown"]["slices"]] == ["Puzzle rating", "Solution length"]


def test_the_board_as_encoded_shades_only_the_moves_the_task_lets_a_network_read():
    example = {"fen": "4nk2/5pp1/1R1p3p/4pP2/4r3/2P3PP/3B3K/4N3 b - - 0 41", "moves": {"setup": "b7b6", "line": "e4e2 e1g2 e2d2"}}
    look = {"examples": {"typical": [example]}}
    task = tasks.get("puzzle-difficulty")

    def figure(marks):
        return closer.encoding_figure(sources.Sources("puzzle-difficulty", False, task, [], [], {}, {}, look, marks, ()))

    shown = figure(("en_passant", "setup_from", "setup_to", "solver1_from", "solver1_to", "later"))
    hidden = figure(("en_passant", "setup_from", "setup_to"))
    # As played, the first move of the line is drawn either way. As encoded, its squares are shaded only where they are read.
    assert shown.count("markmoves={e4-e2}") == 1 and hidden.count("markmoves={e4-e2}") == 1
    assert "color=labBlue, markfields=" in shown and "color=labOrange, markfields=" in shown
    assert "color=labGray, markfields=" in hidden
    assert "color=labBlue, markfields=" not in hidden and "color=labOrange, markfields=" not in hidden
    assert "markfields=" not in figure(("en_passant",))


def test_a_ranking_table_s_head_names_the_end_it_is_taken_from():
    src = sources.read("blunder-hazard")
    top, bottom = closer.ranking_table(src, "top"), closer.ranking_table(src, "bottom")
    # From the bottom the precision is of the examples that were not hits, so each table says which end it reads.
    assert "Top share of test set" in top and "Bottom share of test set" not in top
    assert "Bottom share of test set" in bottom and "Top share of test set" not in bottom


def test_the_error_table_of_a_logarithmic_target_names_factors_in_its_head():
    table = closer.closeness_table(sources.read("think-time"))
    # Its cells are factors, so a head that said "abs. error" would name a unit the column does not hold.
    assert "Median error factor" in table and "90th pct. error factor" in table and "abs. error" not in table
    assert "Within $\\times$2" in table
    plain = closer.closeness_table(sources.read("puzzle-difficulty"))
    assert "Median abs. error" in plain and "error factor" not in plain


def test_a_run_that_was_filed_keeps_its_pair_and_its_place_beside_the_run_it_changed():
    tried = _longer("puzzle-difficulty", (0.1, -0.2, 0.4))
    longer, base = tried.runs[0], tried.runs[1]
    assert tried.variants(base) == [longer] and tried.filed == []
    table, written = changes.pairs_table(tried), tex.Generated("a test")
    changes.values(tried, written)
    assert "\\run{transformer-medium-long} &" in table and written.values["pairs.count"] == "one"

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
    assert written.values["pair.transformer-medium-long.transformer-medium.verdict"] == "not significantly different"
    # And the lab still reads it as what more epochs are worth in this model.
    (measured,) = [one for one in overview.pairs(filed) if one["kind"] == "epochs"]
    assert (measured["run"], measured["over"], measured["gain"]) == ("transformer-medium-long", "transformer-medium", 0.1)


def test_a_study_of_one_run_is_counted_in_the_singular():
    written = tex.Generated("a test")
    changes.values(sources.read("tactic-found"), written)
    # Tactic found has one run on more games for each base, and one run with the attack-aware bias for each.
    assert written.values["more.gbm-hand.better.of"] == "the one model"
    assert written.values["study.attacks.transformer-medium.worse.of"] == "not the one ablation"
    assert written.values["study.games.gbm-hand.worse.of"] == "both ablations"


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
        "trained on twice the training games (\\code{puzzles-all})"
    )
    assert changes.differs(known["transformer-medium-double"], known["transformer-medium"]) == (
        "trained on twice the training games (\\code{puzzles-all}); 6 epochs in place of 12; 2 epochs of patience in place of 3"
    )
    assert changes._change("train", "patience", 1, 3) == "1 epoch of patience in place of 3"
    assert changes._change("train", "epochs", 3, 12) == "3 epochs in place of 12"
    assert changes._change("learner", "rounds", 8000, None) == "up to 8{,}000 boosting rounds"

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
    assert said["more.gbm-hand.most.rows"] == tex.count(4030) and said["more.gbm-hand.most.verdict"] == "significantly better"
    # Puzzle difficulty is an error, so the lower valid score is the better one, and both halves of the rule hold.
    assert said["more.gbm-hand.most.kept"] == said["pair.gbm-hand-quadruple.gbm-hand.kept"] == "accepted"
    # A run on more games was a candidate even after it is filed; a run on fewer never was.
    assert said["pair.gbm-hand-triple.gbm-hand.kept"] == "not accepted" and "pair.gbm-hand-half.gbm-hand.kept" not in said
    assert said["more.transformer-medium.runs"] == "one" and "more.transformer-medium.most.kept" not in said

    # The table has the runs on more games above the run on all of them, and the runs on fewer below it.
    table = changes.games_table(src)
    order = [table.index(f"{sources.run_tex(name)} &") for name in ("gbm-hand-quadruple", "gbm-hand-triple", "gbm-hand-double", "gbm-hand", "gbm-hand-half")]
    assert order == sorted(order) and "& four times &" in table and "& 3.3 times &" in table and "& half &" in table
    # A run changed only by runs on more games has no curve to stand on, so it is among the pairs.
    assert sources.run_tex("transformer-medium-double") not in table
    assert sources.run_tex("transformer-medium-double") in changes.pairs_table(src)
    # A run on a larger build has a longer epoch than the run it changes, so the two share no epoch axis.
    assert src.variants(known["transformer-medium"]) == []

    lab = overview.Lab({"puzzle-difficulty": src}, {}, {})
    assert {base: list(parts) for base, parts in overview.games(lab).items()} == {"gbm-hand": [4.0, 3.3, 2.0, 0.5], "transformer-medium": [2.0]}
    assert overview.switches(lab)["more"]
    # On twice the games the network gained more than the trees here, and no other multiple has both.
    assert overview.more_ahead(lab, "transformer-medium") == {"trees": [], "network": ["puzzle-difficulty"], "mixed": []}
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
    assert said((0.3, 0.1, 0.5), 7.0) == {"verdict": "better", "kept": "accepted"}
    # Better on the valid rows and inside the noise on the test rows: not kept.
    assert said((0.1, -0.2, 0.4), 7.0) == {"verdict": "better", "kept": "not accepted"}
    # Beyond the noise on the test rows and no better on the valid rows: not kept either.
    assert said((0.3, 0.1, 0.5), 9.0) == {"verdict": "no better", "kept": "not accepted"}
    # Worse beyond the noise is not kept, whatever the valid rows say.
    assert said((-0.3, -0.5, -0.1), 7.0)["kept"] == "not accepted"
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


def test_the_ladder_s_board_network_is_counted_apart_in_the_models_that_have_a_start():
    from types import SimpleNamespace

    def run(name, parameters, **learner):
        return {"run": name, "learner": {"parameters": parameters}, "config": {"learner": learner}}

    ladder = [run("transformer-small", 1), run("transformer-medium", 6), run("transformer-medium-hand", 7, features="hand")]
    started = run("transformer-medium-pretrained", 6, init="position-evaluation/transformer-medium")
    counted = run("transformer-medium-hand-pretrained", 7, init="position-evaluation/transformer-medium", features="hand")
    pick = overview._ladder_board_where_started
    assert pick(SimpleNamespace(ladder=ladder, networks=[started, *ladder]))["run"] == "transformer-medium"
    # A model with no network that started from a body is in neither count, and one whose only start reads
    # the hand features has no start from the board alone.
    assert pick(SimpleNamespace(ladder=ladder, networks=ladder)) is None
    assert pick(SimpleNamespace(ladder=ladder, networks=[counted, *ladder])) is None


def test_a_name_and_a_count_read_as_the_lab_s_prose_says_them():
    assert overview.said("puzzle-difficulty-unsolved") == "puzzle difficulty unsolved"
    assert overview.titled("puzzle-difficulty-unsolved") == "Puzzle difficulty unsolved"
    card, chip = ({"learner": {"device": name}, "machine": {"processor": "Some CPU"}} for name in ("Some GPU", "cpu"))
    assert overview.processors([card, chip], cards=True) == ["Some GPU"] and overview.processors([card, chip, chip], cards=False) == ["Some CPU"]
    assert tex.listed([]) == "none" and tex.listed(["one"]) == "one" and tex.listed(["one", "two", "three"]) == "one, two and three"
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
    # Where a row's answer is a set of squares or a move, the trees read a row a square or a row a legal
    # move, and a paper names what they lean on: the square's or the move's own numbers, and the marks there.
    rows = []
    if task.kind == "squares":
        rows = [*SQUARE_PLAIN, *SQUARE_HAND, *(f"square_{name}" for name in marks)]
    if task.kind == "moves":
        rows = [*MOVE_PLAIN, *MOVE_HAND, *(f"{end}{name}" for end in glossary.ENDS for name in marks)]
    for name in rows:
        assert glossary.label(name) and glossary.says(name).endswith(".") and glossary.title(name)[0].isupper()
    assert len({glossary.label(name) for name in rows}) == len(rows)


def test_a_feature_of_one_end_of_a_move_is_worded_from_the_square_s_own():
    assert glossary.label("to_last_to") == "destination square: destination of the last move"
    assert glossary.says("from_square_pinned") == "Of the move's origin square: whether the piece on the square is pinned to its own king."
    assert glossary.label("move_piece") == "piece moved"
    with pytest.raises(KeyError):
        glossary.label("to_nothing_known")


def test_the_glossary_has_words_for_every_group_of_hand_features():
    assert set(GROUPS) <= set(glossary.GROUPS)
    assert glossary.GROUP_FEATURES is GROUPS
