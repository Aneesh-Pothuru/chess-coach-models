"""Positions and moves as a paper prints them: a board from its FEN, moves as numbered figurines."""

from __future__ import annotations

from collections.abc import Sequence

import chess


_FIGURINE = {"K": r"\symking{}", "Q": r"\symqueen{}", "R": r"\symrook{}", "B": r"\symbishop{}", "N": r"\symknight{}"}
CONTEXT = "labGray"
SUBJECT = "labBlue"
OTHER = "labOrange"


def figurine(san: str) -> str:
    """One SAN move with its pieces as figurines."""
    text = san.replace("#", r"\#")
    if text[0] in _FIGURINE:
        text = _FIGURINE[text[0]] + text[1:]
    if "=" in text:
        head, _, tail = text.partition("=")
        text = f"{head}={_FIGURINE.get(tail[0], tail[0])}{tail[1:]}"
    return text


def sans(fen: str, ucis: Sequence[str]) -> list[str]:
    """UCI moves from a position as SAN, each checked on the board."""
    board = chess.Board(fen)
    result = []
    for uci in ucis:
        move = board.parse_uci(uci)
        result.append(board.san(move))
        board.push(move)
    return result


def moves(fen: str, ucis: Sequence[str]) -> str:
    """UCI moves from a position as numbered figurine notation: ``27\\ldots{}Nxc2 28.~Qg5#``."""
    board = chess.Board(fen)
    parts = []
    for index, san in enumerate(sans(fen, ucis)):
        if board.turn == chess.WHITE:
            parts.append(f"{board.fullmove_number}.~{figurine(san)}")
        elif index == 0:
            parts.append(f"{board.fullmove_number}\\ldots{{}}{figurine(san)}")
        else:
            parts.append(figurine(san))
        board.push(board.parse_san(san))
    return " ".join(parts)


def mover(fen: str) -> str:
    return "White" if fen.split(" ")[1] == "w" else "Black"


def mirrored(fen: str) -> str:
    """The position as the networks read it: turned and recoloured so the side to move is White, playing up the board."""
    board = chess.Board(fen)
    return fen if board.turn == chess.WHITE else board.mirror().fen()


def board(
    fen: str,
    *,
    arrows: Sequence[tuple[str, str]] = (),
    fields: Sequence[tuple[Sequence[str], str]] = (),
    size: str = "12pt",
    from_mover: bool = True,
) -> str:
    """A board for a FEN, seen from the side to move unless ``from_mover`` is off.

    ``arrows`` are ``(uci, colour)`` pairs drawn from a move's first square to its second; ``fields`` are
    ``(squares, colour)`` pairs washed over the board.
    """
    options = [f"setfen={{{fen}}}", f"boardfontsize={size}"]
    if from_mover and fen.split(" ")[1] == "b":
        options.append("inverse=true")
    for squares, colour in fields:
        if squares:
            options.append(f"pgfstyle=color, opacity=0.45, color={colour}, markfields={{{','.join(squares)}}}")
    for uci, colour in arrows:
        options.append(
            f"pgfstyle=straightmove, opacity=1, arrow=to, linewidth=0.08em, color={colour}, "
            f"markmoves={{{uci[0:2]}-{uci[2:4]}}}"
        )
    return f"\\chessboard[{', '.join(options)}]"


def beside(board_latex: str, lines: Sequence[str], *, board_width: float = 0.36) -> str:
    """A board with its text beside it, the way every example in a paper is set."""
    text = "\\par\\smallskip\n".join(lines)
    return (
        f"\\noindent\\begin{{minipage}}[t]{{{board_width}\\textwidth}}\\vspace{{0pt}}\n{board_latex}\n\\end{{minipage}}\\hfill\n"
        f"\\begin{{minipage}}[t]{{{0.97 - board_width:.2f}\\textwidth}}\\vspace{{0pt}}\\small\n{text}\n\\end{{minipage}}\\par"
    )


def fen_line(fen: str) -> str:
    """A FEN under its board. ``\\fen`` sets it as a path, so it is given as it is, not escaped."""
    return f"\\textbf{{FEN:}} \\fen{{{fen}}}"
