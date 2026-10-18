#!/usr/bin/env python3
"""Count-only pipeline checks; no network, real names, games or effect estimates.

Run with .venv/bin/python projects/think-time-budget/test_pipeline.py.
Fixtures are generated in a temporary directory and removed afterwards. The
movetext tests exercise tag syntax only; they do not assert chess legality.
Real chess-reader and Black-build parity checks live in facts.mjs --check.
"""
from __future__ import annotations

import contextlib
import gzip
import io
import json
import os
import signal
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import zstandard

for thread_variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ[thread_variable] = "1"
import numpy as np
import pandas as pd

import cohort
import stream
import study

MONTHS = ("2026-08", "2026-09")


def identity():
    return uuid.uuid4().hex


def movetext(plies=20, missing_eval=None, missing_clock=None, eval_text="0.0", mate=False):
    moves = []
    for i in range(plies):
        number = f"{i // 2 + 1}." if i % 2 == 0 else f"{i // 2 + 1}..."
        san = "e4#" if mate and i == plies - 1 else "e4"
        tags = []
        if i != missing_eval:
            tags.append(f"[%eval {eval_text}]")
        if i != missing_clock:
            tags.append("[%clk 0:09:50.5]")
        moves.append(f"{number} {san} {{ {' '.join(tags)} }}")
    return " ".join(moves) + " 1-0"


def pgn(*, tc="600+0", event="Rated Rapid game", text=None, white=None, black=None,
        white_elo=1400, black_elo=1500, game_id=None, termination="Normal"):
    headers = {
        "Event": event, "Site": game_id or identity(), "White": white or identity(),
        "Black": black or identity(), "WhiteElo": white_elo, "BlackElo": black_elo,
        "TimeControl": tc, "Result": "1-0", "Termination": termination,
    }
    return ("\n".join(f'[{key} "{value}"]' for key, value in headers.items())
            + "\n\n" + (text or movetext()) + "\n\n")


def parsed(source: str, month=MONTHS[0]):
    state = stream.initial_state(month)
    parser = stream.Parser(state)
    parser.consume(source.encode(), final=True)
    return parser.rows, stream.aggregate_state(state)


class Response(io.BytesIO):
    def __init__(self, payload: bytes, offset: int, total: int, etag="synthetic-archive"):
        super().__init__(payload)
        self.status = 206
        self.headers = {"ETag": etag, "Content-Range": f"bytes {offset}-{total - 1}/{total}"}

    def read(self, size=-1):
        # Exercise decoder input boundaries separately from zstd frames.
        return super().read(min(size, 137) if size >= 0 else 137)


class Source:
    def __init__(self, archive: bytes, truncate_first=None):
        self.archive = archive
        self.truncate_first = truncate_first
        self.requests = []
        self.etag = "synthetic-archive"

    def __call__(self, request, timeout):
        offset = int(request.get_header("Range").removeprefix("bytes=").removesuffix("-"))
        self.requests.append((offset, request.get_header("If-range")))
        end = self.truncate_first if len(self.requests) == 1 and self.truncate_first else None
        return Response(self.archive[offset:end], offset, len(self.archive), self.etag)


@contextlib.contextmanager
def source_context(directory: Path, source: Source):
    # stream() installs graceful-stop handlers, which must not leak into the
    # test runner or a later test. No signals or background processes run.
    handlers = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        with patch.object(stream, "PRIVATE", directory), \
                patch.object(stream.urllib.request, "urlopen", source), \
                patch.object(stream.time, "sleep", lambda _: None), \
                contextlib.redirect_stderr(io.StringIO()):
            yield
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)


class StreamTests(unittest.TestCase):
    def test_budget_threshold_and_event_category(self):
        self.assertEqual(stream.budget_of("600+0"), ("fast", 600, 0))
        self.assertEqual(stream.budget_of("600+8"), ("slow", 600, 8))
        self.assertEqual(stream.budget_of("900+0"), ("slow", 900, 0))
        for tc in ("600+7", "599+100", "600", "-", "1/86400", "600+nan"):
            self.assertIsNone(stream.budget_of(tc))
        source = "".join(pgn(tc=tc, event=event) for tc, event in (
            ("600+0", "Rated Rapid game"), ("900+10", "Rated Rapid game"),
            ("900+10", "Rated Blitz game"), ("600+0", "Casual Rapid game"),
            ("600+7", "Rated Rapid game")))
        rows, state = parsed(source)
        self.assertEqual([r["budget"] for r in rows], ["fast", "slow"])
        self.assertEqual(state["counts"]["gamesRead"], 5)
        self.assertEqual(state["counts"]["rapidGames"], 3)

    def test_every_move_requires_parseable_eval_and_clock(self):
        self.assertEqual(stream.annotation_count(movetext()), (20, True))
        self.assertEqual(stream.annotation_count(movetext(eval_text="#-3")), (20, True))
        for text in (movetext(missing_eval=19, mate=True), movetext(missing_clock=7),
                     movetext(eval_text="#0"), movetext(eval_text="NaN"),
                     movetext(eval_text="Infinity"), movetext(eval_text="#1.5")):
            self.assertEqual(stream.annotation_count(text), (20, False))
        rows, _ = parsed(pgn(text=movetext(plies=19)) + pgn(text=movetext(missing_eval=19, mate=True)))
        self.assertEqual(rows, [])
        rows, _ = parsed(pgn(white_elo=1400, black_elo=1700) + pgn(white_elo=1400, black_elo=1701)
                         + pgn(termination="Abandoned") + pgn(white="?"))
        self.assertEqual(len(rows), 1)

    def test_frame_restart_and_truncated_connection_are_byte_identical(self):
        text = "".join([
            pgn(), pgn(tc="900+10"), pgn(text=movetext(eval_text="#0")),
            pgn(event="Rated Blitz game"), pgn(tc="900+0"),
        ]).encode()
        frames = [zstandard.ZstdCompressor().compress(text[i:i + 317])
                  for i in range(0, len(text), 317)]
        archive = b"".join(frames)
        with tempfile.TemporaryDirectory(prefix="think-budget-tests-", dir="/tmp") as scratch:
            root = Path(scratch)
            full, resumed, interrupted = (root / name for name in ("full", "resume", "interrupted"))
            with source_context(full, Source(archive)):
                stream.stream(MONTHS[0])
            expected = (full / f"games-{MONTHS[0]}.jsonl.gz").read_bytes()
            expected_state = json.loads((full / f"games-{MONTHS[0]}.json").read_text())
            self.assertEqual(len(gzip.decompress(expected).splitlines()), 3)

            source = Source(archive)
            with source_context(resumed, source):
                stream.stream(MONTHS[0], max_frames=4)
                checkpoint = json.loads((resumed / f"stream-{MONTHS[0]}.checkpoint.json").read_text())
                self.assertFalse(checkpoint["complete"])
                path = resumed / f"games-{MONTHS[0]}.jsonl.gz"
                with path.open("ab") as out:
                    out.write(b"uncommitted interrupted gzip member")
                stream.stream(MONTHS[0])
            self.assertEqual(path.read_bytes(), expected)
            self.assertEqual(source.requests[1][0], checkpoint["compressedOffset"])
            self.assertEqual(source.requests[1][1], source.etag)
            resumed_state = json.loads((resumed / f"games-{MONTHS[0]}.json").read_text())
            for key in ("counts", "complete", "outputBytes", "compressedOffset", "frames"):
                self.assertEqual(resumed_state[key], expected_state[key])

            # A dropped connection exactly at a frame boundary must retry,
            # not mark that prefix as the complete monthly archive.
            source = Source(archive, truncate_first=len(frames[0]))
            with source_context(interrupted, source):
                stream.stream(MONTHS[0])
            self.assertGreaterEqual(len(source.requests), 2)
            self.assertEqual(source.requests[1][0], len(frames[0]))
            self.assertEqual((interrupted / f"games-{MONTHS[0]}.jsonl.gz").read_bytes(), expected)

    def test_changed_archive_is_rejected_on_resume(self):
        payload = pgn().encode()
        frames = [zstandard.ZstdCompressor().compress(payload[:100]),
                  zstandard.ZstdCompressor().compress(payload[100:])]
        with tempfile.TemporaryDirectory(prefix="think-budget-tests-", dir="/tmp") as scratch:
            directory = Path(scratch)
            source = Source(b"".join(frames))
            with source_context(directory, source):
                stream.stream(MONTHS[0], max_frames=1)
                source.etag = "changed-synthetic-archive"
                with self.assertRaisesRegex(RuntimeError, "archive changed"):
                    stream.stream(MONTHS[0])


class CohortTests(unittest.TestCase):
    def test_player_counts_pool_months_and_deduplicate_games(self):
        a, b, c = (identity() for _ in range(3))
        august = [pgn(white=a, black=b) for _ in range(2)]
        august += [pgn(white=a, black=b, tc="900+10")]
        august += [pgn(white=c, white_elo=1700, black_elo=1700) for _ in range(3)]
        august += [pgn(white=a)]
        september = [pgn(white=a, black=b, tc="900+10")]
        september += [pgn(white=c, white_elo=1700, black_elo=1700, tc="900+0") for _ in range(3)]
        september += [pgn(white=a, tc="900+10"), august[0]]
        with tempfile.TemporaryDirectory(prefix="think-budget-tests-", dir="/tmp") as scratch:
            private, project = Path(scratch) / "private", Path(scratch) / "project"
            private.mkdir()
            for month, source in zip(MONTHS, (august, september), strict=True):
                rows, state = parsed("".join(source), month)
                raw = "".join(json.dumps(row) + "\n" for row in rows).encode()
                payload = gzip.compress(raw, mtime=0)
                path = private / f"games-{month}.jsonl.gz"
                # A valid appended gzip member beyond the checkpoint must
                # not change either the cohort or its source fingerprint.
                path.write_bytes(payload + gzip.compress(raw, mtime=0))
                state["outputBytes"] = len(payload)
                (private / f"games-{month}.json").write_text(json.dumps(state))
            with patch.object(cohort, "PRIVATE", private), patch.object(cohort, "PROJECT", project), \
                    contextlib.redirect_stderr(io.StringIO()):
                result = cohort.run(list(MONTHS), "auto", True)
                export_before = {m: (private / f"eligible-{m}.jsonl.gz").read_bytes() for m in MONTHS}
                repeated = cohort.run(list(MONTHS), "auto", True)
                self.assertEqual(result["fingerprint"], repeated["fingerprint"])
                self.assertEqual(export_before, {m: (private / f"eligible-{m}.jsonl.gz").read_bytes() for m in MONTHS})
            self.assertEqual(result["uniqueGames"], 12)
            self.assertEqual(result["duplicateGames"], 1)
            self.assertEqual(result["uniquePlayers"], 11)
            self.assertEqual(result["byK"]["2"]["players"], 3)
            self.assertEqual(result["byK"]["2"]["primaryPlayers"], 2)
            self.assertEqual(result["byK"]["2"]["primaryPlayerGames"], {"fast": 5, "slow": 5})
            self.assertEqual(result["byK"]["3"]["players"], 2)
            self.assertEqual(result["byK"]["3"]["primaryPlayers"], 1)
            self.assertEqual(result["byK"]["5"]["players"], 0)
            self.assertEqual(result["selectedK"], 2)
            for month in MONTHS:
                self.assertEqual(result["byMonthK"][month]["2"]["players"], 0)
            saved = json.loads((private / "cohort.json").read_text())
            self.assertTrue(saved["players"][cohort.player_id(a)]["eligible"])
            self.assertFalse(saved["players"][cohort.player_id(c)]["primary"])
            self.assertEqual(sum(sum(e["games"].values()) for e in saved["exports"].values()), 12)

    def test_player_identity_and_fractional_mean_boundaries(self):
        name = identity()
        self.assertEqual(cohort.player_id(name), cohort.player_id(name.upper()))
        self.assertFalse(cohort.primary({"meanRating": 1099.9}))
        self.assertTrue(cohort.primary({"meanRating": 1100.0}))
        self.assertTrue(cohort.primary({"meanRating": 1599.75}))
        self.assertFalse(cohort.primary({"meanRating": 1600.0}))
        self.assertTrue(cohort.qualifies({"games": {"fast": 2, "slow": 2}}, 2))
        self.assertFalse(cohort.qualifies({"games": {"fast": 20, "slow": 1}}, 2))


class MoveCountTests(unittest.TestCase):
    def test_early_window_keeps_filtered_book_end_and_move_eligibility(self):
        game, other_game, player = identity(), identity(), identity()
        def row(ply, **extra):
            return {"game": game, "player": player, "color": "w", "ply": ply,
                    "bookExitPly": 4, "trigger": None, "phase": "opening",
                    "think": 4, "graded": 1, "nonTrivial": 1, "clockBefore": 60,
                    "meanRating": 1400, "danger": .1, "inCheck": 0,
                    "prevCapture": 0, "hangingOwn": 0, "hangingOpp": 0,
                    "afterOppError": 0, "evalBefore": 0, **extra}
        raw = pd.DataFrame([
            row(4, trigger="book-end", nonTrivial=0),
            row(6, hangingOwn=1), row(12, afterOppError=1), row(14, evalBefore=-300),
            row(16, clockBefore=59.9), row(18, think=None), row(20, graded=0),
            row(22, nonTrivial=0), row(7, color="b", trigger="book-end", graded=0),
            row(9, color="b"), row(6, game=other_game, meanRating=1600),
        ])
        # There is deliberately no serious-error column, and no classifier
        # runs. These are synthetic metadata flags for counting only.
        d = study.prepare(raw)
        self.assertEqual(d.ply.tolist(), [6, 12, 14, 9, 6])
        self.assertEqual(d.endPly.iloc[:4].tolist(), [4, 4, 4, 7])
        self.assertTrue(pd.isna(d.endPly.iloc[-1]))
        primary, masks, _ = study.masks(d, rushed=10)
        self.assertEqual(primary.tolist(), [True, True, True, True, False])
        self.assertEqual(masks["early"].tolist(), [True, True, False, True, False])
        self.assertEqual(masks["own-hanging"].tolist(), [True, False, False, False, False])
        self.assertEqual(masks["after-opp-error"].tolist(), [False, True, False, False, False])
        self.assertEqual(masks["defending"].tolist(), [False, False, True, False, False])
        self.assertTrue(masks["high-danger"].all())  # tied quantile retains ties

    def test_cells_use_common_strata_and_count_lost_players_in_coverage(self):
        a, b, c, d = (identity() for _ in range(4))
        rows = [(a, "fast", 0), (a, "fast", 0), (a, "fast", 1),
                (a, "slow", 0), (a, "slow", 1),
                (b, "fast", 0), (b, "slow", 1), (c, "fast", 1), (d, "slow", 0)]
        data = pd.DataFrame(rows, columns=["player", "budget", "danger"])
        result = study.cells(data, np.ones(len(data), bool))
        self.assertNotIn("effects", result)
        self.assertEqual(result["fast"], 5)
        self.assertEqual(result["slow"], 4)
        self.assertEqual(set(result["paired"]), {a, b})
        self.assertEqual(set(result["supported"]), {a})
        self.assertEqual(result["coverage"].to_dict(), {a: 1.0, b: 0.0})
        kept, diagnostic = study.support(result)
        self.assertEqual(set(kept), {a})
        self.assertEqual(diagnostic["coverage"], [.5])
        self.assertFalse(diagnostic["sufficient"])
        empty = study.cells(data, np.zeros(len(data), bool))
        kept, diagnostic = study.support(empty)
        self.assertEqual(len(kept), 0)
        self.assertEqual(diagnostic["coverage"], [0.0])

    def test_paired_none_coverage_counts_intersection_losses(self):
        a, b, c = (identity() for _ in range(3))
        t = pd.DataFrame([(a, "fast", 0), (a, "slow", 0),
                          (b, "fast", 0), (b, "slow", 0)],
                         columns=["player", "budget", "danger"])
        ordinary = pd.DataFrame([(a, "fast", 0), (a, "slow", 0),
                                 (b, "fast", 0), (b, "slow", 1),
                                 (c, "fast", 1), (c, "slow", 1)],
                                columns=["player", "budget", "danger"])
        tc = study.cells(t, np.ones(len(t), bool))
        nc = study.cells(ordinary, np.ones(len(ordinary), bool))
        kept, diagnostic = study.support(tc, nc)
        self.assertEqual(set(kept), {a})
        self.assertEqual(diagnostic["pairedPlayers"], 2)
        self.assertEqual(diagnostic["coverage"], [.5, .5])


if __name__ == "__main__":
    unittest.main()
