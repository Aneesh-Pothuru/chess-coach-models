// Does the archive's stored acc2 (the v2 instrument, tag coach-accuracy/2-lichess-derived, or
// untagged) reproduce from the archived per-ply evals, rebuilt by the archive reader's records,
// under the frozen v2 model? The archive reader reads a stored accuracy taken under an older
// instrument again from those evals, and this is the check that doing so keeps each game's number:
//
//   bridge/run.sh projects/accuracy-vs-chesscom/reread-check.mjs [--out DIR]
//
// Prints the report; --out also writes report.txt and sides.json there. The
// archive is the app's (CHESS_DIR), and the report names games, so --out
// belongs under private/.
//
// VERDICT RULE (fixed before any number is computed, printed first by this script):
//   seeding = whichever of { doc.rootWin, 50 } has the lower whole-game MAE over all archive sides.
//   THESIS F HOLDS iff, under that seeding, whole-game MAE <= 0.5 AND 90th-percentile |diff| <= 1.5.
//   Otherwise THESIS F FAILS, and the share of sides within 0.5 points is reported.
//
// Recomputed numbers use ONLY doc.records, doc.rootWin, doc.division (never the reader's carried
// doc.white / doc.black). Whole-game: lichess-v2.mjs accuracy(). Phases: the v2 summarizeSide's
// sideAccuracyOver (git c2a07a6, src/services/review/accuracy.ts), replicated here because
// lichess-v2.mjs exports only the whole-game function; the replica is checked against it.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHESS_DIR } from '../../bridge/lib/chess.mjs';

const ROOT = CHESS_DIR;
const outAt = process.argv.indexOf('--out');
const OUT = outAt >= 0 ? resolve(process.argv[outAt + 1]) : null;
const load = rel => import(pathToFileURL(join(ROOT, rel)).href);

const VERDICT_RULE = [
  'VERDICT RULE (fixed before computing):',
  '  seeding = whichever of { doc.rootWin, 50 } has the lower whole-game MAE over all archive sides.',
  '  THESIS F HOLDS iff, under that seeding, whole-game MAE <= 0.5 AND 90th-percentile |diff| <= 1.5.',
  '  Otherwise THESIS F FAILS, and the share of sides within 0.5 points is reported.',
].join('\n');
console.log(VERDICT_RULE + '\n');

const [read, lib, phase, oldModel] = await Promise.all([
  load('src/services/review/archive/read.ts'),
  load('src/services/review/accuracy.ts'),
  load('src/core/phase/index.ts'),
  import('./models/lichess-v2.mjs'),
]);
// Whose games the archive holds: the app's own setting, so no account name lives here.
const { DEFAULT_USERNAME: USERNAME } = await load('src/services/learner/level.ts');

// ---- the v2 instrument, replicated for phases (constants and steps as lichess-v2.mjs / c2a07a6) ----
const OLD = { A: 103.1668100711649, B: 0.04354415386753951, C: 3.166924740191411 };
const oldMoveAcc = loss => Math.max(0, Math.min(100, OLD.A * Math.exp(-OLD.B * loss) - OLD.C + 1));
function stdev(xs) {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1));
}
function volatilityWeights(winSeq, windowSize) {
  const plies = Math.max(0, winSeq.length - 1);
  const size = Math.max(2, Math.min(windowSize, Math.max(2, winSeq.length)));
  const slide = [];
  for (let i = 0; i + size <= winSeq.length; i++) slide.push(winSeq.slice(i, i + size));
  if (slide.length === 0) slide.push([...winSeq]);
  const windows = [];
  for (let k = 0; k < size - 2; k++) windows.push(slide[0]);
  windows.push(...slide);
  const out = [];
  for (let i = 0; i < plies; i++) out.push(Math.max(0.5, Math.min(12, stdev(windows[Math.min(i, windows.length - 1)]))));
  return out;
}
function winSeqOf(records, rootWin) {
  let last = rootWin ?? 50;
  const seq = [last];
  for (const r of records) {
    if (r.winAfter !== null && r.winAfter !== undefined) last = r.winAfter;
    seq.push(last);
  }
  return seq;
}
function v2Aggregate(pairs) {
  if (pairs.length === 0) return null;
  let accW = 0, wSum = 0, invSum = 0;
  for (const { acc, weight } of pairs) { accW += acc * weight; wSum += weight; invSum += 1 / acc; }
  const weighted = wSum > 0 ? accW / wSum : 0;
  const harmonic = pairs.length / invSum;
  return (weighted + harmonic) / 2;
}
// v2 sideAccuracyOver: window size from the SLICE's graded count, volatility over winSeq.slice(lo, hi + 1).
function v2Over(records, color, winSeq, lo, hi) {
  const mine = [];
  for (let i = Math.max(0, lo); i < Math.min(records.length, hi); i++) {
    if (records[i].mover !== color || !lib.graded(records[i])) continue;
    mine.push({ index: i, acc: oldMoveAcc(records[i].lossPct) });
  }
  if (mine.length === 0) return null;
  const weights = volatilityWeights(winSeq.slice(lo, hi + 1), Math.max(2, Math.min(8, Math.floor(mine.length / 10))));
  return v2Aggregate(mine.map(m => ({ acc: m.acc, weight: weights[m.index - lo] ?? 0.5 })));
}
function v2Phases(records, color, winSeq, division) {
  const n = records.length;
  const div = division ?? { middle: null, end: null };
  const midAt = div.middle ?? div.end ?? n;
  const endAt = div.end ?? n;
  return {
    whole: v2Over(records, color, winSeq, 0, n),
    opening: v2Over(records, color, winSeq, 0, midAt),
    middlegame: div.middle !== null ? v2Over(records, color, winSeq, div.middle, endAt) : null,
    endgame: div.end !== null ? v2Over(records, color, winSeq, div.end, n) : null,
  };
}

// ---- collection ----
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sides = [];
const failures = [];
const replicaMismatch = [];
const carryCheck = { games: 0, carried: 0 };
const divideCheck = { withStored: 0, matches: 0, mismatches: [] };
let rowsSeen = 0, rowsWithAcc2 = 0;

function processGame({ set, file, idx, raw, readFn }) {
  const id = String(raw.url ?? '').split('/').pop();
  const meIsWhite = raw.meIsWhite === true;
  const me = meIsWhite ? 'w' : 'b';
  const other = me === 'w' ? 'b' : 'w';
  let doc = null, err = null;
  try { doc = readFn(raw); } catch (e) { err = String(e?.message ?? e); }
  if (!doc) {
    failures.push({ set, file, idx, id, reason: err ?? 'reader returned null', sans: raw.sans?.length ?? null, evals: raw.evals?.length ?? null });
    return;
  }
  const records = doc.records;
  const division = doc.division;
  const rootA = doc.rootWin;
  const ctxA = { rootWin: rootA, division, lib, meta: {} };
  const ctxB = { rootWin: 50, division, lib, meta: {} };
  const wsA = winSeqOf(records, rootA);
  const wsB = winSeqOf(records, 50);
  const storedDiv = raw.division ?? null;
  const hasDivision = storedDiv !== null && typeof storedDiv === 'object';
  // Is the reader carrying the stored summary here (the path this thesis would replace)?
  const storedMine = raw.acc2.mine;
  carryCheck.games++;
  if (doc.white && doc.black && doc.white.accuracy === (me === 'w' ? num(storedMine.accuracy) : num(raw.acc2.opp.accuracy))) carryCheck.carried++;
  // Does the divider reproduce the stored division?
  if (hasDivision) {
    divideCheck.withStored++;
    const d = phase.divide(doc.fens);
    if (d.middle === storedDiv.middle && d.end === storedDiv.end) divideCheck.matches++;
    else divideCheck.mismatches.push({ set, id, stored: storedDiv, divided: d });
  }
  for (const [key, color] of [['mine', me], ['opp', other]]) {
    const st = raw.acc2[key];
    const recA = oldModel.accuracy(records, color, ctxA);
    const recB = oldModel.accuracy(records, color, ctxB);
    const phA = v2Phases(records, color, wsA, division);
    const phB = v2Phases(records, color, wsB, division);
    // Self-check: the replica of the v2 whole-game path must equal the frozen model's number.
    const sameA = (phA.whole === null && recA === null) || (phA.whole !== null && recA !== null && Math.abs(phA.whole - recA) < 1e-9);
    if (!sameA) replicaMismatch.push({ set, id, key, replica: phA.whole, frozen: recA });
    const sum = lib.summarizeSide(records, color, division);
    const gradedRec = records.filter(r => r.mover === color && lib.graded(r)).length;
    const storedCounts = st.counts ?? {};
    const countKeys = new Set([...Object.keys(storedCounts), ...Object.keys(sum.counts)]);
    let countDiff = 0;
    for (const k of countKeys) countDiff += Math.abs((num(storedCounts[k]) ?? 0) - (sum.counts[k] ?? 0));
    sides.push({
      set, file, idx, id, key, color, playerSide: key === 'mine', tag: st.model ?? '(untagged)', hasDivision,
      storedAcc: num(st.accuracy), storedAcpl: num(st.acpl), storedGraded: num(st.gradedMoves),
      storedPh: { opening: num(st.phases?.opening), middlegame: num(st.phases?.middlegame), endgame: num(st.phases?.endgame) },
      storedCounts, recA, recB, newAcc: num(sum.accuracy), recAcpl: num(sum.acpl), recGraded: gradedRec,
      countDiff, phA: { opening: phA.opening, middlegame: phA.middlegame, endgame: phA.endgame },
      phB: { opening: phB.opening, middlegame: phB.middlegame, endgame: phB.endgame },
      newPh: { opening: sum.phases.opening, middlegame: sum.phases.middlegame, endgame: sum.phases.endgame },
    });
  }
}

// The rows this check is about: an accuracy stored under the v2 instrument (its tag, or none).
// The archive goes on growing under later instruments, which the v2 model cannot reproduce.
const V2_TAGS = new Set(['(untagged)', 'coach-accuracy/2-lichess-derived']);
const leftOut = {};
function storedUnderV2(acc2) {
  const tags = [acc2.mine.model ?? '(untagged)', acc2.opp.model ?? '(untagged)'];
  if (tags.every(t => V2_TAGS.has(t))) return true;
  const t = tags.find(t => !V2_TAGS.has(t));
  leftOut[t] = (leftOut[t] ?? 0) + 1;
  return false;
}

// (1) The archive: every row that carries acc2 stored under the v2 instrument.
const archiveDir = join(ROOT, 'coach-log', 'review-analysis');
const files = readdirSync(archiveDir).filter(f => f.endsWith('.json')).sort();
const archiveIds = new Map();
for (const file of files) {
  const data = JSON.parse(readFileSync(join(archiveDir, file), 'utf8'));
  data.forEach((raw, idx) => {
    rowsSeen++;
    if (!raw || typeof raw !== 'object' || !raw.acc2 || !raw.acc2.mine || !raw.acc2.opp) return;
    if (!storedUnderV2(raw.acc2)) return;
    rowsWithAcc2++;
    const id = String(raw.url ?? '').split('/').pop();
    if (!archiveIds.has(id)) archiveIds.set(id, []);
    archiveIds.get(id).push({ file, idx, acc2: raw.acc2 });
    processGame({ set: 'archive', file, idx, raw, readFn: row => read.reviewFromArchiveRow(row, { username: USERNAME }) });
  });
}
const archiveSideCount = sides.length;

// (2) Secondary: the published Coach Review DocGames that carry acc2 (one per game id, first occurrence).
const reviewDir = join(ROOT, 'public', 'coach', 'reviews');
const docGameSeen = new Set();
let docGamesWithAcc2 = 0, docGameDup = 0;
for (const file of readdirSync(reviewDir).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(join(reviewDir, file), 'utf8'));
  (Array.isArray(d.games) ? d.games : []).forEach((g, idx) => {
    if (!g || !g.acc2 || !g.acc2.mine || !g.acc2.opp) return;
    if (!storedUnderV2(g.acc2)) return;
    const id = String(g.url ?? '').split('/').pop();
    if (docGameSeen.has(id)) { docGameDup++; return; }
    docGameSeen.add(id);
    docGamesWithAcc2++;
    processGame({ set: 'coach-review', file, idx, raw: g, readFn: gg => read.reviewFromDocGame(gg, { username: USERNAME }) });
  });
}

// ---- statistics ----
const pct = (sorted, p) => {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
};
const pairs = (rows, rec, st) => rows.map(r => [rec(r), st(r)]).filter(([a, b]) => num(a) !== null && num(b) !== null);
function errStats(rows, rec, st) {
  const prs = pairs(rows, rec, st);
  const signed = prs.map(([a, b]) => a - b);
  const abs = signed.map(Math.abs).sort((x, y) => x - y);
  const n = abs.length;
  const sortedSigned = [...signed].sort((x, y) => x - y);
  return {
    n, of: rows.length,
    mae: n ? abs.reduce((s, x) => s + x, 0) / n : NaN,
    median: pct(abs, 0.5), p90: pct(abs, 0.9), max: n ? abs[n - 1] : NaN,
    bias: n ? signed.reduce((s, x) => s + x, 0) / n : NaN,
    medianSigned: pct(sortedSigned, 0.5),
    within05: n ? abs.filter(x => x <= 0.5).length / n : NaN,
    exact: n ? abs.filter(x => x <= 0.05 + 1e-9).length / n : NaN,
  };
}
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const pc = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '-');
const row = (label, s) => `${label.padEnd(30)} n=${String(s.n).padStart(3)}/${String(s.of).padEnd(3)} MAE ${f(s.mae).padStart(6)}  median ${f(s.median).padStart(6)}  P90 ${f(s.p90).padStart(6)}  max ${f(s.max).padStart(6)}  bias ${f(s.bias).padStart(7)}  within0.5 ${pc(s.within05).padStart(6)}  exact(<=0.05) ${pc(s.exact).padStart(6)}`;

const archive = sides.filter(s => s.set === 'archive');
const coachRev = sides.filter(s => s.set === 'coach-review');
const tagged = archive.filter(s => s.tag !== '(untagged)');
const untagged = archive.filter(s => s.tag === '(untagged)');
const playerS = archive.filter(s => s.playerSide);
const oppS = archive.filter(s => !s.playerSide);

const lines = [];
const out = (s = '') => { lines.push(s); console.log(s); };

out(`rows: ${rowsSeen} read from ${files.length} files; rows with acc2: ${rowsWithAcc2}; reader failures (skipped): ${failures.length}`);
out(`left out, stored under a later instrument (archive and coach-review rows): ${JSON.stringify(leftOut)}`);
out(`duplicate game ids in archive with acc2: ${[...archiveIds.values()].filter(v => v.length > 1).length} (${[...archiveIds.entries()].filter(([, v]) => v.length > 1).map(([k]) => k).join(', ') || 'none'})`);
out(`coach-review DocGames with acc2 (unique ids): ${docGamesWithAcc2} (+${docGameDup} repeat copies skipped)`);
out(`sides scored: archive ${archiveSideCount} (= ${archiveSideCount / 2} games x 2), coach-review ${coachRev.length}`);
out(`reader's summary equals the stored acc2 (archive): ${carryCheck.carried}/${carryCheck.games} games (it carries only an acc2 taken under today's instrument)`);
out(`replica self-check (v2 whole-game replica vs frozen lichess-v2.mjs): ${sides.length * 2 - replicaMismatch.length}/${sides.length * 2} sides agree; mismatches: ${replicaMismatch.length}`);
out(`divider (core/phase on doc.fens) reproduces stored division: ${divideCheck.matches}/${divideCheck.withStored} (stored division present on ${divideCheck.withStored} of ${rowsWithAcc2} acc2 rows)`);
out('');

out('== WHOLE GAME, archive sides (primary set) ==');
const seedA = errStats(archive, r => r.recA, r => r.storedAcc);
const seedB = errStats(archive, r => r.recB, r => r.storedAcc);
out(row('seed A: doc.rootWin', seedA));
out(row('seed B: rootWin = 50', seedB));
const primary = seedA.mae <= seedB.mae ? 'A' : 'B';
const recKey = primary === 'A' ? 'recA' : 'recB';
const PS = primary === 'A' ? seedA : seedB;
out(`chosen seeding under the rule: ${primary} (lower MAE)`);
const holds = PS.mae <= 0.5 && PS.p90 <= 1.5;
out(`VERDICT: ${holds ? 'THESIS F HOLDS' : 'THESIS F FAILS'} (MAE ${f(PS.mae)} vs <=0.5; P90 ${f(PS.p90)} vs <=1.5; within0.5 ${pc(PS.within05)})`);
out('');

out('== SPLITS (primary seeding) ==');
out(row('all archive sides', errStats(archive, r => r[recKey], r => r.storedAcc)));
out(row('  tagged coach-accuracy/2', errStats(tagged, r => r[recKey], r => r.storedAcc)));
out(row('  untagged (no model)', errStats(untagged, r => r[recKey], r => r.storedAcc)));
out(row('  player side', errStats(playerS, r => r[recKey], r => r.storedAcc)));
out(row('  opponent side', errStats(oppS, r => r[recKey], r => r.storedAcc)));
out(row('  stored division present', errStats(archive.filter(s => s.hasDivision), r => r[recKey], r => r.storedAcc)));
out(row('  stored division absent', errStats(archive.filter(s => !s.hasDivision), r => r[recKey], r => r.storedAcc)));
out(row('seed A, tagged', errStats(tagged, r => r.recA, r => r.storedAcc)));
out(row('seed B, tagged', errStats(tagged, r => r.recB, r => r.storedAcc)));
out(row('seed A, untagged', errStats(untagged, r => r.recA, r => r.storedAcc)));
out(row('seed B, untagged', errStats(untagged, r => r.recB, r => r.storedAcc)));
out('');

out('== PHASES (primary seeding, archive sides) ==');
const phKey = primary === 'A' ? 'phA' : 'phB';
for (const ph of ['opening', 'middlegame', 'endgame']) {
  out(row(`${ph}`, errStats(archive, r => r[phKey][ph], r => r.storedPh[ph])));
  const nullMis = archive.filter(r => (r[phKey][ph] === null) !== (r.storedPh[ph] === null)).length;
  out(`  null mismatches (one side null, other not): ${nullMis}`);
}
out('');

out('== NEW INSTRUMENT vs STORED (archive sides): new - stored ==');
const jumpAll = errStats(archive, r => r.newAcc, r => r.storedAcc);
out(row('all sides', jumpAll));
out(`  signed mean ${f(jumpAll.bias)}, signed median ${f(jumpAll.medianSigned)}, mean |shift| ${f(jumpAll.mae)}`);
for (const [lab, rows] of [['player side', playerS], ['opponent side', oppS]]) {
  const j = errStats(rows, r => r.newAcc, r => r.storedAcc);
  out(`  ${lab.padEnd(14)} signed mean ${f(j.bias)}, signed median ${f(j.medianSigned)}, mean |shift| ${f(j.mae)}, n=${j.n}`);
}
const newPhJump = ph => errStats(archive, r => r.newPh[ph], r => r.storedPh[ph]);
for (const ph of ['opening', 'middlegame', 'endgame']) {
  const j = newPhJump(ph);
  out(`  phase ${ph.padEnd(11)} new - stored signed mean ${f(j.bias)}, n=${j.n}`);
}
out('');

out('== SECONDARY: coach-review DocGames (unique games) ==');
const secA = errStats(coachRev, r => r.recA, r => r.storedAcc);
const secB = errStats(coachRev, r => r.recB, r => r.storedAcc);
out(row('seed A', secA));
out(row('seed B', secB));
out('');

if (OUT) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n');
  writeFileSync(join(OUT, 'sides.json'), JSON.stringify({ primary, sides, failures, replicaMismatch, divideMismatches: divideCheck.mismatches }, null, 1));
  // The verdict's numbers alone, which name no game.
  const agg = st => ({ n: st.n, mae: st.mae, p90: st.p90, max: st.max, within05: st.within05 });
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({
    holds, primary, rule: { mae: 0.5, p90: 1.5 }, archiveGames: rowsWithAcc2, leftOut, ...agg(PS),
    untagged: agg(errStats(untagged, r => r[recKey], r => r.storedAcc)),
    tagged: agg(errStats(tagged, r => r[recKey], r => r.storedAcc)),
    replicaMismatches: replicaMismatch.length, failures: failures.length,
  }, null, 2) + '\n');
  console.log('wrote', join(OUT, 'report.txt'), 'sides.json and summary.json');
}
