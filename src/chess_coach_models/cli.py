"""The lab's command line: build a dataset, train a run, score a model, look closer.

    lab data puzzles                         build datasets/puzzles.yaml
    lab train puzzle-difficulty gbm-hand     one run of one model
    lab eval puzzle-difficulty               the model's leaderboard
    lab all puzzle-difficulty                its data, every run this machine can train, its leaderboard
    lab analyse puzzle-difficulty            the closer look, from its dataset and test predictions
    lab file puzzle-difficulty <run>         a trained run's record, filed as its config files it now
    lab paper puzzle-difficulty              its paper: every number and figure, then the PDF
    lab paper                                the lab's own paper: every model's results side by side
    lab report                               the README's table, from the leaderboards

``--smoke`` everywhere uses the small dataset and writes under
``artifacts/smoke/``: a check that the code runs, never a result.
"""

from __future__ import annotations

import argparse
import sys
import time

from . import data, paths, tasks
from .data.store import dataset_dir, write_dataset
from .train.run import run, run_config, run_names, studies


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def build_data(dataset: str, *, smoke: bool, source: str | None, workers: int | None, rebuild: bool) -> None:
    plan = data.recipe(dataset, smoke=smoke)
    manifest_path = dataset_dir(plan["name"]) / "manifest.json"
    if manifest_path.exists() and not rebuild:
        log(f"{plan['name']} is already built ({manifest_path}); --rebuild builds it again")
        return
    build = data.builder(plan["builder"])
    started = time.time()
    # A dataset whose rows are sequences gives its steps as a fifth part.
    rows, tokens, marks, manifest, *steps = build(plan, source=source, workers=workers, log=log)
    manifest["build_seconds"] = round(time.time() - started, 1)
    directory = write_dataset(plan["name"], rows, tokens, marks, manifest, *steps)
    log(f"{plan['name']}: {len(rows):,} rows written to {directory}")


def waits_for(model: str, name: str, *, smoke: bool) -> str | None:
    """What a run waits for on this machine, or nothing when it can be trained now: one that starts from
    another run's weights waits for that run, one marked ``needs: cuda`` for a GPU, and one marked
    ``needs: maia2`` for that package."""
    config = run_config(model, name, smoke=smoke)
    init = config.get("learner", {}).get("init")
    if init and not (paths.run_files(init["model"], init["run"], smoke=smoke) / "model.pt").exists():
        return f"starts from {init['model']}/{init['run']}, which has not been trained on this machine"
    if config.get("needs") == "maia2":
        from importlib.util import find_spec

        return None if find_spec("maia2") else "needs the maia2 package, which is not installed here"
    if config.get("needs") != "cuda":
        return None
    import torch

    return None if torch.cuda.is_available() else "needs a GPU"


def planned(model: str, asked: str | None) -> list[str]:
    """The runs ``lab all`` trains: the leaderboard's own, or the ones asked for by name, where
    ``study:<name>`` stands for every run of that study."""
    if not asked:
        return run_names(model)
    names: list[str] = []
    for token in asked.split(","):
        if not token.startswith("study:"):
            names.append(token)
            continue
        found = run_names(model, study=token.removeprefix("study:"))
        if not found:
            raise SystemExit(f"{model} has no study named {token.removeprefix('study:')!r}: it has {', '.join(studies(model)) or 'none'}")
        names += found
    return list(dict.fromkeys(names))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="lab", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    models = tasks.names()

    build = commands.add_parser("data", help="build a dataset from its recipe in datasets/")
    build.add_argument("dataset")
    build.add_argument("--source", help="a local copy of the source file, instead of its URL")
    build.add_argument("--workers", type=int)
    build.add_argument("--rebuild", action="store_true")

    train = commands.add_parser("train", help="train and score one run")
    train.add_argument("model", choices=models)
    train.add_argument("run")
    train.add_argument("--device")

    evaluate = commands.add_parser("eval", help="write a model's leaderboard from its runs")
    evaluate.add_argument("model", choices=models)

    everything = commands.add_parser("all", help="a model's data, its runs and its leaderboard")
    everything.add_argument("model", choices=models)
    everything.add_argument(
        "--runs",
        help="comma-separated run names, with study:<name> for every run of a study; "
        "default every run of the leaderboard this machine can train",
    )
    everything.add_argument("--source")
    everything.add_argument("--workers", type=int)
    everything.add_argument("--device")

    closer = commands.add_parser(
        "analyse", help="write a model's closer look from its dataset and test predictions, where both are"
    )
    closer.add_argument("model", choices=models)

    filing = commands.add_parser(
        "file", help="file a trained run's record as its config files it now (under a study, against its base), then the leaderboard"
    )
    filing.add_argument("model", choices=models)
    filing.add_argument("runs", nargs="+", metavar="run")

    paper = commands.add_parser(
        "paper", help="write what a model's paper shows from its results, and compile it; with no model, the lab's own paper"
    )
    paper.add_argument("model", choices=models, nargs="?")
    paper.add_argument("--list", action="store_true", help="print every value and block the prose can read")
    paper.add_argument("--no-pdf", action="store_true", help="write the generated files and leave LaTeX out")

    commands.add_parser("report", help="write the README's leaderboard table")
    for command in (build, train, evaluate, everything, closer, filing, paper):
        command.add_argument("--smoke", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "data":
        build_data(args.dataset, smoke=args.smoke, source=args.source, workers=args.workers, rebuild=args.rebuild)
    elif args.command == "train":
        run(args.model, args.run, smoke=args.smoke, device=args.device, log=log)
    elif args.command == "eval":
        from .evals.leaderboard import build as leaderboard

        board = leaderboard(args.model, smoke=args.smoke)
        log(f"{args.model}: leaderboard of {len(board['runs'])} runs written")
    elif args.command == "all":
        from .evals.leaderboard import build as leaderboard

        build_data(tasks.get(args.model).dataset, smoke=args.smoke, source=args.source, workers=args.workers, rebuild=False)
        names = planned(args.model, args.runs)
        reference = tasks.get(args.model).reference
        for name in sorted(names, key=lambda name: name != reference):
            waiting = waits_for(args.model, name, smoke=args.smoke)
            if waiting is None:
                run(args.model, name, smoke=args.smoke, device=args.device, log=log)
            else:
                log(f"{args.model}/{name}: {waiting}, skipped on this machine")
        leaderboard(args.model, smoke=args.smoke)
        log(f"{args.model}: leaderboard written")
    elif args.command == "analyse":
        from .evals.analysis import analyse

        look = analyse(args.model, smoke=args.smoke)
        log(f"{args.model}: analysis of {len(look['runs'])} runs written, best {look['best']}")
        if look.get("studies"):
            log(f"{args.model}: {len(look['studies'])} study runs set against the runs they change")
        for name, reason in look["skipped"].items():
            log(f"{args.model}/{name}: left out, {reason}")
    elif args.command == "file":
        from .evals.leaderboard import build as leaderboard
        from .train.filing import file_run

        for name in args.runs:
            said = file_run(args.model, name, smoke=args.smoke)
            log(f"{args.model}/{name}: {said or 'its record is filed as its config files it already'}")
        leaderboard(args.model, smoke=args.smoke)
        log(f"{args.model}: leaderboard written. Its closer look is of the runs as they were filed before: `lab analyse {args.model}`")
    elif args.command == "paper":
        from .papers import build as papers, overview

        whose = args.model or "the lab"
        if args.list:
            print(papers.listing(args.model, smoke=args.smoke) if args.model else overview.listing(smoke=args.smoke))
            return 0
        folder = papers.write(args.model, smoke=args.smoke) if args.model else overview.write(smoke=args.smoke)
        log(f"{whose}: what its paper shows written to {folder / 'generated'}")
        if not args.no_pdf:
            pdf = papers.compile_paper(folder, log=log)
            if pdf is not None:
                log(f"{whose}: {pdf} written")
    elif args.command == "report":
        from .evals.leaderboard import write_readme

        write_readme()
        log("README.md: leaderboards written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
