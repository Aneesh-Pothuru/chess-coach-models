"""The Colab notebook's own steps: a plan read from its name, what a pass packs, and a runtime that hands
itself back. The notebook cannot run here, so what it does lives in ``chess_coach_models.colab``, and the
notebook's cells are held to calling it."""

import ast
import json
import os
import time
import zipfile
from pathlib import Path

import pytest

from chess_coach_models import colab

REPO = Path(__file__).resolve().parents[1]
NOTEBOOK = REPO / "colab" / "lab.ipynb"


def code_cells() -> list[str]:
    cells = json.loads(NOTEBOOK.read_text())["cells"]
    return ["".join(cell["source"]) for cell in cells if cell["cell_type"] == "code"]


def plans(root: Path, **files: dict[str, str]) -> Path:
    folder = root / "colab" / "plans"
    folder.mkdir(parents=True)
    for name, body in files.items():
        (folder / f"{name}.yaml").write_text("".join(f'{model}: "{runs}"\n' for model, runs in body.items()))
    return root


def test_a_plan_is_read_from_its_name_and_a_dict_is_a_plan_already(tmp_path):
    root = plans(tmp_path, sets={"where-to-look": "", "puzzle-themes": ""})
    assert colab.read_plan("sets", root) == {"where-to-look": "", "puzzle-themes": ""}
    assert colab.read_plan({"think-time": "gbm-hand"}, root) == {"think-time": "gbm-hand"}
    with pytest.raises(SystemExit, match="no plan named 'studies'.*it holds sets"):
        colab.read_plan("studies", root)


def test_plans_joined_into_one_pass_give_a_model_the_runs_of_each_once(tmp_path):
    root = plans(
        tmp_path,
        moves={"human-move": "gbm-hand,transformer-medium"},
        rest={"think-time": "gbm-hand,conv-medium-hand", "human-move": "gbm-hand,conv-medium,transformer-medium"},
        sets={"where-to-look": ""},
        again={"where-to-look": ""},
        named={"where-to-look": "gbm-hand"},
    )
    assert colab.read_plan("moves + rest", root) == {
        "human-move": "gbm-hand,transformer-medium,conv-medium",
        "think-time": "gbm-hand,conv-medium-hand",
    }
    assert colab.read_plan("sets+again", root) == {"where-to-look": ""}
    # Every run of a leaderboard and a few named ones cannot be said in one line of a plan.
    with pytest.raises(SystemExit, match="where-to-look is given every run"):
        colab.read_plan("sets+named", root)


def test_every_plan_the_lab_keeps_reads_and_the_passes_that_are_run_together_join():
    names = sorted(path.stem for path in (REPO / "colab" / "plans").glob("*.yaml"))
    for name in names:
        assert colab.read_plan(name, REPO), name
    joined = colab.read_plan("sets+games+moves+bodies-rest", REPO)
    assert joined["human-move"].split(",")[0] == "gbm-hand"
    assert len(joined["human-move"].split(",")) == len(set(joined["human-move"].split(",")))
    assert colab.plan_name("sets+games+moves") == "sets-games-moves" and colab.plan_name({"a": ""}) == "custom"


def test_a_pass_packs_what_a_report_reads_apart_from_the_weights(tmp_path, monkeypatch):
    root, out = tmp_path / "clone", tmp_path / "content"
    out.mkdir()
    made = {
        "models/think-time/results/gbm-hand.json": b"{}",
        "models/think-time/results/leaderboard.md": b"# board",
        "models/think-time/configs/gbm-hand.yaml": b"learner: {}",
        "artifacts/logs/think-time.log": b"trained",
        "artifacts/runs/think-time/gbm-hand/predictions.parquet": b"p" * 10,
        "artifacts/runs/think-time/gbm-hand/model.txt": b"tree",
        "artifacts/runs/where-to-look/conv-small/predictions.parquet": b"p" * 40,
        "artifacts/runs/where-to-look/conv-small/model.pt": b"w" * 100,
        "artifacts/smoke/runs/think-time/gbm-hand/predictions.parquet": b"never a result",
    }
    for name, body in made.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_bytes(body)
    monkeypatch.setattr(colab, "SMALL", 20)
    files = colab.pack("sets", root, out)
    assert {key: path.name for key, path in files.items()} == {"results": "lab-results-sets.zip", "runs": "lab-runs-sets.zip"}
    with zipfile.ZipFile(files["results"]) as archive:
        assert sorted(archive.namelist()) == [
            "artifacts/logs/think-time.log",
            "artifacts/runs/think-time/gbm-hand/predictions.parquet",
            "models/think-time/results/gbm-hand.json",
            "models/think-time/results/leaderboard.md",
        ]
    with zipfile.ZipFile(files["runs"]) as archive:
        assert sorted(archive.namelist()) == sorted(name for name in made if name.startswith("artifacts/runs/"))
        assert archive.read("artifacts/runs/where-to-look/conv-small/model.pt") == b"w" * 100
    # Unzipped at the root of a clone, both land where the lab reads them, and a second pack replaces the first.
    assert colab.pack("sets", root, out) == files and len(colab.sha256(files["runs"])) == 64


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # A process that has ended and was not waited for is still listed.
    return "Z" not in Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0]


def test_a_runtime_hands_itself_back_later_unless_a_new_plan_starts(tmp_path, monkeypatch):
    timer = tmp_path / "release.pid"
    monkeypatch.delenv("TBE_RUNTIME_ADDR", raising=False)
    assert colab.release_after(45, timer) is None and not timer.exists()
    assert "does not release itself" in colab.said(None, 45)
    # Port 9 answers nothing, and the release is cancelled long before it would be asked.
    monkeypatch.setenv("TBE_RUNTIME_ADDR", "127.0.0.1:9")
    assert colab.release_after(0, timer) is None and not timer.exists()
    when = colab.release_after(45, timer)
    waiting = int(timer.read_text())
    assert when is not None and alive(waiting)
    assert f"{when:%H:%M} UTC" in colab.said(when, 45) and "45 minutes" in colab.said(when, 45)
    again = colab.release_after(30, timer)
    assert again is not None and int(timer.read_text()) != waiting
    for _ in range(50):
        if not alive(waiting):
            break
        time.sleep(0.1)
    assert not alive(waiting)
    waiting = int(timer.read_text())
    assert colab.cancel_release(timer) and not timer.exists() and not colab.cancel_release(timer)
    for _ in range(50):
        if not alive(waiting):
            break
        time.sleep(0.1)
    assert not alive(waiting)


def test_the_release_asks_colab_as_its_own_call_does():
    # What the waiting process runs is Python that reads, and it falls back on the address Colab's own call posts to.
    ast.parse(colab.RELEASE)
    assert "runtime.unassign()" in colab.RELEASE and '"POST", "/unassign"' in colab.RELEASE


def test_a_cell_that_cannot_go_on_does_not_leave_the_runtime_running(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(colab, "TIMER", tmp_path / "release.pid")
    monkeypatch.setattr(colab, "release_after", lambda minutes, timer=None: None)
    error = colab.stop("the build of puzzles failed", 45)
    assert isinstance(error, SystemExit) and str(error) == "the build of puzzles failed"
    assert "does not release itself" in capsys.readouterr().out


def test_the_end_of_a_pass_packs_sends_and_sets_the_release(tmp_path, monkeypatch, capsys):
    root, out = tmp_path / "clone", tmp_path / "content"
    (root / "models/think-time/results").mkdir(parents=True)
    (root / "models/think-time/results/gbm-hand.json").write_text("{}")
    out.mkdir()
    asked = []
    monkeypatch.setattr(colab, "send_to_browser", lambda path: asked.append(path) or True)
    monkeypatch.setattr(colab, "release_after", lambda minutes, timer=None: asked.append(minutes))
    files = colab.wrap_up("more", 45, root, out)
    said = capsys.readouterr().out
    assert asked == [files["results"], 45]
    assert "LAB RUNS DONE" in said and str(files["runs"]) in said and colab.sha256(files["results"]) in said
    # Outside Colab nothing can be sent, and the cell says to save both files by hand.
    monkeypatch.undo()
    assert colab.send_to_browser(files["results"]) is False


def test_the_notebooks_cells_are_python_and_end_a_pass_through_the_lab():
    cells = code_cells()
    for cell in cells:
        # A line for the shell or for IPython is no Python: it is left out, the rest has to parse.
        ast.parse("\n".join("pass" if line.lstrip().startswith(("!", "%")) else line for line in cell.splitlines()))
    whole = "\n".join(cells)
    assert "RELEASE_AFTER_MINUTES" in cells[0] and "PLAN" in cells[0]
    assert whole.count("colab.wrap_up(NAME, RELEASE_AFTER_MINUTES)") == 2
    assert "colab.read_plan(PLAN)" in whole and "colab.cancel_release()" in whole and "colab.stop(" in whole
    # The last cell is the end of a pass, and nothing in the notebook pushes or holds a credential.
    assert "colab.wrap_up" in cells[-1]
    assert "git push" not in whole and "token" not in whole.lower()
