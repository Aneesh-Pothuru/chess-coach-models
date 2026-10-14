#!/usr/bin/env node
// The searches the explanation's defense answers rest on, made by the app's
// own routine step (services/review `defenseProbes`): for every key moment
// whose better move threatens a piece (knowledge `threatOf`), the human-move
// model's likeliest reply after the better move, at the defender's band; when
// that reply moves an attacked piece or blocks (knowledge `naturalDefense`),
// the engine's line from it: the better line itself when the defense is the
// engine's reply there, else a search of the defense at the routine's punish
// budget. Written as the review document's `ext.defenses` (DefenseProbe) per
// game, which build-cases.mjs adds to each re-read document. The cases carry
// no game history, so each search starts from the position before the move.
//
//   bridge/run.sh projects/explain-top-move/defenses.mjs [--cases FILE] [--out FILE]
//
// --cases defaults to private/explain-top-move/cases.json (build-cases.mjs),
// --out to private/explain-top-move/defenses.json, where build-cases.mjs reads
// it. The defender's rating is the game's, from the accuracy project's
// cases.json. All three name games, so none leaves private/. An app without
// `defenseProbes` has no defense answers to measure, and the script says so.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs';

const ROOT = CHESS_DIR;
const HERE = privateDir('explain-top-move');
const ACCURACY = privateDir('accuracy-vs-chesscom');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? resolve(args[i + 1]) : d; };
const casesPath = opt('--cases', join(HERE, 'cases.json'));
const out = opt('--out', join(HERE, 'defenses.json'));
const BUDGET = { nodes: 600_000 };

const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { createNodeEngine } = await load('src/adapters/node/engine/index.ts');
const { position, START_FEN } = await load('src/core/chess/index.ts');
const { defenseProbes } = await load('src/services/review/index.ts');
if (typeof defenseProbes !== 'function') throw new Error(`the app at ${ROOT} has no defenseProbes`);
const engine = createNodeEngine({ root: ROOT, tablebase: false, evalCache: false });
// defenseProbes makes none without the model, so a missing model would read as no defenses.
if ((await engine.humanPolicy(position(START_FEN))) === 'unavailable') throw new Error('the human-move model is unavailable');

const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const games = new Map(JSON.parse(readFileSync(join(ACCURACY, 'cases.json'), 'utf8')).map((g) => [String(g.id), g]));
const byMoment = new Map();
for (const c of cases) {
  if (!byMoment.has(c.game)) byMoment.set(c.game, []);
  byMoment.get(c.game).push(c);
}
const byGame = {};
for (const [id, moments] of byMoment) {
  const g = games.get(String(id));
  if (!g) throw new Error(`no accuracy case for game ${id}`);
  // Only the records and positions of the key moments: the step reads nothing else.
  const records = [], fens = [];
  for (const c of moments) {
    records[c.index] = { cls: c.cls, uci: c.uci, bestUci: c.bestUci ?? '', bestPv: c.bestPvUci ?? [], mover: c.mover };
    fens[c.index] = c.fenBefore;
  }
  const rating = (side) => (side === g.playerColor ? g.myRating : g.oppRating);
  const probes = await defenseProbes(
    engine,
    { records, fens, moments: moments.map((c) => c.index) },
    (i) => position(fens[i]),
    { white: { rating: rating('w') }, black: { rating: rating('b') } },
    BUDGET,
    { priority: 'batch' },
  );
  if (probes.length) byGame[id] = probes;
}
engine.dispose();
const kept = Object.values(byGame).flat();
writeFileSync(out, `${JSON.stringify({ budget: BUDGET, games: byGame }, null, 1)}\n`);
console.log(JSON.stringify({ moments: cases.length, defenses: kept.length, searched: kept.filter((p) => p.score !== null).length, out }));
