"""What a paper says about one change at a time: runs set against the run each changed, and the studies.

A ladder says what each learner is worth. A change says what one thing is
worth inside a learner: more epochs, a body that starts from another run's,
the hand features under a network, fewer training games, a group of hand
features left out. Each is a pair of runs that differ in that one thing, and
what is reported is the first's paired gain over the second on the same
resampled test games.

The gains come from the closer look (``analysis.json``, ``pairs``), which is
written where the test predictions are. One kind of pair needs no closer
look: a run that changes the reference was compared with it when it was
trained, and its record holds that gain.

A pair's values sit under ``pair.<run>.<the run it is set against>``. A
study's table is the block ``study-<name>`` and its figure
``study-<name>-figure``; the features study has one figure a run it was made
on, the reference's under that name and another run's as
``study-features-<run>``. A model without a study has none of them.
"""

from __future__ import annotations

from typing import Any

from . import charts, glossary, tex
from .sources import METRIC_NAMES, METRIC_WORDS, STUDIES, Sources, run_cell, run_tex


# A share of the training games as prose and an axis say it.
SHARES = {1.0: "all", 0.5: "half", 0.25: "a quarter"}


def records(src: Sources) -> dict[str, dict[str, Any]]:
    """Every record of the model by its run's name: the leaderboard's and the studies'."""
    return {run["run"]: run for run in [*src.runs, *src.studies]}


def base_of(src: Sources, run: dict[str, Any]) -> str | None:
    """The run a run changes one thing in: the base its config names, or for a run written out in full the
    run its name starts from."""
    named = run["config"].get("base")
    if named is not None:
        return named
    family = charts.family(run["run"])
    return family if family != run["run"] and family in records(src) else None


def pairs(src: Sources) -> list[dict[str, Any]]:
    """Every pair with a measured gain: the closer look's, then each run that changes the reference and is in
    no pair of the closer look, with the gain its record holds."""
    found = [dict(pair) for pair in (src.look or {}).get("pairs") or [] if pair.get("gain") is not None]
    seen = {(pair["run"], pair["over"]) for pair in found}
    for name, run in sorted(records(src).items()):
        gain = run.get("gain")
        if gain is None or base_of(src, run) != src.task.reference or (name, src.task.reference) in seen:
            continue
        entry = {key: gain[key] for key in ("gain", "low", "high", "beyond_noise")}
        entry.update(run=name, over=src.task.reference)
        if run["config"].get("study"):
            entry["study"] = run["config"]["study"]
        found.append(entry)
    return found


def tabled(entry: dict[str, Any]) -> bool:
    """Whether a pair is a run of the games or the features study, which has a table of its own. A run filed
    under another study was tried as a run of the model's own, and its pair stands with the other pairs."""
    return entry.get("study") in STUDIES


def pair(src: Sources, run: str, over: str) -> dict[str, Any] | None:
    return next((one for one in pairs(src) if one["run"] == run and one["over"] == over), None)


def valid_gain(src: Sources, run: dict[str, Any], over: dict[str, Any]) -> float | None:
    """How much better one run is than another on the valid rows, by the primary metric: positive when it is
    better. A change is kept only when this is, and its gain on the test rows is beyond the noise."""
    ours, theirs = (one.get("valid", {}).get(src.primary) for one in (run, over))
    return None if ours is None or theirs is None else src.better_by(ours, theirs)


def verdict(entry: dict[str, Any]) -> str:
    """A pair's gain as a sentence ends: better, worse, or inside the noise."""
    if not entry["beyond_noise"]:
        return "inside the noise"
    return "better beyond the noise" if entry["gain"] > 0 else "worse beyond the noise"


def share_words(share: float) -> str:
    return SHARES.get(share, f"{tex.plain(round(100.0 * share, 4))}\\%")


def _change(block: str, key: str, new: Any, old: Any) -> str:
    """One setting a run changes, in words."""
    if (block, key) == ("learner", "features"):
        return "reads the hand features" if new == "hand" else "does not read the hand features"
    if (block, key) == ("learner", "init"):
        return "does not start from another run" if new is None else f"starts from the body of {run_cell(new['model'] + '/' + new['run'])}"
    if (block, key) == ("learner", "without"):
        groups = " and ".join(glossary.group(name) for name in new or [])
        return f"does not read the hand features of {groups}"
    if (block, key) == ("data", "train_share"):
        return f"trains on {share_words(float(new))} of the training games" if new is not None else "trains on all the training games"
    name = {"epochs": "epochs", "patience": "epochs of patience", "lr": "peak learning rate", "batch": "rows a batch"}.get(key)
    if block == "train" and name is not None and new is not None:
        number = tex.plain(new) if isinstance(new, (int, float)) else tex.esc(new)
        was = "" if old is None else f" for {tex.plain(old) if isinstance(old, (int, float)) else tex.esc(old)}"
        return f"{number} {name}{was}"
    said = "not set" if new is None else tex.esc(new)
    return f"\\texttt{{{tex.esc(block)}.{tex.esc(key)}}} {said}" + ("" if old is None else f" for {tex.esc(old)}")


def changed(run: dict[str, Any], other: dict[str, Any]) -> list[tuple[str, str]] | None:
    """The settings one run's config changes in another's, each as ``(block, key)``, or nothing for two
    runs of different learners, which differ in more than a setting."""
    ours, theirs = run["config"], other["config"]
    if any(ours["learner"].get(key) != theirs["learner"].get(key) for key in ("kind", "body", "dim", "depth")):
        return None
    return [
        (block, key)
        for block in ("learner", "data", "train")
        for key in sorted(set(ours.get(block) or {}) | set(theirs.get(block) or {}))
        if (ours.get(block) or {}).get(key) != (theirs.get(block) or {}).get(key)
    ]


def differs(run: dict[str, Any], other: dict[str, Any]) -> str:
    """What one run's config changes in another's, in words. Two runs of different learners differ in the
    learner, and their names say how."""
    settings = changed(run, other)
    if settings is None:
        return "another learner"
    ours, theirs = run["config"], other["config"]
    said = [_change(block, key, (ours.get(block) or {}).get(key), (theirs.get(block) or {}).get(key)) for block, key in settings]
    return "; ".join(said) if said else "nothing its config names"


def _gain_cells(entry: dict[str, Any] | None) -> list[str]:
    if entry is None:
        return ["not measured", ""]
    value, low, high = tex.trio(entry["gain"], entry["low"], entry["high"])
    return [tex.bold(value, entry["beyond_noise"]), f"{low} to {high}"]


def values(src: Sources, out: tex.Generated) -> None:
    """Every value the pairs and the studies give."""
    known = records(src)
    for entry in pairs(src):
        prefix = tex.key("pair", entry["run"], entry["over"])
        value, low, high = tex.trio(entry["gain"], entry["low"], entry["high"])
        out.set(f"{prefix}.gain", value)
        out.set(f"{prefix}.gain.low", low)
        out.set(f"{prefix}.gain.high", high)
        out.set(f"{prefix}.verdict", verdict(entry))
        other = known.get(entry["over"])
        if other is not None:
            score = other["test"][src.primary]["value"]
            if score:
                out.set(f"{prefix}.gain.percent", tex.sig(100.0 * abs(entry["gain"]) / abs(score), 2))
        if entry["run"] in known and other is not None:
            out.set(f"{prefix}.differs", differs(known[entry["run"]], other))
            ahead = valid_gain(src, known[entry["run"]], other)
            if ahead is not None:
                out.set(f"{prefix}.valid.gain", tex.sig(ahead, 3, sign=True))
                out.set(f"{prefix}.valid.verdict", "better" if ahead > 0 else "no better")
    plain = [entry for entry in pairs(src) if not tabled(entry)]
    out.set("pairs.count", tex.word(len(plain)))
    for study in sorted({run["config"]["study"] for run in src.studies}):
        runs = [run for run in src.studies if run["config"]["study"] == study]
        prefix = tex.key("study", study)
        out.set(f"{prefix}.runs", tex.word(len(runs)))
        for base in sorted({run["config"].get("base") for run in runs} - {None}):
            measured = [(run, pair(src, run["run"], base)) for run in runs if run["config"].get("base") == base]
            measured = [(run, entry) for run, entry in measured if entry is not None]
            inner = tex.key(prefix, base)
            out.set(f"{inner}.runs", tex.word(len(measured)))
            worse = [entry for _, entry in measured if entry["beyond_noise"] and entry["gain"] < 0]
            better = [entry for _, entry in measured if entry["beyond_noise"] and entry["gain"] > 0]
            out.set(f"{inner}.worse", tex.word(len(worse)))
            out.set(f"{inner}.worse.of", tex.of(len(worse), len(measured), "runs"))
            out.set(f"{inner}.better", tex.word(len(better)))
            out.set(f"{inner}.level", tex.word(len(measured) - len(worse) - len(better)))
            if study == "features" and measured:
                ordered = sorted(measured, key=lambda item: item[1]["gain"])
                for end, (run, entry) in (("most", ordered[0]), ("least", ordered[-1])):
                    out.set(f"{inner}.{end}.group", glossary.group(run["config"]["learner"]["without"][0]))
                    out.set(f"{inner}.{end}.run", run_tex(run["run"]))
                    out.set(f"{inner}.{end}.gain", tex.trio(entry["gain"], entry["low"], entry["high"])[0])
                    out.set(f"{inner}.{end}.verdict", verdict(entry))


def pairs_table(src: Sources) -> str | None:
    """The runs set against the run each changed or has to beat: what differs between the two, and the first's
    paired gain over the second. The runs of the games and the features study have tables of their own."""
    known = records(src)
    asked = [entry for entry in (src.look or {}).get("pairs") or [] if not tabled(entry)]
    measured = {(entry["run"], entry["over"]): entry for entry in pairs(src) if not tabled(entry)}
    listed = [(entry["run"], entry["over"]) for entry in asked]
    listed += [names for names in measured if names not in listed]
    rows = []
    for run, over in listed:
        if run not in known or over not in known:
            continue
        ahead = valid_gain(src, known[run], known[over])
        on_valid = "" if ahead is None else tex.sig(ahead, 3, sign=True)
        rows.append([run_cell(run), run_cell(over), differs(known[run], known[over]), on_valid, *_gain_cells(measured.get((run, over)))])
    if not rows:
        return None
    name = ">{\\raggedright\\arraybackslash}p{2.45cm}"
    head = ["Run", "Set against", "What the run changes", "Valid rows", "Test rows", "95\\% interval"]
    table = tex.tabular(f"{name}{name}Lrrr", head, rows, width="\\textwidth")
    gain = f"\\multicolumn{{3}}{{c}}{{Gain in {METRIC_NAMES[src.primary]}}}"
    return tex.grouped(table, ["", "", "", gain], [(4, 6)])


def pairs_figure(src: Sources) -> str | None:
    """Each measured pair's gain with its interval, zero as the line to read against."""
    measured = [entry for entry in pairs(src) if not tabled(entry)]
    if not measured:
        return None
    rows = [(f"{entry['run']} over {entry['over']}", entry["gain"], entry["low"], entry["high"]) for entry in measured]
    return charts.intervals(
        rows,
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} of the first run over the second (right of the line is better)",
        reference=0.0,
        colours=[charts.run_colour(entry["run"]) for entry in measured],
        width="0.5\\textwidth",
    )


def _study(src: Sources, study: str) -> dict[str, list[dict[str, Any]]]:
    """A study's runs by the run each changes, the reference's first."""
    by_base: dict[str, list[dict[str, Any]]] = {}
    for run in src.studies:
        if run["config"]["study"] == study and run["config"].get("base") is not None:
            by_base.setdefault(run["config"]["base"], []).append(run)
    return dict(sorted(by_base.items(), key=lambda item: (item[0] != src.task.reference, item[0])))


def _score(src: Sources, run: dict[str, Any]) -> str:
    return tex.score(run["test"][src.primary]["value"])


def _train_rows(run: dict[str, Any]) -> str:
    return tex.count(run.get("train_rows") or run["dataset"]["splits"]["train"])


def games_table(src: Sources) -> str | None:
    """The games study: each run trained on a share of the training games, under the run on all of them."""
    known = records(src)
    rows = []
    for base, runs in _study(src, "games").items():
        if base not in known:
            continue
        rows.append([run_cell(base), "all", _train_rows(known[base]), _score(src, known[base]), "", ""])
        for run in sorted(runs, key=lambda run: -float(run["config"]["data"]["train_share"])):
            share = share_words(float(run["config"]["data"]["train_share"]))
            rows.append([run_cell(run["run"]), share, _train_rows(run), _score(src, run), *_gain_cells(pair(src, run["run"], base))])
    if not rows:
        return None
    head = ["Run", "Training games", "Train rows", METRIC_NAMES[src.primary], "Gain over all the games", "95\\% interval"]
    return tex.tabular(">{\\raggedright\\arraybackslash}p{4.6cm}lrrrr", head, rows)


def games_figure(src: Sources) -> str | None:
    """The games study as a learning curve: each run's score by the share of the training games it was given."""
    known = records(src)
    series, shares = [], sorted(SHARES)
    for base, runs in _study(src, "games").items():
        if base not in known:
            continue
        points = {1.0: known[base]["test"][src.primary]["value"]}
        points.update({float(run["config"]["data"]["train_share"]): run["test"][src.primary]["value"] for run in runs})
        shares = sorted(set(shares) | set(points))
        series.append((base, points))
    if not series:
        return None
    drawn = [
        charts.run_series(base, [(shares.index(share), value) for share, value in sorted(points.items())])
        for base, points in series
    ]
    better = "lower" if src.task.lower_is_better else "higher"
    return charts.lines(
        drawn,
        xlabel="Share of the training games",
        ylabel=f"{METRIC_NAMES[src.primary]} on the test rows ({better} is better)",
        tick_labels=[share_words(share) for share in shares],
        width="0.5\\textwidth",
    )


def _left_out(run: dict[str, Any]) -> list[str]:
    return list(run["config"]["learner"].get("without") or [])


def features_table(src: Sources) -> str | None:
    """The features study: each run with one group of hand features left out, under the run that reads them all,
    the group whose loss costs most first."""
    known = records(src)
    rows = []
    for base, runs in _study(src, "features").items():
        if base not in known:
            continue
        rows.append([run_cell(base), "nothing", "", _score(src, known[base]), "", ""])
        measured = [(run, pair(src, run["run"], base)) for run in runs]
        for run, entry in sorted(measured, key=lambda item: (item[1] is None, item[1]["gain"] if item[1] else 0.0)):
            groups = _left_out(run)
            count = sum(len(glossary.GROUP_FEATURES[name]) for name in groups)
            rows.append(
                [run_cell(run["run"]), " and ".join(glossary.group(name) for name in groups), str(count), _score(src, run), *_gain_cells(entry)]
            )
    if not rows:
        return None
    head = ["Run", "Left out", "Features", METRIC_NAMES[src.primary], "Gain over reading all", "95\\% interval"]
    return tex.tabular(">{\\raggedright\\arraybackslash}p{4.6cm}>{\\raggedright\\arraybackslash}p{3.4cm}rrrr", head, rows)


def features_figure(src: Sources, base: str) -> str | None:
    """What leaving each group of hand features out costs one run: the paired gain of the run without the
    group over the run with it, the costliest first. Left of the line, the run was worse without the group."""
    measured = [(run, pair(src, run["run"], base)) for run in _study(src, "features").get(base, [])]
    measured = sorted([(run, entry) for run, entry in measured if entry is not None], key=lambda item: item[1]["gain"])
    if not measured:
        return None
    rows = [
        (" and ".join(glossary.group(name) for name in _left_out(run)), entry["gain"], entry["low"], entry["high"])
        for run, entry in measured
    ]
    return charts.intervals(
        rows,
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} without the group (left of the line: worse without it)",
        reference=0.0,
        reference_label=run_tex(base),
        colours=[charts.run_colour(base)] * len(rows),
        code=False,
        width="0.5\\textwidth",
        row_height=0.44,
    )


def blocks(src: Sources, out: tex.Generated) -> None:
    """Every table and figure the pairs and the studies give."""
    made: dict[str, str | None] = {
        "pairs": pairs_table(src),
        "pairs-figure": pairs_figure(src),
        "study-games": games_table(src),
        "study-games-figure": games_figure(src),
        "study-features": features_table(src),
    }
    # The reference's figure has one name in every paper; another run's is named for the run.
    for base in _study(src, "features"):
        name = "study-features-figure" if base == src.task.reference else f"study-features-{base}"
        made[name] = features_figure(src, base)
    for name, latex in made.items():
        if latex is not None:
            out.block(name, latex)
