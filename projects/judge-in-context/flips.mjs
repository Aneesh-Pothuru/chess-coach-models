#!/usr/bin/env node
// Which move verdicts change under the proposed rule. The judge reads the
// mover's win% on a curve calibrated to the mover's rating: old is the shipped
// Lichess slope, new is the proposed slope. Every exact-score ply of the 60
// phone-profile reviews is first judged by a copy of the judge that takes the
// slope as a parameter, and the copy is asserted against the real judge on the
// shipped slope. Then the graded plies (class not book, forced or unknown) are
// judged on both curves, the flips recorded, and a 25-flip sample drawn for
// the player's review.
//
// Writes flips.json, flips.md and flips-sample.json into --out (default
// private/judge-in-context/). Writes nothing when an assertion fails.
//
//   bridge/run.sh projects/judge-in-context/flips.mjs [--out DIR]

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = opt('--out', privateDir('judge-in-context'));
const CASES = join(privateDir('accuracy-vs-chesscom'), 'cases.json');
const EVIDENCE = join(privateDir('accuracy-vs-chesscom'), 'evidence', 'phone');

// The proposal: the mover's slope is LOW_K at or below RATING_FLOOR and rises
// linearly to the Lichess slope at RATING_FLOOR + RATING_SPAN.
const LOW_K = 0.00245;
const RATING_FLOOR = 1000;
const RATING_SPAN = 1300;
const SEED = 7;
const SAMPLE_SIZE = 25;
const BEST_LINE_PLIES = 6;
const EXCLUDED = new Set(['book', 'forced', 'unknown']);
const RANK = { good: 0, ok: 1, inaccuracy: 2, mistake: 3, blunder: 4 };
const JUDGMENTS = ['blunder', 'mistake', 'inaccuracy', 'ok', 'good'];

const load = (rel) => import(pathToFileURL(join(CHESS_DIR, rel)).href);
const [verdicts, scoreMod, docMod, replayMod, runMod] = await Promise.all([
  load('src/services/knowledge/verdicts.ts'),
  load('src/core/score/index.ts'),
  load('src/services/review/pipeline/document.ts'),
  load('src/services/review/pipeline/replay.ts'),
  load('src/services/review/pipeline/run.ts'),
]);
const { judgeMove, mateSlip, JUDGMENT_THRESHOLDS: T } = verdicts;
const { LICHESS_WIN_K, expectedPoints, winPercent, isExactScore } = scoreMod;

// --- the copies --------------------------------------------------------------

/**
 * The shipped judge (knowledge/verdicts.ts judgeMove), with the win% curve as
 * its one parameter: win% is 100 * expectedPoints on slope k. Thresholds and
 * clamps are the shipped ones, line for line.
 */
function judgeAtSlope(before, after, color, k) {
  const wp = (e) => 100 * expectedPoints(e, k);
  const sign = color === 'w' ? 1 : -1;
  const wpBefore = 50 + sign * (wp(before) - 50);
  const wpAfter = 50 + sign * (wp(after) - 50);
  const swing = wpBefore - wpAfter;
  let judgment;
  if (swing >= T.blunder) judgment = 'blunder';
  else if (swing >= T.mistake) judgment = 'mistake';
  else if (swing >= T.inaccuracy) judgment = 'inaccuracy';
  else if (swing <= T.good) judgment = 'good';
  else judgment = 'ok';
  if (wpAfter >= T.keptWon && judgment !== 'good') return 'ok';
  if (wpAfter >= T.keptWinning && (judgment === 'blunder' || judgment === 'mistake')) return 'inaccuracy';
  return judgment;
}

/** The shipped mateSlip (knowledge/verdicts.ts) with the win% curve as its parameter. */
function mateSlipAtSlope(before, after, color, k) {
  const sign = color === 'w' ? 1 : -1;
  if (before.mate === null || before.mate * sign <= 0) return null;
  if (after.mate !== null && after.mate * sign > 0) return null;
  const wpAfter = 50 + sign * (100 * expectedPoints(after, k) - 50);
  return wpAfter >= T.keptWon ? Math.abs(before.mate) : null;
}

// --- the proposal and the mechanism -------------------------------------------

/** The mover's slope for a rating, as the proposal states it. */
function slopeFor(rating) {
  if (!Number.isFinite(rating)) throw new Error(`no usable rating: ${rating}`);
  const t = Math.min(1, Math.max(0, (rating - RATING_FLOOR) / RATING_SPAN));
  return LOW_K + (LICHESS_WIN_K - LOW_K) * t;
}

/** The judge's band on a swing, before any clamp. */
function bandOf(swing) {
  if (swing >= T.blunder) return 'blunder';
  if (swing >= T.mistake) return 'mistake';
  if (swing >= T.inaccuracy) return 'inaccuracy';
  if (swing <= T.good) return 'good';
  return 'ok';
}

/**
 * The clamp that changes this band's verdict at this after-position:
 * 'kept-won' (88% floor, turns a band worse than good into ok), 'kept-winning'
 * (75% cap, turns a blunder or mistake into an inaccuracy), or null. A floor
 * that leaves the band as it is does not count, so a flip is attributed to the
 * floor only when the floor is what moved the verdict.
 */
function clampOf(band, wpAfter) {
  if (wpAfter >= T.keptWon && (band === 'inaccuracy' || band === 'mistake' || band === 'blunder')) return 'kept-won';
  if (wpAfter >= T.keptWinning && (band === 'blunder' || band === 'mistake')) return 'kept-winning';
  return null;
}

/** The judgment a band and its clamp give. Must reproduce judgeAtSlope; checked on every graded ply. */
function applyClamp(band, clamp) {
  if (clamp === 'kept-won') return 'ok';
  if (clamp === 'kept-winning') return 'inaccuracy';
  return band;
}

/** A score as the mover reads it: +1.23, -0.40, M3 (the mover mates in 3), -M2 (the mover is mated in 2). */
function moverText(s, sign) {
  if (s.mate !== null) {
    const m = s.mate * sign;
    return m > 0 ? `M${m}` : `-M${-m}`;
  }
  const cp = s.cp * sign;
  return `${cp >= 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(2)}`;
}

const moverCp = (s, sign) => (s.mate !== null || s.cp === null ? null : s.cp * sign);

/** The mover's win% at which a slope reaches w, as centipawns from level. */
const cpAtWin = (w, k) => Math.log(w / (100 - w)) / k;

/**
 * The centipawns from level where the two curves change win% at the same rate
 * per pawn: nearer level the proposed curve moves less, further out it moves more.
 */
function crossoverCp() {
  const rate = (c, k) => {
    const w = 1 / (1 + Math.exp(-k * c));
    return k * w * (1 - w);
  };
  const f = (c) => rate(c, LICHESS_WIN_K) - rate(c, LOW_K);
  let lo = 1;
  let hi = 3000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// --- reading the evidence ----------------------------------------------------

/** The kept evidence document for a case, re-read under the working tree's code exactly as run-eval.mjs reread() does. */
function reread(stored) {
  const rp = replayMod.replayGame(stored.game);
  return docMod.buildDocument({
    id: stored.id,
    game: stored.game,
    replay: rp,
    positions: stored.positions.map((p) => ({ ...p })),
    division: stored.division,
    playerColor: stored.playerColor,
    register: stored.provenance.register,
    flaggedPlies: stored.coverage.flaggedPlies,
    verifyBudget: stored.coverage.verifyBudget,
    provenance: { ...stored.provenance, evidenceVersion: runMod.EVIDENCE_VERSION },
    ext: stored.ext,
  });
}

/** UCI moves from a FEN as SAN, with chess.js; throws on an illegal move, which would mean the line is not from this position. */
function sanLine(fen, ucis, limit) {
  const board = new Chess(fen);
  const out = [];
  for (const uci of ucis.slice(0, limit)) {
    const move = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
    if (uci.length > 4) move.promotion = uci[4];
    out.push(board.move(move).san);
  }
  return out;
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const zeroMatrix = () => Object.fromEntries(JUDGMENTS.map((a) => [a, Object.fromEntries(JUDGMENTS.map((b) => [b, 0]))]));
const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sortByGamePly = (a, b) => (Number(a.game) - Number(b.game)) || (a.ply - b.ply);

// --- the walk ----------------------------------------------------------------

const cases = JSON.parse(readFileSync(CASES, 'utf8'));
const A = {
  exactPlies: 0,
  gradedPlies: 0,
  judgmentChecks: 0,
  mateChecks: 0,
  maxWinDiff: 0,
  judgmentMismatch: [],
  mateMismatch: [],
  mechanismMismatch: [],
  storedJudgedMismatch: [],
};
const pop = {
  games: 0,
  records: 0,
  notExact: 0,
  notExactByTerminal: {},
  excludedByClass: {},
  pvFirstNotBest: 0,
  ratingsUsed: { player: [], opponent: [] },
};
const matrix = { player: zeroMatrix(), opponent: zeroMatrix() };
const gradedRows = [];
const flips = [];

for (const c of cases) {
  const stored = JSON.parse(readFileSync(join(EVIDENCE, `${c.id}.json`), 'utf8'));
  const doc = reread(stored);
  if (doc.playerColor !== c.playerColor) throw new Error(`player color differs from cases.json in game ${c.id}`);
  pop.games++;
  for (let i = 0; i < doc.records.length; i++) {
    const r = doc.records[i];
    pop.records++;
    if (r.ply !== i + 1) throw new Error(`ply ${r.ply} at index ${i} in game ${c.id}`);
    if (r.bestPv.length && r.bestPv[0] !== r.bestUci) pop.pvFirstNotBest++;
    if (!isExactScore(r.before) || !isExactScore(r.after)) {
      pop.notExact++;
      pop.notExactByTerminal[r.terminal ?? 'none'] = (pop.notExactByTerminal[r.terminal ?? 'none'] ?? 0) + 1;
      continue;
    }
    A.exactPlies++;
    const color = r.mover;
    const sign = color === 'w' ? 1 : -1;
    const role = r.mover === doc.playerColor ? 'player' : 'opponent';
    const isGraded = !EXCLUDED.has(r.cls);

    // The assertion: the copy on the shipped slope against the real functions, on every exact-score ply.
    const judgedReal = judgeMove(r.before, r.after, color);
    const judgedCopy = judgeAtSlope(r.before, r.after, color, LICHESS_WIN_K);
    A.judgmentChecks++;
    if (judgedReal !== judgedCopy) A.judgmentMismatch.push({ game: c.id, ply: r.ply, real: judgedReal, copy: judgedCopy });
    const mateReal = mateSlip(r.before, r.after, color);
    const mateCopy = mateSlipAtSlope(r.before, r.after, color, LICHESS_WIN_K);
    A.mateChecks++;
    if (mateReal !== mateCopy) A.mateMismatch.push({ game: c.id, ply: r.ply, real: mateReal, copy: mateCopy });
    for (const e of [r.before, r.after]) {
      A.maxWinDiff = Math.max(A.maxWinDiff, Math.abs(winPercent(e) - 100 * expectedPoints(e, LICHESS_WIN_K)));
    }

    if (!isGraded) {
      pop.excludedByClass[r.cls] = (pop.excludedByClass[r.cls] ?? 0) + 1;
      continue;
    }
    A.gradedPlies++;
    if (judgedReal !== r.judged) A.storedJudgedMismatch.push({ game: c.id, ply: r.ply, stored: r.judged, real: judgedReal });

    const rating = role === 'player' ? c.myRating : c.oppRating;
    pop.ratingsUsed[role].push(rating);
    const k = slopeFor(rating);
    const judgedNew = judgeAtSlope(r.before, r.after, color, k);
    const mateNew = mateSlipAtSlope(r.before, r.after, color, k);

    const wOldB = 50 + sign * (winPercent(r.before) - 50);
    const wOldA = 50 + sign * (winPercent(r.after) - 50);
    const wNewB = 50 + sign * (100 * expectedPoints(r.before, k) - 50);
    const wNewA = 50 + sign * (100 * expectedPoints(r.after, k) - 50);
    const swingOld = wOldB - wOldA;
    const swingNew = wNewB - wNewA;
    const bandO = bandOf(swingOld);
    const bandN = bandOf(swingNew);
    const clampO = clampOf(bandO, wOldA);
    const clampN = clampOf(bandN, wNewA);
    if (applyClamp(bandO, clampO) !== judgedReal) A.mechanismMismatch.push({ game: c.id, ply: r.ply, side: 'old', band: bandO, clamp: clampO, judged: judgedReal });
    if (applyClamp(bandN, clampN) !== judgedNew) A.mechanismMismatch.push({ game: c.id, ply: r.ply, side: 'new', band: bandN, clamp: clampN, judged: judgedNew });

    matrix[role][judgedReal][judgedNew]++;
    const mateChanged = mateReal !== mateNew;
    gradedRows.push({ game: Number(c.id), ply: r.ply, role, old: judgedReal, new: judgedNew, mateChanged });
    if (judgedReal === judgedNew) continue;

    const fenBefore = doc.fens[i];
    flips.push({
      game: c.id,
      url: c.url,
      ply: r.ply,
      moveNumber: r.moveNumber,
      san: r.san,
      moveLabel: `${r.moveNumber}${color === 'w' ? '.' : '...'} ${r.san}`,
      mover: role,
      moverColor: color,
      cls: r.cls,
      rating,
      slopeNew: k,
      before: { cp: r.before.cp, mate: r.before.mate },
      after: { cp: r.after.cp, mate: r.after.mate },
      beforeMover: moverText(r.before, sign),
      afterMover: moverText(r.after, sign),
      cpBeforeMover: moverCp(r.before, sign),
      cpAfterMover: moverCp(r.after, sign),
      winBeforeOld: round3(wOldB),
      winAfterOld: round3(wOldA),
      winBeforeNew: round3(wNewB),
      winAfterNew: round3(wNewA),
      swingOld: round3(swingOld),
      swingNew: round3(swingNew),
      old: judgedReal,
      new: judgedNew,
      direction: RANK[judgedNew] > RANK[judgedReal] ? 'harsher' : 'milder',
      bandOld: bandO,
      bandNew: bandN,
      clampOld: clampO,
      clampNew: clampN,
      mateSlipOld: mateReal,
      mateSlipNew: mateNew,
      mateSlipChanged: mateChanged,
      fenBefore,
      bestUci: r.bestUci,
      bestSan: r.bestUci ? sanLine(fenBefore, [r.bestUci], 1)[0] : null,
      bestLineSan: sanLine(fenBefore, r.bestPv, BEST_LINE_PLIES),
    });
  }
}

const failures = A.judgmentMismatch.length + A.mateMismatch.length + A.mechanismMismatch.length;
if (failures > 0) {
  console.error(JSON.stringify({ judgmentMismatch: A.judgmentMismatch.slice(0, 10), mateMismatch: A.mateMismatch.slice(0, 10), mechanismMismatch: A.mechanismMismatch.slice(0, 10) }, null, 1));
  console.error(`ASSERTION FAILED: ${A.judgmentMismatch.length} judgment, ${A.mateMismatch.length} mateSlip, ${A.mechanismMismatch.length} mechanism mismatches. Nothing written.`);
  process.exit(1);
}

flips.sort(sortByGamePly);

// --- the sample --------------------------------------------------------------

/** mulberry32: a small seeded generator, so the shuffle is the same on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(list, seed) {
  const rnd = mulberry32(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * n flips drawn from `pool`, one stratum per flip type (old -> new), each type
 * at least one when it occurs, the rest in proportion to the type's count
 * (largest remainder, capped at the type's count). Order: sorted by game and
 * ply, then shuffled with the seed; each type takes from the front of its own
 * shuffled list.
 */
function stratify(pool, n) {
  const sorted = [...pool].sort(sortByGamePly);
  const shuffled = seededShuffle(sorted, SEED);
  const groups = new Map();
  for (const f of shuffled) {
    const key = `${f.old}→${f.new}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const types = [...groups.keys()].sort();
  if (types.length > n) throw new Error(`${types.length} flip types cannot all be drawn into ${n}`);
  const total = pool.length;
  const target = Object.fromEntries(types.map((t) => [t, (n * groups.get(t).length) / total]));
  const alloc = Object.fromEntries(types.map((t) => [t, Math.min(groups.get(t).length, Math.max(1, Math.floor(target[t])))]));
  let sum = types.reduce((s, t) => s + alloc[t], 0);
  while (sum > n) {
    const t = types.filter((x) => alloc[x] > 1).sort((a, b) => (alloc[b] - target[b]) - (alloc[a] - target[a]) || (a < b ? -1 : 1))[0];
    alloc[t]--;
    sum--;
  }
  while (sum < n) {
    const t = types.filter((x) => alloc[x] < groups.get(x).length).sort((a, b) => (target[b] - alloc[b]) - (target[a] - alloc[a]) || (a < b ? -1 : 1))[0];
    alloc[t]++;
    sum++;
  }
  const picked = types.flatMap((t) => groups.get(t).slice(0, alloc[t])).sort(sortByGamePly);
  const table = types.map((t) => ({ transition: t, flips: groups.get(t).length, target: round3(target[t]), drawn: alloc[t] }));
  return { picked, table };
}

const playerFlips = flips.filter((f) => f.mover === 'player');
if (playerFlips.length < SAMPLE_SIZE) throw new Error(`only ${playerFlips.length} player flips for a sample of ${SAMPLE_SIZE}`);
const sampled = stratify(playerFlips, SAMPLE_SIZE);

// --- the summary -------------------------------------------------------------

const gradedBy = (role) => gradedRows.filter((g) => g.role === role);
const flipsBy = (role) => flips.filter((f) => f.mover === role);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const matrixCount = (m) => JUDGMENTS.reduce((s, a) => s + JUDGMENTS.reduce((t, b) => t + m[a][b], 0), 0);

const mateChangedGraded = gradedRows.filter((g) => g.mateChanged).length;
const mateChangedFlips = flips.filter((f) => f.mateSlipChanged).length;
const kStats = (xs) => (xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null);
const kRange = {
  player: kStats(pop.ratingsUsed.player.map(slopeFor)),
  opponent: kStats(pop.ratingsUsed.opponent.map(slopeFor)),
};
const ratingRange = {
  player: kStats(pop.ratingsUsed.player),
  opponent: kStats(pop.ratingsUsed.opponent),
};
const crossover = crossoverCp();
const floors = {
  kept88: { old: cpAtWin(88, LICHESS_WIN_K) / 100, new: cpAtWin(88, LOW_K) / 100 },
  kept75: { old: cpAtWin(75, LICHESS_WIN_K) / 100, new: cpAtWin(75, LOW_K) / 100 },
};

/**
 * Patterns: flips grouped by mover, the two judgments, and the mechanism. A
 * 'band' flip has no floor on either curve, so the swing itself crosses a band.
 * Otherwise a floor (88% or 75%) applies on one curve only ('floor lost' or
 * 'floor gained') or at a different level ('floor changed').
 */
const FLOOR_LABEL = { 'kept-won': '88% floor', 'kept-winning': '75% cap', '-': 'none' };
const mechOf = (f) => (f.clampOld === f.clampNew ? 'band' : f.clampOld && !f.clampNew ? 'floor lost' : !f.clampOld && f.clampNew ? 'floor gained' : 'floor changed');
const modeOf = (xs) => {
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
};
const cpText = (cp) => (cp === null ? 'a mate position' : `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`);
const patternGroups = new Map();
for (const f of flips) {
  const key = [f.mover, f.old, f.new, mechOf(f)].join('|');
  if (!patternGroups.has(key)) patternGroups.set(key, []);
  patternGroups.get(key).push(f);
}
const patterns = [...patternGroups.entries()]
  .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))
  .slice(0, 10)
  .map(([key, members]) => {
    const [mover, old, nu, mech] = key.split('|');
    const med = (xs) => median(xs.filter((x) => x !== null));
    const cpB = med(members.map((f) => f.cpBeforeMover));
    const cpA = med(members.map((f) => f.cpAfterMover));
    const swO = median(members.map((f) => f.swingOld));
    const swN = median(members.map((f) => f.swingNew));
    const waO = median(members.map((f) => f.winAfterOld));
    const waN = median(members.map((f) => f.winAfterNew));
    const bandO = modeOf(members.map((f) => f.bandOld));
    const bandN = modeOf(members.map((f) => f.bandNew));
    const clampO = modeOf(members.map((f) => f.clampOld ?? '-'));
    const clampN = modeOf(members.map((f) => f.clampNew ?? '-'));
    let mechanism;
    if (mech === 'band') {
      mechanism = `The drop is ${swO.toFixed(1)} win points on the old curve, which reads as ${old} there, and ${swN.toFixed(1)} on the new one, which reads as ${nu}.`;
    } else if (mech === 'floor lost') {
      mechanism = `On the old curve the mover is at ${waO.toFixed(1)}% after the move, above the ${FLOOR_LABEL[clampO]}, which turns the ${bandO} (swing ${swO.toFixed(1)}) into ${old}. On the new curve the mover is at ${waN.toFixed(1)}%, below the floor, so the ${bandN} (swing ${swN.toFixed(1)}) stands as ${nu}.`;
    } else if (mech === 'floor gained') {
      mechanism = `On the new curve the mover is at ${waN.toFixed(1)}% after the move, above the ${FLOOR_LABEL[clampN]}, which turns the ${bandN} (swing ${swN.toFixed(1)}) into ${nu}. On the old curve the mover is at ${waO.toFixed(1)}%, so the ${bandO} (swing ${swO.toFixed(1)}) stands as ${old}.`;
    } else {
      mechanism = `On the old curve the ${FLOOR_LABEL[clampO]} (mover at ${waO.toFixed(1)}%) turns the ${bandO} into ${old}. On the new curve the ${FLOOR_LABEL[clampN]} (mover at ${waN.toFixed(1)}%) turns the ${bandN} into ${nu}.`;
    }
    let flavour = '';
    if (mech === 'band' && cpB !== null) {
      flavour = Math.abs(cpB) < crossover
        ? ' The position is near level, where the new curve counts each pawn as fewer win points.'
        : ' The position is far from level, where the new curve counts each pawn as more win points.';
    }
    const example = members
      .filter((f) => f.cpBeforeMover !== null)
      .sort((a, b) => (cpB === null ? 0 : Math.abs(a.cpBeforeMover - cpB) - Math.abs(b.cpBeforeMover - cpB)) || sortByGamePly(a, b))[0] ?? members.slice().sort(sortByGamePly)[0];
    return {
      mover,
      old,
      new: nu,
      mechanism: mech,
      count: members.length,
      share: round3(members.length / flips.length),
      cpBeforeMedian: cpB === null ? null : round3(cpB / 100),
      cpAfterMedian: cpA === null ? null : round3(cpA / 100),
      swingOldMedian: round3(swO),
      swingNewMedian: round3(swN),
      winAfterOldMedian: round3(waO),
      winAfterNewMedian: round3(waN),
      text: `The move takes the position from ${cpText(cpB)} to ${cpText(cpA)} (median, mover's view). ${mechanism}${flavour}`,
      example,
    };
  });

// --- the outputs -------------------------------------------------------------

const inputs = {
  cases: 'private/accuracy-vs-chesscom/cases.json',
  evidence: 'private/accuracy-vs-chesscom/evidence/phone/<id>.json',
  evidenceVersion: runMod.EVIDENCE_VERSION,
  shippedSlope: LICHESS_WIN_K,
  proposedSlope: { atOrBelowFloor: LOW_K, floor: RATING_FLOOR, span: RATING_SPAN, formula: 'k(r) = 0.00245 + (0.00368208 - 0.00245) * clamp((r - 1000) / 1300, 0, 1)' },
  judgeSource: 'src/services/knowledge/verdicts.ts (judgeMove, mateSlip, JUDGMENT_THRESHOLDS)',
};

const assertion = {
  passed: true,
  exactPlies: A.exactPlies,
  gradedPlies: A.gradedPlies,
  judgmentChecks: A.judgmentChecks,
  judgmentMismatches: A.judgmentMismatch.length,
  mateSlipChecks: A.mateChecks,
  mateSlipMismatches: A.mateMismatch.length,
  mechanismMismatches: A.mechanismMismatch.length,
  storedJudgedMismatches: A.storedJudgedMismatch.length,
  maxWinPercentDifference: A.maxWinDiff,
};

const counts = {
  games: pop.games,
  records: pop.records,
  exactScorePlies: A.exactPlies,
  notExactScorePlies: pop.notExact,
  excludedByClass: pop.excludedByClass,
  gradedPlies: A.gradedPlies,
  gradedByRole: { player: gradedBy('player').length, opponent: gradedBy('opponent').length },
  flips: flips.length,
  flipShare: round3(flips.length / A.gradedPlies),
  flipsByRole: { player: flipsBy('player').length, opponent: flipsBy('opponent').length },
  mateSlipChangedGraded: mateChangedGraded,
  mateSlipChangedAmongFlips: mateChangedFlips,
  pvFirstNotBest: pop.pvFirstNotBest,
  ratings: ratingRange,
  slopes: kRange,
  crossoverPawns: round3(crossover / 100),
  floorPawns: floors,
};

const matrixOut = {};
for (const role of ['player', 'opponent']) {
  matrixOut[role] = {};
  for (const a of JUDGMENTS) for (const b of JUDGMENTS) {
    if (matrix[role][a][b]) matrixOut[role][`${a}→${b}`] = matrix[role][a][b];
  }
}

writeFileSync(join(OUT, 'flips.json'), JSON.stringify({ inputs, assertion, counts, matrix: matrixOut, flips, patterns: patterns.map(({ example, ...p }) => ({ ...p, example: { game: example.game, ply: example.ply, moveLabel: example.moveLabel } })) }, null, 2) + '\n');

const sampleDoc = {
  purpose: "A 25-flip sample of the player's own moves whose verdict changes under the proposed curve, for the player's review.",
  seed: SEED,
  sampleSize: SAMPLE_SIZE,
  pool: { flips: playerFlips.length, gradedPlies: gradedBy('player').length },
  method: 'Pool: the player\'s flips (sorted by game, then ply, then shuffled with mulberry32 seed 7). Each flip type (old→new) draws at least one flip when it occurs; the rest go to types in proportion to their counts (largest remainder, capped at the type\'s count). Each type takes from the front of its shuffled list. Output sorted by game and ply.',
  transitions: sampled.table,
  flips: sampled.picked,
};
writeFileSync(join(OUT, 'flips-sample.json'), JSON.stringify(sampleDoc, null, 2) + '\n');

// flips.md
const L = [];
const table = (role) => {
  const m = matrix[role];
  const out = [`| shipped → proposed | ${JUDGMENTS.join(' | ')} | total |`, `|---|${JUDGMENTS.map(() => '---:').join('|')}|---:|`];
  for (const a of JUDGMENTS) {
    const total = JUDGMENTS.reduce((s, b) => s + m[a][b], 0);
    const cells = JUDGMENTS.map((b) => (a === b ? `(${m[a][b]})` : m[a][b] ? `**${m[a][b]}**` : '0'));
    out.push(`| ${a} | ${cells.join(' | ')} | ${total} |`);
  }
  const colTotals = JUDGMENTS.map((b) => JUDGMENTS.reduce((s, a) => s + m[a][b], 0));
  out.push(`| total | ${colTotals.join(' | ')} | ${matrixCount(m)} |`);
  return out.join('\n');
};

L.push('# Verdicts under the mover-rated curve');
L.push('');
L.push(`Phone-profile reviews of ${pop.games} games (${runMod.EVIDENCE_VERSION}), each re-read through the review service's own path. **Old** is the shipped judge on the Lichess slope ${LICHESS_WIN_K}. **New** is the same judge on the proposed slope for the mover's rating: ${LOW_K} at ${RATING_FLOOR} or below, linear to ${LICHESS_WIN_K} at ${RATING_FLOOR + RATING_SPAN}. Only the win% curve differs; thresholds and clamps are the shipped ones.`);
L.push('');
L.push('## Assertion');
L.push('');
L.push(`The copy at the shipped slope reproduces the real judge on all ${A.exactPlies} exact-score plies (${A.gradedPlies} graded): ${A.judgmentMismatch.length} judgment and ${A.mateMismatch.length} mateSlip mismatches, so the comparison is the curve alone. Largest win% difference between the copy and the app's \`winPercent\`: ${A.maxWinDiff.toExponential(1)}.`);
L.push('');
L.push('## Counts');
L.push('');
L.push(`- Records: ${pop.records}. Exact before and after: ${A.exactPlies}. Not exact: ${pop.notExact} (${Object.entries(pop.notExactByTerminal).map(([k, v]) => `terminal ${k}: ${v}`).join(', ')}; the game ends on the move, so the judge does not run and the outcome grades it).`);
L.push(`- Excluded from grading (book, forced or unknown): ${Object.entries(pop.excludedByClass).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
L.push(`- **Graded plies: ${A.gradedPlies}** (player ${gradedBy('player').length}, opponent ${gradedBy('opponent').length}).`);
L.push(`- **Flips: ${flips.length}** (${pct(flips.length, A.gradedPlies)} of graded plies): player ${flipsBy('player').length} of ${gradedBy('player').length} (${pct(flipsBy('player').length, gradedBy('player').length)}), opponent ${flipsBy('opponent').length} of ${gradedBy('opponent').length} (${pct(flipsBy('opponent').length, gradedBy('opponent').length)}).`);
L.push(`- mateSlip changes: ${mateChangedGraded} graded plies, ${mateChangedFlips} of them also flip the judgment.`);
L.push(`- Mover ratings in the set: player ${ratingRange.player.min}-${ratingRange.player.max}, opponent ${ratingRange.opponent.min}-${ratingRange.opponent.max}. Proposed slopes: player ${kRange.player.min.toFixed(5)}-${kRange.player.max.toFixed(5)}, opponent ${kRange.opponent.min.toFixed(5)}-${kRange.opponent.max.toFixed(5)}.`);
L.push('');
L.push('## Where the curves part');
L.push('');
L.push(`- The two curves change win% at the same rate per pawn at about ${(crossover / 100).toFixed(1)} pawns from level, either side. Nearer level the proposed curve moves each pawn less, so its verdicts are milder; further out it moves each pawn more, so they are harsher.`);
L.push(`- The 88% floor needs about +${floors.kept88.old.toFixed(1)} pawns on the old curve and +${floors.kept88.new.toFixed(1)} on the new one. The 75% cap needs +${floors.kept75.old.toFixed(1)} and +${floors.kept75.new.toFixed(1)}. A move that leaves the mover between those two levels is protected by the floor on the old curve and not on the new one.`);
L.push('');
L.push('## Flip matrix (rows: old judgment; columns: new judgment)');
L.push('');
L.push('Diagonal in parentheses (unchanged); flips in bold.');
L.push('');
L.push('**Player moves**');
L.push('');
L.push(table('player'));
L.push('');
L.push('**Opponent moves**');
L.push('');
L.push(table('opponent'));
L.push('');
L.push('## Flips by mechanism');
L.push('');
L.push('| mechanism | milder | harsher | total |');
L.push('|---|---:|---:|---:|');
for (const mech of ['band', 'floor lost', 'floor gained', 'floor changed']) {
  const xs = flips.filter((f) => mechOf(f) === mech);
  const harsher = xs.filter((f) => RANK[f.new] > RANK[f.old]).length;
  L.push(`| ${mech} | ${xs.length - harsher} | ${harsher} | ${xs.length} |`);
}
L.push('');
const nearLevel = (f) => f.cpBeforeMover !== null && Math.abs(f.cpBeforeMover) < crossover;
const farFromLevel = (f) => f.cpBeforeMover !== null && Math.abs(f.cpBeforeMover) >= crossover;
const bandFlips = flips.filter((f) => mechOf(f) === 'band');
const milderBand = bandFlips.filter((f) => RANK[f.new] < RANK[f.old]);
const harsherBand = bandFlips.filter((f) => RANK[f.new] > RANK[f.old]);
const floorFlips = flips.filter((f) => mechOf(f) !== 'band');
const mateFlips = flips.filter((f) => f.mateSlipChanged);
L.push('## Where the flips fall');
L.push('');
L.push(`- Milder band flips: ${milderBand.length}. ${milderBand.filter(nearLevel).length} of them lie within ${(crossover / 100).toFixed(1)} pawns of level.`);
L.push(`- Harsher band flips: ${harsherBand.length}. ${harsherBand.filter(farFromLevel).length} lie beyond ${(crossover / 100).toFixed(1)} pawns from level (${harsherBand.filter((f) => farFromLevel(f) && f.cpBeforeMover < 0).length} with the mover losing, ${harsherBand.filter((f) => farFromLevel(f) && f.cpBeforeMover > 0).length} winning), ${harsherBand.filter(nearLevel).length} sit within it, and ${harsherBand.filter((f) => f.cpBeforeMover === null).length} are mate positions.`);
L.push(`- Floor flips: ${floorFlips.length}${floorFlips.every((f) => RANK[f.new] > RANK[f.old]) ? ', all harsher' : ''}. A floor flip is one where the 88% floor or the 75% cap changes the verdict on one curve and not on the other, or changes it to a different level on each.`);
L.push(`- mateSlip changes: ${mateFlips.length}${mateFlips.every((f) => mechOf(f) !== 'band') ? ', all of them floor flips' : ''}.`);
L.push('');
L.push('## The ten most common patterns');
L.push('');
L.push('Grouped by mover, the old and new judgment, and the mechanism: `band` (no floor on either curve, so the swing itself crosses a band), `floor lost` or `floor gained` (the 88% floor or the 75% cap applies on one curve only), or `floor changed` (the floor applies on both at different levels). Harsher means the new judgment is the worse one.');
L.push('');
patterns.forEach((p, idx) => {
  const dir = RANK[p.new] > RANK[p.old] ? 'harsher' : 'milder';
  const ex = p.example;
  L.push(`${idx + 1}. **${p.mover}: ${p.old} → ${p.new}** (${dir}; ${p.mechanism}), ${p.count} flips, ${pct(p.count, flips.length)} of all flips. ${p.text}`);
  L.push(`   Example: game ${ex.game}, ply ${ex.ply} (${ex.moveLabel}): ${ex.beforeMover} → ${ex.afterMover}; win% old ${ex.winBeforeOld.toFixed(1)} → ${ex.winAfterOld.toFixed(1)}, new ${ex.winBeforeNew.toFixed(1)} → ${ex.winAfterNew.toFixed(1)}.`);
});
L.push('');
L.push('## The player sample');
L.push('');
L.push(`${sampleDoc.flips.length} of the ${playerFlips.length} player flips, in \`flips-sample.json\`, drawn with seed ${SEED}. Each flip type draws at least one flip:`);
L.push('');
L.push('| type | flips | target | drawn |');
L.push('|---|---:|---:|---:|');
for (const t of sampled.table) L.push(`| ${t.transition} | ${t.flips} | ${t.target} | ${t.drawn} |`);
L.push('');
writeFileSync(join(OUT, 'flips.md'), L.join('\n') + '\n');

console.log(JSON.stringify({ assertion, counts: { gradedPlies: A.gradedPlies, flips: flips.length, playerFlips: playerFlips.length, opponentFlips: flipsBy('opponent').length }, sample: sampled.table }, null, 2));
