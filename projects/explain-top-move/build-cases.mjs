#!/usr/bin/env node
// The input set for the explain-top-move eval: every key moment the player's
// Game Review stops at, across the accuracy eval's 60 games (cases.json), with
// the engine's answer for the move and the app's own texts for it.
//
// Each game's kept phone document is re-read the way run-eval.mjs's reread()
// reads it: buildDocument over the document's own positions, under the code of
// the app checkout (CHESS_DIR: the pinned commit, or a candidate). Every
// verdict and every text comes from the review and knowledge services over
// that stored evidence. No engine runs here.
//
//   bridge/run.sh projects/explain-top-move/build-cases.mjs [--evidence DIR] [--out DIR] [--probes FILE] [--defenses FILE]
//
// --evidence (default private/accuracy-vs-chesscom/evidence): the kept
// documents build-evidence.mjs writes, read from <DIR>/phone/<id>.json.
// --probes (default private/explain-top-move/probes.json, when present): the
// stored searches of captures the best lines decline (probes.mjs), added to
// each document as its ext.captures, so the lessons can say what such a
// capture costs. They are evidence like the kept documents; nothing searches
// here.
// --defenses (default private/explain-top-move/defenses.json, when present):
// the stored natural defenses to the best moves' threats with the engine's
// answer to each (defenses.mjs), added as each document's ext.defenses the
// same way. An app without defense answers reads past them.
//
// Writes cases.json (one object per key moment, sorted by game then ply) and
// preview.md (counts and sample moments) into private/explain-top-move/, or
// into --out (a hill-climb variant's directory), and prints a JSON summary.
// Both files name games, so neither leaves private/. A text whose function
// throws is stored as null with the reason in the moment's `failures`, and
// counted; nothing is written in its place.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs';

const ROOT = CHESS_DIR;
const ACCURACY = privateDir('accuracy-vs-chesscom');
const OUT = privateDir('explain-top-move');
const PROFILE = 'phone';
const SAMPLE_COUNT = 12;

/**
 * The wrappers the UI puts around the texts, read from the feature files. They
 * are for the reader of the eval; the texts themselves come only from the
 * service functions and are never composed here.
 */
const UI_NOTES = Object.freeze({
  card:
    'ReviewCard.tsx:361-371. cardShows "lesson": LessonHeadline shows lesson.headline, then " " and "<CLASS_LABEL>: it cost N% of your|their winning chances." (N = max(1, round(lossPct))). cardShows "comment": the card shows commentFor. The card also adds record lines not in these texts (ReviewCard.tsx:343-346 double-check note; 378-382 "A deeper check changed this from ... to ...").',
  why:
    'GameReview.tsx:705 heading "Why <moveLabel> was <GRADE_PHRASE[cls]>" (also h2 at :868, Sheet title at :971). Evidence list = whyLabel(record).slice(1), the first line (evidence status) is not shown (GameReview.tsx:720), then one provenance line (GameReview.tsx:721-725).',
  lesson:
    'LessonPanel.tsx: takeaway (:34); "What <played> allowed: <allowed.san>" with allowed.points and allowed.line (:37-43); "What <better.san> does instead" with better.points and better.line (:48-54); "The difference" with difference[] (:59); "What <played> does" with yourMove[] (:67); "How the grade was made" (:77) shows grade (:78) and the evidence lines (:80). Lines run through numberedLine(line, moveNumber, mover). A null lesson shows the "missing" sentence (:75; the copy is GameReview.tsx:712-718).',
  retry:
    'GameReview.tsx:458-464: the UI calls retryTeaching(doc, index); when no answer is stored and the retry looked one up, it calls again with records[index].bestUci set to that answer. Words (retry.ts:89-98): hintWords "Hint: <hint>. The move starts on the lit square." (a hint starting "it " reads "Hint: find a move that <rest>. It starts on the lit square."); revealWords "The move was <answer.san> (the green arrow). <reason>".',
});

function parseArgs(argv) {
  const args = { evidence: join(ACCURACY, 'evidence'), out: OUT, probes: join(OUT, 'probes.json'), defenses: join(OUT, 'defenses.json') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--evidence') {
      if (argv[i + 1] === undefined) throw new Error('missing value for --evidence');
      args.evidence = resolve(argv[++i]);
    } else if (argv[i] === '--probes') {
      if (argv[i + 1] === undefined) throw new Error('missing value for --probes');
      args.probes = resolve(argv[++i]);
    } else if (argv[i] === '--defenses') {
      if (argv[i + 1] === undefined) throw new Error('missing value for --defenses');
      args.defenses = resolve(argv[++i]);
    } else if (argv[i] === '--out') {
      if (argv[i + 1] === undefined) throw new Error('missing value for --out');
      args.out = resolve(argv[++i]);
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

/** The review and knowledge services and the gamereview constants, from the app checkout (tsx loads the TypeScript). */
async function loadServices() {
  const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
  const [review, document, replay, run, knowledge, format] = await Promise.all([
    load('src/services/review/index.ts'),
    load('src/services/review/pipeline/document.ts'),
    load('src/services/review/pipeline/replay.ts'),
    load('src/services/review/pipeline/run.ts'),
    load('src/services/knowledge/index.ts'),
    load('src/features/gamereview/format.ts'),
  ]);
  return {
    keyMoments: review.keyMoments,
    commentFor: review.commentFor,
    whyLabel: review.whyLabel,
    lessonFor: review.lessonFor,
    wantsLesson: review.wantsLesson,
    retryTeaching: review.retryTeaching,
    REVIEW_CLASSES: review.REVIEW_CLASSES,
    buildDocument: document.buildDocument,
    replayGame: replay.replayGame,
    EVIDENCE_VERSION: run.EVIDENCE_VERSION,
    teachMove: knowledge.teachMove,
    ERROR_CLASS: format.ERROR_CLASS,
  };
}

/** run-eval.mjs's reread(): the kept document read again under the app checkout's code. */
function reread(kept, s) {
  const replay = s.replayGame(kept.game);
  return s.buildDocument({
    id: kept.id,
    game: kept.game,
    replay,
    positions: kept.positions.map((p) => ({ ...p })),
    division: kept.division,
    playerColor: kept.playerColor,
    register: kept.provenance.register,
    flaggedPlies: kept.coverage.flaggedPlies,
    verifyBudget: kept.coverage.verifyBudget,
    provenance: { ...kept.provenance, evidenceVersion: s.EVIDENCE_VERSION },
    ext: kept.ext,
  });
}

/** ReviewCard.tsx:55-58, mirrored: the helper is private to the component, and it only computes an argument. */
function recaptureSquare(records, index) {
  const prev = index > 0 ? records[index - 1] : null;
  return prev && prev.san.includes('x') ? prev.uci.slice(2, 4) : null;
}

/** UCI moves from `fen` as SAN with chess.js, stopping at the first move that is not legal there. */
function uciLineToSan(fen, ucis) {
  const game = new Chess(fen);
  const out = [];
  for (const uci of ucis) {
    let move = null;
    try {
      move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4, 5) : undefined });
    } catch {
      move = null;
    }
    if (!move) break;
    out.push(move.san);
  }
  return out;
}

/**
 * lessonFor gives null both when teachMove returns null and when teachMove
 * throws (its own catch hides the throw). Re-run teachMove with lessonFor's
 * arguments, for the reason only; the text stays lessonFor's.
 */
function diagnoseLesson(doc, index, r, s) {
  const next = doc.records[index + 1];
  try {
    const out = s.teachMove({
      fenBefore: doc.fens[index],
      uci: r.uci,
      bestUci: r.bestUci,
      bestPv: r.bestPv.length && r.bestPv[0] === r.bestUci ? r.bestPv : [r.bestUci],
      replyPv: next ? next.bestPv : [],
      cls: r.cls,
      lossPct: r.lossPct,
      bestScore: r.before,
      playedScore: r.after,
      playerMove: r.mover === doc.playerColor,
    });
    return { note: out ? null : 'teachMove returned null', threw: null };
  } catch (e) {
    return { note: null, threw: e?.message ?? String(e) };
  }
}

/**
 * The opponent's line lessonFor hands teachMove (review/lessons.ts), mirrored:
 * the selection is private to lessonFor and only picks an argument. momentOf
 * checks it by calling teachMove with it and comparing the lesson with
 * lessonFor's.
 */
function replyPvOf(doc, index) {
  const r = doc.records[index];
  const fen = doc.fens[index];
  const next = doc.records[index + 1];
  const deep = doc.positions?.[index]?.deep;
  const playedPv = r.evidence === 'verified' && deep?.complete && deep.played ? (deep.playedPv ?? deep.lines.find((line) => line.move === r.uci)?.pv) : undefined;
  const after = doc.positions?.[index + 1];
  if (playedPv?.[0] === r.uci && playedPv.length > 1 && uciLineToSan(fen, playedPv).length === playedPv.length) return playedPv.slice(1);
  if (next?.bestPv.length) return next.bestPv;
  if (after?.deep?.complete && after.deep.lines[0]) return after.deep.lines[0].pv;
  return after?.pv ?? [];
}

/** teachMove with lessonFor's arguments and `replyPv`: equal to lessonFor's lesson when `replyPv` is the line it read. */
function lessonWith(doc, index, replyPv, s) {
  const r = doc.records[index];
  const probes = (doc.ext?.captures ?? []).filter((p) => p.ply === index && p.best === r.bestUci && p.pv.length > 0);
  const defense = (doc.ext?.defenses ?? []).find((d) => d.ply === index && d.best === r.bestUci && d.pv[0] === d.defense);
  return s.teachMove({
    ...(probes.length ? { bestCaptures: probes.map((p) => p.pv) } : {}),
    ...(defense ? { bestDefense: defense.pv } : {}),
    fenBefore: doc.fens[index],
    uci: r.uci,
    bestUci: r.bestUci,
    bestPv: r.bestPv.length && r.bestPv[0] === r.bestUci ? r.bestPv : [r.bestUci],
    replyPv,
    cls: r.cls,
    lossPct: r.lossPct,
    bestScore: r.before,
    playedScore: r.after,
    playerMove: r.mover === doc.playerColor,
  });
}

/** Every non-finite number or undefined in a value, by path: JSON would turn them into null without a word. */
function badLeaves(value, path = '') {
  if (value === undefined) return [path || '(root)'];
  if (typeof value === 'number' && !Number.isFinite(value)) return [path];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => badLeaves(v, `${path}.${k}`));
  return [];
}

/** One key moment: the position, the engine's answer as SAN, and the app's texts for it. */
function momentOf(c, doc, kept, index, s) {
  const r = doc.records[index];
  const fenBefore = doc.fens[index];
  const id = `${c.id}-${r.ply}`;
  const deep = doc.positions[index]?.deep ?? null;
  const player = r.mover === doc.playerColor;
  const failures = [];
  const fail = (fn, message, extra = {}) => {
    failures.push({ fn, message, ...extra });
    console.error(`FAIL ${id} ${fn}: ${message}`);
  };
  const attempt = (fn, f) => {
    try {
      return f() ?? null;
    } catch (e) {
      fail(fn, e?.message ?? String(e));
      return null;
    }
  };

  const bestUci = r.bestUci || null;
  const bestSan = bestUci
    ? attempt('bestSan', () => {
        const san = uciLineToSan(fenBefore, [bestUci])[0];
        if (!san) throw new Error(`bestUci ${bestUci} is not legal from fenBefore`);
        return san;
      })
    : null;
  const pvUci = r.bestPv ?? [];
  const pvSan = attempt('bestPv', () => uciLineToSan(fenBefore, pvUci));
  const bestPv = pvSan ?? [];
  const pvNote = pvSan && pvSan.length < pvUci.length ? `stops at ply ${pvSan.length + 1} of ${pvUci.length}: ${pvUci[pvSan.length]} is not legal there` : null;

  const commentFor = attempt('commentFor', () => s.commentFor(r, fenBefore, player, recaptureSquare(doc.records, index)));
  const whyLabel = attempt('whyLabel', () => s.whyLabel(r));
  const lessonFor = attempt('lessonFor', () => s.lessonFor(doc, index));
  let lessonNote = null;
  if (lessonFor === null && s.wantsLesson(r)) {
    const d = diagnoseLesson(doc, index, r, s);
    if (d.threw) {
      lessonNote = `teachMove threw: ${d.threw}`;
      fail('lessonFor', `teachMove threw, and lessonFor's own catch returned null: ${d.threw}`, { swallowed: true });
    } else {
      lessonNote = d.note;
    }
  }
  const retryTeaching = attempt('retryTeaching', () => s.retryTeaching(doc, index));
  const cardShows = lessonFor !== null && s.ERROR_CLASS.has(r.cls) ? 'lesson' : 'comment';
  const replyPvUci = lessonFor ? replyPvOf(doc, index) : null;
  if (lessonFor && JSON.stringify(attempt('replyPv', () => lessonWith(doc, index, replyPvUci, s))) !== JSON.stringify(lessonFor)) {
    fail('replyPv', 'teachMove with the mirrored reply line writes a different lesson from lessonFor');
  }

  const moment = {
    id,
    game: c.id,
    gameRef: c.game,
    url: c.url,
    ply: r.ply,
    index,
    moveNumber: r.moveNumber,
    mover: r.mover,
    playerColor: doc.playerColor,
    fenBefore,
    san: r.san,
    uci: r.uci,
    cls: r.cls,
    storedCls: kept.records[index]?.cls ?? null,
    judged: r.judged,
    lossPct: r.lossPct,
    before: r.before,
    after: r.after,
    winAfter: r.winAfter,
    evidence: r.evidence,
    onlyMove: r.onlyMove,
    sacrifice: r.sacrifice,
    whatWasMissed: r.whatWasMissed,
    motifs: r.motifs,
    gapToSecond: r.gapToSecond,
    deepAgrees: r.deepAgrees,
    mateSlipped: r.mateSlipped,
    bestUci,
    bestSan,
    bestPv,
    bestPvUci: pvUci,
    // The opponent's line after the move that the lesson reads (UCI), when there is a lesson.
    replyPvUci,
    // The searched captures of the best move (ext.captures), each line from the position after it.
    probes: (doc.ext?.captures ?? []).filter((p) => p.ply === index).map((p) => ({ capture: p.capture, pv: p.pv })),
    // The natural defense to the best move's threat (ext.defenses), its line from the position after it.
    defenses: (doc.ext?.defenses ?? []).filter((p) => p.ply === index).map((p) => ({ best: p.best, defense: p.defense, band: p.band, p: p.p, pv: p.pv })),
    pvNote,
    bestFromPass2: deep !== null && deep.complete === true,
    pass2: { present: deep !== null, complete: deep ? deep.complete : null },
    profile: doc.provenance.profile,
    scanNodes: doc.provenance.scanNodes,
    verifyNodes: doc.provenance.verifyNodes,
    texts: { commentFor, cardShows, whyLabel, lessonFor, retryTeaching },
    lessonNote,
    uiNotes: UI_NOTES,
    failures,
  };
  for (const path of badLeaves(moment)) fail('serialize', `non-finite or undefined value at ${path}`);
  return moment;
}

const fmtNum = (x, d = 1) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : 'none');
const fmtScore = (sc) => (sc == null ? 'none' : sc.mate != null ? `mate ${sc.mate}` : `${sc.cp} cp`);
const quote = (t) => (t == null ? 'null' : JSON.stringify(t));
const san = (m) => `${m.moveNumber}${m.mover === 'w' ? '.' : '...'} ${m.san}`;

/**
 * One sample per class where there are enough slots (best classes first), and
 * the remaining slots to the classes with the most moments per slot; within a
 * class, evenly spaced moments.
 */
function pickSamples(moments, classes, n) {
  if (moments.length <= n) return moments;
  const byClass = new Map(classes.map((c) => [c, moments.filter((m) => m.cls === c)]));
  const present = classes.filter((c) => byClass.get(c).length > 0);
  const order = present.slice(0, Math.min(n, present.length));
  const slots = new Map(order.map((c) => [c, 1]));
  let left = n - order.length;
  while (left > 0) {
    const open = order.filter((c) => slots.get(c) < byClass.get(c).length);
    if (!open.length) break;
    const next = open.reduce((best, c) => (byClass.get(c).length / slots.get(c) > byClass.get(best).length / slots.get(best) ? c : best), open[0]);
    slots.set(next, slots.get(next) + 1);
    left--;
  }
  const picks = [];
  for (const c of order) {
    const list = byClass.get(c);
    const k = slots.get(c);
    for (let j = 0; j < k; j++) picks.push(list[Math.floor(((j + 0.5) * list.length) / k)]);
  }
  return picks;
}

function sampleSection(m, n) {
  const L = [];
  const who = m.mover === m.playerColor ? 'the player' : 'the opponent';
  L.push(`### ${n}. ${m.id}: ${san(m)}, ${m.cls}`, '');
  L.push(`- Game: ${m.url}, ply ${m.ply}, ${who} moved; the player is ${m.playerColor === 'w' ? 'White' : 'Black'}.`);
  L.push(`- fenBefore: \`${m.fenBefore}\``);
  L.push(`- Move: ${m.san} (${m.uci}). Class ${m.cls}, judged ${m.judged ?? 'none'}, win% lost ${fmtNum(m.lossPct)}, evidence ${m.evidence}. Before ${fmtScore(m.before)}, after ${fmtScore(m.after)}, winAfter ${m.winAfter ?? 'none'} (White's view).`);
  L.push(`- Best: ${m.bestSan ?? 'none'} (${m.bestUci ?? 'none'}), from pass 2: ${m.bestFromPass2 ? 'yes' : 'no'}. Budgets: scan ${m.scanNodes} nodes, verify ${m.verifyNodes}.`);
  L.push(`- Best line (SAN): ${m.bestPv.join(' ') || 'none'}${m.pvNote ? ` (${m.pvNote})` : ''}`);
  L.push(`- Flags: onlyMove ${m.onlyMove}; gapToSecond ${fmtNum(m.gapToSecond, 0)}; sacrifice ${m.sacrifice ? JSON.stringify(m.sacrifice) : 'none'}; whatWasMissed ${m.whatWasMissed ?? 'none'}; motifs ${m.motifs.join(', ') || 'none'}.`);
  L.push('', `**commentFor** (the card; the card shows ${m.texts.cardShows === 'lesson' ? 'the lesson headline instead' : 'this text'}):`, '', `> ${m.texts.commentFor ?? 'null'}`, '');
  L.push('**whyLabel**:', '');
  if (m.texts.whyLabel === null) L.push('- null');
  else for (const line of m.texts.whyLabel) L.push(`- ${line}`);
  L.push('');
  const lesson = m.texts.lessonFor;
  L.push('**lessonFor**:', '');
  if (lesson === null) {
    L.push(`- null${m.lessonNote ? ` (${m.lessonNote})` : ''}`);
  } else {
    L.push(`- headline: ${quote(lesson.headline)}`);
    L.push(`- takeaway: ${quote(lesson.takeaway)}`);
    L.push(`- yourMove: ${lesson.yourMove.length ? lesson.yourMove.map((t) => quote(t)).join('; ') : '[]'}`);
    for (const key of ['allowed', 'better']) {
      const x = lesson[key];
      L.push(`- ${key}: ${x ? `san ${x.san}, material ${x.material}, points ${x.points.map((t) => quote(t)).join('; ') || '[]'}, line ${quote(x.line)}` : 'null'}`);
    }
    L.push(`- difference: ${lesson.difference.length ? lesson.difference.map((t) => quote(t)).join('; ') : '[]'}`);
    L.push(`- grade: ${quote(lesson.grade)}`);
  }
  L.push('');
  const t = m.texts.retryTeaching;
  L.push('**retryTeaching**:', '');
  if (t === null) L.push('- null');
  else {
    L.push(`- hint: ${quote(t.hint)}`);
    L.push(`- from: ${quote(t.from)}`);
    L.push(`- answer: ${t.answer ? `${t.answer.san} (${t.answer.uci})` : 'null'}`);
    L.push(`- reason: ${quote(t.reason)}`);
  }
  L.push('');
  L.push(`Failures: ${m.failures.length ? m.failures.map((f) => `${f.fn}: ${f.message}`).join(' | ') : 'none'}.`, '');
  return L;
}

function renderPreview(ctx) {
  const { moments, games, gameFailures, meta, stored, samples, classes } = ctx;
  const L = [];
  const count = (pred) => moments.filter(pred).length;
  const nonEmpty = (x) => typeof x === 'string' && x.length > 0;
  const byClass = classes.map((c) => [c, count((m) => m.cls === c)]);
  const failures = moments.flatMap((m) => m.failures.map((f) => ({ id: m.id, ...f })));
  const failByFn = {};
  for (const f of failures) failByFn[f.fn] = (failByFn[f.fn] ?? 0) + 1;

  L.push('# explain-top-move: the input set', '');
  L.push(
    "Built by `build-cases.mjs` from the accuracy eval's 60 games (`private/accuracy-vs-chesscom/cases.json`). Each game's kept phone document (`private/accuracy-vs-chesscom/evidence/phone/<id>.json`) is re-read under the app checkout's code the way `run-eval.mjs` `reread()` reads it. Every key moment's texts are the review and knowledge services' own functions over that evidence. No engine ran.",
    '',
  );
  L.push(`- Code: git HEAD ${meta.head}. Uncommitted changes in the review, knowledge and gamereview sources: ${meta.dirty.length ? meta.dirty.join(', ') : 'none'}.`);
  L.push(`- Evidence: stored as ${meta.storedVersions.join(', ')} (builds: ${meta.builds.join(', ')}); re-read as ${meta.evidenceVersion} (\`EVIDENCE_VERSION\`).`);
  L.push(`- Key moments: \`keyMoments(review)\` matched the document's \`moments\` for ${meta.momentsAgree} of ${games.length} games.`);
  L.push(
    `- Stored vs re-read: ${stored.changed} of ${stored.records} plies got a different class from the stored document (${stored.keyMomentsChanged} of ${moments.length} key moments).`,
  );
  L.push(`- Game-level failures: ${gameFailures.length ? gameFailures.map((g) => `${g.game}: ${g.message}`).join('; ') : 'none'}.`, '');

  L.push('## Counts', '');
  L.push(`- Games: ${games.length} (${games.filter((g) => g.moments > 0).length} with key moments). Key moments: ${moments.length}.`, '');
  L.push('| class | moments |', '|---|---|');
  for (const [c, n] of byClass) L.push(`| ${c} | ${n} |`);
  L.push('');
  L.push('| text (non-null per moment) | moments |', '|---|---|');
  L.push(`| commentFor | ${count((m) => nonEmpty(m.texts.commentFor))} |`);
  L.push(`| whyLabel (non-empty) | ${count((m) => Array.isArray(m.texts.whyLabel) && m.texts.whyLabel.length > 0)} |`);
  L.push(`| lessonFor | ${count((m) => m.texts.lessonFor !== null)} |`);
  L.push(`| card shows the lesson (cardShows = lesson) | ${count((m) => m.texts.cardShows === 'lesson')} |`);
  L.push(`| retryTeaching.answer | ${count((m) => m.texts.retryTeaching?.answer != null)} |`);
  L.push(`| retryTeaching.hint | ${count((m) => m.texts.retryTeaching?.hint != null)} |`);
  L.push(`| retryTeaching.from | ${count((m) => m.texts.retryTeaching?.from != null)} |`);
  L.push(`| retryTeaching.reason | ${count((m) => m.texts.retryTeaching?.reason != null)} |`);
  L.push(`| bestSan | ${count((m) => m.bestSan !== null)} |`);
  L.push(`| bestPv (non-empty SAN line) | ${count((m) => m.bestPv.length > 0)} |`);
  L.push(`| best move from pass 2 (deep complete) | ${count((m) => m.bestFromPass2)} |`);
  L.push('');
  const evidence = {};
  for (const m of moments) evidence[m.evidence] = (evidence[m.evidence] ?? 0) + 1;
  L.push(`Evidence status: ${Object.entries(evidence).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
  const noLesson = count((m) => m.texts.lessonFor === null);
  const engineMove = count((m) => m.texts.lessonFor === null && m.lessonNote === null);
  const nullReturn = count((m) => m.texts.lessonFor === null && m.lessonNote === 'teachMove returned null');
  const swallowed = count((m) => m.failures.some((f) => f.swallowed));
  L.push(
    `lessonFor is null for ${noLesson} moments: ${engineMove} where the played move is the engine's own move (no lesson wanted), ${nullReturn} where teachMove returned null, ${swallowed} where teachMove threw inside lessonFor (counted in failures).`,
    '',
  );
  const slipped = moments.filter((m) => m.mateSlipped !== null);
  L.push(
    `Mate slips: ${slipped.length} key moments have a mate the player let slip (mateSlipped), ${slipped.filter((m) => m.cls === 'good' || m.cls === 'excellent').length} of them graded good or excellent, so they are key moments for the slip and not for the grade.`,
    '',
  );
  L.push(`Failures: ${failures.length}${failures.length ? ` (${Object.entries(failByFn).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}.`);
  for (const f of failures.slice(0, 40)) L.push(`- ${f.id} ${f.fn}: ${f.message}`);
  L.push('');
  L.push('## Templates', '');
  L.push('Each moment carries `uiNotes`: the wrappers the UI puts around these texts, with file and line. The texts themselves are only the functions\' output.', '');
  L.push('## Samples', '');
  L.push(`${samples.length} moments, one per class where the slots allow (best classes first), then the largest classes. Scores are White's point of view.`, '');
  samples.forEach((m, i) => L.push(...sampleSection(m, i + 1)));
  return L.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const s = await loadServices();
  const cases = JSON.parse(readFileSync(join(ACCURACY, 'cases.json'), 'utf8'));
  const probes = existsSync(args.probes) ? JSON.parse(readFileSync(args.probes, 'utf8')).games ?? {} : {};
  const defenses = existsSync(args.defenses) ? JSON.parse(readFileSync(args.defenses, 'utf8')).games ?? {} : {};
  const moments = [];
  const gameFailures = [];
  const games = [];
  const stored = { records: 0, changed: 0, keyMomentsChanged: 0 };
  const meta = { momentsAgree: 0, storedVersions: new Set(), builds: new Set() };

  for (const c of cases) {
    const path = join(args.evidence, PROFILE, `${c.id}.json`);
    try {
      const kept = JSON.parse(readFileSync(path, 'utf8'));
      meta.storedVersions.add(kept.provenance?.evidenceVersion ?? 'none');
      meta.builds.add(kept.provenance?.build ?? 'none');
      const doc = reread(kept, s);
      if (probes[c.id]?.length) doc.ext = { ...(doc.ext ?? {}), captures: probes[c.id] };
      if (defenses[c.id]?.length) doc.ext = { ...(doc.ext ?? {}), defenses: defenses[c.id] };
      if (doc.fens.length !== doc.records.length + 1) throw new Error(`${doc.fens.length} fens for ${doc.records.length} records`);
      if (doc.playerColor !== c.playerColor) throw new Error(`document playerColor ${doc.playerColor} differs from cases.json (${c.playerColor})`);
      const km = s.keyMoments(doc);
      if (JSON.stringify(km) !== JSON.stringify(doc.moments)) throw new Error('keyMoments differs from the document\'s moments');
      meta.momentsAgree++;
      doc.records.forEach((r, i) => {
        stored.records++;
        const changed = kept.records[i]?.cls !== r.cls;
        if (changed) stored.changed++;
        if (changed && km.includes(i)) stored.keyMomentsChanged++;
      });
      for (const index of km) moments.push(momentOf(c, doc, kept, index, s));
      games.push({ game: c.id, moments: km.length });
    } catch (e) {
      const message = e?.message ?? String(e);
      gameFailures.push({ game: c.id, message });
      console.error(`FAIL game ${c.id}: ${message}`);
      games.push({ game: c.id, moments: 0 });
    }
  }

  moments.sort((a, b) => Number(a.game) - Number(b.game) || a.ply - b.ply);
  const classes = s.REVIEW_CLASSES;
  const samples = pickSamples(moments, classes, SAMPLE_COUNT);
  const gitOut = (gitArgs) => {
    try {
      return execFileSync('git', ['-C', ROOT, ...gitArgs], { encoding: 'utf8' }).trim();
    } catch (e) {
      return `unavailable (${(e?.message ?? '').split('\n')[0]})`;
    }
  };
  const dirtyRaw = gitOut(['status', '--porcelain', '--', 'src/services/review', 'src/services/knowledge', 'src/features/gamereview']);
  const runMeta = {
    head: gitOut(['rev-parse', '--short', 'HEAD']),
    dirty: dirtyRaw.startsWith('unavailable') ? [dirtyRaw] : dirtyRaw.split('\n').filter(Boolean),
    storedVersions: [...meta.storedVersions],
    builds: [...meta.builds],
    evidenceVersion: s.EVIDENCE_VERSION,
    momentsAgree: meta.momentsAgree,
  };

  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, 'cases.json'), `${JSON.stringify(moments, null, 2)}\n`);
  writeFileSync(join(args.out, 'preview.md'), `${renderPreview({ moments, games, gameFailures, meta: runMeta, stored, samples, classes })}\n`);

  const failures = moments.flatMap((m) => m.failures);
  const failuresByFn = {};
  for (const f of failures) failuresByFn[f.fn] = (failuresByFn[f.fn] ?? 0) + 1;
  const byClass = Object.fromEntries(classes.map((c) => [c, moments.filter((m) => m.cls === c).length]).filter(([, n]) => n > 0));
  const summary = {
    games: cases.length,
    gamesWithMoments: games.filter((g) => g.moments > 0).length,
    gameFailures: gameFailures.length,
    moments: moments.length,
    byClass,
    commentFor: moments.filter((m) => typeof m.texts.commentFor === 'string' && m.texts.commentFor.length > 0).length,
    whyLabel: moments.filter((m) => m.texts.whyLabel?.length > 0).length,
    lessonFor: moments.filter((m) => m.texts.lessonFor !== null).length,
    cardShowsLesson: moments.filter((m) => m.texts.cardShows === 'lesson').length,
    retryAnswer: moments.filter((m) => m.texts.retryTeaching?.answer != null).length,
    retryHint: moments.filter((m) => m.texts.retryTeaching?.hint != null).length,
    retryFrom: moments.filter((m) => m.texts.retryTeaching?.from != null).length,
    retryReason: moments.filter((m) => m.texts.retryTeaching?.reason != null).length,
    bestSan: moments.filter((m) => m.bestSan !== null).length,
    bestPv: moments.filter((m) => m.bestPv.length > 0).length,
    bestFromPass2: moments.filter((m) => m.bestFromPass2).length,
    failures: failures.length,
    failuresByFn,
    storedClassChanges: { plies: stored.records, changed: stored.changed, keyMoments: stored.keyMomentsChanged },
    samples: samples.map((m) => m.id),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (gameFailures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`build-cases failed: ${e?.stack ?? e}`);
  process.exitCode = 1;
});
