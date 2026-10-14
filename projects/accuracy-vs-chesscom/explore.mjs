// The research bench for accuracy-model hypotheses: score an alternative
// accuracy function against chess.com on the TRAIN split (fresh evidence
// from the eval's kept documents) and on the DEV pool (the eligible games the
// eval did not sample, read from the routine's archive), never on the test
// split. A hypothesis that only helps here is not adopted; the eval's own
// rounds decide that, test split included.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/explore.mjs --model current
//   bridge/run.sh projects/accuracy-vs-chesscom/explore.mjs --model ./my-model.mjs [--pool train|dev|both] [--profile routine|phone] [--detail] [--flow DIR]
//
// A model module exports `accuracy(records, color, ctx)` returning a number
// in [0, 100] or null. `records` are the document's PlyRecords (mover, cls,
// lossPct, before/after White-POV scores, winAfter, ply, san); `ctx` carries
// `rootWin`, `division`, `meta` (plies, result, termination, myRating,
// oppRating, playerColor, timeControl) and `lib`, the review service's own
// accuracy module (MOVE_DECAY, moveAccuracy, graded, gameAccuracy,
// summarizeSide). models/current.mjs is today's model with one hook per part;
// models/lichess-v2.mjs is the instrument it replaced.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs';

// The cases, gold, evidence and loop state name the player's games: private/.
const EVAL_DIR = privateDir('accuracy-vs-chesscom');
const ROOT = CHESS_DIR;

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const modelArg = opt('--model', 'current');
const pool = opt('--pool', 'both');
const profile = opt('--profile', 'routine');
const detail = argv.includes('--detail');
const FLOW = opt('--flow', join(EVAL_DIR, 'state'));
const evidenceDir = opt('--evidence', join(EVAL_DIR, 'evidence'));

const load = rel => import(pathToFileURL(join(ROOT, rel)).href);
const [document, replay, run, lib, review] = await Promise.all([
  load('src/services/review/pipeline/document.ts'),
  load('src/services/review/pipeline/replay.ts'),
  load('src/services/review/pipeline/run.ts'),
  load('src/services/review/accuracy.ts'),
  load('src/services/review/index.ts'),
]);
// Whose games the archive holds: the app's own setting, so no account name lives here.
const { DEFAULT_USERNAME: USERNAME } = await load('src/services/learner/level.ts');

const model = modelArg === 'current'
  ? { accuracy: (records, color, ctx) => lib.summarizeSide(records, color, ctx.division).accuracy }
  : await import(pathToFileURL(resolve(modelArg)).href);
if (typeof model.accuracy !== 'function') throw new Error(`${modelArg} does not export accuracy(records, color, ctx)`);

const state = JSON.parse(readFileSync(join(FLOW, '_state.json'), 'utf8'));
const testIds = new Set((state.test_ids ?? []).map(String));
if (!testIds.size) throw new Error('_state.json has no test_ids: draw the split before exploring');
const cases = JSON.parse(readFileSync(join(EVAL_DIR, 'cases.json'), 'utf8'));
const gold = JSON.parse(readFileSync(join(EVAL_DIR, 'gold.json'), 'utf8'));
const lengthBucket = plies => (plies <= 40 ? 'short' : plies <= 80 ? 'medium' : 'long');

/** One game ready to score: its records and context, and chess.com's two numbers. */
function entry(id, doc, meta, cc) {
  if (testIds.has(String(id))) throw new Error(`refusing to read test-split game ${id}`);
  return { id: String(id), records: doc.records, ctx: { rootWin: doc.rootWin, division: doc.division, meta, lib }, cc };
}

const games = { train: [], dev: [] };
if (pool === 'train' || pool === 'both') {
  for (const id of (state.train_ids ?? []).map(String)) {
    const c = cases.find(x => String(x.id) === id);
    const p = join(evidenceDir, profile, `${id}.json`);
    if (!c || !existsSync(p)) { console.error(`train ${id}: no ${profile} evidence yet, skipped`); continue; }
    const stored = JSON.parse(readFileSync(p, 'utf8'));
    const doc = document.buildDocument({
      id: stored.id, game: stored.game, replay: replay.replayGame(stored.game),
      positions: stored.positions.map(x => ({ ...x })), division: stored.division, playerColor: stored.playerColor,
      register: stored.provenance.register, flaggedPlies: stored.coverage.flaggedPlies, verifyBudget: stored.coverage.verifyBudget,
      provenance: { ...stored.provenance, evidenceVersion: run.EVIDENCE_VERSION }, ext: stored.ext,
    });
    const meta = { plies: c.plies, result: c.result, termination: c.termination, myRating: c.myRating, oppRating: c.oppRating, playerColor: c.playerColor, timeControl: c.timeControl };
    games.train.push(entry(id, doc, meta, { white: gold[id].white, black: gold[id].black }));
  }
}
if (pool === 'dev' || pool === 'both') {
  const devPool = JSON.parse(readFileSync(join(EVAL_DIR, 'dev-pool.json'), 'utf8'));
  const byFile = new Map();
  for (const { id, file } of devPool) {
    if (!byFile.has(file)) byFile.set(file, JSON.parse(readFileSync(join(ROOT, 'coach-log', 'review-analysis', file), 'utf8')));
    const row = byFile.get(file).find(r => String(r.url ?? '').endsWith(`/${id}`));
    if (!row || !gold[id]) continue;
    const doc = review.reviewFromArchiveRow(row, { username: USERNAME });
    if (!doc) continue;
    const meta = { plies: row.sans.length, result: row.result === 'W' ? 'win' : row.result === 'L' ? 'loss' : 'draw', termination: row.termination, myRating: row.myRating, oppRating: row.oppRating, playerColor: row.meIsWhite ? 'w' : 'b', timeControl: row.time_control };
    // gold.json, not the row: it carries the corrections against chess.com's API.
    const cc = { white: gold[id].white, black: gold[id].black };
    games.dev.push(entry(id, doc, meta, cc));
  }
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function pearson(ps) {
  if (ps.length < 3) return NaN;
  const mo = mean(ps.map(p => p.ours)), mc = mean(ps.map(p => p.cc));
  let so = 0, sc = 0, soc = 0;
  for (const p of ps) { so += (p.ours - mo) ** 2; sc += (p.cc - mc) ** 2; soc += (p.ours - mo) * (p.cc - mc); }
  return soc / Math.sqrt(so * sc);
}
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
function report(name, ps) {
  const scored = ps.filter(p => Number.isFinite(p.ours));
  const errs = scored.map(p => p.ours - p.cc);
  return `${name.padEnd(16)} sides ${String(scored.length).padStart(3)}/${String(ps.length).padEnd(3)} MAE ${f(mean(errs.map(Math.abs))).padStart(5)}  bias ${f(mean(errs)).padStart(5)}  within5 ${f(100 * mean(errs.map(e => (Math.abs(e) <= 5 ? 1 : 0))), 0).padStart(3)}%  r ${f(pearson(scored), 2)}`;
}

const out = [`model ${modelArg}, ${profile} evidence for train, archive evidence for dev`];
for (const [name, gs] of Object.entries(games)) {
  if (!gs.length) continue;
  const ps = [];
  for (const g of gs) {
    for (const [color, side] of [['w', 'white'], ['b', 'black']]) {
      let ours = null;
      try { ours = model.accuracy(g.records, color, g.ctx); } catch (e) { console.error(`${name} ${g.id} ${side}: ${e?.message || e}`); }
      ps.push({ id: g.id, side, me: g.ctx.meta.playerColor === color, bucket: lengthBucket(g.ctx.meta.plies), result: g.ctx.meta.result, ours: typeof ours === 'number' ? ours : NaN, cc: g.cc[side] });
    }
  }
  out.push('', `== ${name}: ${gs.length} games ==`, report('all', ps));
  for (const b of ['short', 'medium', 'long']) out.push(report(`  ${b}`, ps.filter(p => p.bucket === b)));
  out.push(report('  player', ps.filter(p => p.me)), report('  opponent', ps.filter(p => !p.me)));
  for (const r of ['win', 'loss', 'draw']) out.push(report(`  player ${r}s`, ps.filter(p => p.result === r)));
  if (detail) for (const p of ps) out.push(`    ${p.id} ${p.side.padEnd(5)} ${p.me ? 'player' : 'opp   '} ${p.bucket.padEnd(6)} ours ${f(p.ours)} cc ${f(p.cc)} err ${f(p.ours - p.cc)}`);
}
console.log(out.join('\n'));
