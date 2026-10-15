#!/usr/bin/env node
// The judge model's pairwise comparison for one round of the explanation
// hill-climb: every key moment whose visible texts differ between two
// variants, shown as two versions (X and Y, assigned by a seeded coin, and
// reversed in the second run), each a list of headings and texts as the app
// lays them out. The judge answers X, Y or same per moment
// (instructions.md); --score applies the round's rule to the two runs.
//
//   bridge/run.sh projects/explain-top-move/judge/pairwise.mjs --old DIR --new DIR --out ROUND_DIR [--seed N]
//   node projects/explain-top-move/judge/pairwise.mjs --score ROUND_DIR [--over ROUND_DIR] [--only FILE]
//
// --old and --new are two variants' case directories (build-cases.mjs, or
// endgame-cases.mjs, whose moments carry their own split);
// ROUND_DIR names moments, so a new round's belongs under
// private/explain-top-move/. The recorded rounds are in the research records
// (evals/explain-top-move/judge/round*/), which --score reads in place.
// --over: a later round that re-judged some moments on their final texts; its
// judgments replace the first round's for the moments it judged.
// --only: a JSON list of moment ids, or sample.mjs's sample.json (its
// counted ids), the only moments the score counts.
//
// The rule, fixed before any run: keep the round if, pooling both runs, the
// new texts are preferred in more than half of the decided (non-same)
// comparisons on train AND on test.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { records } from '../../../bridge/lib/lab.mjs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const RULE = 'keep the round if, pooling both runs, the new texts are preferred in more than half of the decided (non-same) comparisons on train AND on test; same answers are not counted.';

/**
 * Which of a round's two labels is the newer variant: 'new', or, in a round
 * keyed by variant names (round 3's v2 and v3), the later variant.
 */
function newerLabel(key) {
  const labels = [...new Set(Object.values(key).flatMap(k => [k.X, k.Y]))];
  if (labels.includes('new')) return 'new';
  const order = v => { const m = /^v(\d+)([a-z]?)$/.exec(v); if (!m) throw new Error(`a key label that is neither old/new nor a variant: ${v}`); return Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) : 0); };
  return labels.sort((a, b) => order(a) - order(b)).at(-1);
}

/**
 * The pooled tally of a round's two runs, each moment counted once, by the
 * last round that judged it; `only`, a set of moment ids, limits it to those.
 */
export function score(dirs, only = null) {
  const owner = new Map();
  for (const dir of dirs) for (const r of ['r1', 'r2']) for (const id of Object.keys(J(join(dir, `key-${r}.json`)))) owner.set(id, dir);
  const tally = { train: { new: 0, old: 0, same: 0 }, test: { new: 0, old: 0, same: 0 } };
  for (const dir of dirs) {
    for (const r of ['r1', 'r2']) {
      const key = J(join(dir, `key-${r}.json`));
      const newer = newerLabel(key);
      for (const a of J(join(dir, `out-${r}.judge.json`)).answers) {
        const k = key[a.id];
        if (!k || owner.get(a.id) !== dir || (only && !only.has(a.id))) continue;
        const pick = a.choice === 'same' ? 'same' : k[a.choice] === newer ? 'new' : 'old';
        tally[k.split][pick]++;
      }
    }
  }
  const keep = (t) => t.new > (t.new + t.old) / 2;
  return { tally, rule: RULE, keep: keep(tally.train) && keep(tally.test) };
}

const CLASS_LABEL = { brilliant: 'Brilliant', great: 'Great move', best: 'Best move', excellent: 'Excellent', good: 'Good', book: 'Book', forced: 'Forced', inaccuracy: 'Inaccuracy', mistake: 'Mistake', miss: 'Miss', blunder: 'Blunder' };
const moveLabel = (n, mover, san) => (mover === 'w' ? `${n}.${san}` : `${n}...${san}`);
function numbered(line, n, side) {
  const parts = [];
  for (const [i, san] of line.entries()) {
    if (side === 'w') parts.push(`${n}.${san}`);
    else parts.push(i === 0 ? `${n}...${san}` : san);
    if (side === 'b') n++;
    side = side === 'w' ? 'b' : 'w';
  }
  return parts.join(' ');
}
function evalFor(score, mover) {
  if (!score) return '?';
  const sign = mover === 'w' ? 1 : -1;
  if (score.mate != null) { const m = score.mate * sign; return m > 0 ? `you mate in ${m}` : `mated in ${-m}`; }
  const v = (score.cp * sign) / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function build(opt) {
  const { CHESS_DIR } = await import('../../../bridge/lib/chess.mjs');
  const oldDir = resolve(opt('--old')), newDir = resolve(opt('--new')), out = resolve(opt('--out'));
  const seed = Number(opt('--seed') ?? 20261013);
  const { hintWords, revealWords } = await import(pathToFileURL(join(CHESS_DIR, 'src/features/gamereview/retry.ts')).href);
  const state = J(join(records(), '.claude', 'hillclimb', 'explain-top-move', '_state.json'));
  const train = new Set(state.train_ids.map(String));

  /** A moment's texts as the app lays them out: one heading per section, points joined, the line after them. */
  function versionOf(c) {
    const t = c.texts, out = [];
    const num = (line) => (line ? numbered(line.trim().split(/\s+/), c.moveNumber, c.mover) : null);
    if (t.cardShows === 'lesson' && t.lessonFor) {
      const L = t.lessonFor;
      out.push({ heading: 'On the card', text: `${L.headline} ${CLASS_LABEL[c.cls] ?? c.cls}: it cost ${Math.max(1, Math.round(c.lossPct))}% of your winning chances.` });
      if (L.takeaway) out.push({ heading: 'Takeaway', text: L.takeaway });
      if (L.allowed?.san) out.push({ heading: `What ${c.san} allowed: ${L.allowed.san}`, text: [L.allowed.points.join('; '), num(L.allowed.line)].filter(Boolean).join(' · ') });
      if (L.better?.san) out.push({ heading: `What ${L.better.san} does instead`, text: [L.better.points.join('; '), num(L.better.line)].filter(Boolean).join(' · ') });
      if (L.difference?.length) out.push({ heading: 'The difference', text: L.difference.join(' ') });
      if (L.yourMove?.length) out.push({ heading: `What ${c.san} does`, text: L.yourMove.join('; ') });
    } else if (t.commentFor) out.push({ heading: 'On the card', text: t.commentFor });
    const r = t.retryTeaching;
    if (r?.hint) out.push({ heading: 'Retry hint', text: hintWords(r) });
    if (r?.answer) out.push({ heading: 'Retry answer', text: revealWords(r) });
    return out;
  }

  const rng = mulberry32(seed);
  const visible = (c) => JSON.stringify([c.texts?.cardShows, c.texts?.commentFor, c.texts?.lessonFor, c.texts?.retryTeaching]);
  const before = new Map(J(join(oldDir, 'cases.json')).map((c) => [`${c.game}-${c.ply}`, c]));
  const items1 = [], items2 = [], key1 = {}, key2 = {};
  for (const c of J(join(newDir, 'cases.json'))) {
    const id = `${c.game}-${c.ply}`;
    const o = before.get(id);
    if (!o || visible(o) === visible(c)) continue;
    const base = {
      id,
      move: moveLabel(c.moveNumber, c.mover, c.san),
      side: c.mover === 'w' ? 'White' : 'Black',
      fenBefore: c.fenBefore,
      appVerdict: CLASS_LABEL[c.cls] ?? c.cls,
      engine: {
        evalText: `${evalFor(c.before, c.mover)} with the best move, ${evalFor(c.after, c.mover)} after yours`,
        bestMove: c.bestSan ? moveLabel(c.moveNumber, c.mover, c.bestSan) : null,
        bestLine: c.bestPv ? numbered(c.bestPv.slice(0, 6), c.moveNumber, c.mover) : null,
      },
    };
    const split = c.split ?? (train.has(String(c.game)) ? 'train' : 'test');
    const newIsX = rng() < 0.5;
    const [x, y] = newIsX ? [versionOf(c), versionOf(o)] : [versionOf(o), versionOf(c)];
    items1.push({ ...base, versionX: x, versionY: y });
    key1[id] = { split, X: newIsX ? 'new' : 'old', Y: newIsX ? 'old' : 'new' };
    items2.push({ ...base, versionX: y, versionY: x });
    key2[id] = { split, X: newIsX ? 'old' : 'new', Y: newIsX ? 'new' : 'old' };
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'items-r1.json'), JSON.stringify({ items: items1 }, null, 1));
  writeFileSync(join(out, 'items-r2.json'), JSON.stringify({ items: items2 }, null, 1));
  writeFileSync(join(out, 'key-r1.json'), JSON.stringify(key1, null, 1));
  writeFileSync(join(out, 'key-r2.json'), JSON.stringify(key2, null, 1));
  writeFileSync(join(out, 'rule.txt'), `rule: ${RULE}\n`);
  const instructions = join(records(), 'evals', 'explain-top-move', 'judge', 'round3', 'instructions.md');
  if (existsSync(instructions) && !existsSync(join(out, 'instructions.md'))) copyFileSync(instructions, join(out, 'instructions.md'));
  console.log(JSON.stringify({ items: items1.length, train: Object.values(key1).filter((k) => k.split === 'train').length, test: Object.values(key1).filter((k) => k.split === 'test').length, out }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (opt('--score')) {
    const dirs = [resolve(opt('--score')), ...(opt('--over') ? [resolve(opt('--over'))] : [])];
    const only = opt('--only') ? J(resolve(opt('--only'))) : null;
    console.log(JSON.stringify(score(dirs, only ? new Set(Array.isArray(only) ? only : only.counted) : null), null, 1));
  } else {
    await build(opt);
  }
}
