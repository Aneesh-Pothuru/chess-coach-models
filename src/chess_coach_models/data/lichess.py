"""Open Lichess data as streams: the puzzle database and a month of rated games.

Both are published at database.lichess.org under CC0. A source is a local
``.zst`` file or its URL; a URL is read through curl, so a build can stop
after the rows it needs without downloading the rest of a 30 GB month.
"""

from __future__ import annotations

import csv
import io
import subprocess
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TextIO

import zstandard


PUZZLES_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
LICENCE = "CC0 1.0, database.lichess.org"


def games_url(month: str) -> str:
    return f"https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"


@contextmanager
def open_zst(source: str | Path) -> Iterator[TextIO]:
    """A ``.zst`` file or URL as decompressed text."""
    name = str(source)
    process = None
    if name.startswith(("http://", "https://")):
        process = subprocess.Popen(
            ["curl", "-sSL", "--fail", "--retry", "3", name], stdout=subprocess.PIPE
        )
        raw = process.stdout
    else:
        raw = open(name, "rb")
    try:
        reader = zstandard.ZstdDecompressor(max_window_size=2**31).stream_reader(raw)
        yield io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
    finally:
        raw.close()
        if process is not None:
            process.terminate()
            process.wait()


def puzzle_rows(text: TextIO) -> Iterator[dict[str, str]]:
    """The puzzle database's rows, keyed by its own column names."""
    return csv.DictReader(text)


def game_blocks(text: TextIO) -> Iterator[tuple[dict[str, str], str]]:
    """Each game of a PGN stream as its headers and its movetext.

    Nothing is parsed beyond the header pairs, so a build can turn most games
    away on their headers without ever replaying a move.
    """
    headers: dict[str, str] = {}
    moves: list[str] = []
    for line in text:
        if line.startswith("[") and not moves:
            key, _, rest = line[1:].partition(" ")
            headers[key] = rest.strip()[1:-2]
        elif line.strip():
            moves.append(line.strip())
        elif moves:
            yield headers, " ".join(moves)
            headers, moves = {}, []
    if moves:
        yield headers, " ".join(moves)
