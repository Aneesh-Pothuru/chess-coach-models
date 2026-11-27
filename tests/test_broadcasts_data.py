import chess
import pytest

from chess_coach_models.data import broadcasts as bc


HEADERS = {
    "Event": "Round 3",
    "BroadcastName": "Example Open 2025 | Championship",
    "GameURL": "https://lichess.org/broadcast/example/round-3/abcdEFGH/gameID01",
    "White": "Carlsen, Magnus",
    "Black": "Player, Some",
    "WhiteTitle": "GM",
    "BlackTitle": "",
    "WhiteElo": "2830",
    "BlackElo": "2150",
    "WhiteFideId": "1503014",
    "BlackFideId": "999",
    "Result": "1-0",
    "TimeControl": "90+30",
    "UTCDate": "2025.06.01",
}
MOVETEXT = (
    "1. e4 { [%eval 0.2] [%clk 1:30:20] } 1... e5 { [%eval 0.2] [%clk 1:30:25] } "
    "2. Nf3 { [%eval 0.2] [%clk 1:30:40] } 2... Nc6 { [%eval 0.3] [%clk 1:29:00] } "
    "3. Bb5!? { [%eval 0.3] } { A sharp choice. } { [%clk 1:29:30] } (3. Bc4 Bc5) 3... a6 $2 { [%eval 0.4] [%clk 1:20:00] } "
    "4. Ba4 { Inaccuracy. Bxc6 was best. } { [%eval 0.3] [%clk 0:05:00] } 4... Nf6 { [%eval 0.3] [%clk 1:19:00] } 1-0"
)


def test_movetext_keeps_the_main_line_with_its_clocks_evaluations_glyphs_and_words():
    plies = bc.read_movetext(MOVETEXT)
    assert [ply.san for ply in plies] == ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"]
    assert plies[0].clock == 5420.0
    assert plies[4].glyph == 5 and plies[5].glyph == 2
    assert plies[4].comment == "A sharp choice."
    # Lichess's own analysis is not a person's words.
    assert plies[6].comment == ""
    assert plies[5].eval_cp_white == pytest.approx(40.0)


@pytest.mark.parametrize(
    "header, expected",
    [
        ("90+30", (5400, 30)),
        ("5400+30", (5400, 30)),
        ("40/5400+30:1800+30", (5400, 30)),
        ("90'+30''", (5400, 30)),
        ("G: 3 minutes + 2 seconds per move", (180, 2)),
        ("15+10", (900, 10)),
        ("-", None),
        ("", None),
    ],
)
def test_time_controls_are_read_however_they_are_written(header, expected):
    assert bc.time_control(header) == expected


def test_a_classical_game_is_read_and_its_strong_players_moves_are_rows():
    game, why = bc.classical_game(HEADERS, MOVETEXT)
    assert why == "kept" and game is not None
    assert (game.base, game.increment, game.control_read_from) == (5400, 30, "header")
    rows = bc.strong_moves(game)
    # Only the grandmaster's moves: the opponent is rated under 2200 with no title.
    assert [row["ply"] for row in rows] == [1, 3, 5, 7]
    first, last = rows[0], rows[-1]
    assert first["fen"] == chess.STARTING_FEN and first["move"] == "e2e4"
    assert first["mover_champion"] == "Magnus Carlsen"
    assert last["clock"] == 5370.0 and last["spent"] == pytest.approx(5370.0 - 300.0 + 30)
    assert last["ample_clock"] is True
    assert last["eval_before"] == pytest.approx(40.0) and last["loss"] is not None
    assert "legal_moves" in first


def test_games_that_are_not_classical_or_not_finished_give_nothing():
    assert bc.classical_game({**HEADERS, "Result": "*"}, MOVETEXT)[1] == "unfinished"
    assert bc.classical_game({**HEADERS, "TimeControl": "15+10"}, MOVETEXT)[1] == "not classical"
    assert bc.classical_game({**HEADERS, "BroadcastName": "World Rapid 2025"}, MOVETEXT)[1] == "not classical"
    assert bc.classical_game({**HEADERS, "Variant": "Chess960"}, MOVETEXT)[1] == "not standard"
    assert bc.classical_game(HEADERS, MOVETEXT.replace("2. Nf3", "2. Nf5"))[1] == "illegal move"


def test_without_a_header_the_clocks_give_the_time_control():
    game, _ = bc.classical_game({key: value for key, value in HEADERS.items() if key != "TimeControl"}, MOVETEXT)
    assert game.control_read_from == "clocks"
    # The clocks rose once in these few moves: too few to say there is an increment.
    assert game.base == 5440 and game.increment == 0
    rising = [bc.Ply(san="", clock=5400.0 + 25 * (index // 2)) for index in range(12)]
    assert bc.increment_from_clocks(rising) == 30


def test_strength_and_champions():
    assert bc.is_strong(bc.Player("a", "CM", 2100, ""))
    assert bc.is_strong(bc.Player("a", "", 2250, ""))
    assert not bc.is_strong(bc.Player("a", "WFM", 2150, ""))
    assert bc.world_champion(bc.Player("Gukesh D", "GM", 2780, "")) == "Gukesh Dommaraju"
    assert bc.world_champion(bc.Player("Anand, Pranav", "GM", 2500, "")) == ""


def test_two_relays_of_one_game_share_a_key():
    sans = ["e4", "e5"]
    copy = {**HEADERS, "GameURL": "https://lichess.org/broadcast/other/round-3/xyz/gameID02"}
    assert bc.same_game(HEADERS, sans) == bc.same_game(copy, sans)
    assert bc.same_game(HEADERS, sans) != bc.same_game(HEADERS, ["d4", "d5"])
