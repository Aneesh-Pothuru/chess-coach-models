#!/usr/bin/env node
// The numbers every keep/revert decision on the explanations rests on,
// recomputed from each variant's per-moment grades: per split, the share of
// key moments graded faithful, concrete and named_deep, each with a 95%
// bootstrap interval over GAMES (a game's moments share its evidence, so
// games are the unit), every variant's paired difference from the baseline
// on the same moments, and how many moments' visible texts the variant
// changed.
//
//   node projects/explain-top-move/summarize.mjs [--flow DIR] [--records DIR] [--write] [--json]
//
// --flow is the private flow directory (_state.json and each variant's
// results.jsonl, which name moments); --records the published one, whose
// metrics.md --write updates between the aggregate markers. A variant's
// change line is the first line of its change.md, in the flow directory or
// the published one. Only aggregates leave this script.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hillclimbDir, privateDir } from '../../bridge/lib/lab.mjs';

const FLOW = 'explain-top-move';
const B = 4000;
const DIMS = ['faithful', 'concrete', 'named_deep', 'faithfulAll'];

// A seeded generator, so intervals do not wander between rebuilds.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (xs, q) => { const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : NaN; };

/** The mean over moments and its 95% interval, resampling games. */
function boot(groups, seed) {
  const games = [...groups.keys()];
  const mean = gs => { let s = 0, n = 0; for (const k of gs) for (const v of groups.get(k)) { s += v; n++; } return n ? s / n : NaN; };
  const rng = mulberry32(seed);
  const draws = [];
  for (let b = 0; b < B; b++) draws.push(mean(games.map(() => games[Math.floor(rng() * games.length)])));
  return { est: mean(games), lo: pct(draws, 0.025), hi: pct(draws, 0.975), n: games.reduce((s, k) => s + groups.get(k).length, 0) };
}
const fmtRate = x => `${(100 * x.est).toFixed(1)}% [${(100 * x.lo).toFixed(1)}, ${(100 * x.hi).toFixed(1)}]`;
const fmtDelta = x => `${x.est >= 0 ? '+' : ''}${(100 * x.est).toFixed(1)} [${(100 * x.lo).toFixed(1)}, ${(100 * x.hi).toFixed(1)}]`;

const gameOf = id => id.slice(0, id.lastIndexOf('-'));

/** The split's moments grouped by game (game -> values), less the baseline's value when one is given. */
function byGame(grades, split, which, dim, base) {
  const out = new Map();
  for (const [id, m] of grades) {
    const game = gameOf(id);
    if (split.get(game) !== which) continue;
    let value = Number(m[dim]);
    if (base) { const b = base.get(id); if (!b) continue; value -= Number(b[dim]); }
    if (!out.has(game)) out.set(game, []);
    out.get(game).push(value);
  }
  return out;
}

/** One split's rates (each {est, lo, hi, n}) from per-moment grades keyed by moment id. */
export function rates(grades, split, which) {
  return Object.fromEntries(DIMS.map((d, i) => [d, boot(byGame(grades, split, which, d), 11 + i)]));
}

/**
 * Every variant's aggregates from a flow directory: `rows` for machines (no
 * moment appears in them), `markdown` for metrics.md.
 */
export function summarize({ flow, records = null }) {
  const state = JSON.parse(readFileSync(join(flow, '_state.json'), 'utf8'));
  const split = new Map([...state.train_ids.map(id => [String(id), 'train']), ...state.test_ids.map(id => [String(id), 'test'])]);
  const has = (d, f) => existsSync(join(flow, d, f));
  const variants = readdirSync(flow)
    .filter(d => /^(baseline|v[1-9]\d*[a-z]?)$/.test(d) && (has(d, 'results.jsonl') || has(d, 'grades.json')))
    .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) || a.localeCompare(b)));

  /** A variant's per-moment grades: its kept results.jsonl (results.mjs), else its full grades.json. */
  const grades = v => new Map(
    (has(v, 'results.jsonl')
      ? readFileSync(join(flow, v, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : JSON.parse(readFileSync(join(flow, v, 'grades.json'), 'utf8'))
    ).map(m => [m.id, m]),
  );
  const changeLine = v => {
    if (v === 'baseline') return 'baseline';
    const p = [flow, records].filter(Boolean).map(d => join(d, v, 'change.md')).find(existsSync);
    if (!p) return '(no change.md)';
    return readFileSync(p, 'utf8').split('\n').map(s => s.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
  };

  const base = variants.includes('baseline') ? grades('baseline') : null;
  const rows = [];
  const lines = [];
  lines.push(`Recomputed from each variant's per-moment grades (results.jsonl); 95% intervals from ${B} bootstrap draws over games (seeded). Rates are shares of key moments; differences are in percentage points, paired on the same moments.`, '');
  for (const which of ['test', 'train']) {
    lines.push(`### ${which}`, '');
    lines.push('| variant | change | moments | faithful | concrete | named_deep | faithful vs baseline | concrete vs baseline | texts changed |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const v of variants) {
      const g = grades(v);
      const r = rates(g, split, which);
      const paired = base && v !== 'baseline' ? Object.fromEntries(['faithful', 'concrete'].map((d, i) => [d, boot(byGame(g, split, which, d, base), 31 + i)])) : null;
      let changed = '-';
      if (v !== 'baseline' && base) {
        let n = 0;
        for (const [id, m] of g) if (split.get(gameOf(id)) === which && m.textHash && m.textHash !== base.get(id)?.textHash) n++;
        changed = String(n);
      }
      rows.push({ split: which, variant: v, moments: r.faithful.n, ...r, faithfulVsBaseline: paired?.faithful ?? null, concreteVsBaseline: paired?.concrete ?? null, textsChanged: changed === '-' ? null : Number(changed) });
      lines.push(`| ${v} | ${changeLine(v)} | ${r.faithful.n} | ${fmtRate(r.faithful)} | ${fmtRate(r.concrete)} | ${fmtRate(r.named_deep)} | ${paired ? fmtDelta(paired.faithful) : '-'} | ${paired ? fmtDelta(paired.concrete) : '-'} | ${changed} |`);
    }
    lines.push('');
  }
  return { rows, markdown: lines.join('\n') };
}

/** Replaces the block between the aggregate markers in a metrics.md. */
export function writeMetrics(path, markdown) {
  const md = readFileSync(path, 'utf8');
  const start = '<!-- aggregates:start -->', end = '<!-- aggregates:end -->';
  const i = md.indexOf(start), j = md.indexOf(end);
  if (i < 0 || j < i) throw new Error(`${path} has no aggregate markers`);
  writeFileSync(path, `${md.slice(0, i + start.length)}\n${markdown}\n${md.slice(j)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const flow = opt('--flow', join(privateDir(FLOW), 'state'));
  const records = opt('--records', hillclimbDir(FLOW));
  const out = summarize({ flow, records });
  console.log(args.includes('--json') ? JSON.stringify(out.rows, null, 2) : out.markdown);
  if (args.includes('--write')) {
    writeMetrics(join(records, 'metrics.md'), out.markdown);
    console.error(`wrote ${join(records, 'metrics.md')}`);
  }
}
