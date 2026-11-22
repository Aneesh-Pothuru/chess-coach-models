"""What the Colab notebook does that is worth a test: reading a plan, packing what a pass made, and handing
the GPU back.

A notebook's runtime costs the same idle as training, and its disk goes with it. So a pass ends by itself,
whether or not anyone is watching: it packs what the runs made, asks the browser that opened the notebook to
save the small file a report is written from, and releases the runtime a while later.
"""

from __future__ import annotations

import hashlib
import os
import re
import shlex
import signal
import subprocess
import sys
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml

# A run's test predictions are a few megabytes where a row has one number. Where a row has a chance for
# each square, tag or move they are a hundred times that, and nothing reads them yet but the run itself.
SMALL = 8 * 1024 * 1024
CONTENT = Path("/content")
TIMER = CONTENT / "lab-release.pid"

# How a runtime is handed back: Colab's own call, and what that call does where it cannot finish outside a
# notebook's kernel (https://github.com/googlecolab/colabtools, google/colab/runtime.py).
RELEASE = """
import http.client, os
try:
    from google.colab import runtime
    runtime.unassign()
except Exception:
    address = os.environ.get("TBE_RUNTIME_ADDR")
    if address:
        connection = http.client.HTTPConnection(address, timeout=30)
        connection.request("POST", "/unassign")
        connection.getresponse()
"""


def read_plan(plan: str | dict[str, str], root: Path = Path(".")) -> dict[str, str]:
    """A plan as the notebook's cells read it: each model and its runs, where no runs stands for every run
    of the model's leaderboard. A dict is a plan already. A name reads ``colab/plans/<name>.yaml``, and
    names joined with ``+`` are read one after another into one pass: a model that two of them name is
    given the runs of both, each once, in the order they come."""
    if isinstance(plan, dict):
        return dict(plan)
    merged: dict[str, list[str]] = {}
    for name in (part.strip() for part in plan.split("+")):
        path = root / "colab" / "plans" / f"{name}.yaml"
        if not path.exists():
            known = ", ".join(sorted(one.stem for one in path.parent.glob("*.yaml")))
            raise SystemExit(f"there is no plan named {name!r} in colab/plans/: it holds {known}")
        for model, runs in yaml.safe_load(path.read_text()).items():
            asked = [run for run in (runs or "").split(",") if run]
            if model not in merged:
                merged[model] = asked
            elif bool(asked) != bool(merged[model]):
                raise SystemExit(
                    f"{model} is given every run of its leaderboard by one plan and named runs by another: "
                    f"name its runs in both, or run the two plans apart"
                )
            else:
                merged[model] += [run for run in asked if run not in merged[model]]
    return {model: ",".join(runs) for model, runs in merged.items()}


def plan_name(plan: str | dict[str, str]) -> str:
    """A plan's name as a file can carry it."""
    return re.sub(r"[^a-z0-9]+", "-", plan.lower()).strip("-") if isinstance(plan, str) else "custom"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def pack(name: str, root: Path = Path("."), out: Path = CONTENT) -> dict[str, Path]:
    """Packs what a pass made into two files, to be unzipped at the root of a clone.

    ``lab-results-<name>.zip`` holds what a report is written from: the run records and leaderboards, the
    logs, and each run's test predictions where they are small. ``lab-runs-<name>.zip`` holds every run's
    files, its weights among them."""
    results = [path for path in sorted(root.glob("models/*/results/**/*")) if path.is_file()]
    logs = [path for path in sorted(root.glob("artifacts/logs/**/*")) if path.is_file()]
    runs = [path for path in sorted(root.glob("artifacts/runs/**/*")) if path.is_file()]
    small = [path for path in runs if path.name == "predictions.parquet" and path.stat().st_size <= SMALL]
    files = {"results": out / f"lab-results-{name}.zip", "runs": out / f"lab-runs-{name}.zip"}
    for key, members in (("results", [*results, *logs, *small]), ("runs", runs)):
        files[key].unlink(missing_ok=True)
        with zipfile.ZipFile(files[key], "w") as archive:
            for path in members:
                # Weights and Parquet files do not shrink, and deflating a few hundred megabytes of them
                # only keeps a paid GPU waiting.
                stored = path.suffix in (".pt", ".parquet")
                archive.write(path, path.relative_to(root).as_posix(), zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
    return files


def send_to_browser(path: Path) -> bool:
    """Asks the browser that opened the notebook to save a file, as its Files panel would, so that the file
    is on that computer even when nobody is at the notebook as a pass ends. The browser fetches it once the
    cell that asked has finished. Outside Colab this does nothing."""
    try:
        from google.colab import files
    except ImportError:
        return False
    try:
        files.download(str(path))
    except Exception as error:  # noqa: BLE001: what the pass made matters more than this way of saving it
        print(f"the browser could not be asked to save {path.name}: {error}")
        return False
    return True


def cancel_release(timer: Path = TIMER) -> bool:
    """Stops a release that ``release_after`` set, as a new plan on the same runtime must."""
    if not timer.exists():
        return False
    try:
        os.killpg(int(timer.read_text()), signal.SIGTERM)
    except (ValueError, ProcessLookupError, PermissionError):
        pass
    timer.unlink()
    return True


def release_after(minutes: float, timer: Path = TIMER) -> datetime | None:
    """Hands the runtime back to Colab after ``minutes``, from a process of its own, so that it happens
    whether or not a cell is running or anyone is watching. Says when, or nothing where no release is set:
    ``minutes`` is 0, or this is no Colab runtime."""
    cancel_release(timer)
    if not minutes or not os.environ.get("TBE_RUNTIME_ADDR"):
        return None
    seconds = int(minutes * 60)
    waiting = subprocess.Popen(
        ["bash", "-c", f"sleep {seconds} && exec {shlex.quote(sys.executable)} -c {shlex.quote(RELEASE)}"],
        start_new_session=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    timer.write_text(str(waiting.pid))
    return datetime.now(UTC) + timedelta(seconds=seconds)


def said(when: datetime | None, minutes: float) -> str:
    if when is None:
        return "This runtime does not release itself: delete it once the files are saved (Runtime, Disconnect and delete runtime)."
    return (
        f"This runtime hands itself back to Colab at {when:%H:%M} UTC, {minutes:g} minutes from now, with everything on "
        f"its disk. Running the data cell for another plan cancels that."
    )


def stop(message: str, minutes: float) -> SystemExit:
    """What a cell raises when it cannot go on before any full run has started: nothing is there to pack,
    and the runtime is not left running for nobody."""
    print(said(release_after(minutes), minutes))
    return SystemExit(message)


def wrap_up(name: str, minutes: float, root: Path = Path("."), out: Path = CONTENT) -> dict[str, Path]:
    """The end of a pass, finished or stopped by a failure: what the runs made is packed, the small file is
    sent to the browser, and the runtime is set to hand itself back."""
    files = pack(name, root, out)
    for path in files.values():
        print(f"{sha256(path)}  {path}  {path.stat().st_size:,} bytes")
    sent = send_to_browser(files["results"])
    print(f"LAB RUNS DONE: save {files['runs']} from the Files panel now: it holds the weights.")
    if sent:
        print(f"{files['results'].name} is on its way to the browser's downloads. If it does not arrive, save it from the Files panel too.")
    else:
        print(f"Save {files['results']} from the Files panel too.")
    print(said(release_after(minutes), minutes))
    return files
