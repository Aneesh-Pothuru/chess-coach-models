"""Maia-2's published model through the lab's reading, held to the package's own reading of one position.

These need the ``maia2`` package and its rapid weights under ``artifacts/maia2/`` (``docs/compute.md``),
and are skipped where either is missing. The stand-in in ``test_lab_pipeline.py`` covers the run itself
on any machine.
"""

import pytest

pytest.importorskip("torch")
pytest.importorskip("maia2")

import chess  # noqa: E402
import numpy as np  # noqa: E402

from chess_coach_models import paths  # noqa: E402
from chess_coach_models.encode.moves import legal_pairs, pair_of  # noqa: E402
from chess_coach_models.train.learners import maia  # noqa: E402


WEIGHTS = paths.artifacts() / "maia2" / "rapid_model.pt"
pytestmark = pytest.mark.skipif(not WEIGHTS.exists(), reason="Maia-2's published weights are not on this machine")

# A position, the mover's rating and the opponent's: both sides to move, castling either way, taking in
# passing, promotions with and without a capture, a check to answer, one legal move, and ratings in the
# lowest band, the highest, and between.
POSITIONS = [
    ("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", 1500, 1500),
    ("r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8", 1900, 1850),
    ("r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 6 8", 1100, 1300),
    ("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", 1650, 1700),
    ("rnbqkbnr/pppp1ppp/8/8/3Pp3/P4N2/1PP1PPPP/RNBQKB1R b KQkq d3 0 3", 1750, 1640),
    ("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1", 2000, 2100),
    ("4k3/8/8/8/8/8/p7/1N2K3 b - - 0 1", 900, 1000),
    ("R5k1/5pp1/8/8/8/8/8/4K3 b - - 0 1", 1500, 1500),
    ("r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 2 8", 1420, 1380),
    ("8/5pk1/6p1/8/3R4/6P1/5PK1/3r4 b - - 4 40", 2250, 2190),
    ("rnbqk1nr/pppp1ppp/8/4p3/1b2P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3", 1300, 1250),
]


def printed(net, prepared, fen: str, own: int, other: int) -> dict[int, float]:
    """The package's own reading of one position, as a chance for each pair of squares on the mover's board."""
    from maia2 import inference

    board = chess.Board(fen)
    allowed = {move.uci() for move in board.legal_moves}
    theirs, _ = inference.inference_each(net, prepared, fen, own, other)
    # The package's list can also name the first move it knows, at no chance, whether or not the position
    # allows it: it reads the row numbers of its one-row mask of legal moves as moves.
    assert all(chance == 0.0 for uci, chance in theirs.items() if uci not in allowed)
    by_pair: dict[int, float] = {}
    for uci, chance in theirs.items():
        if uci in allowed:
            by_pair[pair_of(uci, board.turn)] = by_pair.get(pair_of(uci, board.turn), 0.0) + chance
    return by_pair


def test_the_lab_reads_the_published_model_as_its_own_package_does():
    from maia2 import inference

    net = maia.published("rapid", "cpu")
    prepared = inference.prepare()
    fens, own, other = (list(column) for column in zip(*POSITIONS))
    candidates = legal_pairs(fens)
    said = maia.read(net, fens, own, other, candidates)
    assert said.shape == candidates.shape
    for row, position in enumerate(POSITIONS):
        held = candidates[row] >= 0
        theirs = printed(net, prepared, *position)
        assert sorted(theirs) == candidates[row][held].tolist()
        ours, their = said[row][held], np.array([theirs[int(pair)] for pair in candidates[row][held]])
        assert np.isnan(said[row][~held]).all() and ours.sum() == pytest.approx(1.0, abs=1e-6)
        # The package prints a chance to four places, and a promotion's candidate adds four printed chances.
        assert np.abs(ours - their).max() < 2.5e-4
        assert their[np.argmax(ours)] >= their.max() - 2e-4
    # A promotion to any piece is one candidate, and a position with one legal move gives it every chance.
    assert int((candidates[5] >= 0).sum()) == 7 and int((candidates[7] >= 0).sum()) == 1
    assert said[7][0] == pytest.approx(1.0)


def test_the_published_model_reads_the_two_ratings():
    net = maia.published("rapid", "cpu")
    fens = [POSITIONS[8][0]] * 3
    candidates = legal_pairs(fens)
    said = maia.read(net, fens, [1150, 1950, 1150], [1150, 1950, 1150], candidates)
    assert np.allclose(said[0], said[2], equal_nan=True)
    assert not np.allclose(said[0], said[1], atol=1e-3, equal_nan=True)
