// The bands the app gives each person, shared by the scripts that score the
// player's games and the fit that reads them: the player's chess.com rating
// converted at DEFAULT_LICHESS_OFFSET and his opponents' at
// OPPONENT_LICHESS_OFFSET (an app from before that split converts both at the
// default), each following its owner into either input of Maia.

/** The app's offsets, read from its engine service. */
export function appOffsets(engine) {
  const offsets = { player: engine.DEFAULT_LICHESS_OFFSET, opponents: engine.OPPONENT_LICHESS_OFFSET ?? engine.DEFAULT_LICHESS_OFFSET }
  if (!Number.isFinite(offsets.player) || !Number.isFinite(offsets.opponents)) throw new Error('the app exports no Lichess offset')
  return offsets
}

/** A counted move's bands: the mover's (s) and the opponent's (o), each at its owner's offset. */
export function moveBands(m, offsets, defaultMaiaElo) {
  return {
    s: defaultMaiaElo(m.r, m.me ? offsets.player : offsets.opponents),
    o: defaultMaiaElo(m.ro, m.me ? offsets.opponents : offsets.player),
  }
}

/** The offset a punish event's replier is read at: after the player's error the replier is an opponent. */
export const replierOffset = (dir, offsets) => (dir === 'player-err' ? offsets.opponents : offsets.player)
