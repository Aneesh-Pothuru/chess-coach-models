import json
import os
from pathlib import Path

import pytest

from chess_coach_models.bridge import ROOT, chess_dir, load_pin, records_dir, run_eval


def test_pin_names_full_commits() -> None:
    pin = load_pin()
    assert pin["repo"].startswith("https://")
    assert len(pin["commit"]) == 40
    assert len(pin["records"]) == 40


SHA = "0" * 40


@pytest.mark.parametrize(
    "pin",
    [
        {"repo": "https://github.com/example/chess", "commit": "main", "records": SHA},
        {"repo": "https://github.com/example/chess", "commit": "d8b7712", "records": SHA},
        {"repo": "https://github.com/example/chess", "commit": SHA, "records": "main"},
        {"repo": "https://github.com/example/chess", "commit": SHA},
        {"repo": "git@github.com:example/chess.git", "commit": SHA, "records": SHA},
        {"commit": SHA, "records": SHA},
    ],
)
def test_pin_refuses_what_could_move(tmp_path: Path, pin: dict) -> None:
    path = tmp_path / "chess.json"
    path.write_text(json.dumps(pin))
    with pytest.raises(ValueError):
        load_pin(path)


def test_overrides_skip_the_checkout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CHESS_DIR", str(tmp_path / "app"))
    monkeypatch.setenv("CHESS_RECORDS_DIR", str(tmp_path / "records"))
    assert chess_dir() == tmp_path / "app"
    assert records_dir() == tmp_path / "records"


@pytest.mark.skipif(
    not os.environ.get("CHESS_DIR"),
    reason="needs a chess checkout with node_modules (set CHESS_DIR)",
)
def test_app_win_percent_through_the_bridge() -> None:
    script = ROOT / "projects" / "winprob-parity" / "app.mts"
    out = run_eval(script, {"cp": [0, 1000], "mate": [1, -1]})
    assert out["cp"][0] == pytest.approx(50.0)
    assert out["cp"][1] > 97.0
    assert out["mate"][0] > 99.9
    assert out["mate"][1] < 0.1
