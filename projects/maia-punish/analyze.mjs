// The punish-calibration check over events.json, by the rule in README.md
// (fixed before any statistic was computed): Brier scores against two
// leave-one-game-out baselines with a game bootstrap, and calibration bins.
//
//   node projects/maia-punish/analyze.mjs [--events FILE] [--out DIR]   # writes report.txt, results.json and calibration.json
//
// calibration.json holds the calibration bins report.txt prints, for a figure;
// results.json is unchanged by it, so a recompute still matches the records'.
import fs from 'node:fs';
import { join } from 'node:path';
import { privateDir } from '../../bridge/lib/lab.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const EVENTS = opt('--events', join(privateDir('maia-punish'), 'events.json'));
const OUT = opt('--out', privateDir('maia-punish'));
const { events: EV, skips } = JSON.parse(fs.readFileSync(EVENTS, 'utf8'));
const CASES = JSON.parse(fs.readFileSync(join(privateDir('accuracy-vs-chesscom'), 'cases.json'), 'utf8')).map((c) => c.id);
const SEED = 20261012, B = 1000, Z = 1.959963984540054;
const BINS = [[0, 0.1], [0.1, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0]];
const DIRS = ['player-err', 'opp-err'];
const SETS = { EXACT: 'inExact', ALL: 'inAll' };
const out = [];
const P = (s = '') => { out.push(s); };
const f3 = (x) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : x.toFixed(3));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function wilson(k, n) {
  if (n === 0) return [NaN, NaN];
  const p = k / n, z2 = Z * Z, denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [centre - half, centre + half];
}
function fitLogit(xs, ys) {
  let b0 = 0, b1 = 0;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = 1e-9, h01 = 0, h11 = 1e-9;
    for (let i = 0; i < xs.length; i++) {
      const p = 1 / (1 + Math.exp(-(b0 + b1 * xs[i])));
      const w = p * (1 - p), r = ys[i] - p;
      g0 += r; g1 += r * xs[i];
      h00 += w; h01 += w * xs[i]; h11 += w * xs[i] * xs[i];
    }
    const det = h00 * h11 - h01 * h01;
    const d0 = (h11 * g0 - h01 * g1) / det, d1 = (-h01 * g0 + h00 * g1) / det;
    b0 += d0; b1 += d1;
    if (Math.abs(d0) + Math.abs(d1) < 1e-10) break;
  }
  return [b0, b1];
}
// Leave-one-game-out predictions for the outcome key yKey, within the event set S.
function looPreds(S, yKey) {
  const games = [...new Set(S.map((e) => e.game))];
  const pred = new Map();
  for (const g of games) {
    const rest = S.filter((e) => e.game !== g);
    const ys = rest.map((e) => (e[yKey] ? 1 : 0));
    const base = ys.reduce((a, b) => a + b, 0) / ys.length;
    const [b0, b1] = fitLogit(rest.map((e) => e.errorLossPct / 10), ys);
    for (const e of S.filter((x) => x.game === g)) pred.set(e, { base, lr: 1 / (1 + Math.exp(-(b0 + b1 * (e.errorLossPct / 10)))) });
  }
  return pred;
}
const brier = (ps, ys) => ps.reduce((a, p, i) => a + (p - (ys[i] ? 1 : 0)) ** 2, 0) / ps.length;
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

// Brier comparison for one outcome key with a game bootstrap.
function brierBlock(S, yKey, label) {
  const pred = looPreds(S, yKey);
  const ys = S.map((e) => e[yKey]);
  const qs = S.map((e) => e.q), bs = S.map((e) => pred.get(e).base), ls = S.map((e) => pred.get(e).lr);
  const bq = brier(qs, ys), bb = brier(bs, ys), bl = brier(ls, ys);
  // per-game sums for a bootstrap over games
  const per = new Map();
  S.forEach((e, i) => {
    const g = per.get(e.game) ?? { n: 0, q: 0, b: 0, l: 0 };
    g.n++; g.q += (qs[i] - (ys[i] ? 1 : 0)) ** 2; g.b += (bs[i] - (ys[i] ? 1 : 0)) ** 2; g.l += (ls[i] - (ys[i] ? 1 : 0)) ** 2;
    per.set(e.game, g);
  });
  const rng = mulberry32(SEED);
  const dB = [], dL = [];
  for (let b = 0; b < B; b++) {
    let n = 0, q = 0, bs2 = 0, l = 0;
    for (let k = 0; k < CASES.length; k++) {
      const g = per.get(CASES[Math.floor(rng() * CASES.length)]);
      if (!g) continue;
      n += g.n; q += g.q; bs2 += g.b; l += g.l;
    }
    dB.push(q / n - bs2 / n); dL.push(q / n - l / n);
  }
  const iB = [pct(dB, 0.025), pct(dB, 0.975)], iL = [pct(dL, 0.025), pct(dL, 0.975)];
  P(`  Brier (${label}, n=${S.length}): q=${f3(bq)}  base-rate LOGO=${f3(bb)}  LR(lossPct) LOGO=${f3(bl)}`);
  P(`    q minus base-rate: ${f3(bq - bb)}  95% bootstrap [${f3(iB[0])}, ${f3(iB[1])}]  ${iB[1] < 0 ? 'beats' : 'does NOT beat'} base rate`);
  P(`    q minus LR:        ${f3(bq - bl)}  95% bootstrap [${f3(iL[0])}, ${f3(iL[1])}]  ${iL[1] < 0 ? 'beats' : 'does NOT beat'} LR`);
  return { bq, bb, bl, iB, iL, pass: iB[1] < 0 && iL[1] < 0 };
}

const results = {};
const calibration = {};
for (const [setName, flag] of Object.entries(SETS)) {
  P('');
  P(`==================== SET ${setName} (${setName === 'EXACT' ? 'spec: reply evidence verified or terminal' : 'sensitivity: every non-book reply'}) ====================`);
  for (const dir of DIRS) {
    const S = EV.filter((e) => e.dir === dir && e[flag]);
    const games = new Set(S.map((e) => e.game)).size;
    const k1 = S.filter((e) => e.E1).length, k2 = S.filter((e) => e.E2).length;
    const mq = S.reduce((a, e) => a + e.q, 0) / S.length;
    P('');
    P(`--- ${dir}: n=${S.length} events in ${games} games; E1 (plays the best reply) ${k1}/${S.length}=${f3(k1 / S.length)}; E2 (reply within 2 win%) ${k2}/${S.length}=${f3(k2 / S.length)}; mean q=${f3(mq)}`);
    // calibration table for E1
    P('  Calibration for E1 (bins of q):');
    P('    bin           n   meanQ   obsE1   Wilson95        gap-rule(n>=15)  alt-rule');
    const violations = [], altViol = [];
    const bins = (calibration[`${setName}|${dir}`] = []);
    BINS.forEach(([a, b], bi) => {
      const inb = S.filter((e) => (bi === BINS.length - 1 ? e.q >= a && e.q <= b : e.q >= a && e.q < b));
      const n = inb.length;
      if (n === 0) { P(`    [${a},${b}${bi === BINS.length - 1 ? ']' : ')'}`.padEnd(14) + ' 0   (empty)'); return; }
      const k = inb.filter((e) => e.E1).length, mean = inb.reduce((s, e) => s + e.q, 0) / n, obs = k / n;
      const [lo, hi] = wilson(k, n);
      const gapViol = n >= 15 && (mean < lo - 0.1 || mean > hi + 0.1);
      const altV = n >= 15 && (mean < lo || mean > hi) && Math.abs(obs - mean) > 0.1;
      if (gapViol) violations.push(bi);
      if (altV) altViol.push(bi);
      bins.push({ lo: a, hi: b, n, meanQ: mean, observed: obs, wilson: [lo, hi], tested: n >= 15, violates: gapViol, altViolates: altV });
      P(`    [${a},${b}${bi === BINS.length - 1 ? ']' : ')'}`.padEnd(14) + String(n).padStart(3) + '   ' + f3(mean) + '   ' + f3(obs) + '   [' + f3(lo) + ', ' + f3(hi) + ']  ' + (n < 15 ? '(not tested)' : gapViol ? 'VIOLATES' : 'ok').padEnd(18) + (altV ? 'alt-violates' : 'alt-ok'));
    });
    P('  Brier comparisons:');
    const e1 = brierBlock(S, 'E1', 'E1');
    const e2 = brierBlock(S, 'E2', 'E2, secondary');
    const brierOK = e1.pass, calOK = violations.length === 0;
    const verdict = brierOK && calOK ? 'HOLDS' : 'FAILS';
    const why = [!brierOK ? 'Brier part failed (' + [e1.iB[1] < 0 ? null : 'does not beat base rate', e1.iL[1] < 0 ? null : 'does not beat LR'].filter(Boolean).join('; ') + ')' : 'Brier part passed', !calOK ? 'calibration violated in bin(s) ' + violations.map((i) => BINS[i].join('-')).join(', ') : 'calibration passed'].join('; ');
    P(`  VERDICT ${dir} [${setName}]: ${verdict}. ${why}. Sensitivity (alt calibration reading): ${altViol.length === 0 ? 'no change' : 'alt-violates in ' + altViol.map((i) => BINS[i].join('-')).join(', ')}.`);
    results[`${setName}|${dir}`] = { n: S.length, games, k1, k2, mq, e1, e2, violations, altViol, verdict, why };

    // step 5: errors with lossPct >= 10
    const S5 = S.filter((e) => e.errorLossPct >= 10);
    const un = S5.filter((e) => !e.E2), pu = S5.filter((e) => e.E2);
    const [ul, uh] = wilson(un.length, S5.length);
    const mqP = pu.reduce((s, e) => s + e.q, 0) / pu.length, mqU = un.reduce((s, e) => s + e.q, 0) / un.length;
    const qs5 = S5.map((e) => e.q), ys5 = S5.map((e) => e.E2);
    const aucPoint = auc(qs5, ys5);
    const perG = new Map();
    for (const e of S5) (perG.get(e.game) ?? perG.set(e.game, []).get(e.game)).push(e);
    const rng = mulberry32(SEED);
    const aucs = [];
    for (let b = 0; b < B; b++) {
      const draw = [];
      for (let k = 0; k < CASES.length; k++) { const g = perG.get(CASES[Math.floor(rng() * CASES.length)]); if (g) draw.push(...g); }
      const a = auc(draw.map((e) => e.q), draw.map((e) => e.E2));
      if (a !== null) aucs.push(a);
    }
    P(`  Step 5, errors with lossPct>=10 (${dir}): n=${S5.length}; unpunished (E2 false) ${un.length}/${S5.length}=${f3(un.length / S5.length)} [${f3(ul)}, ${f3(uh)}]; mean q punished=${f3(mqP)} (n=${pu.length}), unpunished=${f3(mqU)} (n=${un.length}); AUC of q for E2=${f3(aucPoint)} bootstrap95% [${f3(pct(aucs, 0.025))}, ${f3(pct(aucs, 0.975))}] (${aucs.length} valid draws)`);
    results[`${setName}|${dir}|step5`] = { n: S5.length, unpunished: un.length, mqP, mqU, aucPoint, aucLo: pct(aucs, 0.025), aucHi: pct(aucs, 0.975) };
  }
}

function auc(qs, ys) {
  const idx = qs.map((_, i) => i).sort((a, b) => qs[a] - qs[b]);
  const rank = new Array(qs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && qs[idx[j + 1]] === qs[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rank[idx[k]] = avg;
    i = j + 1;
  }
  let nPos = 0, nNeg = 0, rPos = 0;
  ys.forEach((y, k) => { if (y) { nPos++; rPos += rank[k]; } else nNeg++; });
  if (nPos === 0 || nNeg === 0) return null;
  return (rPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

const header = [
  `M1 report. Events: ${EV.length} (exact ${EV.filter((e) => e.inExact).length}), games: ${new Set(EV.map((e) => e.game)).size} of ${CASES.length}.`,
  `Skipped: ${JSON.stringify(skips)}`,
  `Bootstrap: ${B} draws over the ${CASES.length} games, seed ${SEED}. Baselines: leave-one-game-out for both the base rate and the LR on errorLossPct/10.`,
];
fs.writeFileSync(join(OUT, 'report.txt'), [...header, ...out].join('\n') + '\n');
fs.writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
fs.writeFileSync(join(OUT, 'calibration.json'), JSON.stringify(calibration, null, 1) + '\n');
console.log([...header, ...out].join('\n'));
