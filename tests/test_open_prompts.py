"""Only set-ups from open data are copied for a Colab run."""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "models" / "coach-narrator" / "colab" / "open_prompts.py"
spec = importlib.util.spec_from_file_location("open_prompts", SCRIPT)
open_prompts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(open_prompts)


def row(moment_id: str) -> str:
    return json.dumps({"id": moment_id, "messages": [{"role": "system", "content": "s"}]}) + "\n"


def test_a_course_set_up_is_left_out_and_lichess_ones_are_kept():
    lines = [row("lichess:00K8j:0"), row("course:tactics:12:0"), row("AiNXhpcc:3"), "\n"]
    kept, counts = open_prompts.open_rows(lines)
    assert [json.loads(line)["id"] for line in kept] == ["lichess:00K8j:0", "AiNXhpcc:3"]
    assert counts == {"Lichess puzzle": 1, "course puzzle": 1, "Lichess game": 1}


def test_an_id_of_an_unknown_shape_stops_everything():
    with pytest.raises(ValueError, match="cannot tell"):
        open_prompts.open_rows([row("lichess:00K8j:0"), row("my-game-123")])


def test_the_five_files_are_written_filtered(tmp_path, monkeypatch, capsys):
    sheets = tmp_path / "sheets"
    sheets.mkdir()
    for stem in open_prompts.FILES:
        (sheets / f"narrate-prompts-{stem}-n9.jsonl").write_text(
            row("lichess:abcde:0") + row("course:x:1"), encoding="utf-8"
        )
    monkeypatch.setattr(sys, "argv", ["open_prompts.py", "n9", "--sheets", str(sheets), "--out", str(tmp_path / "out")])
    open_prompts.main()
    report = json.loads(capsys.readouterr().out)
    assert all(entry == {"read": 2, "kept": 1, "from": {"Lichess puzzle": 1, "course puzzle": 1}} for entry in report.values())
    for stem in open_prompts.FILES:
        text = (tmp_path / "out" / f"narrate-prompts-{stem}-n9.jsonl").read_text(encoding="utf-8")
        assert "course:" not in text and text.count("\n") == 1


def test_nothing_is_written_when_one_file_has_an_unknown_id(tmp_path, monkeypatch):
    sheets = tmp_path / "sheets"
    sheets.mkdir()
    for stem in open_prompts.FILES:
        bad = stem == "puzzles-heldout"
        (sheets / f"narrate-prompts-{stem}-n9.jsonl").write_text(row("who-knows" if bad else "lichess:abcde:0"), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["open_prompts.py", "n9", "--sheets", str(sheets), "--out", str(tmp_path / "out")])
    with pytest.raises(ValueError):
        open_prompts.main()
    assert not (tmp_path / "out").exists()
