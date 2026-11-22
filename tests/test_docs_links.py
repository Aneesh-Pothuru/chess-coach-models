"""Every relative link in a tracked Markdown file leads to a file that exists."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
ELSEWHERE = ("http://", "https://", "mailto:", "#")


def tracked_markdown() -> list[Path]:
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z", "*.md"], check=True, stdout=subprocess.PIPE)
    return [ROOT / name for name in out.stdout.decode().split("\0") if name]


def awaits_a_first_run(target: Path) -> bool:
    """A model's card links its leaderboard before its first full run has written one."""
    return target.parent.name == "results" and not target.parent.exists()


def broken_links(files: list[Path], root: Path = ROOT) -> list[str]:
    broken = []
    for file in files:
        for match in LINK.finditer(file.read_text(encoding="utf-8")):
            link = match.group(1)
            path = link.split("#", 1)[0]
            if link.startswith(ELSEWHERE) or not path:
                continue
            target = (file.parent / path).resolve()
            if not target.exists() and not awaits_a_first_run(target):
                broken.append(f"{file.relative_to(root)}: {link}")
    return broken


def test_relative_links_in_the_docs_resolve():
    files = tracked_markdown()
    assert files
    assert broken_links(files) == []


def test_a_missing_file_is_reported_and_a_leaderboard_not_yet_written_is_not(tmp_path):
    card = tmp_path / "models" / "new-model" / "README.md"
    card.parent.mkdir(parents=True)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "design.md").write_text("the design")
    card.write_text(
        "[the leaderboard](results/leaderboard.md), [a doc](../../docs/gone.md), "
        "[the design](../../docs/design.md#runs), [a site](https://example.org), [here](#the-rule)"
    )
    assert broken_links([card], tmp_path) == ["models/new-model/README.md: ../../docs/gone.md"]
    (card.parent / "results").mkdir()
    assert broken_links([card], tmp_path) == [
        "models/new-model/README.md: results/leaderboard.md",
        "models/new-model/README.md: ../../docs/gone.md",
    ]
