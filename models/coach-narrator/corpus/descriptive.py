"""English descriptive notation (``P - K 4``, ``Kt × B ch``, ``Q R - Q 1``) read against a board.

Old books name a square by its file's piece and the rank counted from the mover's side, and a capture by
what is taken. A move is read by keeping, of the position's legal moves, those that fit everything the
text says: the piece, the square or the piece taken, the qualifier (the king's or the queen's piece, the
file a pawn stands on) and the promotion. Exactly one must be left; otherwise the text is not read.
"""

from __future__ import annotations

import re

import chess

PIECES = {"K": chess.KING, "Q": chess.QUEEN, "R": chess.ROOK, "B": chess.BISHOP, "KT": chess.KNIGHT, "N": chess.KNIGHT, "P": chess.PAWN}
# The files a file's name may mean: "B" alone is either bishop's file, "KB" only the king's.
FILES = {
    "QR": {0}, "QKT": {1}, "QN": {1}, "QB": {2}, "Q": {3}, "K": {4}, "KB": {5}, "KKT": {6}, "KN": {6}, "KR": {7},
    "R": {0, 7}, "KT": {1, 6}, "N": {1, 6}, "B": {2, 5},
}
ORIGINS = {
    chess.A1: "QR", chess.B1: "QKT", chess.C1: "QB", chess.D1: "Q", chess.E1: "K", chess.F1: "KB", chess.G1: "KKT", chess.H1: "KR",
    chess.A8: "QR", chess.B8: "QKT", chess.C8: "QB", chess.D8: "Q", chess.E8: "K", chess.F8: "KB", chess.G8: "KKT", chess.H8: "KR",
}
NOISE = re.compile(
    r"(?<![A-Za-z])(?:dis\.?\s*ch|dbl\.?\s*ch|ch|mate|e\.\s*p\.?|en passant)(?![A-Za-z])|[!?†‡+#,;:]|\(\s*\)|\.\s*$",
    re.I,
)


class Reader:
    """A game read move by move from the start, which knows which rook, knight or bishop is the king's."""

    def __init__(self) -> None:
        self.board = chess.Board()
        self.origin = dict(ORIGINS)

    def push(self, move: chess.Move) -> None:
        name = self.origin.pop(move.from_square, None)
        self.origin.pop(move.to_square, None)
        if name:
            self.origin[move.to_square] = name
        if self.board.is_castling(move):
            rook_from, rook_to = _castling_rook(self.board, move)
            rook = self.origin.pop(rook_from, None)
            if rook:
                self.origin[rook_to] = rook
        self.board.push(move)

    def read(self, text: str) -> chess.Move | None:
        """The legal move a piece of descriptive notation names, or ``None`` when it names none or several."""
        found = matches(self.board, self.origin, text)
        return found[0] if len(found) == 1 else None


def _castling_rook(board: chess.Board, move: chess.Move) -> tuple[int, int]:
    rank = chess.square_rank(move.from_square)
    if chess.square_file(move.to_square) > chess.square_file(move.from_square):
        return chess.square(7, rank), chess.square(5, rank)
    return chess.square(0, rank), chess.square(3, rank)


COMPOUND = re.compile(r"^(?:KT|[KQRBNP])+$")


def _words(text: str) -> list[str]:
    """The notation as words: "P×QP" and "P x Q P" alike become ``P X Q P``, "B--KKt5" ``B - K KT 5``."""
    cleaned = NOISE.sub(" ", text.replace("×", " x ").replace("—", "-").replace("–", "-"))
    # A lower-case x between two pieces is a capture too ("PxQP", "KtxB").
    cleaned = re.sub(r"(?<=[KQRBNPt)\d])x(?=[KQRBNP(])", " x ", cleaned)
    cleaned = re.sub(r"-+", "-", cleaned)
    cleaned = re.sub(r"(?<=\D)(?=\d)", " ", cleaned)
    words = []
    for word in cleaned.upper().replace("-", " - ").replace("(", " ( ").replace(")", " ) ").split():
        # Books that print without spaces join a qualifier to its piece ("QP", "KKt", "QBP").
        words.extend(re.findall(r"KT|[KQRBNP]", word) if COMPOUND.match(word) and len(word) > 1 and word != "KT" else [word])
    return words


def _square_in_brackets(words: list[str]) -> tuple[list[str], list[str] | None]:
    """A piece's words without the square written in brackets after it ("R (Q 2)", "P (Kt 6)"), and that square."""
    if "(" in words and ")" in words and words.index("(") < words.index(")"):
        start, end = words.index("("), words.index(")")
        return words[:start] + words[end + 1:], words[start + 1:end]
    return words, None


def _rank(square: int, colour: bool) -> int:
    rank = chess.square_rank(square) + 1
    return rank if colour == chess.WHITE else 9 - rank


def _file_name(words: list[str]) -> str:
    return "".join(words)


def _piece_fits(board: chess.Board, origin: dict, square: int, words: list[str]) -> bool:
    """Whether the piece on a square is the one ``words`` name: its kind last, a qualifier before it."""
    piece = board.piece_at(square)
    if piece is None or not words:
        return False
    *qualifier, kind = words
    if PIECES.get(kind) != piece.piece_type:
        return False
    if not qualifier:
        return True
    name = _file_name(qualifier)
    if piece.piece_type == chess.PAWN:
        return chess.square_file(square) in FILES.get(name, set())
    own = origin.get(square)
    if own is not None and name in ("K", "Q"):
        return own.startswith(name)
    files = FILES.get(name, set())
    return chess.square_file(square) in files if files else False


ALGEBRAIC = re.compile(r"^(?:Kt|[KQRBN])?([a-h][1-8])\s*[-:×x]\s*([a-h][1-8])(?:=?([QRBN]))?$")


def algebraic(board: chess.Board, text: str) -> list[chess.Move]:
    """A move some of these books print in algebraic notation: "Ktb1-c3", "d2-d4", "Ktc3", "e6×d5"."""
    plain = NOISE.sub("", text).strip()
    both = ALGEBRAIC.match(plain)
    if both:
        try:
            move = chess.Move.from_uci(both.group(1) + both.group(2) + (both.group(3) or "").lower())
        except ValueError:
            return []
        if move not in board.legal_moves and move.promotion is None:
            move = chess.Move(move.from_square, move.to_square, chess.QUEEN)
        return [move] if move in board.legal_moves else []
    try:
        return [board.parse_san(plain.replace("Kt", "N"))]
    except ValueError:
        return []


def matches(board: chess.Board, origin: dict, text: str) -> list[chess.Move]:
    found = _descriptive(board, origin, text)
    return found if found else algebraic(board, text)


def _descriptive(board: chess.Board, origin: dict, text: str) -> list[chess.Move]:
    words = _words(text)
    if not words:
        return []
    joined = " ".join(words)
    if joined in ("O - O", "O O", "CASTLES", "CASTLES K", "CASTLES KR", "CASTLES K R", "CASTLES KING SIDE", "0 - 0"):
        return [move for move in board.legal_moves if board.is_kingside_castling(move)]
    if joined in ("O - O - O", "O O O", "CASTLES Q", "CASTLES QR", "CASTLES Q R", "CASTLES QUEEN SIDE", "0 - 0 - 0"):
        return [move for move in board.legal_moves if board.is_queenside_castling(move)]
    promotion = None
    tail = re.search(r"(?:=\s*|\(\s*)(Q|R|B|KT|N)\s*\)?$", joined)
    if tail:
        promotion = PIECES[tail.group(1)]
        joined = joined[: tail.start()].strip()
        words = joined.split()
    elif joined.endswith("QUEENS"):
        promotion = chess.QUEEN
        words = joined.removesuffix("QUEENS").split()
    if "X" in words:
        at = words.index("X")
        mover, target, capture = words[:at], words[at + 1:], True
    elif "-" in words:
        at = words.index("-")
        mover, target, capture = words[:at], words[at + 1:], False
    elif len(words) >= 3 and words[0] in PIECES and words[-1].isdigit():
        # A printer's dropped dash: "P K 4".
        mover, target, capture = words[:1], words[1:], False
    else:
        return []
    mover, from_square = _square_in_brackets(mover)
    target, at_square = _square_in_brackets(target)
    if not mover or not target:
        return []
    found = []
    for move in board.legal_moves:
        if board.is_castling(move):
            continue
        if not _piece_fits(board, origin, move.from_square, mover):
            continue
        if from_square and not _square_fits(move.from_square, board.turn, from_square):
            continue
        if at_square and not _square_fits(move.to_square, board.turn, at_square):
            continue
        if promotion is not None and move.promotion != promotion:
            continue
        if promotion is None and move.promotion not in (None, chess.QUEEN):
            continue
        if capture:
            if not board.is_capture(move):
                continue
            if target[-1].isdigit():
                if not _square_fits(move.to_square, board.turn, target):
                    continue
            else:
                victim_square = move.to_square
                if board.is_en_passant(move):
                    victim_square = chess.square(chess.square_file(move.to_square), chess.square_rank(move.from_square))
                if not _piece_fits(board, origin, victim_square, target):
                    continue
        else:
            if board.is_capture(move) or not _square_fits(move.to_square, board.turn, target):
                continue
        found.append(move)
    return found


def _square_fits(square: int, colour: bool, words: list[str]) -> bool:
    if not words or not words[-1].isdigit():
        return False
    rank = int(words[-1])
    name = _file_name(words[:-1])
    files = FILES.get(name)
    return files is not None and chess.square_file(square) in files and _rank(square, colour) == rank
