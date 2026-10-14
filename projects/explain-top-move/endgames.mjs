#!/usr/bin/env node
// The endgame set: games from the routine archive that the accuracy sample
// left out and that reach the endgame by the app's divider (core/phase), drawn
// and split before any lesson is read. The 60 sampled games hold too few
// endgame moments to measure an endgame round on; this set gives the
// explanation rounds their endgame key moments, with a train half to design on
// and a test half to check on.
//
//   bridge/run.sh projects/explain-top-move/endgames.mjs [--games N] [--archive DIR]
//
// A game is eligible when its move list replays, meIsWhite is a boolean, it is
// not in the accuracy sample (private/accuracy-vs-chesscom/cases.json), and the
// divider puts at least MIN_ENDGAME_PLIES of its moves in the endgame. The
// eligible games are sorted by numeric id and shuffled with Fisher-Yates driven
// by mulberry32(SEED); the first N are taken, the first half of them train and
// the second half test. A game id keeps the row from the latest day file, as
// the accuracy sample's builder reads the archive.
//
// Writes private/explain-top-move/endgames/games.json, in the accuracy cases'
// shape (so build-evidence.mjs, build-cases.mjs and defenses.mjs read it with
// --games; the defense searches read the players' ratings) plus each game's
// split and the ply its endgame starts at, and prints counts only. The file
// names games, so it stays under private/.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs';

const SEED = 20261014;
const MIN_ENDGAME_PLIES = 6;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const GAME_URL = /\/game\/live\/(\d+)\/?$/;
const RESULT_WORD = { W: 'win', L: 'loss', D: 'draw' };

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const take = Number(opt('--games', '160'));
const archiveDir = opt('--archive', join(CHESS_DIR, 'coach-log', 'review-analysis'));
if (!Number.isInteger(take) || take < 2 || take % 2) {
  console.error('usage: endgames.mjs [--games N (even, at least 2)] [--archive DIR]');
  process.exit(2);
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rand) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const { divide, phaseAtIndex } = await chess('src/core/phase/index.ts');
const sampled = new Set(JSON.parse(readFileSync(join(privateDir('accuracy-vs-chesscom'), 'cases.json'), 'utf8')).map((c) => String(c.id)));

const latest = new Map();
for (const file of readdirSync(archiveDir).filter((f) => DAY_FILE.test(f)).sort()) {
  for (const row of JSON.parse(readFileSync(join(archiveDir, file), 'utf8'))) {
    const m = typeof row.url === 'string' ? GAME_URL.exec(row.url) : null;
    if (m) latest.set(m[1], { id: m[1], date: DAY_FILE.exec(file)[1], row });
  }
}

const why = { sampled: 0, noMoves: 0, illegal: 0, noColor: 0, shortEndgame: 0 };
const eligible = [];
for (const g of latest.values()) {
  if (sampled.has(g.id)) { why.sampled++; continue; }
  if (!Array.isArray(g.row.sans) || g.row.sans.length === 0) { why.noMoves++; continue; }
  if (typeof g.row.meIsWhite !== 'boolean') { why.noColor++; continue; }
  const board = new Chess();
  const fens = [board.fen()];
  let legal = true;
  for (const san of g.row.sans) {
    try { board.move(san); } catch { legal = false; break; }
    fens.push(board.fen());
  }
  if (!legal) { why.illegal++; continue; }
  const division = divide(fens);
  const plies = g.row.sans.length;
  let from = -1;
  for (let i = 0; i < plies; i++) if (phaseAtIndex(division, i) === 'endgame') { from = i; break; }
  if (from < 0 || plies - from < MIN_ENDGAME_PLIES) { why.shortEndgame++; continue; }
  eligible.push({
    id: g.id,
    game: `cc:${g.id}`,
    url: g.row.url,
    date: g.date,
    playerColor: g.row.meIsWhite ? 'w' : 'b',
    result: RESULT_WORD[g.row.result] ?? null,
    myRating: g.row.myRating ?? null,
    oppRating: g.row.oppRating ?? null,
    plies,
    endgameFrom: from,
  });
}

eligible.sort((a, b) => Number(a.id) - Number(b.id));
if (eligible.length < take) throw new Error(`${eligible.length} eligible games, fewer than the ${take} asked for`);
const drawn = shuffle(eligible.slice(), mulberry32(SEED)).slice(0, take);
drawn.forEach((g, i) => { g.split = i < take / 2 ? 'train' : 'test'; });
drawn.sort((a, b) => Number(a.id) - Number(b.id));

const dir = privateDir('explain-top-move/endgames');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'games.json'), `${JSON.stringify(drawn, null, 2)}\n`);
console.log(JSON.stringify({
  archiveGames: latest.size,
  notEligible: why,
  eligible: eligible.length,
  drawn: drawn.length,
  train: drawn.filter((g) => g.split === 'train').length,
  test: drawn.filter((g) => g.split === 'test').length,
  seed: SEED,
  minEndgamePlies: MIN_ENDGAME_PLIES,
  out: 'private/explain-top-move/endgames/games.json',
}, null, 2));
