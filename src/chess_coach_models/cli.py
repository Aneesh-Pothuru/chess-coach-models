"""The lab's command line: build a dataset, train a run, score a model, look closer.

    lab data puzzles                         build datasets/puzzles.yaml
    lab train puzzle-difficulty gbm-hand     one run of one model
    lab eval puzzle-difficulty               the model's leaderboard
    lab all puzzle-difficulty                its data, every run this machine can train, its leaderboard
    lab analyse puzzle-difficulty            the closer look, from its dataset and test predictions
    lab report                               the README's table, from the leaderboards

``--smoke`` everywhere uses the small dataset and writes under
``artifacts/smoke/``: a check that the code runs, never a result.
"""

from __future__ import annotations

import argparse
import sys
import time

from . import data, tasks
from .data.store import dataset_dir, write_dataset
from .train.run import run, run_config, run_names


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
    rows, tokens, marks, manifest = build(plan, source=source, workers=workers, log=log)
    manifest["build_seconds"] = round(time.time() - started, 1)
    directory = write_dataset(plan["name"], rows, tokens, marks, manifest)
    log(f"{plan['name']}: {len(rows):,} rows written to {directory}")


def can_train(model: str, name: str, *, smoke: bool) -> bool:
    """Whether this machine should train a run: one marked ``needs: cuda`` waits for a GPU."""
    if run_config(model, name, smoke=smoke).get("needs") != "cuda":
        return True
    import torch

    return torch.cuda.is_available()


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
    everything.add_argument("--runs", help="comma-separated run names; default every config this machine can train")
    everything.add_argument("--source")
    everything.add_argument("--workers", type=int)
    everything.add_argument("--device")

    closer = commands.add_parser(
        "analyse", help="write a model's closer look from its dataset and test predictions, where both are"
    )
    closer.add_argument("model", choices=models)

    commands.add_parser("report", help="write the README's leaderboard table")
    for command in (build, train, evaluate, everything, closer):
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
        names = args.runs.split(",") if args.runs else run_names(args.model)
        reference = tasks.get(args.model).reference
        for name in sorted(names, key=lambda name: name != reference):
            if can_train(args.model, name, smoke=args.smoke):
                run(args.model, name, smoke=args.smoke, device=args.device, log=log)
            else:
                log(f"{args.model}/{name}: needs a GPU, skipped on this machine")
        leaderboard(args.model, smoke=args.smoke)
        log(f"{args.model}: leaderboard written")
    elif args.command == "analyse":
        from .evals.analysis import analyse

        look = analyse(args.model, smoke=args.smoke)
        log(f"{args.model}: analysis of {len(look['runs'])} runs written, best {look['best']}")
        for name, reason in look["skipped"].items():
            log(f"{args.model}/{name}: left out, {reason}")
    elif args.command == "report":
        from .evals.leaderboard import write_readme

        write_readme()
        log("README.md: leaderboards written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
