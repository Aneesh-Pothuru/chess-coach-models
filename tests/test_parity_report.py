"""The committed win% parity report is what its script writes from the committed numbers."""

import importlib.util
import json
from pathlib import Path


PARITY = Path(__file__).resolve().parents[1] / "bridge" / "winprob-parity"


def test_the_report_is_the_scripts_rendering_of_its_numbers():
    spec = importlib.util.spec_from_file_location("parity", PARITY / "parity.py")
    parity = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(parity)
    report = json.loads((PARITY / "results" / "parity_winprob.json").read_text(encoding="utf-8"))
    assert parity.render(report) == (PARITY / "results" / "parity_winprob.md").read_text(encoding="utf-8")
    assert report["shared_range_agrees"]


def test_the_report_was_measured_on_the_app_commit_the_bridge_pins():
    report = json.loads((PARITY / "results" / "parity_winprob.json").read_text(encoding="utf-8"))
    pinned = json.loads((PARITY.parent / "chess.json").read_text(encoding="utf-8"))["commit"]
    assert report["chess"]["measured_commit"] == pinned, "the pin moved: run `make parity` again"
