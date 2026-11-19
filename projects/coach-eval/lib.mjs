// What coach-eval's scripts share: the bare task's prompt, which gives a model the
// position, the move played and the player's side and rating, and the rubric, with
// none of the facts the app's code has checked.

export const PROJECT = 'coach-eval'
export const BARE_VERSION = 1

export const BARE_SYSTEM = [
  'You are a chess coach. A club player made a move in one of their games, and the move was a mistake.',
  'Write the explanation they read in their game review: three to five short sentences, at most 90 words, in plain words for a player rated about the rating given, speaking to the player as "you".',
  'Cover these in order: (1) what the move played allowed: your opponent\'s best reply, what it does and what it costs;',
  '(2) the target the play turns on, such as a loose piece, a piece that can be forked or pinned, or a weak square near a king;',
  '(3) the better move, and how it deals with that reply or what it does first;',
  '(4) one habit for next time that fits this moment, such as looking for checks, captures and threats first, counting a piece\'s attackers and defenders, or asking what your opponent\'s best reply is.',
  'Call the other side "your opponent" or "they". Do not use headings, lists or markdown. Write only the explanation.',
].join(' ')

export function bareMessagesOf(m) {
  const moment = {
    you_play: m.mover === 'w' ? 'White' : 'Black',
    player_rating: m.rating,
    position_before_the_move_fen: m.fen,
    move_played: m.played.san,
  }
  return [
    { role: 'system', content: BARE_SYSTEM },
    { role: 'user', content: `The moment:\n${JSON.stringify(moment, null, 1)}` },
  ]
}
