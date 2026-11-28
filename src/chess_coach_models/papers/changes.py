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

A pair's values sit under ``pair.<run>.<the run it is set against>``: its gain
on the test rows with its interval and verdict, its gain on the valid rows,
and ``kept``, which is the lab's rule for a change read off the two. A
study's table is the block ``study-<name>`` and its figure
``study-<name>-figure``; the features study has one figure a run it was made
on, the reference's under that name and another run's as
``study-features-<run>``. A model without a study has none of them.

A change is of a kind (``kind``): the one setting it changes, or what a
network of another body or size is beside the run it changes. The kinds that
change a network's shape (``SHAPES``) are drawn apart from the others: the
block ``variants`` follows a ladder network and the runs that changed how it
is trained, epoch by epoch, and ``shapes`` each run of another shape beside
the network it changes.
"""

from __future__ import annotations

from typing import Any

from . import charts, glossary, tex
from .results import reference_level, valid_curve
from .sources import METRIC_NAMES, METRIC_WORDS, STUDIES, Sources, run_tex


# How many of the training games a run was given, beside the run it changes, as an axis and a table say it:
# a share of them, or a multiple for a run that trains on a larger build of the dataset.
SHARES = {4.0: "four times", 2.0: "twice", 1.0: "all", 0.5: "half", 0.25: "a quarter"}
# What a run may change and still be one that changes only how many games it trains on: where its training
# rows come from, and how often it goes through them, which a study changes to keep the steps the same.
GAMES_SETTINGS = {("data", "train_on"), ("data", "train_share"), ("train", "epochs"), ("train", "patience")}


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
        return "not significantly different"
    return "significantly better" if entry["gain"] > 0 else "significantly worse"


def kept(entry: dict[str, Any], ahead: float) -> bool:
    """The lab's rule for a change, both halves of it: the run is better than the run it changed on the valid
    rows (``ahead``), and its paired gain on the test rows is above zero beyond the noise."""
    return ahead > 0 and bool(entry["beyond_noise"]) and entry["gain"] > 0


def share_words(share: float) -> str:
    """A share or a multiple of the training games by itself, as a table's cell or an axis says it."""
    if share in SHARES:
        return SHARES[share]
    return f"{tex.plain(round(share, 2))} times" if share > 1 else f"{tex.plain(round(100.0 * share, 4))}\\%"


def games_words(share: float, games: str = "the training games") -> str:
    """The same with what it is a share of: ``half of the training games``, ``twice the training games``."""
    if share == 1.0:
        return f"all {games}"
    return f"{share_words(share)} {games}" if share > 1 else f"{share_words(share)} of {games}"


def multiple(run: dict[str, Any], base: dict[str, Any]) -> float | None:
    """How many times the training rows of the run it changes a run on a larger build trained on, taken to
    the nearest multiple an axis names when it is within a twentieth of one. Nothing for a run that trained
    on the dataset's own rows."""
    if run.get("train_dataset") is None or not run.get("train_rows"):
        return None
    ratio = run["train_rows"] / (base.get("train_rows") or base["dataset"]["splits"]["train"])
    return next((share for share in SHARES if abs(ratio / share - 1.0) < 0.05), round(ratio, 2))


def games_share(src: Sources, run: dict[str, Any]) -> float | None:
    """How many of the training games of the run it changes a run was given: the share its config names, or
    for a run on a larger build of the dataset the multiple its record gives."""
    base = records(src).get(run["config"].get("base"))
    if base is None:
        return None
    if run.get("train_dataset") is not None:
        return multiple(run, base)
    share = (run["config"].get("data") or {}).get("train_share")
    return None if share is None else float(share)


def games_runs(src: Sources) -> dict[str, list[tuple[float, dict[str, Any]]]]:
    """The runs that change only how many games a run trains on, by the run each changes and from the most
    games to the fewest: the games study's runs on a share of the training games, and any run that trains
    on a larger build of the dataset, whether it is ranked or has been filed under the study. The
    reference's come first."""
    known = records(src)
    found: dict[str, list[tuple[float, dict[str, Any]]]] = {}
    for run in known.values():
        base = known.get(run["config"].get("base"))
        if base is None or run["config"].get("study") not in (None, "games"):
            continue
        settings = changed(run, base)
        if not settings or not set(settings) <= GAMES_SETTINGS or not any(block == "data" for block, _ in settings):
            continue
        share = games_share(src, run)
        if share is not None and share != 1.0:
            found.setdefault(base["run"], []).append((share, run))
    return {
        base: sorted(runs, key=lambda item: -item[0])
        for base, runs in sorted(found.items(), key=lambda item: (item[0] != src.task.reference, item[0]))
    }


def more(src: Sources) -> list[tuple[str, float, dict[str, Any], dict[str, Any]]]:
    """The runs on more games than the run they change, with a measured pair: the run changed, the multiple,
    the run and its pair."""
    return [
        (base, share, run, entry)
        for base, runs in games_runs(src).items()
        for share, run in runs
        if share > 1 and (entry := pair(src, run["run"], base)) is not None
    ]


def _change(block: str, key: str, new: Any, old: Any) -> str:
    """One setting a run changes, in words."""
    if (block, key) == ("learner", "features"):
        return "with hand-crafted features" if new == "hand" else "without hand-crafted features"
    if (block, key) == ("learner", "init"):
        return "trained from scratch" if new is None else f"encoder initialised from {run_tex(new['model'] + '/' + new['run'])}"
    if (block, key) == ("learner", "without"):
        groups = " and ".join(glossary.group(name) for name in new or [])
        return f"without the {groups} features"
    if (block, key) == ("learner", "attacks"):
        return "with attack-aware attention bias" if new else "without attack-aware attention bias"
    if (block, key) == ("learner", "geometry"):
        return "without relative position bias" if new is False else "with relative position bias"
    if (block, key) == ("learner", "temporal"):
        return "with derived temporal step features" if new else "without derived temporal step features"
    if (block, key) == ("learner", "board_features"):
        return "with per-move board-geometry features" if new else "without per-move board-geometry features"
    if (block, key) == ("learner", "without_opponent"):
        return "without opponent clock or implied-loss features" if new else "with opponent signals"
    if (block, key) == ("learner", "solution_boards"):
        return "with post-move and final solution boards" if new else "without solution boards"
    if (block, key) == ("train", "aux_target"):
        return "without auxiliary head" if new is None else f"with auxiliary \\code{{{tex.esc(new)}}} supervision"
    if (block, key) == ("train", "loss"):
        return "asymmetric loss" if new == "asl" else f"\\code{{{tex.esc(new)}}} loss"
    if (block, key) == ("train", "calibrate"):
        return "per-tag Platt calibration" if new == "per_candidate" else "shared Platt calibration"
    if (block, key) == ("data", "train_share"):
        return f"trained on {games_words(float(new))}" if new is not None else "trained on all the training games"
    if (block, key) == ("data", "train_on"):
        return "trained on the standard training set" if new is None else f"trained on the larger training set \\code{{{tex.esc(new)}}}"
    if (block, key) == ("train", "seed"):
        return "second training run, different random seed"
    if (block, key) == ("learner", "rounds"):
        return "default limit on boosting rounds" if new is None else f"up to {tex.count(new)} boosting rounds"
    names = {"epochs": ("epoch", "epochs"), "patience": ("epoch of patience", "epochs of patience")}
    name = names[key][new != 1] if key in names else {"lr": "peak learning rate", "batch": "examples per batch"}.get(key)
    if block == "train" and name is not None and new is not None:
        number = tex.plain(new) if isinstance(new, (int, float)) else tex.esc(new)
        was = "" if old is None else f" in place of {tex.plain(old) if isinstance(old, (int, float)) else tex.esc(old)}"
        return f"{number} {name}{was}"
    said = "not set" if new is None else tex.esc(new)
    return f"\\texttt{{{tex.esc(block)}.{tex.esc(key)}}} {said}" + ("" if old is None else f" in place of {tex.esc(old)}")


# The settings that say a network's shape: its body, and what the body is made of.
SHAPE = frozenset(("learner", key) for key in ("body", "dim", "depth", "heads", "convs", "squeeze"))


def differing(run: dict[str, Any], other: dict[str, Any]) -> list[tuple[str, str]]:
    """Every setting one run's config has otherwise than another's, each as ``(block, key)``."""
    ours, theirs = run["config"], other["config"]
    return [
        (block, key)
        for block in ("learner", "data", "train")
        for key in sorted(set(ours.get(block) or {}) | set(theirs.get(block) or {}))
        if (ours.get(block) or {}).get(key) != (theirs.get(block) or {}).get(key)
    ]


def changed(run: dict[str, Any], other: dict[str, Any]) -> list[tuple[str, str]] | None:
    """The settings one run's config changes in another's, each as ``(block, key)``, or nothing for two
    runs of different learners, which differ in more than a setting."""
    ours, theirs = run["config"], other["config"]
    if any(ours["learner"].get(key) != theirs["learner"].get(key) for key in ("kind", "body", "dim", "depth")):
        return None
    return differing(run, other)


def beside_shape(run: dict[str, Any], other: dict[str, Any]) -> list[tuple[str, str]]:
    """What two networks differ in beside their shape: a tower trained at a rate of its own differs from
    the transformer it is set against in its body and in that rate."""
    return [setting for setting in differing(run, other) if setting not in SHAPE]


# A kind of change by the one setting that makes it: the hand features, more epochs, a start from another
# run's body, attention told what each piece attacks, attention without the offsets between squares.
KIND_OF = {
    ("learner", "features"): "hand",
    ("train", "epochs"): "epochs",
    ("learner", "init"): "start",
    ("learner", "attacks"): "attacks",
    ("learner", "geometry"): "geometry",
}
# The kinds that change a network's shape and nothing it is trained on or for how long: another body for
# the transformer's, the same body larger, attention told more of the board or less. A table and a figure
# have them in this order.
SHAPES = ("conv", "hybrid", "larger", "attacks", "geometry")
# What a network of another body or size may change beside its shape and still be of its shape's kind: a
# tower is trained at the rate a tower takes.
AT_ITS_RATE = {("train", "lr")}


def kind(run: dict[str, Any], over: dict[str, Any]) -> str | None:
    """The kind of change one run makes in another: the one setting it changes when that is one of
    ``KIND_OF``, and for two networks of different bodies or sizes what the first is beside the second: a
    convolutional tower or a hybrid for a transformer (``conv``, ``hybrid``), or the same body with more
    parameters (``larger``). Two runs that differ in more, or in something else, are of no kind. A network
    of another shape may be trained at a rate of its own (``AT_ITS_RATE``) and is still of its shape's kind."""
    settings = changed(run, over)
    if settings is not None:
        return KIND_OF.get(settings[0]) if len(settings) == 1 else None
    ours, theirs = run["config"]["learner"], over["config"]["learner"]
    if ours.get("kind") != "net" or theirs.get("kind") != "net":
        return None
    if not set(beside_shape(run, over)) <= AT_ITS_RATE:
        return None
    if ours["body"] != theirs["body"]:
        return ours["body"] if theirs["body"] == "transformer" and ours["body"] in SHAPES else None
    return "larger" if run["learner"]["parameters"] > over["learner"]["parameters"] else None


def kinds(src: Sources) -> set[str]:
    """The kinds of change (``KIND_OF``, ``SHAPES``) this model has a measured pair of."""
    found = records(src)
    made = (
        kind(found[entry["run"]], found[entry["over"]])
        for entry in pairs(src)
        if entry["run"] in found and entry["over"] in found
    )
    return {one for one in made if one}


# Every kind of change, in the order a paper lists them.
KINDS = (*KIND_OF.values(), *(shape for shape in SHAPES if shape not in KIND_OF.values()))

# A network's body as a table says it.
BODIES = {"transformer": "transformer", "conv": "ResNet", "hybrid": "CNN-transformer hybrid", "steps": "per-move sequence"}


def differs(run: dict[str, Any], other: dict[str, Any]) -> str:
    """What one run's config changes in another's, in words. Two networks of different bodies or sizes differ in
    that, and it is said first, before anything they differ in beside their shape. Two runs of different
    learners differ in the learner, and their names say how."""
    settings = changed(run, other)
    said = []
    if settings is None:
        ours, theirs = run["config"]["learner"], other["config"]["learner"]
        if ours.get("kind") != "net" or theirs.get("kind") != "net":
            return "a different model class"
        if ours["body"] != theirs["body"]:
            said.append(f"{BODIES.get(ours['body'], tex.esc(ours['body']))} encoder in place of the {BODIES.get(theirs['body'], tex.esc(theirs['body']))}")
        else:
            said.append(f"{tex.plain(ours['depth'])} layers of width {tex.plain(ours['dim'])} in place of {tex.plain(theirs['depth'])} of width {tex.plain(theirs['dim'])}")
        settings = beside_shape(run, other)
    ours, theirs = run["config"], other["config"]
    times = multiple(run, other) if ("data", "train_on") in settings else None
    if times is not None:
        # A larger build and the share of it a run takes are one change: how many games it trains on.
        build = tex.esc(ours["data"]["train_on"])
        said.append(f"trained on {games_words(times)} (\\code{{{build}}})")
        settings = [(block, key) for block, key in settings if (block, key) not in (("data", "train_on"), ("data", "train_share"))]
    said += [_change(block, key, (ours.get(block) or {}).get(key), (theirs.get(block) or {}).get(key)) for block, key in settings]
    return "; ".join(said) if said else "no configured difference"


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
                # A study run is there to measure, not to be kept. A run on more games was tried as a run of
                # the model's own, so the rule was read off it even where it has been filed under the study.
                if not tabled(entry) or (games_share(src, known[entry["run"]]) or 0.0) > 1.0:
                    out.set(f"{prefix}.kept", "accepted" if kept(entry, ahead) else "not accepted")
    plain = [entry for entry in pairs(src) if not tabled(entry)]
    out.set("pairs.count", tex.word(len(plain)))
    for study in sorted({run["config"]["study"] for run in src.studies}):
        runs = [run for run in src.studies if run["config"]["study"] == study]
        prefix = tex.key("study", study)
        out.set(f"{prefix}.runs", tex.word(len(runs)))
        for base in sorted({run["config"].get("base") for run in runs} - {None}):
            measured = [(run, pair(src, run["run"], base)) for run in runs if run["config"].get("base") == base]
            measured = [(run, entry) for run, entry in measured if entry is not None]
            if study == "games":
                # The study's own question is what fewer games cost. A run on more games that was filed under
                # it is counted with the runs on more games below.
                measured = [(run, entry) for run, entry in measured if (games_share(src, run) or 0.0) < 1.0]
            inner = tex.key(prefix, base)
            out.set(f"{inner}.runs", tex.word(len(measured)))
            worse = [entry for _, entry in measured if entry["beyond_noise"] and entry["gain"] < 0]
            better = [entry for _, entry in measured if entry["beyond_noise"] and entry["gain"] > 0]
            out.set(f"{inner}.worse", tex.word(len(worse)))
            out.set(f"{inner}.worse.of", tex.of(len(worse), len(measured), "ablation" if len(measured) == 1 else "ablations"))
            out.set(f"{inner}.better", tex.word(len(better)))
            out.set(f"{inner}.level", tex.word(len(measured) - len(worse) - len(better)))
            if study == "features" and measured:
                ordered = sorted(measured, key=lambda item: item[1]["gain"])
                for end, (run, entry) in (("most", ordered[0]), ("least", ordered[-1])):
                    out.set(f"{inner}.{end}.group", glossary.group(run["config"]["learner"]["without"][0]))
                    out.set(f"{inner}.{end}.run", run_tex(run["run"]))
                    out.set(f"{inner}.{end}.gain", tex.trio(entry["gain"], entry["low"], entry["high"])[0])
                    out.set(f"{inner}.{end}.verdict", verdict(entry))
    more_values(src, out)


def more_values(src: Sources, out: tex.Generated) -> None:
    """What the runs on more games than the run they change give, under ``more.<run changed>``: how many
    there are and how they came out, and the one on the most games by itself."""
    known = records(src)
    by_base: dict[str, list[tuple[float, dict[str, Any], dict[str, Any]]]] = {}
    for base, share, run, entry in more(src):
        by_base.setdefault(base, []).append((share, run, entry))
    for base, found in by_base.items():
        prefix = tex.key("more", base)
        better = [entry for _, _, entry in found if entry["beyond_noise"] and entry["gain"] > 0]
        worse = [entry for _, _, entry in found if entry["beyond_noise"] and entry["gain"] < 0]
        out.set(f"{prefix}.runs", tex.word(len(found)))
        out.set(f"{prefix}.better", tex.word(len(better)))
        out.set(f"{prefix}.better.of", tex.of(len(better), len(found), "model" if len(found) == 1 else "models"))
        out.set(f"{prefix}.worse", tex.word(len(worse)))
        out.set(f"{prefix}.level", tex.word(len(found) - len(better) - len(worse)))
        share, run, entry = max(found, key=lambda item: item[0])
        out.set(f"{prefix}.most", share_words(share))
        out.set(f"{prefix}.most.run", run_tex(run["run"]))
        out.set(f"{prefix}.most.rows", tex.count(run["train_rows"]))
        out.set(f"{prefix}.most.gain", tex.trio(entry["gain"], entry["low"], entry["high"])[0])
        out.set(f"{prefix}.most.verdict", verdict(entry))
        ahead = valid_gain(src, run, known[base])
        if ahead is not None:
            out.set(f"{prefix}.most.kept", "accepted" if kept(entry, ahead) else "not accepted")


def _place(run: dict[str, Any], over: dict[str, Any]) -> tuple[int, str, str]:
    """Where a pair stands in the table of pairs: by the kind of its change, in the order a paper lists the
    kinds, then by the run it changes. A pair of no listed kind (a run on more training games) comes last."""
    made = kind(run, over)
    return (KINDS.index(made) if made in KINDS else len(KINDS), over["run"], run["run"])


def pairs_table(src: Sources) -> str | None:
    """The runs set against the run each changed or has to beat: what differs between the two, and the first's
    paired gain over the second. The runs of the games and the features study have tables of their own."""
    known = records(src)
    asked = [entry for entry in (src.look or {}).get("pairs") or [] if not tabled(entry)]
    measured = {(entry["run"], entry["over"]): entry for entry in pairs(src) if not tabled(entry)}
    listed = [(entry["run"], entry["over"]) for entry in asked]
    listed += [names for names in measured if names not in listed]
    listed = [(run, over) for run, over in listed if run in known and over in known]
    rows = []
    for run, over in sorted(listed, key=lambda names: _place(known[names[0]], known[names[1]])):
        ahead = valid_gain(src, known[run], known[over])
        on_valid = "" if ahead is None else tex.sig(ahead, 3, sign=True)
        rows.append([run_tex(run), run_tex(over), differs(known[run], known[over]), on_valid, *_gain_cells(measured.get((run, over)))])
    if not rows:
        return None
    name = ">{\\raggedright\\arraybackslash}p{2.45cm}"
    head = ["Model", "Baseline", "Change", "Validation", "Test", "95\\% CI"]
    table = tex.tabular(f"{name}{name}Lrrr", head, rows, width="\\textwidth", pages=True)
    gain = f"\\multicolumn{{3}}{{c}}{{Gain in {METRIC_WORDS[src.primary]}}}"
    return tex.grouped(table, ["", "", "", gain], [(4, 6)])


def pairs_figure(src: Sources) -> str | None:
    """Each measured pair's gain with its interval, zero as the line to read against."""
    measured = [entry for entry in pairs(src) if not tabled(entry)]
    if not measured:
        return None
    rows = [(f"{entry['run']} over {entry['over']}", entry["gain"], entry["low"], entry["high"]) for entry in measured]
    return charts.intervals(
        rows,
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} of the first model over the second (right of the line is better)",
        reference=0.0,
        colours=[charts.run_colour(entry["run"]) for entry in measured],
        width="0.5\\textwidth",
    )


def _curved(src: Sources, run: dict[str, Any]) -> list[tuple[str | None, dict[str, Any]]]:
    """The networks that change one thing in a ladder network and have a score for every epoch, each with
    the kind of its change."""
    return [(kind(other, run), other) for other in src.variants(run) if other["learner"].get("history")]


def variants_figure(src: Sources) -> str | None:
    """Each ladder network that another run changed in how it is trained (more epochs, another start),
    beside those runs, on the valid rows epoch by epoch: one panel a ladder network, all on one scale. A run
    of another shape is not among them: ``shapes_figure`` has it."""
    groups = []
    for run in src.ladder:
        family = [run] if run["learner"].get("history") else []
        family += [other for made, other in _curved(src, run) if made not in SHAPES]
        if len(family) > 1:
            groups.append([valid_curve(src, one) for one in family])
    if not groups:
        return None
    return charts.panels(
        groups,
        xlabel="Epoch",
        ylabel=f"{METRIC_NAMES[src.primary]} on the validation set",
        level=reference_level(src),
        width=f"{min(0.52, 0.98 / len(groups)):.2f}\\textwidth",
    )


def shapes_figure(src: Sources) -> str | None:
    """Each run of another shape than the ladder network it changes (``SHAPES``), beside that network, on the
    valid rows epoch by epoch: one panel a run, two panels a row, all on one scale. The panels are in the
    order of the ladder, and under a network in the order of the kinds."""
    groups = []
    for run in src.ladder:
        if not run["learner"].get("history"):
            continue
        shaped = [(SHAPES.index(made), other) for made, other in _curved(src, run) if made in SHAPES]
        groups += [[valid_curve(src, run), valid_curve(src, other)] for _, other in sorted(shaped, key=lambda item: item[0])]
    if not groups:
        return None
    return charts.panels(
        groups,
        xlabel="Epoch",
        ylabel=f"{METRIC_NAMES[src.primary]} on the validation set",
        level=reference_level(src),
        width="0.52\\textwidth",
        height="4.5cm",
        columns=2,
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
    """The games study: each run trained on a share of the training games, under the run on all of them, and
    above that run any run trained on more of them, from a larger build of the dataset. A model has the
    table once it has a run on fewer games."""
    known = records(src)
    rows = []
    for base, runs in games_runs(src).items():
        if not any(share < 1 for share, _ in runs):
            continue
        whole = [run_tex(base), "all", _train_rows(known[base]), _score(src, known[base]), "", ""]
        cells = [
            (share, [run_tex(run["run"]), share_words(share), _train_rows(run), _score(src, run), *_gain_cells(pair(src, run["run"], base))])
            for share, run in runs
        ]
        rows += [row for share, row in cells if share > 1] + [whole] + [row for share, row in cells if share < 1]
    if not rows:
        return None
    # The run's name takes what the numbers leave of the page: a gain of six digits with its interval is wide.
    head = ["Model", "Training games", "Training examples", METRIC_NAMES[src.primary], "Gain", "95\\% CI"]
    return tex.tabular("Llrrrr", head, rows, width="\\textwidth")


def games_figure(src: Sources) -> str | None:
    """The games study as a learning curve: each run's score by how many of the training games it was given,
    a share of them or, from a larger build, a multiple."""
    known = records(src)
    series, shares = [], sorted(share for share in SHARES if share <= 1)
    for base, runs in games_runs(src).items():
        if not any(share < 1 for share, _ in runs):
            continue
        points = {1.0: known[base]["test"][src.primary]["value"]}
        points.update({share: run["test"][src.primary]["value"] for share, run in runs})
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
        xlabel="Training games, relative to the standard training set",
        ylabel=f"{METRIC_NAMES[src.primary]} on the test set ({better} is better)",
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
        rows.append([run_tex(base), "none", "", _score(src, known[base]), "", ""])
        measured = [(run, pair(src, run["run"], base)) for run in runs]
        for run, entry in sorted(measured, key=lambda item: (item[1] is None, item[1]["gain"] if item[1] else 0.0)):
            groups = _left_out(run)
            count = sum(src.group_size(name) for name in groups)
            rows.append(
                [run_tex(run["run"]), " and ".join(glossary.group(name) for name in groups), str(count), _score(src, run), *_gain_cells(entry)]
            )
    if not rows:
        return None
    head = ["Model", "Removed group", "Features", METRIC_NAMES[src.primary], "Gain", "95\\% CI"]
    return tex.tabular(">{\\raggedright\\arraybackslash}p{3.7cm}Lrrrr", head, rows, width="\\textwidth")


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
        "variants": variants_figure(src),
        "shapes": shapes_figure(src),
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
