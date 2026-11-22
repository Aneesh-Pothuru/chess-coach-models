"""A build stops when its source does: a failed download and a panic among its rows are errors, never an early end or a hang."""

import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from multiprocessing import TimeoutError as PoolTimeout
from pathlib import Path

import pytest

zstandard = pytest.importorskip("zstandard")

from chess_coach_models.data import lichess, store  # noqa: E402

DATA = Path(store.__file__).parent
TEXT = "".join(f"line {number}\n" for number in range(20_000))
PACKED = zstandard.ZstdCompressor().compress(TEXT.encode())


class Panic(BaseException):
    """Stands in for the panic Polars raises from Rust, which is a BaseException too."""


def rows(stop: BaseException | None):
    yield from range(5)
    if stop is not None:
        raise stop


def test_a_panic_among_the_rows_becomes_an_error_and_an_error_stays_itself():
    assert list(store.fed(rows(None))) == [0, 1, 2, 3, 4]
    with pytest.raises(RuntimeError, match="Panic: the schema") as raised:
        list(store.fed(rows(Panic("the schema"))))
    assert isinstance(raised.value.__cause__, Panic)
    with pytest.raises(OSError, match="no network"):
        list(store.fed(rows(OSError("no network"))))
    half = store.fed(rows(Panic("never reached")))
    assert next(half) == 0
    half.close()


def test_a_pool_fed_rows_that_panic_fails_the_build_instead_of_waiting(tmp_path):
    with store.worker_pool(2) as pool:
        results = pool.imap(abs, store.fed(rows(Panic("the schema"))))
        with pytest.raises(RuntimeError, match="Panic: the schema"):
            try:
                for _ in range(6):
                    results.next(timeout=60)
            except PoolTimeout:
                pytest.fail("the pool waited for rows that were never coming")


def test_every_pool_in_a_builder_is_fed_through_the_guard():
    calls = [
        (path.name, call)
        for path in sorted(DATA.glob("*.py"))
        for call in re.findall(r"\.imap(?:_unordered)?\([^\n]*", path.read_text(encoding="utf-8"))
    ]
    assert len(calls) >= 3
    assert [call for call in calls if "fed(" not in call[1]] == []


class Source(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/missing.zst":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(PACKED)))
        self.end_headers()
        self.wfile.write(PACKED if self.path == "/whole.zst" else PACKED[: len(PACKED) // 2])

    def log_message(self, *args):
        pass


@pytest.fixture()
def served(monkeypatch):
    for name in ("NO_PROXY", "no_proxy"):
        monkeypatch.setenv(name, "127.0.0.1")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Source)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()


def test_a_whole_download_reads_to_its_end(served):
    with lichess.open_zst(f"{served}/whole.zst") as text:
        assert text.read() == TEXT


def test_a_reader_may_stop_before_the_download_does(served):
    with lichess.open_zst(f"{served}/whole.zst") as text:
        assert text.readline() == "line 0\n"


@pytest.mark.parametrize("name", ["cut.zst", "missing.zst"])
def test_a_download_that_fails_is_an_error_not_the_end_of_the_data(served, name):
    with pytest.raises(OSError, match="stopped early: curl exited with"):
        with lichess.open_zst(f"{served}/{name}") as text:
            text.read()


def test_a_local_file_reads_as_before(tmp_path):
    path = tmp_path / "local.zst"
    path.write_bytes(PACKED)
    with lichess.open_zst(path) as text:
        assert text.read() == TEXT
