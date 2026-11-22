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


class Download:
    """A URL's bytes as curl sends them, to be read like a file.

    A download that fails looks, to its reader, like one that ended: the bytes stop. So the end of the
    bytes asks curl how it went, and a build stops on a failed download instead of keeping the part that
    arrived. A reader that stops first closes it, and curl is ended with it.
    """

    def __init__(self, url: str) -> None:
        self.url = url
        self.process = subprocess.Popen(["curl", "-sSL", "--fail", "--retry", "3", url], stdout=subprocess.PIPE)

    def read(self, size: int = -1) -> bytes:
        data = self.process.stdout.read(size)
        if not data and self.process.wait() != 0:
            raise OSError(f"the download of {self.url} stopped early: curl exited with {self.process.returncode}")
        return data

    def close(self) -> None:
        self.process.stdout.close()
        self.process.terminate()
        self.process.wait()


@contextmanager
def open_zst(source: str | Path) -> Iterator[TextIO]:
    """A ``.zst`` file or URL as decompressed text."""
    name = str(source)
    raw = Download(name) if name.startswith(("http://", "https://")) else open(name, "rb")
    try:
        reader = zstandard.ZstdDecompressor(max_window_size=2**31).stream_reader(raw)
        yield io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
    finally:
        raw.close()


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
