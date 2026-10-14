// The numbers every keep/revert decision rests on, recomputed from the raw
// rows (never from an aggregate field): per variant and split, the mean
// absolute error against chess.com, the share of sides within 5 points, the
// signed bias and Pearson's r over sides, each with a 95% bootstrap interval
// over GAMES (a game's two sides share its evidence, so games are the unit);
// and every variant's paired difference from the baseline on the same games.
//
//   node projects/accuracy-vs-chesscom/summarize.mjs [--flow DIR] [--records DIR] [--write] [--json]
//
// --flow is the private flow directory (_state.json and each variant's
// results.jsonl, which name games); --records the published one, whose
// change.md files label the variants and whose metrics.md --write updates
// between the aggregate markers. Only aggregates leave this script.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hillclimbDir, privateDir } from '../../bridge/lib/lab.mjs';

const FLOW = 'accuracy-vs-chesscom';
const B = 4000;

// A seeded generator, so intervals do not wander between rebuilds.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-side points for a game under a profile suffix: [ours, chess.com] pairs. */
function sides(g, sfx) {
  const out = [];
  for (const side of ['white', 'black']) {
    const ours = g[`ours_${side}${sfx}`];
    const cc = g[`cc_${side}`];
    if (typeof ours === 'number' && Number.isFinite(ours) && typeof cc === 'number') out.push([ours, cc]);
  }
  return out;
}
const STATS = {
  mae: ps => ps.length ? ps.reduce((s, [o, c]) => s + Math.abs(o - c), 0) / ps.length : NaN,
  within5: ps => ps.length ? ps.filter(([o, c]) => Math.abs(o - c) <= 5).length / ps.length : NaN,
  bias: ps => ps.length ? ps.reduce((s, [o, c]) => s + (o - c), 0) / ps.length : NaN,
  r: ps => {
    const n = ps.length;
    if (n < 3) return NaN;
    const mo = ps.reduce((s, [o]) => s + o, 0) / n, mc = ps.reduce((s, [, c]) => s + c, 0) / n;
    let so = 0, sc = 0, soc = 0;
    for (const [o, c] of ps) { so += (o - mo) ** 2; sc += (c - mc) ** 2; soc += (o - mo) * (c - mc); }
    return so > 0 && sc > 0 ? soc / Math.sqrt(so * sc) : NaN;
  },
};
const pct = (xs, q) => { const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : NaN; };

/** A statistic and its 95% interval, resampling games. */
function boot(ids, perGame, stat, rng) {
  const all = ids.flatMap(id => perGame.get(id) ?? []);
  const point = stat(all);
  const draws = [];
  for (let b = 0; b < B; b++) {
    const ps = [];
    for (let k = 0; k < ids.length; k++) ps.push(...(perGame.get(ids[Math.floor(rng() * ids.length)]) ?? []));
    draws.push(stat(ps));
  }
  return { point, lo: pct(draws, 0.025), hi: pct(draws, 0.975) };
}
/** Paired: the same resampled games under both variants. */
function bootDelta(ids, a, b, stat, rng) {
  const common = ids.filter(id => a.has(id) && b.has(id));
  const val = (m, pick) => stat(pick.flatMap(id => m.get(id)));
  const point = val(a, common) - val(b, common);
  const draws = [];
  for (let k = 0; k < B; k++) {
    const pick = Array.from({ length: common.length }, () => common[Math.floor(rng() * common.length)]);
    draws.push(val(a, pick) - val(b, pick));
  }
  return { point, lo: pct(draws, 0.025), hi: pct(draws, 0.975), n: common.length };
}

const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const ci = ({ point, lo, hi }, d = 1) => `${f(point, d)} [${f(lo, d)}, ${f(hi, d)}]`;
const signed = ({ point, lo, hi }, d = 1) => `${point >= 0 ? '+' : ''}${f(point, d)} [${f(lo, d)}, ${f(hi, d)}]`;
const percent = ({ point, lo, hi }) => ({ point: point * 100, lo: lo * 100, hi: hi * 100 });

/**
 * Every variant's aggregates from a flow directory: `rows` for machines (no
 * game appears in them), `markdown` for metrics.md.
 */
export function summarize({ flow, records = null }) {
  const state = JSON.parse(readFileSync(join(flow, '_state.json'), 'utf8'));
  const variants = readdirSync(flow)
    .filter(d => /^(baseline|v[1-9]\d*)$/.test(d) && existsSync(join(flow, d, 'results.jsonl')))
    .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : Number(a.slice(1)) - Number(b.slice(1))));

  const rows = v => {
    const out = new Map();
    for (const ln of readFileSync(join(flow, v, 'results.jsonl'), 'utf8').split('\n')) {
      if (!ln.trim()) continue;
      const r = JSON.parse(ln);
      if (r.status && r.status !== 'ok') continue;
      out.set(String(r.prompt_id), r.grade);
    }
    return out;
  };
  const changeLine = v => {
    if (v === 'baseline') return 'baseline';
    const p = [records, flow].filter(Boolean).map(d => join(d, v, 'change.md')).find(existsSync);
    if (!p) return '(no change.md)';
    return readFileSync(p, 'utf8').split('\n').map(s => s.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
  };

  const splits = { test: (state.test_ids ?? []).map(String), train: (state.train_ids ?? []).map(String) };
  const profiles = ['', '_phone'];
  const data = Object.fromEntries(variants.map(v => {
    const rs = rows(v);
    return [v, Object.fromEntries(profiles.map(sfx => [sfx, new Map([...rs].map(([id, g]) => [id, sides(g, sfx)]))]))];
  }));

  const table = [];
  const lines = [];
  lines.push(`Recomputed from each variant's results.jsonl; 95% intervals from ${B} bootstrap draws over games (seeded). MAE and bias in accuracy points, ours minus chess.com.`, '');
  for (const [sfx, label, profile] of [['', 'routine evidence (headline)', 'routine'], ['_phone', 'phone evidence', 'phone']]) {
    lines.push(`### ${label}`, '');
    lines.push('| variant | change | test MAE | train MAE | test within 5 | test bias | test r | test MAE vs baseline (paired) |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const v of variants) {
      const rng = mulberry32(20261009);
      const d = data[v][sfx];
      const t = boot(splits.test, d, STATS.mae, rng);
      const tr = boot(splits.train, d, STATS.mae, rng);
      const w = boot(splits.test, d, STATS.within5, rng);
      const bi = boot(splits.test, d, STATS.bias, rng);
      const r = boot(splits.test, d, STATS.r, rng);
      const delta = v === 'baseline' || !data.baseline ? null : bootDelta(splits.test, d, data.baseline[sfx], STATS.mae, rng);
      table.push({ profile, variant: v, testMae: t, trainMae: tr, testWithin5: percent(w), testBias: bi, testR: r, testMaeVsBaseline: delta });
      lines.push(`| ${v} | ${changeLine(v)} | ${ci(t)} | ${ci(tr)} | ${ci(percent(w), 0)}% | ${signed(bi)} | ${ci(r, 2)} | ${delta ? signed(delta) : '-'} |`);
    }
    lines.push('');
  }
  return { rows: table, markdown: lines.join('\n') };
}

/** Replaces the block between the aggregate markers in a metrics.md. */
export function writeMetrics(path, markdown) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const start = '<!-- aggregates:start -->', end = '<!-- aggregates:end -->';
  const block = `${start}\n${markdown}\n${end}`;
  const next = text.includes(start) && text.includes(end)
    ? text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length)
    : `${text.trimEnd()}\n\n## Aggregates per variant\n\n${block}\n`;
  writeFileSync(path, next);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const flow = opt('--flow', join(privateDir(FLOW), 'state'));
  const records = opt('--records', hillclimbDir(FLOW));
  const out = summarize({ flow, records });
  console.log(args.includes('--json') ? JSON.stringify(out.rows, null, 2) : out.markdown);
  if (args.includes('--write')) writeMetrics(join(records, 'metrics.md'), out.markdown);
}
