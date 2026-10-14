#!/usr/bin/env node
// The searches the explanation's capture answers rest on, as the routine
// makes them (services/review pipeline/captures.ts): for every key moment
// whose better move puts a piece where the other side can take it, and whose
// best line declines the capture (the rook lands en prise and the reply
// is a quiet move, not the capture), a search of each capture knowledge
// `declinedCaptures` picks (two at most, the cheapest capturer first), from
// the position after the better move, at the routine's punish budget. Written
// as the review document's `ext.captures` (CaptureProbe) per game, which
// build-cases.mjs adds to each re-read document. The cases carry no game
// history, so each search starts from the position before the move.
//
//   bridge/run.sh projects/explain-top-move/probes.mjs [--cases FILE] [--out FILE]
//
// --cases defaults to private/explain-top-move/cases.json (build-cases.mjs),
// --out to private/explain-top-move/probes.json, where build-cases.mjs reads
// it. Both name games, so neither leaves private/.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs';

const ROOT = CHESS_DIR;
const HERE = privateDir('explain-top-move');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? resolve(args[i + 1]) : d; };
const casesPath = opt('--cases', join(HERE, 'cases.json'));
const out = opt('--out', join(HERE, 'probes.json'));
const BUDGET = { nodes: 600_000 };

const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { createNodeEngine } = await load('src/adapters/node/engine/index.ts');
const { position } = await load('src/core/chess/index.ts');
const { declinedCaptures } = await load('src/services/knowledge/index.ts');
const engine = createNodeEngine({ root: ROOT, tablebase: false, evalCache: false, human: false });

const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const byGame = {};
let moments = 0, searched = 0;
for (const c of cases) {
  if (!c.texts?.lessonFor || !c.bestUci || c.bestUci === c.uci) continue;
  const captures = declinedCaptures(c.fenBefore, c.bestUci, c.bestPvUci ?? []);
  if (!captures.length) continue;
  moments++;
  for (const capture of captures) {
    const r = await engine.scoreMove(position(c.fenBefore, [c.bestUci]), capture, { budget: BUDGET });
    searched++;
    if (!r.pv?.length || r.pv[0] !== capture) continue;
    (byGame[c.game] ??= []).push({ ply: c.index, best: c.bestUci, capture, pv: [...r.pv], score: r.score ?? null });
  }
}
engine.dispose();
writeFileSync(out, `${JSON.stringify({ budget: BUDGET, games: byGame }, null, 1)}\n`);
console.log(JSON.stringify({ moments, searched, kept: Object.values(byGame).flat().length, out }));
