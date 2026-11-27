"""Over-the-board games from the Lichess broadcast database.

Lichess relays tournaments played on real boards, from world championship
matches to local opens, and publishes every relayed game in monthly files
under CC BY-SA 4.0 (database.lichess.org, "Broadcasts"). A game carries the
players' FIDE titles, ratings and ids, and most carry each move's clock, read
from the boards' clocks, and Lichess's own engine evaluation.

This module reads one game: its headers as the players and the time control,
its movetext as the moves with their clocks, evaluations, glyphs and comments.
The time control is written many ways in these files ("90+30", "5400+30",
"40/5400+30:1800+30", "G: 3 minutes + 2 seconds per move"), so it is read from
the header when that can be read, and from the clocks of the first moves
otherwise.
"""

from __future__ import annotations

import hashlib
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import chess

from .. import paths
from ..encode.hand import position_features
from ..winprob import eval_to_cp, mover_win_percent
from .games import CLOCK_RE, EVAL_RE, _seconds


LIST_URL = "https://database.lichess.org/broadcast/list.txt"
LICENCE = "CC BY-SA 4.0, Lichess broadcast database (database.lichess.org)"
SOURCE = "lichess-broadcasts"

RESULTS = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5, "½-½": 0.5}
# FIDE's titles and the national master title Lichess shows. Arena titles (AGM, AIM, AFM, ACM) are won
# online and say little about a player's strength over the board, so they count as no title.
TITLES = ("GM", "IM", "FM", "CM", "NM", "WGM", "WIM", "WFM", "WCM")
# A mover counts as strong with one of these titles or a rating of at least STRONG_ELO: candidate
# master strength and above. The women's titles below WGM are given at lower ratings, so they count
# through the rating.
STRONG_TITLES = ("GM", "IM", "FM", "CM", "NM", "WGM")
STRONG_ELO = 2200
# The world champions of the open title, by the words of the name the relays give them: every word of
# one of a champion's spellings must be a word of the relay's name. The FIDE ids of the players matched
# are written into a corpus's manifest, so a wrong match shows there.
WORLD_CHAMPIONS = {
    "Magnus Carlsen": (("carlsen", "magnus"),),
    "Ding Liren": (("ding", "liren"),),
    "Gukesh Dommaraju": (("gukesh",),),
    "Viswanathan Anand": (("anand", "viswanathan"),),
    "Vladimir Kramnik": (("kramnik", "vladimir"),),
    "Veselin Topalov": (("topalov", "veselin"),),
    "Garry Kasparov": (("kasparov", "garry"), ("kasparov", "garri")),
    "Anatoly Karpov": (("karpov", "anatoly"),),
    "Ruslan Ponomariov": (("ponomariov", "ruslan"),),
    "Rustam Kasimdzhanov": (("kasimdzhanov", "rustam"),),
    "Alexander Khalifman": (("khalifman", "alexander"),),
}
# What makes a time control classical here: at least this many seconds on the clock at the start.
# FIDE rates a game as standard only from 60 minutes a player; a 50-minute floor keeps 60-minute
# controls whose first clock reading is a few minutes short.
CLASSICAL_SECONDS = 3000
# Words in a broadcast's name that mark a game as something other than standard chess at a slow pace.
NOT_CLASSICAL = re.compile(r"rapid|blitz|bullet|armageddon|960|freestyle|fischer random|chess ?9lx|online|simul", re.I)

TOKEN_RE = re.compile(
    r"\{([^}]*)\}"  # a comment
    r"|([()])"  # a variation opens or closes
    r"|\$(\d+)"  # a numeric glyph
    r"|(\d+\.+)"  # a move number
    r"|(1-0|0-1|1/2-1/2|½-½|\*)(?=\s|$)"  # the result
    r"|([^\s{}()$]+)"  # a move
)
COMMAND_RE = re.compile(r"\[%[^\]]*\]")
GLYPHS = {"!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6}
# Comments Lichess's own analysis writes, which say nothing a person wrote.
MACHINE_RE = re.compile(
    r"^(?:(?:Inaccuracy|Mistake|Blunder)\. .+ was best\.|Lost forced checkmate sequence\. .*|Checkmate is now unavoidable\. .*)$"
)


@dataclass
class Ply:
    san: str
    glyph: int | None = None
    clock: float | None = None
    eval_cp_white: float | None = None
    comment: str = ""


@dataclass
class Player:
    name: str
    title: str
    elo: int | None
    fide_id: str


def broadcast_url(month: str) -> str:
    return f"https://database.lichess.org/broadcast/lichess_db_broadcast_{month}.pgn.zst"


def raw_dir() -> Path:
    return paths.ROOT / "data" / "raw" / SOURCE


def month_source(month: str) -> str:
    """A month's local copy when ``desktop``'s download put one in ``data/raw``, its URL otherwise."""
    local = raw_dir() / f"lichess_db_broadcast_{month}.pgn.zst"
    return str(local) if local.exists() else broadcast_url(month)


def _month_of(name: str) -> str:
    return name.rsplit("/", 1)[-1].removeprefix("lichess_db_broadcast_").removesuffix(".pgn.zst")


def local_months() -> list[str]:
    """The months whose files are in ``data/raw``, oldest first."""
    return sorted(_month_of(path.name) for path in raw_dir().glob("lichess_db_broadcast_*.pgn.zst"))


def listed_months() -> list[str]:
    """The months the database publishes, oldest first, from its list of files."""
    with urllib.request.urlopen(LIST_URL, timeout=60) as response:
        names = response.read().decode("utf-8").split()
    return sorted(_month_of(name) for name in names if name.endswith(".pgn.zst"))


def read_movetext(movetext: str) -> list[Ply] | None:
    """The main line's moves with what was written after each: glyph, clock, evaluation, comment.

    Variations are skipped. A comment before the first move is kept by nobody. ``None`` when the
    movetext holds no move.
    """
    plies: list[Ply] = []
    depth = 0
    for match in TOKEN_RE.finditer(movetext):
        comment, bracket, nag, number, result, word = match.groups()
        if bracket:
            depth = depth + 1 if bracket == "(" else max(0, depth - 1)
            continue
        if depth:
            continue
        if comment is not None:
            if not plies:
                continue
            ply = plies[-1]
            clock = CLOCK_RE.search(comment)
            if clock:
                ply.clock = _seconds(clock)
            value = EVAL_RE.search(comment)
            if value:
                try:
                    ply.eval_cp_white = eval_to_cp(value.group(1))
                except ValueError:
                    pass
            text = " ".join(COMMAND_RE.sub(" ", comment).split())
            if text and not MACHINE_RE.match(text):
                ply.comment = f"{ply.comment} {text}".strip()
        elif nag is not None:
            if plies and plies[-1].glyph is None:
                plies[-1].glyph = int(nag)
        elif word is not None:
            san = word.rstrip("!?")
            glyph = GLYPHS.get(word[len(san):]) if len(san) < len(word) else None
            if not san:
                continue
            plies.append(Ply(san=san, glyph=glyph))
    return plies or None


_MINUTES = re.compile(r"(\d+(?:\.\d+)?)\s*(?:'|m\b|min)", re.I)
_SECONDS = re.compile(r"(\d+(?:\.\d+)?)\s*(?:''|\"|s\b|sec)", re.I)


def time_control(value: str) -> tuple[int, int] | None:
    """A time control header as starting seconds and the increment, or ``None`` when it cannot be read.

    ``90+30`` is read as minutes and seconds and ``5400+30`` as seconds, by the size of the first number;
    of a control in periods (``40/5400+30:1800+30``) the first period counts.
    """
    text = value.strip()
    if not text or text in ("-", "?"):
        return None
    first = text.split(":")[0]
    if "/" in first and re.match(r"^\d+/", first):
        first = first.split("/", 1)[1]
    simple = re.fullmatch(r"(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)", first)
    if simple is None:
        simple = re.fullmatch(r"(\d+(?:\.\d+)?)", first)
    if simple:
        base = float(simple.group(1))
        increment = float(simple.group(2)) if simple.lastindex and simple.lastindex > 1 else 0.0
        seconds = base * 60 if base <= 240 else base
        return int(round(seconds)), int(round(increment))
    words = text.replace("Game/", "G ").replace("G:", "G ")
    minutes = _MINUTES.search(words)
    if minutes is None:
        loose = re.search(r"\bG\s*(\d+)", words)
        if loose is None:
            return None
        minutes_value = float(loose.group(1))
    else:
        minutes_value = float(minutes.group(1))
    seconds = _SECONDS.search(words[minutes.end():] if minutes else words)
    return int(round(minutes_value * 60)), int(round(float(seconds.group(1)))) if seconds else 0


def clock_start(plies: list[Ply]) -> float | None:
    """The time each side had at the start, read off the clocks: the highest of each side's first three."""
    white = [ply.clock for ply in plies[0:6:2] if ply.clock is not None]
    black = [ply.clock for ply in plies[1:6:2] if ply.clock is not None]
    readings = white + black
    return max(readings) if readings else None


def speed_of(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    if seconds >= CLASSICAL_SECONDS:
        return "classical"
    if seconds >= 600:
        return "rapid"
    if seconds >= 120:
        return "blitz"
    return "bullet"


def player(headers: dict[str, str], side: str) -> Player:
    title = headers.get(f"{side}Title", "").strip().upper()
    elo = headers.get(f"{side}Elo", "").strip()
    rating = int(elo) if elo.isdigit() and 1000 <= int(elo) <= 3000 else None
    return Player(
        name=headers.get(side, "").strip(),
        title=title if title in TITLES else "",
        elo=rating,
        fide_id=headers.get(f"{side}FideId", "").strip(),
    )


def is_strong(someone: Player) -> bool:
    return someone.title in STRONG_TITLES or (someone.elo is not None and someone.elo >= STRONG_ELO)


def world_champion(someone: Player) -> str:
    """The champion's name when the relay's name for this player is one of theirs, else empty."""
    words = set(re.sub(r"[^a-z ]", " ", someone.name.lower()).split())
    for name, spellings in WORLD_CHAMPIONS.items():
        if any(words.issuperset(spelling) for spelling in spellings):
            return name
    return ""


def game_id(headers: dict[str, str]) -> str:
    url = headers.get("GameURL") or headers.get("Site", "")
    return url.rstrip("/").rsplit("/", 1)[-1]


INCREMENTS = (2, 3, 5, 10, 15, 20, 30, 60)
# A move counts as made with time to think when the mover had at least this much on the clock before it.
AMPLE_SECONDS = 600


def increment_from_clocks(plies: list[Ply]) -> int:
    """A guess at the increment when no header gives it. A side's clock can only gain between two of its
    moves by the increment less the time the move took, so the largest gain of the first 80 plies, raised
    to the nearest usual increment, is the guess; none when the clocks rose fewer than three times."""
    gains = []
    for index in range(2, min(len(plies), 80)):
        before, after = plies[index - 2].clock, plies[index].clock
        if before is not None and after is not None and 0 < after - before <= 60:
            gains.append(after - before)
    if len(gains) < 3:
        return 0
    largest = max(gains)
    return next(value for value in INCREMENTS if value >= largest - 0.5)


@dataclass
class Classical:
    """A finished standard game at a classical pace, its moves checked legal."""

    game_id: str
    copy_key: str
    headers: dict[str, str]
    plies: list[Ply]
    sans: list[str]
    ucis: list[str]
    white: Player
    black: Player
    result: str
    white_score: float
    base: int
    increment: int
    control_read_from: str
    clock_start: float | None
    final_fen: str

    @property
    def has_clocks(self) -> bool:
        return len(self.plies) > 1 and all(ply.clock is not None for ply in self.plies[:-1])


def classical_game(headers: dict[str, str], movetext: str) -> tuple[Classical | None, str]:
    """A game read when it is a finished standard game at a classical pace with legal moves, and why
    not otherwise: ``not standard``, ``unfinished``, ``no moves``, ``not classical``, ``bot`` or
    ``illegal move``.

    The pace is read from the clocks of the first moves when they are there, and must agree with the
    time control header when that can be read; a broadcast named as rapid, blitz or another game is
    never classical.
    """
    if headers.get("Variant", "Standard") not in ("Standard", "") or headers.get("SetUp") == "1" or "FEN" in headers:
        return None, "not standard"
    result = headers.get("Result", "*").strip()
    if result not in RESULTS:
        return None, "unfinished"
    plies = read_movetext(movetext)
    if not plies or len(plies) < 2:
        return None, "no moves"
    control = time_control(headers.get("TimeControl", ""))
    started = clock_start(plies)
    by_header = speed_of(control[0]) if control else None
    by_clock = speed_of(started)
    speed = by_clock if by_clock is not None else by_header
    name = headers.get("BroadcastName", "") + " " + headers.get("Event", "")
    if speed != "classical" or by_header not in (None, "classical") or NOT_CLASSICAL.search(name):
        return None, "not classical"
    if "BOT" in (headers.get("WhiteTitle", "").upper(), headers.get("BlackTitle", "").upper()):
        return None, "bot"
    if control is not None:
        base, increment = control
        read_from = "header"
    else:
        base, increment = int(started or 0), increment_from_clocks(plies)
        read_from = "clocks"
    board = chess.Board()
    sans, ucis = [], []
    try:
        for ply in plies:
            move = board.parse_san(ply.san)
            sans.append(board.san(move))
            ucis.append(move.uci())
            board.push(move)
    except ValueError:
        return None, "illegal move"
    copy_key = same_game(headers, sans)
    return (
        Classical(
            game_id=game_id(headers) or copy_key,
            copy_key=copy_key,
            headers=headers,
            plies=plies,
            sans=sans,
            ucis=ucis,
            white=player(headers, "White"),
            black=player(headers, "Black"),
            result="1/2-1/2" if result == "½-½" else result,
            white_score=RESULTS[result],
            base=base,
            increment=increment,
            control_read_from=read_from,
            clock_start=started,
            final_fen=board.fen(),
        ),
        "kept",
    )


def strong_moves(game: Classical, *, features: bool = True) -> list[dict]:
    """A row for every move a strong player made in a game: the position before it, the move, the mover
    and the opponent, both clocks before it and the seconds it took, Lichess's evaluation before and after
    it as the mover's winning chances and what it lost, the glyph and comment written after it, the game's
    result for the mover and, with ``features``, the board's hand features (``encode/hand.py``).

    The clocks of a game that has them start at the time control's base; a game without them gives no
    clock. A clock that jumps up by more than the increment had a period's time added (move 40 of a
    control in periods), and the time that move took cannot be read from it.
    """
    rows = []
    board = chess.Board()
    last = ""
    start = float(game.base) if game.base and game.has_clocks else None
    for index, ply in enumerate(game.plies):
        mover = board.turn
        me, them = (game.white, game.black) if mover == chess.WHITE else (game.black, game.white)
        move = chess.Move.from_uci(game.ucis[index])
        if is_strong(me):
            before_clock = game.plies[index - 2].clock if index >= 2 else start
            opponent_clock = game.plies[index - 1].clock if index >= 1 else start
            spent = None
            if before_clock is not None and ply.clock is not None:
                taken = before_clock - ply.clock + game.increment
                spent = max(0.0, taken) if taken >= -5 else None
            eval_before = game.plies[index - 1].eval_cp_white if index >= 1 else None
            eval_after = ply.eval_cp_white
            win_before = mover_win_percent(eval_before, mover) if eval_before is not None else None
            win_after = mover_win_percent(eval_after, mover) if eval_after is not None else None
            row = {
                "key": f"{game.game_id}:{index + 1}",
                "game_id": game.game_id,
                "ply": index + 1,
                "fen": board.fen(),
                "last_move": last,
                "move": move.uci(),
                "san": game.sans[index],
                "side": "white" if mover == chess.WHITE else "black",
                "mover_name": me.name,
                "mover_title": me.title,
                "mover_elo": me.elo,
                "mover_fide_id": me.fide_id,
                "mover_champion": world_champion(me),
                "opponent_title": them.title,
                "opponent_elo": them.elo,
                "base": game.base,
                "increment": game.increment,
                "clock": before_clock,
                "opponent_clock": opponent_clock,
                "spent": spent,
                "ample_clock": before_clock is not None and before_clock >= AMPLE_SECONDS,
                "eval_before": eval_before,
                "eval_after": eval_after,
                "win_before": win_before,
                "win_after": win_after,
                "loss": (win_before - win_after) if win_before is not None and win_after is not None else None,
                "glyph": ply.glyph,
                "comment": ply.comment or None,
                "mover_score": game.white_score if mover == chess.WHITE else 1.0 - game.white_score,
                "game_plies": len(game.plies),
            }
            if features:
                row.update(position_features(board))
            rows.append(row)
        board.push(move)
        last = move.uci()
    return rows


def same_game(headers: dict[str, str], sans: list[str]) -> str:
    """A key that two relays of one game share: the players, the day and the moves."""
    white = headers.get("WhiteFideId") or headers.get("White", "")
    black = headers.get("BlackFideId") or headers.get("Black", "")
    day = headers.get("UTCDate") or headers.get("Date", "")
    text = "|".join([white.strip().lower(), black.strip().lower(), day[:7], " ".join(sans)])
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
