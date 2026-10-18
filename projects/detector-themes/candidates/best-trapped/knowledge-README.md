# services/knowledge

## Purpose

The Position Knowledge service: everything that reads a position or a move for its chess content.
One memoised board kernel (piece lists, attack maps, legal attackers and defenders, pins, the
capture war, material) built once per position and shared by every detector; the position facts
built on it; the detectors (threats, forks, tactics, techniques, named patterns, insights,
lessons, the threat gate, the blind-spot scan); and the catalogues they name things from
(patterns, structures, endgame theory).

The service is engine-free. Engine evidence (a best move, a PV, a win% loss, scores) arrives as
data from the caller; nothing here searches.

## Public API

The service API

- `describePosition(fen, { history? })`: every fact about a position, memoised per position,
  each group computed when first read: `PositionFacts` (`material` with typed imbalances, `phase` from the divider with
  `technicalEndgame` and `taper`, the `endgame` signature, the `structure` with its owner, per
  side `SideFacts`, the `threats` each side has, and the kernel `board`). Its parts: `SideFacts`
  (`material`, `points`, `king`, `pawns`, `safety`, `activity`), `KingFacts` (castling, the one
  shelter scale, open files, ring attackers, escapes, back rank, luft), `PawnFacts` (islands,
  doubled, isolated, backward, `PassedPawn`s, `PawnChain`s with their base, `Lever`s, holes),
  `SafetyFacts` (hanging, loose, loose and attacked, `SoleDefender`s, `PinnedPiece`s),
  `ActivityFacts` (mobility, worst piece, centre, space, control of the enemy half,
  `RookActivity`, outposts, bad bishop, bishop pair), `PhaseFacts`, `WinningCapture`.
- `describeMove(fen, move, evidence?)`: what a move (SAN or UCI) does, or null when it is not
  legal: `MoveFacts` (`findings` from every registered move detector, ranked; `lead`;
  `sentence`; `delta`, a `MoveDelta`: newly hanging, the deserted guard, the shelter, the
  structure, new passers, the mate it allows; `allowed` from the reply line; `missed` from the
  best move; `lesson`), each read lazily.
- `detectPosition(fen)`: every position-scope finding (threats, pattern opportunities,
  structures, the endgame). A mate in one is read from `PositionFacts.threats`: the side not to
  move's is its threat (`threat.mate-in-one`, none while the side to move is in check), and the
  side to move's is a mate to play now (`opportunity.mate-in-one`, the checkmate concept), never
  a threat.
- `safetyCheck(fen, candidate)` and `SafetyReport`, `SafetyVerdict`: the blunder check for a
  candidate move: the opponent's checks, captures and mates, what is left loose, the deserted
  guard, and a verdict (`safe`, `loses-material`, `allows-mate`).
- `registerDetector(spec)` and `detectors(filter?)`: the registry. `DetectorSpec` (`id`,
  `conceptId`, `scope`, `maxEvidence`, `needsEngine`, `cost`, `run`), `DetectorScope`
  (`position`, `move`, `line`), `DetectorCost`, `PositionContext`, `MoveContext`, `LineContext`,
  `ScopeContext`.
- `Finding`: one detector's claim (`id`, `conceptId`, `actor`, `tone`, `evidence`, `text`,
  `squares`, `arrows`, `witnessFen`, `priority`, `data`), and `Evidence`, its strength
  (`geometry` < `exchange` < `proven2ply` < `line` < `verified`).
- `EngineEvidence`: engine output as data (`bestUci`, `bestPv`, `replyPv`, `lossPct`,
  `winBefore`, `scoreBefore`, `scoreAfter`, `cls`).
- `catalogue` and `createCatalogue(content?)` returning a `Catalogue` (`concept(id)`, which also
  reads any source's id, an alias or a name; `concepts({ kind?, detectable? })`): one `Concept`
  per idea over the patterns, structures, endgame theory, techniques, motifs and the content
  port's lessons, drills and principles. `Concept` (`id`, `kind`, `name`, `aliases`, `idea`,
  `teach`, `sources`, `drills`, `steps`, and `detectors`, derived from the registry),
  `ConceptKind`, `ConceptSources`, `ConceptLink`.
- `phrase(finding, opts?)` and `PhraseOptions`: the one place a finding becomes a sentence.
- `judgeSighting(sighting)` and `Sighting`, `SightingVerdict`, `SIGHTING_LOSS_PCT`: the one
  policy for what became of a named-pattern sighting, in the review's words (played, refuted,
  missed, seen, faced, weakness). A `Sighting` carries `patternLossPct`, the mover's win% loss
  had the pattern's move been played (the played move's loss, 0 for the engine's own move, else
  a probe's).
- `patternSound(sighting)`: the pattern's move gives up less than `SIGHTING_LOSS_PCT` (null when
  nobody judged it), the one soundness bar.
- `ledgerVerdict(run)` → `LedgerReading` (`verdict`, `at`) or null, and `LedgerVerdict`,
  `LEDGER_VERDICTS`: the same policy in the pattern ledger's words, the routine contracts'
  (taken, taken-unsound, missed, refuted, allowed, weakness), over a run's sightings: taken if any
  ply played it, else missed if the move was sound at any ply, else refuted only when every ply
  the engine read was unsound, else null (unknown).
- `patternSightings(plies, playerColor, hits?)` and `SightingPly`, `PatternSighting`,
  `PatternVerdict` (`mate` or a sighting verdict): every named pattern a game contained, one
  sighting per run (the same pattern for the same side while that side keeps seeing it, within
  `RUN_GAP_PLIES`), carrying its most instructive verdict (`VERDICT_RANK`), its reading in the
  ledger's words (`ledger`: a `PatternLedgerReading`, the verdict, the ply it was read at, the
  pattern move's loss there and the geometry), and the finished mate. The app's review panel and
  the routine's pattern ledger both read it. `scanSightingHits(fens)`: the geometry of every
  position, for the side to move. `pendingSightingProbes(plies, color, hits?)`: the positions
  whose engine move would decide a verdict and is not known yet; `pendingPatternProbes(plies,
  color, hits?)` → `PatternProbe`s: the pattern moves whose soundness would decide a ledger
  verdict and nobody has probed (`SightingPly.patternLoss`), for a caller that searches.

Kernel: the board and its memo

- `Board`: one position, read-only to callers, memoising every reading asked of it (`get`,
  `pieces`, `rows`, `king`, `attackers`, `isAttacked`, `inCheck`, `moves`, `movesFrom`, `sans`,
  `find` (SAN or UCI as chess.js `move(string)` reads it), `findUci` (chess.js's object form),
  `play`, `turnedTo`, `without`, `isCheckmate`, `isStalemate`, `isInsufficientMaterial`,
  `isGameOver`, `moveNumber`, `squareColor`, `fen`, `turn`).
- `BoardMove`: a legal move shaped like chess.js's verbose Move (same fields and flag letters),
  with `uci`. `isCapture()` counts en passant (chess.js does not; `isEnPassant()` still tells it
  apart), so no reader takes an en passant capture for a quiet pawn move.
- `boardOf(fen)`: the shared Board for a FEN (an LRU of recent positions); throws on a FEN chess.js
  refuses. `tryBoard(fen)`: the same, or null.
- `asBoard(pos)`: a Board from a `PositionLike`. `PositionLike`: a FEN, a Board or a chess.js game.
- `clearBoards()`: empties the memo (for cold measurements).
- `replayFens(sans, startFen?)`: the FENs a game passes through (index i after i plies), read with
  chess.js's `move(string)` rules and stopping at the first move that is not legal; one mailbox,
  no Board per position, for scans that need only the positions.
- `PieceOn`: `{ square, type, color }`.
- `PIECE_VALUE`: the one piece-value table (p 1, n 3, b 3, r 5, q 9, king 0).
- `KING_RANK_VALUE` and `rankValue(type)`: the king at 100 where pieces are ranked, not counted.
- `PIECE_NAME`, `SIDE_NAME`: the one table of piece and side names.
- `between(a, b)`, `kingDistance(a, b)`, `squareAt(file, rank)`: square geometry.
- `legalAttackers(pos, square, color)`: pieces that can legally capture there (pin-aware, en
  passant included).
- `legalDefenders(pos, square, color, attackerFrom)`: legal recaptures after that capture.
- `cheapestOf(pos, squares)`: the cheapest piece among squares.
- `hangingPieces(pos, color)` and `HangingPiece`: the one hanging definition (free,
  underDefended, outnumbered; pin-aware, settled by the capture war).
- `unguardedPieces(pos, color)`: the one loose definition (no legal recapture), pin-aware.
- `captureExchange(fen, square)`: the exact capture war on a square for the side to move.
- `captureExchangeByMove(fen, uci)`: the capture war for one named capture (en passant included:
  it banks the pawn beside the landing square).
- `exchangeFor(board, square, color)`: the capture war with `color` to move (null when the turn
  cannot be handed over).
- `seeGe(board, from, to, threshold?)`: Stockfish's static exchange test with x-rays, a screen.
- `pinKind(board, us, front, back)` and `PinKind`: the one pin rule.
- `pinsOn(board, color)` and `Pin`: every pin on a side's pieces.
- `materialCount(pos)` and `MaterialCount`, `materialFor(pos, color)`, `piecePoints(pos)`: the one
  material count.
- `materialChange(before, after, color)` and `MaterialChange`, `PieceCounts`: the pieces a side
  won and gave between two positions, by kind, trades set off (a piece against one of its kind,
  then a knight against a bishop; a promotion gives the pawn and wins the piece).
- `sideMaterial(pos)` and `SideMaterial`: per-side piece counts, bishop colours, pawn files and
  squares, king square. `pointsOf(m)`, `piecePointsOf(m)`: its totals.
- `isPassed(board, square, color)`: the one passed-pawn test. `passedPawns(board, color)`,
  `pawnFiles(board, color)`.
- `flipTurn(fen)`: the same position with the other side to move, or null when that side is in
  check.

Facts

- `readPosition(fen, history?)` and `PositionReading`, `SideReading`, `KingReading`,
  `PawnReading`, `PieceMobility`: the readings panel.
- `castlingText(king)`, `materialText(diff)`: the panel's words.
- `readCastling(pos, color, history?)` and `CastlingReading`, `ReadingHistory`.
- `shelterOf(board, color)`: the one king-shelter scale, files covered 0-3.
- `kingDanger(pos, color?)` and `KingDanger`, `KingDangerSign`: the signs of danger to a king (the
  side to move's by default). `queenOnExits`: their queen attacks a square next to the king that
  none of its pieces stands on (the queen and those squares; the queen covering the most when they
  have two). `noSafeSquares`: the king has no escape (`KingFacts`). `signs` lists them in that
  order; null without a king.
- `phaseOf(pos)`: the divider's phase of one position (core/phase).
- `imbalancesOf(pos)` and `Imbalance`, `ImbalanceKind`: typed material imbalances.
- `structureOf(fen)`, `featuresOf(fen)` and `StructureHit` (with `owner`), `skeletonKey(fen)`,
  `centreKey(fen)`: pawn structures.
- `settledStructure(sans, hold?)` and `SettledStructure`, `STRUCTURE_HOLD_PLIES`: the structure a
  game settled into, when, and who holds it. `playedLever(sans, meIsWhite, levers, fromPly?)`:
  whether the player played a lever after it arrived (the destination square decides).
- `signatureOf(fen)` and `Signature`, `Side`, `isEndgameMaterial(fen)`: endgame signatures.
- `endgameJourney(fens, evals, meIsWhite, result)` and `EndgameSegment`, `EntryBand`,
  `ConversionVerdict`, `entryBandOf(win)`, `SETTLE_PLIES`: the endgames a game passed through.
- `pieceSight(board, square)` and `PieceSight`: what one piece sees. `sees` is every square it
  reaches, up to and including the first piece on each line; `defends` the pieces of its own side
  among them (kings left out); `attacks` the other side's pieces among them; `onLines` every piece
  of the other side on its lines, behind other pieces too (a knight, king or pawn has no lines, so
  it is `attacks`); `inTheWay` every piece standing between it and one of those. Piece vision asks
  for these.

Detectors

- `mateInOneMoves(pos)`, `moveAllowsMateInOne(fen, san)`: mate in one.
- `f7f2Danger(fen, color)` and `F7Danger`, `queenRaidWarning(fen, color)`,
  `backRankWeakness(fen, color)`, `opponentMobility(fen)`, `stalematingMoves(fen)`,
  `threatSummary(fen, color)`, `HANGING_PHRASE`: the live coach's threat readers.
- `detectFork(fenBefore, san)` and `ForkInfo`.
- `themeOfBest(fen, bestSan, solutionPv?)` → `BestMoveTheme`: what a turning point's best move does, in the
  player's vocabulary (`mateIn1`, `backRankMate`, `fork`, `attackingF2F7`, `hangingPiece`, then a
  `skewer`, `discoveredAttack` or `pin` that `describeMove` finds to the mover's gain, then
  `trappedPiece` when the line wins the trapped piece that `describeMove` names, then
  `defensiveMove`, else the position's phase; `tactics` when the move is not legal there), each
  tag gated on the move exploiting or repairing the feature it names. The misses deck, the facts
  record and the rule ledger file turning points by it. `solutionPv` is an optional UCI line
  starting with `bestSan`'s move; without it the existing board-only themes still apply. A
  trapped piece must be the describer's gain for the mover: the moved piece attacks an enemy
  piece that loses where it stands and on each of its legal escape squares. The supplied line
  must legally reach a capture of that same piece, following its square when it moves; the
  reader stops at that capture, with no separate ply cap. The named capture must win its
  capture war (`captureExchangeByMove` greater than zero), and the material change from before
  the best move plus that capture war must also be positive (`materialFor`, in the same pawn
  units). Winning another piece, an even trade, an unaffordable investment, or a missing or
  illegal prefix does not qualify. This is proof on the supplied line through the capture,
  not a search of every defense or a verdict on unrelated later moves. The misses deck passes
  its best line through `core/chess`'s `replaySans`.
- `createdMotifs(fenBefore, san, uci)`: every motif a move creates (the fork, the pins, the skewer,
  the discoveries, the double check, the battery, the passed pawn), by the concept each is.
- `blunderMotifs(fenBefore, san, fenAfter, afterScore, refutationPv, color)`: the motif tags of a bad
  move, read from what the engine's refutation line wins (`hangingPiece`, `fork`, `discoveredAttack`,
  `allowedMate`, `allowedForcedMate`, the line removals), with a static fallback without a line.
- `desertedDefence(fenBefore, san)` and `DesertedDefence`.
- `matesInARow(fen, side, count, opts?)`: every way `side` mates with `count` moves in a row while
  the other side passes, each move before the last giving no check (a check would be answered);
  null when either side is in check there. `fewestInARow(fen, side, most, opts?)` and
  `InARowSearch`: the fewest moves in a row that mate, up to `most`, with their plans; null when
  none mates within `most` or the node budget (`InARowOptions.nodes`) runs out first. `cap` stops
  a search at that many plans. `playInARow(fen, side, ucis)` and `InARowMove`: those moves played
  in a row, each with its SAN, the position after it and whether it checks or mates; null when a
  move is illegal or follows a check. Moves in a row asks for these.
- `moveReasons(fen, uci, recapture?)` and `MoveReason`: why a move is strong, as facts (a mate,
  a NEW mate threat of the mover's own (not one the same piece could already deliver on the same
  square, and none after a move that ends the game), a capture that wins or trades or takes back, a fork with the pieces it hits, a
  promotion, a check, castling, or a piece of theirs the move newly attacks, directly or by
  discovery; a piece that was loose before the move is not its reason; a castle whose rook hits a
  piece is that attack first, then castling). `reasonText(reason,
  form?, pov?)` and `ReasonForm`: one reason in words, as a clause ("it attacks their queen on
  g5"), a verb phrase after the move ("Nf3 attacks their queen on g5") or a participle ("Better:
  Nf3, attacking their queen on g5"); `pov` is the side "your" means (default the mover's).
  `explainMove(fen, uci, recapture?)`: the clauses joined ("it wins the knight outright and it
  comes with check"), '' when nothing stands out. `describeLine(fen, pv, maxPlies?)`.
- `ccaKind(fen, move)`, `CcaKind` and `CCA_KINDS`: which step of the CCA scan (checks, then
  captures, then attacks) finds a move given in SAN or UCI: `check` (a
  capture or discovery that checks is a check), `capture`, `attack` (a quiet move whose reasons
  are a mate threat, a fork, a promotion or a newly attacked piece, a castle included), or `quiet`; null when the
  move is not legal there. The Play hint and the brief's turning points read it.
- `CCA_SCAN` (`ScanStep`), `CCA_WORD`: the one pre-move scan in the words every surface states it
  with, in order: their move (some want nothing), then checks, captures and attacks for both sides,
  each with its test (what a check gains, whether a capture leaves you better and what the
  capturing piece stops guarding, whether the attacked piece just moves somewhere better), then the
  quiet answer when nothing forcing works (loose pieces and weak squares, then the worst piece), and
  last the test of the move before it is played (what is wrong with it, their best answer). The
  app's scan order, the Play hint's lead and the review's takeaway read these; the curriculum quotes
  them.
- `tacticalThemes(fenBefore, uci)`, `leadTactic(themes)`, `Tactic`, `TacticKind`,
  `discoveredAttackInfo(fenBefore, uci)` and `DiscoveredAttack`.
- `detectCapturingDefender`, `detectDeflection`, `detectAttraction`, `detectIntermezzo`,
  `quietMove`, and `DefenderRemoval`, `Deflection`, `Attraction`, `Intermezzo`: the engine-line
  readers (cook.py port).
- `techniqueInsights(fenBefore, uci, ctx?)` and `TechniqueContext`, `seventhRankTargets`.
- `moveInsights(fenBefore, uci, ctx?)`, `replyInsights(fenAfter, reply)` and `Insight`,
  `InsightArrow`: the review's cards. `REPLY_AS_MOVE_CARD`: the move card a reply card names
  when it reads the mover's own move (a capture nothing takes back is `wins-capture`), so a
  reader listing both counts one fact once.
- `scanPatterns(fen, side)` and `PatternHit`, `nameMate(fen)` and `MateShape`,
  `patternInsights(fenBefore, uci, ctx?)` and `PatternContext`: the named patterns.
- `sacrificeEvidence(fenBefore, uci, pvAfter, register?)` and `SacrificeEvidence`,
  `SacrificeTermination`, `TeachingRegister`.
- `teachMove(args)` and `TeachArgs`, `MoveLesson`, `readLine`, `LineRead`, `newAttacks`,
  `AttackFact`, `LINE_PLIES`: the lesson behind a grade. A forced mate on either line (the line
  ends in mate on the board, or the engine's exact score for its position is a mate) is the
  lesson: who mates, in how many moves and with which move, never the material on the way or a
  positional difference, and a mate against the player is never told as his. A move that
  stalemates is that lesson: the draw, and from a winning position the win it threw away and the
  better move ("Qf7 is stalemate: a won game becomes a draw. Qd8# is mate."). A mistake, blunder
  or miss that captures, not en passant, where nothing can take back and the better move lands
  elsewhere, opens its headline with the trap when the engine's line mates the mover, or ends
  settled two pawns' worth or more down while the better line ends settled two pawns' worth or
  more better: "Their pawn on c7 looked free, but it was a trap." ("Your" on the opponent's
  move). An insight that is
  a whole clause keeps its own subject beside a move ("Rdf1: the rooks are doubled…"), never
  "Rdf1 queen and rook…". `readLine` reads a
  line that ends in mate to the mate (`LineRead.mate`: who gives it, on which ply).
  `LineRead.material` is the gain over the shown line, never the absolute material lead, and
  `LineRead.pieces` the pieces behind it (`materialChange`). An amount is said as a count ("a
  piece and a pawn") only when the count names those pieces, otherwise as the pieces ("a rook for
  a pawn", "they win a bishop for two pawns"), as `amountPhrase(material, pieces)` says it;
  "either way" says the worth when the two lines' pieces differ ("a pawn's worth of material"),
  and "the knight on c3 falls" names only a piece the line keeps;
  `materialSettled` is false for an interrupted exchange, a line ending in check, or an
  illegal continuation. Material comparisons require a settled line with a reply on both
  branches. Missing or unsettled continuations are stated as insufficient evidence, and no
  material change is never treated as proof that the reason is positional. When nothing else
  explains the better move of an inaccuracy, mistake, blunder or miss (its section has no point,
  its line ends with no more material than the played one, and the headline does not name the
  reply's threat), a better move that takes nothing, from a position not in check, says which of
  the mover's knights, bishops, rooks and queens it brings into play: one that had at most three
  squares to go to (`squaresToGo`, the count the activity facts' worst piece is read by) and has
  at least three more after it, and at least three more than the played move leaves it ("it
  brings the bishop on c8 into play, with 5 squares to go to instead of none"; the largest gain,
  the moved piece on a tie). As the section's point it gives the headline's, the difference's and
  the takeaway's reason ("d5 was better: it brings the bishop on c8 into play, ..."). The grade's
  numbers are the mover's, rounded by `evalFor` like the card's other scores, said to the player
  ("for them" on the opponent's move); a score past the mate line reads as the mate it encodes. The right
  move too early is said as such: when the best line plays the played move one or two of the
  mover's moves later, the difference ends "The order matters: f3 comes in the engine's line too,
  two moves later (Ng6 Re8 Qxf5 c6 f3)", and the takeaway says where it comes. Unless a check with a
  reason explains the order, a reply to the played move that captures is followed by what the better
  line does first, checked on the board: it takes the capturing piece, drives it off with an attack
  ("(Qe2)" names the retreat) or moves the target away, the target is not taken on the way unless it
  took that piece itself, and nothing can take it once the played move comes: "Played now, Bf5
  allows dxc5. cxd4 first takes the pawn on d4." ("Qd7 first drives the queen from b5 (Qe2)", "Nfd6
  first moves your knight on f5 away"). It says nothing of a reply that takes en passant, or when
  the better move's own point already moves that piece away (`keepsWhatIsLost`). A better move
  that gives check, answered by a king's step off a square it guarded that the line's next move
  then lands on, is said by that guard: "Rd8+ is a check with a reason: after Kh7, their king no
  longer guards f8, and Rf8 follows." ("and Rxf1+ takes the rook there" when that move
  captures), before the order and the stakes. Before it, a played move whose piece guarded the
  square its reply lands on, when nothing of the mover's guards it after the move and the guard
  held something (the reply is a king's step, its piece is worth more than the moved one, or
  nothing covers it there), is said by the guard it gives up: "After Qe1, your queen no longer
  guards d3, and Rxd3 takes the bishop there." ("and Kc3 follows" when the reply takes nothing).
  When it says nothing, a played move that newly attacks a piece with a threat (the piece is
  unguarded, or the attacker is worth less and is not the king) and gives no check, whose reply
  moves that piece away to take something, give check or newly attack something of the mover's
  that is unguarded or worth more, is said by the escape: "Ne5 attacks their bishop on g4, but it
  escapes to f5, where it attacks your queen on d3." A reply that takes the attacker, a trade,
  and the better line's own answer do not count.
  A reply that
  captures nothing, in a "What X allowed" section with no other point, is said by what it
  defends, checked on the board: it moves or guards the piece the better move would have won or
  attacked ("it moves the rook off e5, where dxe5 would have won it", "it guards the pawn on e4,
  which Nxe4 would have won"), takes away the better move's check ("it takes away the check Qd3
  would have given"), or answers the played move's own threat ("it guards the pawn on b5, which
  Rd5 attacked"). The headline's reply sentence carries it, and it is never read as a threat.
  In an endgame (the divider's phase of the position before the move, and neither line a mate)
  the lesson tells the passed pawns' story, each pawn followed from its square over the window
  its line is read on: a pawn that queens in one line and not the other opens the difference
  with its steps and its fate in the other line ("After Kg4, their b-pawn queens: b7 and b8=Q in
  the engine's line. Nxb6 takes it first."), then, when the other side has a passed pawn as it
  queens, where the one nearest its last rank stands, how many squares it has left and the first
  piece on its path ("When h1=R comes, your b-pawn is still on b5, three squares from b8, with
  your knight on b6 in its way."); a reply that pushes it says it goes on to queen
  ("the b-pawn goes on to queen on b8 in the engine's line"); a better move that takes a passed
  pawn, or stands on the path of one past the middle of the board, says so ("it takes their
  passed b-pawn", "it blocks their passed b-pawn on b7", "the king stands in front of their
  passed c-pawn"), first when it is the section's only point or stops the pawn that queens; and a
  king that walks to a passed pawn, each move closer and ending next to it or on it, is named
  with its moves ("your king walks over to their c-pawn: Kb2, Kc3 and Kxc4 in the engine's
  line"). The shown lines run on to the promotion or the walk's last move. When the played
  move's reply is their king's step, not castling and taking nothing, to a square nothing of the
  mover's covered before the move, and the better move, with no check, covers that square with
  the piece it moves while their king never stands there in the better line, the better move's
  points say so ("it keeps their king out of c5"; "Kd6 was better: it keeps their king out of c5.
  After Kf6, they can answer Kc5" when it leads them), after the board's insights of `priority` 3
  or less and before the rest.
  A line that trades into a pawn ending (only kings and pawns left, within the window the lesson
  reads, from a position with another piece) is played out over twice that window, up to its
  first promotion: "After Qxg1+ Kxg1, only kings and pawns are left: in the engine's line your
  king takes their pawns on h4 and g2, and their king takes your pawn on e3." (each king's
  captures, then the promotion, "your e-pawn queens on e8"; "only the kings are left: a draw."
  when no pawn is). The better line comes first, then the played one, before the sentence on
  where each move leaves the game, in a lesson on a mate too. A promotion is left out when the
  passed pawns' story opens the difference, and the sentence when it would name nothing.
  On an inaccuracy, mistake, miss or blunder whose two scores are exact and neither a mate, the
  difference ends with where each move leaves the mover, in `evalWords`'s words and `evalFor`'s
  number from the mover's side: "You stay ahead either way: much better after Re5 (+4.6),
  winning after Rxd8+ (+5.9)." when both leave the mover ahead (much better or winning), "You are
  behind either way: losing after Rb5 (-8.1), much worse after Rxb2+ (-4.4)." when both leave the
  mover behind (much worse or losing), and on a mistake, miss or blunder whose better move leaves
  a better standing, "After b5 you are losing (-5.0). After Nc4 you would be slightly worse
  (-1.0)." It says nothing when both moves leave the game open (worse to better) or the played
  move leaves the better standing.
- `declinedCaptures(fenBefore, bestUci, bestPv)`: the captures of the better move's piece that a
  lesson answers from a search (the other side's captures on its square, the cheapest capturer
  first, two at most; none when the best line takes it itself, since that line answers). Each
  one's searched line goes in `TeachArgs.bestCaptures`, and the better move's points say what
  the capture costs, once the moves to it replay: a recapture as the trade it is ("if they take
  it with Qxf6, Bxf6 wins their queen for your rook"), an even trade by what is left ("Bxe5
  takes back, and you have won a pawn"), checks that win a piece move by move ("Qg6+ Kf8 Qxh6+
  Kf7, then Qxe3 takes their rook on e3, and you have won two pawns' worth of material"), or a
  mate. Only a win within three of the mover's moves, every one before it a check, counted after
  any recapture on its square and kept to the end of the line. What is won is a gain from before
  the better move, never a balance. The natural capture (the cheapest capturer) that wins nothing
  is said as the trade it is when the search takes back at once and nothing is lost after it
  ("if they take it with axb5, axb5 takes back: an even trade"); otherwise nothing is said.
- `threatOf(fenBefore, bestUci)`: the piece the better move threatens, the most valuable piece it
  newly attacks when that piece is undefended or worth more than the attacker (the lesson's
  threat); null when it threatens nothing.
- `naturalDefense(fenBefore, bestUci, policy)`: the natural defense to that threat, the move the
  human-move model weighs most after the better move (`policy`, UCI to probability at the
  defender's band) when it moves an attacked piece or blocks a bishop, rook or queen; null
  otherwise, and a capture of the attacker is left to the capture answers. Its line, the
  defense first, goes in `TeachArgs.bestDefense`, and the better move's points say what it
  costs when the lesson's line reader finds that line settled with at least a pawn won after
  the defense, shown to the first quiet point where the count is what the line ends with ("if
  they move the queen (Qg4), Nxg4 hxg4, and you have won about 6 pawns of material", "if they
  block with c6, Bxc6 Qe7 Bxe8, and ..."), or a mate ("if they move the queen (Qh5), Rd8# is
  mate").
- `readThreatGate(fen, color)` and `ThreatGateReading`, `buildThreatPrompt` and `ThreatPrompt`,
  `newlyAttackedSquares`, `replyCheckTargets`: the threat gate and the reply-check scan;
  `moveSight`: everything a move now sees, the scan's squares that are not asked for but are
  no mistake to name.
- `theirPlanSign(fenBefore, theirMove, line)`: which of the six plans (`PLAN_SIGNS`, `PlanSign`)
  their move starts, read from the move and the first two of their moves in the line that
  follows (a list of moves from the position handed back to them, or a `PlanLine` from any
  position after it, such as the line after his reply): a pawn storm at his castled king, a
  faster king attack against his minority attack, removing the guard of an outpost square, a
  rook lift that swings toward his king, a center break at his uncastled king, a knight move
  that opens a bishop's line to a pin or check. Null when their move takes a piece, when the
  threat gate already finds something (a loose piece, the f7 strike, a mate in one), or when
  the line wins more than a pawn in four plies: those are tactics, not plans.
  `PLAN_SIGN_WORDS` names each plan and says how to spot it.
- `scanGame(input)` and `ScanInput`, `BlindSpotScan`, `SideCounts`, `CommitEvent`, `MoveKind`,
  `emptySide`, `addSide`, `justMovedShare`, `netHangRate`, `wentBadRate`, `paceOn`,
  `BAD_SQUARE_WINDOW`, `AGE_BUCKETS`: the blind-spot scan.

Catalogue

- `PATTERNS`, `patternById(id)`, `PATTERN_ALIASES` and `Pattern`, `PatternFamily`,
  `PatternDetect`: the named-pattern library.
- `STRUCTURES`, `structureById(id)` and `Structure`; `HOLDER_WRITTEN`, `leversFor`,
  `mirrorRanks`: the structure catalogue and its role-relative levers.
- `ENDGAME_THEORY` and `EndgameTheory`, `EndgameOutcome`, `StudyPriority`.
- `VOCABULARY`: every word the other vocabularies use for an idea (the detectors' tactical kinds
  and reply cards, the puzzle buckets, the review scan's motif tags, the misses deck's themes), by
  the concept it names; `catalogue.concept(word)` resolves it, so one idea has one id and one
  name everywhere (a double check is the double check). `AREA_WORDS`, `isAreaWord(word)`: the
  words that name a phase, the repertoire, a book or planning rather than a concept.

Verdicts (engine evidence in)

- `judgeMove(before, after, color)` and `MoveJudgment`, `JUDGMENT_THRESHOLDS`,
  `JUDGMENT_GLYPH`, `mateSlip`, `gameEndStandInScore`, `wonGameActive` and its bar `WON_GAME_CP`.
- `PRAISE_LOSS_PCT`: the one praise bar. A move that gives up this much win% or more is faulted
  and earns no praise: `techniqueInsights` withholds its technique praise past it, and the live
  coach's held praise stands only under it.

## Ports

`ports.ts` declares the one port, `KnowledgeContent` (with `LessonContent`, `DrillContent`,
`PrincipleContent`): the static teaching content the catalogue links to but does not own. The
adapter `src/adapters/content/knowledge.ts` fills it from src/data (strategy lessons, endgame and
conversion drills, the principles); the app's wiring (`src/app/services/knowledge.ts`,
`knowledgeCatalogue`) and the Node adapter (`src/adapters/node/knowledge`, `createKnowledge()`)
build their catalogues from it. The service reads no files and calls no engine.

## Depends on

`chess.js` (FEN validation, and the permissive SAN parser for rare spellings), `core/chess`,
`core/score`, `core/phase`, `core/game`.

## Invariants

- **One of each.** One piece-value table, one hanging and one loose definition (pin-aware), one
  passed-pawn test, one material count, one pin rule, one shelter scale, one phase (the divider).
- **chess.js parity.** The kernel's mailbox generates the same legal moves as chess.js, in the
  same order, with the same SAN, flags and FENs (an en passant square only when the capture is
  legal). `kernel/mailbox.test.ts` pins it on crafted positions and random playouts;
  `tests/integration/knowledgeKernel.test.ts` sweeps archived positions.
- **Memoised, immutable boards.** `boardOf` returns the same Board for the same FEN while it is in
  the LRU; a Board never changes once built, and every array it returns publicly is a copy. The
  board after a move is found through a second bounded cache, never held by its parent, so a
  replay of the whole archive keeps only the recent positions alive.
- **Geometry proposes, the capture war disposes.** A "wins material" claim is made only when the
  exact capture war (and, for forks and skewers, every legal reply) says so.

- **One word, one concept.** Every vocabulary word names one concept (`VOCABULARY`), and the
  Learner's maps, the motif census and the detectors key their words through it;
  `tests/integration/vocabulary.test.ts` fails on a word no concept carries.
- **One sighting policy.** What became of a named pattern is `patternSightings` (runs, the
  collapse, `judgeSighting`), for the app's review and the routine's ledger alike. The ledger's
  words (`ledgerVerdict`) are the same runs and evidence read in the routine contracts' vocabulary,
  never a second policy, and one threshold (`SIGHTING_LOSS_PCT`) decides both a refuted played
  move and an unsound pattern move.
- **The catalogue derives, never declares.** A concept's detector list is read from the
  registry at the moment it is asked for; a detector registered under any source's id for the
  concept (`iqp` for the isolated queen's pawn) counts for it.
- **Engine-free.** Engine evidence is an argument. A detector that needs it says which fields
  (`needsEngine`) and is skipped without them.

## Tests

Colocated: `kernel/*.test.ts` (the mailbox against chess.js, attack maps and legal attackers,
pins, the capture war with promotions, pins and x-rays, the SEE screen), `facts/*.test.ts`
(`describePosition`, the readings panel, endgames, each sign of danger to the king), `detectors/**/*.test.ts` (each detector on
concrete FENs; the insight corpus; the threat gate's oracle sweep over the archive),
`describeMove.test.ts` (with and without evidence, `safetyCheck`), `catalogue/concepts.test.ts`,
`verdicts.test.ts` (both vocabularies, the soundness bar, the run rule),
`detectors/pattern/sightings.test.ts` (the sighting policy: runs, the verdict rank, the ledger's
reading of a run, the probes a verdict waits on). Cross-service: `tests/integration/knowledgeKernel.test.ts`
(the kernel against chess.js on archived positions, slow tier), `tests/integration/vocabulary.test.ts`
(every word the detectors, the Learner's maps, the misses deck and the review scan use names one catalogue concept),
`tests/integration/knowledgeToolParity.test.ts` (the tools' board readings against the copies
they carried, archive-wide, parity tier) and `tests/integration/indexToolParity.test.ts`
(pattern-scan, pattern-months and phase-index against the tools they replaced, parity tier). The
routine's tool shims have parity tests in `tests/` (`captureCopies`, `structureIndex`,
`patternScan`, `evalDeck`, `transferTest`, `style`).

## How the app and the routines call it

The app imports `src/services/knowledge` (index.ts) directly for the pure functions, and
`knowledgeCatalogue` from `src/app/services/knowledge.ts` for the content-linked catalogue.
The `coach knowledge` CLI command (`describe`, `readings`, `move`, `safety`, `concept`,
`concepts`, `detectors`) reads the Node instance. The routines' tools require the service
through the tsx bridge: `tools/coach-review/lib/knowledge.cjs` is the service, and
`lib/coach.cjs` is the service plus core/score's `winPercent` (what the tools loaded as the
`.cache/coach.cjs` bundle). Every board reading the tools print or publish comes from here:
the decks (quiet, eval, mistake, reply-check, commit-check), the indexes (structure, position,
phase), style, career, the rule graph, the pattern ledger and census, the transcripts and the
video. setup.cjs builds no knowledge bundle; its smoke checks read positions through
`lib/coach.cjs`. The Game Review service (`src/services/review`) reads the endgame reader,
`teachMove` and the judge from this index, so what `analyze.cjs` archives and what the app's
review shows come from the same readings.
