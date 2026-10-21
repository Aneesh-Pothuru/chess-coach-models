# Held-out examples, read by the blunder check

Written by `why.mjs` on app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`, from `results/examples.json` (Lichess standard rated 600+0, 2026-09, CC0). Read after the results; it describes the examples and changes no verdict.

Each move is read by the app's blunder check (`safetyCheck`) and its capture war (`captureExchangeByMove`): it **allows mate** when the reply can mate at once, and it **loses material** when it is a capture the capture war says loses, or when, after it, a piece of the mover's can be taken for a gain (`leavesLoose`, newly loose or loose already; the capturing piece of an even or winning capture is not counted, since taking it back is the trade). An unsound rule move that does neither **passes over a forcing move** when the natural move is a check, a capture or a promotion, and is **a quieter choice** otherwise.

| Rule | Examples | R sound | R unsound | Allows mate | Loses material | Passes over a forcing move | A quieter choice | N forcing | R flagged | N flagged |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| active-king | 8 | 5 | 3 | 0 | 0 | 3 | 0 | 4 | 0 | 0 |
| opposition | 8 | 5 | 3 | 0 | 1 | 1 | 1 | 2 | 2 | 0 |
| square-rule | 8 | 8 | 0 | 0 | 0 | 0 | 0 | 4 | 1 | 1 |
| rook-behind-passer | 8 | 4 | 4 | 1 | 3 | 0 | 0 | 3 | 5 | 2 |
| cut-off-king | 8 | 2 | 6 | 0 | 5 | 1 | 0 | 4 | 7 | 1 |
| outside-passer | 8 | 2 | 6 | 0 | 5 | 1 | 0 | 6 | 5 | 0 |
| trade-when-ahead | 8 | 4 | 4 | 0 | 1 | 2 | 1 | 5 | 1 | 0 |
| open-file | 8 | 4 | 4 | 0 | 2 | 2 | 0 | 4 | 3 | 0 |
| rook-on-the-seventh | 8 | 4 | 4 | 0 | 4 | 0 | 0 | 5 | 4 | 1 |
| outpost | 8 | 2 | 6 | 0 | 4 | 2 | 0 | 4 | 4 | 0 |
| pawn-break | 8 | 3 | 5 | 0 | 4 | 1 | 0 | 3 | 4 | 4 |
| passed-pawn | 8 | 1 | 7 | 1 | 5 | 1 | 0 | 5 | 6 | 1 |
| worst-piece | 8 | 4 | 4 | 0 | 2 | 1 | 1 | 4 | 2 | 1 |
| all | 104 | 48 | 56 | 2 | 36 | 15 | 3 | 53 | 44 | 11 |

R flagged counts the rule moves the check flags, sound or not; 6 of them were sound. N flagged counts the same for the natural move.

## active-king

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Kf4 | no | safe | - | - | Rg8+ | yes | yes | passes over a forcing move |
| 2 | Kc6 | no | safe | - | - | Rxh3 | no | yes | passes over a forcing move |
| 3 | Kf7 | yes | safe | - | - | Kf8 | yes | no | sound |
| 4 | Kf3 | no | safe | - | - | Rc8+ | no | yes | passes over a forcing move |
| 5 | Kg5 | yes | safe | - | - | Nxa2 | no | yes | sound |
| 6 | Ke2 | yes | safe | - | - | Nc3 | yes | no | sound |
| 7 | Ke4 | yes | safe | - | - | f5 | yes | no | sound |
| 8 | Kc5 | yes | safe | - | - | a5 | yes | no | sound |

## opposition

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Kc2 | yes | safe | - | - | b2 | yes | no | sound |
| 2 | Kb1 | yes | safe | - | - | Kc1 | yes | no | sound |
| 3 | Kd7 | no | safe | - | - | Kf7 | yes | no | a quieter choice |
| 4 | Kc5 | yes | safe | - | - | Kd3 | yes | no | sound |
| 5 | Kc7 | yes | safe | - | - | Ke7 | yes | no | sound |
| 6 | Ke2 | no | safe | - | - | c8=Q+ | yes | yes | passes over a forcing move |
| 7 | Kh2 | yes | safe | - | h5 | Kg4 | yes | no | sound |
| 8 | Kd4 | no | loses-material | - | b5 | gxh4 | yes | yes | loses material |

## square-rule

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | d3 | yes | safe | - | - | Kf4 | yes | no | sound |
| 2 | a2 | yes | safe | - | - | Bxf5+ | yes | yes | sound |
| 3 | c3 | yes | safe | - | - | Bf3# | yes | yes | sound |
| 4 | b6 | yes | safe | - | - | Qxd5+ | yes | yes | sound |
| 5 | h5 | yes | loses-material | - | g5 | Ne6 | yes | no | sound |
| 6 | a4 | yes | safe | - | - | Kf3 | yes | no | sound |
| 7 | a5 | yes | safe | - | - | Rd3 | no | no | sound |
| 8 | h4 | yes | safe | - | - | Bxd4 | yes | yes | sound |

## rook-behind-passer

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Rd5 | no | allows-mate | - | f8 | R5f7 | yes | no | allows mate |
| 2 | Rhd1 | yes | safe | - | b3 | Rc6 | yes | no | sound |
| 3 | Rc7 | yes | safe | - | - | c3 | no | no | sound |
| 4 | Rhe8 | yes | safe | - | - | Rxc5 | yes | yes | sound |
| 5 | Re3 | yes | safe | - | - | Rf7 | yes | no | sound |
| 6 | Rh8 | no | safe | - | e4 | Bd5 | yes | no | loses material |
| 7 | Rc8 | no | safe | - | d4 | Nxe2+ | yes | yes | loses material |
| 8 | Ra8 | no | safe | - | a7 b4 | Rxc1+ | yes | yes | loses material |

## cut-off-king

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Rf6 | no | safe | - | h7 | Rg8+ | yes | yes | loses material |
| 2 | Rd1 | yes | safe | - | f5 | Kf3 | yes | no | sound |
| 3 | Rc3 | no | loses-material | - | g2 | a6 | no | no | loses material |
| 4 | Rd4 | yes | safe | - | c3 | Rc4 | yes | no | sound |
| 5 | Rc2 | no | safe | - | - | gxf5+ | yes | yes | passes over a forcing move |
| 6 | Re8 | no | loses-material | - | d5 | Kf8 | yes | no | loses material |
| 7 | Re7 | no | safe | - | a4 | Rxd4 | yes | yes | loses material |
| 8 | Re3 | no | safe | - | b5 d5 | g1=Q+ | yes | yes | loses material |

## outside-passer

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Rxc3+ | no | loses-material | -4 | c3 g2 | g1=Q+ | yes | yes | loses material |
| 2 | Rxb4 | no | loses-material | -4 | b4 | Ra3+ | yes | yes | loses material |
| 3 | Kxh4 | yes | safe | 1 | - | c1=Q+ | yes | yes | sound |
| 4 | Rxb4 | no | loses-material | -4 | b4 | f5+ | no | yes | loses material |
| 5 | Rxb4+ | no | loses-material | -4 | b4 | Bc3 | no | no | loses material |
| 6 | Kxh7 | no | safe | 1 | - | Kxf8 | yes | yes | passes over a forcing move |
| 7 | Nxb5 | yes | safe | 1 | - | d8=Q | yes | yes | sound |
| 8 | Rxa5 | no | loses-material | -4 | a5 f4 | Kg4 | yes | no | loses material |

## trade-when-ahead

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Bxc6 | no | loses-material | 0 | h3 | fxg4 | no | yes | loses material |
| 2 | Nxg6+ | no | loses-material | 0 | - | Qd8+ | yes | yes | passes over a forcing move |
| 3 | Bxf3 | yes | loses-material | 0 | - | Bb2 | yes | no | sound |
| 4 | Rxf1+ | no | loses-material | 0 | - | Rh2+ | yes | yes | passes over a forcing move |
| 5 | Qxg2+ | yes | loses-material | 0 | - | Qe3+ | yes | yes | sound |
| 6 | Qxe6+ | yes | loses-material | 0 | - | Qa4 | yes | no | sound |
| 7 | Nxc3+ | yes | loses-material | 0 | - | Qf1+ | yes | yes | sound |
| 8 | Bxh6 | no | loses-material | 0 | - | g4 | yes | no | a quieter choice |

## open-file

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Rh8 | no | safe | - | d6 | Rxg2+ | yes | yes | loses material |
| 2 | Rfe1 | no | safe | - | - | Qxd5+ | yes | yes | passes over a forcing move |
| 3 | Qe7 | no | safe | - | f6 | Nxe5 | yes | yes | loses material |
| 4 | Rd1 | no | safe | - | - | Rh8+ | no | yes | passes over a forcing move |
| 5 | Re1 | yes | safe | - | b2 | Rb1 | yes | no | sound |
| 6 | Rfe8 | yes | safe | - | - | Bg3 | no | no | sound |
| 7 | Rac1 | yes | safe | - | - | Ng3 | yes | no | sound |
| 8 | Re1+ | yes | safe | - | - | Kd2 | yes | no | sound |

## rook-on-the-seventh

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Rd2 | yes | safe | - | - | Rxe1+ | yes | yes | sound |
| 2 | Rc7+ | yes | safe | - | - | g4 | yes | no | sound |
| 3 | Rd2 | no | safe | - | g7 | gxh6 | yes | yes | loses material |
| 4 | Ra2 | yes | safe | - | - | Qd7 | yes | no | sound |
| 5 | Rxa2 | yes | safe | 1 | - | Rxa7 | yes | yes | sound |
| 6 | Rdd2 | no | safe | - | b7 | Rxe7+ | yes | yes | loses material |
| 7 | Rg7 | no | loses-material | - | h6 | h7 | yes | no | loses material |
| 8 | Rg2 | no | safe | - | d6 | Qxc2 | yes | yes | loses material |

## outpost

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Nb5 | no | safe | - | - | Nxe5 | yes | yes | passes over a forcing move |
| 2 | Nab5 | yes | safe | - | - | fxe5 | yes | yes | sound |
| 3 | Ne5 | no | safe | - | h4 | Qh3 | no | no | loses material |
| 4 | Nb3 | no | loses-material | - | b5 | Rad8 | yes | no | loses material |
| 5 | Nxe4 | yes | safe | 1 | - | fxe4 | yes | yes | sound |
| 6 | Bc3 | no | loses-material | - | g1 | Rdg8 | yes | no | loses material |
| 7 | Bf4 | no | safe | - | - | hxg4 | yes | yes | passes over a forcing move |
| 8 | Bd5 | no | safe | - | d4 | Qe3 | no | no | loses material |

## pawn-break

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | c6 | no | safe | - | c4 | Re8 | yes | no | loses material |
| 2 | d5 | yes | safe | - | - | Be7 | yes | no | sound |
| 3 | c4 | no | loses-material | - | a1 | Qxg4 | no | yes | loses material |
| 4 | c4 | yes | safe | - | - | Nh4 | yes | no | sound |
| 5 | a4 | yes | safe | - | - | Nd5 | yes | no | sound |
| 6 | f3 | no | safe | - | - | Nxa7 | yes | yes | passes over a forcing move |
| 7 | d5 | no | safe | - | b2 c4 | Bxb7 | yes | yes | loses material |
| 8 | b4 | no | safe | - | g3 | Bd6 | yes | no | loses material |

## passed-pawn

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | h4 | no | safe | - | d8 | Qe8+ | yes | yes | loses material |
| 2 | g3 | no | loses-material | - | g3 h3 | Bxc5 | no | yes | loses material |
| 3 | h5 | no | loses-material | - | c2 h5 | Qd1+ | yes | yes | loses material |
| 4 | f5 | no | safe | - | - | Qxh1 | yes | yes | passes over a forcing move |
| 5 | g7+ | yes | safe | - | - | Qxf6+ | yes | yes | sound |
| 6 | a5 | no | allows-mate | - | h7 | g6 | yes | no | allows mate |
| 7 | c6 | no | loses-material | - | c6 | a3 | yes | no | loses material |
| 8 | d7+ | no | loses-material | - | d7 | h3 | yes | no | loses material |

## worst-piece

| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |
|---:|---|---|---|---:|---|---|---|---|---|
| 1 | Rc5 | yes | safe | - | - | b4 | yes | no | sound |
| 2 | Rde8 | no | safe | - | - | c5 | no | no | a quieter choice |
| 3 | Rf8 | no | loses-material | - | e5 | f3 | no | no | loses material |
| 4 | Be7 | yes | safe | - | - | Qe5+ | no | yes | sound |
| 5 | Ne4 | yes | safe | - | - | Rac8 | yes | no | sound |
| 6 | Re1 | no | safe | - | b4 | Ba4+ | yes | yes | loses material |
| 7 | Rfc8 | no | safe | - | - | Qxe3+ | yes | yes | passes over a forcing move |
| 8 | Nd6 | yes | safe | - | - | Ra1+ | yes | yes | sound |

