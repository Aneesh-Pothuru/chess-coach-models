#!/usr/bin/env node
// The endgame set's key moments, graded: the chain reproduce.mjs runs (cases,
// the capture searches, cases again, the defense searches, cases again) over
// the games endgames.mjs drew and the phone evidence build-evidence.mjs built
// for them, under the app checkout the bridge names (CHESS_DIR: the pinned app
// or a candidate). The moments whose position before the move the document's
// own division puts in the endgame are then kept, with each one's split, in
// <out>/cases.json, which grade.mjs grades and results.mjs records.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone \
//     --games private/explain-top-move/endgames/games.json \
//     --out private/explain-top-move/endgames/evidence                       (first)
//   bridge/run.sh projects/explain-top-move/endgame-cases.mjs --out DIR [--searches DIR] [--games FILE] [--evidence DIR]
//
// --searches DIR reads the capture and defense searches from DIR (a base's
// all/ folder) instead of searching again, so a candidate is read on the same
// searches as the base it is compared with. --games and --evidence default to
// the endgame set's. Everything written names games, so it all stays under
// private/.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chess, LAB_DIR, privateDir, projectDir } from '../../bridge/lib/chess.mjs';

const FLOW = 'explain-top-move';
const SET = privateDir(`${FLOW}/endgames`);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? resolve(args[i + 1]) : d; };
const out = opt('--out', null);
const searchesFrom = opt('--searches', null);
if (!out) {
  console.error('usage: endgame-cases.mjs --out DIR [--searches DIR] [--games FILE] [--evidence DIR]');
  process.exit(2);
}
const gamesFile = opt('--games', join(SET, 'games.json'));
const evidence = opt('--evidence', join(SET, 'evidence'));

const run = (script, ...a) => execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [join(projectDir(FLOW), script), ...a], {
  cwd: LAB_DIR, stdio: ['ignore', 'ignore', 'inherit'],
});

const all = join(out, 'all');
rmSync(out, { recursive: true, force: true });
mkdirSync(all, { recursive: true });
const probes = join(all, 'probes.json');
const defenses = join(all, 'defenses.json');
const cases = (...extra) => run('build-cases.mjs', '--games', gamesFile, '--evidence', evidence, '--out', all, '--probes', probes, '--defenses', defenses, ...extra);
if (searchesFrom) {
  copyFileSync(join(searchesFrom, 'probes.json'), probes);
  if (existsSync(join(searchesFrom, 'defenses.json'))) copyFileSync(join(searchesFrom, 'defenses.json'), defenses);
  console.error(`[endgames] cases on the searches in ${searchesFrom}`);
  cases();
} else {
  console.error('[endgames] cases, without searches');
  cases();
  console.error('[endgames] probes: the capture searches the best lines decline');
  run('probes.mjs', '--cases', join(all, 'cases.json'), '--out', probes);
  console.error('[endgames] cases again, with the probes');
  cases();
  console.error('[endgames] defenses: the natural defenses to the best moves\' threats');
  run('defenses.mjs', '--cases', join(all, 'cases.json'), '--out', defenses, '--games', gamesFile);
  console.error('[endgames] cases again, with the defenses');
  cases();
}

const { phaseAtIndex } = await chess('src/core/phase/index.ts');
const games = new Map(JSON.parse(readFileSync(gamesFile, 'utf8')).map((g) => [String(g.id), g]));
const divisions = new Map();
const divisionOf = (id) => {
  if (!divisions.has(id)) divisions.set(id, JSON.parse(readFileSync(join(evidence, 'phone', `${id}.json`), 'utf8')).division);
  return divisions.get(id);
};
const moments = JSON.parse(readFileSync(join(all, 'cases.json'), 'utf8'));
const kept = moments
  .filter((m) => phaseAtIndex(divisionOf(String(m.game)), m.ply - 1) === 'endgame')
  .map((m) => ({ ...m, split: games.get(String(m.game)).split }));
writeFileSync(join(out, 'cases.json'), `${JSON.stringify(kept, null, 2)}\n`);
console.error('[endgames] grades');
run('grade.mjs', join(out, 'cases.json'), '--out', join(out, 'grades.json'));
execFileSync(process.execPath, [join(projectDir(FLOW), 'results.mjs'), out], { stdio: ['ignore', 'ignore', 'inherit'] });

const count = (split) => kept.filter((m) => m.split === split).length;
console.log(JSON.stringify({
  moments: moments.length,
  endgame: kept.length,
  train: count('train'),
  test: count('test'),
  games: new Set(kept.map((m) => String(m.game))).size,
  out: out.replace(`${LAB_DIR}/`, ''),
}, null, 2));
