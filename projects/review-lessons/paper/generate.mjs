#!/usr/bin/env node
// Writes paper/generated.tex for the review's lesson link: the rule's verdict
// (results/judge.json), what each matcher names (results/measure.json), the
// train round that narrowed the candidate (results/train-six-kinds.json), the
// lessons' wrong moves as the board code reads them, and three positions from
// the held-out moments. It refuses to write when a claim the paper makes no
// longer holds.
//
//   bridge/run.sh projects/review-lessons/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, esc, fixed, line, movesTex, percent, word } from '../../paper.mjs'
import {
  CONTROLS,
  COVERAGE_SLACK,
  DECOY_BAR,
  DRAWS,
  HELDOUT_FROM,
  HELDOUT_UNTIL,
  INSPECTED,
  JUDGE_HELDOUT,
  JUDGE_TRAIN,
  PROJECT,
  SAME_BAR,
  TRAIN_EVERY,
  TRAIN_UNTIL,
  readJson,
  reviewPath,
} from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const K = await chess('src/services/knowledge/index.ts')
const S = await chess('src/services/study/index.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')
const { readChapters } = await chess('src/adapters/content/study.ts')
const res = resultsDir(PROJECT)
const dir = privateDir(PROJECT)
const measured = readJson(join(res, 'measure.json'))
const judged = readJson(join(res, 'judge.json'))
const six = readJson(join(res, 'train-six-kinds.json'))
const g = new Generated('projects/review-lessons/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const f2 = (x) => fixed(x, 2)
const interval = (s) => `${f2(s.net)} (${f2(s.interval[0])} to ${f2(s.interval[1])})`

claim(measured.app.commit === judged.app.commit, 'the measure and the judge read the same app commit')
const T = measured.splits.train
const H = measured.splits.heldout
const JT = judged.judged.train
const JH = judged.judged.heldout
claim(T.missing === 0 && H.missing === 0, 'every game of both splits was reviewed')

// ---- what was measured ----
const study = buildStudyFromDisk(CHESS_DIR)
const spots = study.lessons.flatMap((d) => S.workbookSpots(d))
const wrong = spots.filter((s) => s.intent === 'counterexample')
const chapters = readChapters(study.lessons)
claim(chapters.length === measured.app.chapters && chapters.filter((c) => c.mistakes.length).length === measured.app.withMistakes, 'the chapters read here are the ones measured')
g.def('AppCommit', measured.app.commit.slice(0, 10)).def('Lessons', String(measured.app.lessons)).def('Chapters', String(chapters.length))
g.def('WrongMoves', String(wrong.length)).def('WithMistakes', String(measured.app.withMistakes))
g.def('TrainUntil', TRAIN_UNTIL).def('HeldFrom', HELDOUT_FROM).def('HeldUntil', HELDOUT_UNTIL).def('TrainEvery', word(TRAIN_EVERY))
g.def('Inspected', INSPECTED.join(', ')).def('InspectedN', word(INSPECTED.length))
g.def('JudgeTrain', String(JUDGE_TRAIN)).def('JudgeHeld', String(JUDGE_HELDOUT)).def('Controls', String(CONTROLS)).def('Draws', count(DRAWS))
g.def('SameBar', String(SAME_BAR)).def('DecoyBar', String(DECOY_BAR)).def('CoverageSlack', percent(COVERAGE_SLACK, 0))
g.def('MistakePlies', word(K.MISTAKE_PLIES))
for (const [p, s] of [['Train', T], ['Held', H]]) {
  g.def(`${p}Games`, String(s.games)).def(`${p}Moments`, count(s.moments)).def(`${p}Differ`, String(s.differ))
  g.def(`${p}BCoverage`, percent(s.b.coverage)).def(`${p}CCoverage`, percent(s.c.coverage))
  g.def(`${p}BChapters`, String(s.b.chapters)).def(`${p}CChapters`, String(s.c.chapters)).def(`${p}BLessons`, String(s.b.lessons)).def(`${p}CLessons`, String(s.c.lessons))
  g.def(`${p}BTop`, percent(s.b.top.share)).def(`${p}CTop`, percent(s.c.top.share))
  g.def(`${p}ViaMistake`, String(s.via.mistake ?? 0)).def(`${p}ViaFix`, String(s.via.fix ?? 0)).def(`${p}ViaReply`, String(s.via.reply ?? 0)).def(`${p}ViaNone`, String(s.via.none ?? 0))
  g.def(`${p}Read`, percent(1 - (s.mistakes.none ?? 0) / s.moments, 0))
}
claim(T.b.top.chapter === H.b.top.chapter && T.c.top.chapter === T.b.top.chapter && H.c.top.chapter === H.b.top.chapter, "one chapter is both matchers' most named on both splits")
g.def('TopTitle', esc(T.b.top.title))
const topLesson = study.lessons.find((d) => d.id === T.b.top.chapter.split(':')[0])
g.def('TopLesson', esc(topLesson.title))

// ---- the kinds ----
const KIND_WORDS = {
  'allows-mate': ['allows mate', 'the line mates within three of their moves'],
  'bad-capture': ['captures at a loss', 'his capture loses the exchange, and they take back on that square'],
  'unsafe-square': ['lands on an unsafe square', 'their first move takes the moved piece and wins the exchange'],
  'opens-line': ['opens a line', 'their first move captures along a line through the square his piece left'],
  'deserted-guard': ['deserts a guard', 'the moved piece guarded a piece that now has no guard, and they take it within three plies'],
  'ignored-threat': ['leaves a loose piece', 'their first move takes a piece of his that was already loose'],
  'allows-tactic': ['allows a tactic', 'a move of theirs in the line wins material with a tactic the board code names'],
  'loses-material': ['loses material', 'the line loses two points or more, their capture within three plies'],
}
const READ_ORDER = Object.keys(KIND_WORDS)
claim(K.MISTAKE_KINDS.every((k) => KIND_WORDS[k]) && K.MISTAKE_KINDS.length === READ_ORDER.length, 'every kind the reader names has its words')
claim(S.MISTAKE_CHAPTER_KINDS.join(',') === 'allows-mate,deserted-guard,bad-capture,allows-tactic', 'C links by the mistake for four kinds')
const shownKinds = new Map()
for (const m of chapters.flatMap((c) => c.mistakes)) shownKinds.set(m.kind, (shownKinds.get(m.kind) ?? 0) + 1)
g.def('ReadWrong', String([...shownKinds.values()].reduce((a, b) => a + b, 0)))
const kindRow = (k) =>
  `\\texttt{${k}} & ${KIND_WORDS[k][1]} & ${shownKinds.get(k) ?? 0} & ${T.mistakes[k] ?? 0} & ${H.mistakes[k] ?? 0} & ${S.MISTAKE_CHAPTER_KINDS.includes(k) ? 'yes' : 'no'} \\\\`
g.block(
  'KindTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabularx}{\\textwidth}{lLrrrc}',
    '\\toprule',
    'Kind & What the board code sees & Lessons & Train & Held out & C links \\\\',
    '\\midrule',
    ...READ_ORDER.map(kindRow),
    `none & no kind fits, or the line loses no material & & ${T.mistakes.none ?? 0} & ${H.mistakes.none ?? 0} & \\\\`,
    '\\bottomrule',
    '\\end{tabularx}',
    `\\caption{What his move got wrong, read from the move and the reply line the review's lesson shows, in the order the reader tries them at the capture it reads. \\emph{Lessons}: the lessons' wrong moves read as that kind. \\emph{Train}, \\emph{Held out}: his moments. \\emph{C links}: C names the chapter showing the same mistake for this kind; the others fall back to B.}`,
    '\\label{tab:kinds}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the verdict ----
const rule = judged.rule
g.def('Kept', rule.kept ? 'kept' : 'not kept')
for (const [p, s] of [['Train', JT], ['Held', JH]]) {
  g.def(`${p}Judged`, String(s.judged)).def(`${p}Wins`, String(s.wins)).def(`${p}Ties`, String(s.ties)).def(`${p}Losses`, String(s.losses)).def(`${p}Net`, interval(s))
}
const ctl = judged.controls
g.def('SameSame', String(ctl.same.same)).def('SameJudged', String(ctl.same.judged)).def('DecoyWins', String(ctl.decoy.cWins)).def('DecoyJudged', String(ctl.decoy.judged))
g.def('DecoySame', String(ctl.decoy.same)).def('DecoyLosses', String(ctl.decoy.cLosses))
claim(ctl.same.same >= SAME_BAR && ctl.decoy.cWins >= DECOY_BAR, 'the controls hold')
claim(H.c.coverage >= H.b.coverage - COVERAGE_SLACK && Math.abs(H.c.coverage - H.b.coverage) <= COVERAGE_SLACK, 'held out, C names a chapter about as often as B')
claim(H.c.chapters > H.b.chapters, 'held out, C spreads its links over more chapters than B')
claim(H.c.top.share < H.b.top.share, "held out, C's most named chapter takes a smaller share than B's")
claim(JH.wins > JH.losses && JT.wins >= JT.losses, 'C wins more than it loses held out, and not fewer on train')
const ruleRow = (name, t, h) => `${name} & ${t} & ${h} \\\\`
g.block(
  'RuleTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    ' & Train & Held out \\\\',
    '\\midrule',
    ruleRow('Games (moments)', `${T.games} (${count(T.moments)})`, `${H.games} (${count(H.moments)})`),
    ruleRow('Moments where B and C name different chapters', JT.differ, JH.differ),
    ruleRow('\\quad judged (both name one)', JT.judged, JH.judged),
    ruleRow('\\textbf{C wins / ties / losses}', `\\textbf{${JT.wins} / ${JT.ties} / ${JT.losses}}`, `\\textbf{${JH.wins} / ${JH.ties} / ${JH.losses}}`),
    ruleRow('\\textbf{(wins $-$ losses) / judged} (bar: interval above 0)', interval(JT), `\\textbf{${interval(JH)}}`),
    ruleRow(`\\textbf{Coverage}, B; C (bar: C at least B $-$ ${percent(COVERAGE_SLACK, 0)} points)`, `${percent(T.b.coverage)}\\%; ${percent(T.c.coverage)}\\%`, `${percent(H.b.coverage)}\\%; \\textbf{${percent(H.c.coverage)}\\%}`),
    ruleRow("\\textbf{Most named chapter's share}, B; C (bar: C at most B)", `${percent(T.b.top.share)}\\%; ${percent(T.c.top.share)}\\%`, `${percent(H.b.top.share)}\\%; \\textbf{${percent(H.c.top.share)}\\%}`),
    ruleRow('Distinct chapters (lessons), B; C', `${T.b.chapters} (${T.b.lessons}); ${T.c.chapters} (${T.c.lessons})`, `${H.b.chapters} (${H.b.lessons}); ${H.c.chapters} (${H.c.lessons})`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The rule's measures. A moment is a win for C when the judge preferred C in both orders, or in one with the other the same; a loss likewise for B. Intervals are 95\\% percentiles of ${count(DRAWS)} bootstrap draws over games. Coverage is the share of moments where the matcher names a chapter.}`,
    '\\label{tab:rule}',
    '\\end{table}',
  ].join('\n'),
)

// ---- by kind ----
const KINDS = ['allows-mate', 'deserted-guard', 'bad-capture', 'unsafe-square', 'opens-line', 'allows-tactic']
claim(KINDS.every((k) => READ_ORDER.includes(k)), 'the by-kind table names kinds the reader names')
const sixKinds = six.judged.train.kinds
const kinds = (s) => s.kinds ?? {}
const cell = (o) => (o ? `${o.win} / ${o.tie} / ${o.loss}` : '--')
const byKind = KINDS.filter((k) => sixKinds[k] || kinds(JT)[k] || kinds(JH)[k])
g.block(
  'ByKindTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lccc}',
    '\\toprule',
    'His mistake & Train, six kinds & Train, four kinds & Held out, four kinds \\\\',
    '\\midrule',
    ...byKind.map((k) => `\\texttt{${k}} & ${cell(sixKinds[k])} & ${cell(kinds(JT)[k])} & ${cell(kinds(JH)[k])} \\\\`),
    '\\midrule',
    `All & ${six.judged.train.wins} / ${six.judged.train.ties} / ${six.judged.train.losses} & ${JT.wins} / ${JT.ties} / ${JT.losses} & ${JH.wins} / ${JH.ties} / ${JH.losses} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{C's wins / ties / losses by what his move got wrong. The first column is the train round of the candidate before it was narrowed; the kinds C no longer links by fall back to B and leave the judged pairs.}",
    '\\label{tab:bykind}',
    '\\end{table}',
  ].join('\n'),
)
for (const k of ['unsafe-square', 'opens-line']) claim(sixKinds[k] && sixKinds[k].loss > sixKinds[k].win, `on train, the six-kind round lost more than it won on ${k}`)
for (const k of S.MISTAKE_CHAPTER_KINDS) claim(!sixKinds[k] || sixKinds[k].win >= sixKinds[k].loss, `on train, the six-kind round won at least as often as it lost on ${k}`)
g.def('SixWins', String(six.judged.train.wins)).def('SixTies', String(six.judged.train.ties)).def('SixLosses', String(six.judged.train.losses)).def('SixJudged', String(six.judged.train.judged))

// ---- each path against a decoy ----
const PATHS = [
  ['mistake', 'the same mistake'],
  ['fix', "the engine's move"],
  ['reply', 'their reply'],
]
g.block(
  'PathTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrrrrc}',
    '\\toprule',
    "C's chapter, from & Held-out moments & C wins & same & C loses & Shown \\\\",
    '\\midrule',
    ...PATHS.map(([via, words]) => {
      const p = judged.paths[via]
      return `${words} (\\texttt{${via}}) & ${H.via[via] ?? 0} & ${p.cWins} & ${p.same} & ${p.cLosses} & ${p.shown ? 'yes' : 'no'} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Each way C names a chapter, against a chapter drawn at random from the other lessons: up to ${CONTROLS} held-out moments each, judged in both orders. A path is shown in the Game Review when C wins at least ${DECOY_BAR}.}`,
    '\\label{tab:paths}',
    '\\end{table}',
  ].join('\n'),
)
for (const [via] of PATHS) g.def(`Path${via[0].toUpperCase()}${via.slice(1)}Wins`, String(judged.paths[via].cWins)).def(`Path${via[0].toUpperCase()}${via.slice(1)}Judged`, String(judged.paths[via].judged))
claim(PATHS.every(([via]) => judged.paths[via].shown === judged.paths[via].cWins >= DECOY_BAR), 'a path is shown exactly when it reaches the decoy bar')
claim(judged.paths.mistake.cWins > Math.max(judged.paths.fix.cWins, judged.paths.reply.cWins), "the mistake path beats its decoy more often than B's two paths do")
const { LINKED_VIAS } = await chess('src/features/gamereview/lessonLink.ts')
claim(LINKED_VIAS.join(',') === PATHS.filter(([via]) => judged.paths[via].shown).map(([via]) => via).join(','), 'the Game Review links from exactly the paths that reached the bar')

// ---- three positions ----
const rows = readJson(join(dir, 'rows-heldout.json'))
const docs = new Map()
const docOf = (game) => (docs.has(game) ? docs.get(game) : docs.set(game, readJson(reviewPath(dir, game))).get(game))
const key = (m) => `${m.lesson}:${m.chapter}`
const verdictOf = (row) => {
  const at = (order) => readJson(join(dir, 'judge', `pair-heldout-${row.game.replace(/^cc:/, '')}-${row.index}-${order}.json`))
  const a = at('cb')
  const b = at('bc')
  if (!a || !b || a.pair !== `${key(row.c)} / ${key(row.b)}` || b.pair !== `${key(row.b)} / ${key(row.c)}`) return null
  return a.winner === 'c' && b.winner === 'c' ? 'win' : null
}
const chapterOf = (m) => {
  const doc = study.lessons.find((d) => d.id === m.lesson)
  const scene = doc.script.find((s) => s.n === m.chapter)
  return { lesson: doc.title, chapter: scene.title }
}
const won = rows.filter((r) => r.c?.via === 'mistake' && r.b && key(r.b) !== key(r.c) && verdictOf(r) === 'win')
const pick = (kind, taken) => won.filter((r) => r.mistake?.kind === kind && !taken.has(r.game))[0]
const taken = new Set()
const examples = []
for (const [prefix, kind] of [
  ['Ea', 'allows-mate'],
  ['Eb', 'deserted-guard'],
  ['Ec', 'allows-tactic'],
]) {
  const r = pick(kind, taken)
  claim(r, `a held-out moment of kind ${kind} that C won in both orders exists`)
  taken.add(r.game)
  examples.push([prefix, r])
}
const R = await chess('src/services/review/index.ts')
const side = (fen) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black')
for (const [prefix, r] of examples) {
  const doc = docOf(r.game)
  const rec = doc.records[r.index]
  const fen = doc.fens[r.index]
  const reading = R.lessonReading(doc, r.index)
  claim(reading?.mistake?.kind === r.mistake.kind, `the ${prefix} moment reads as ${r.mistake.kind} again`)
  const reply = reading.mistake.line
  const played = line(fen, [rec.uci])
  const after = played.sans.length ? line(fen, [rec.uci, ...reply]) : null
  const best = line(fen, [rec.bestUci])
  const b = chapterOf(r.b)
  const c = chapterOf(r.c)
  g.def(`${prefix}Side`, side(fen)).def(`${prefix}Fen`, `\\fen{${fen}}`)
  g.def(`${prefix}Played`, movesTex(fen, played.sans)).def(`${prefix}PlayedUci`, `\\uci{${rec.uci}}`)
  g.def(`${prefix}Best`, movesTex(fen, best.sans)).def(`${prefix}BestUci`, `\\uci{${rec.bestUci}}`)
  g.def(`${prefix}Line`, movesTex(fen, after.sans)).def(`${prefix}LineUci`, `\\uci{${[rec.uci, ...reply].join(' ')}}`)
  g.def(`${prefix}Kind`, `\\texttt{${r.mistake.kind}}${r.mistake.idea ? ` (\\texttt{${r.mistake.idea}})` : ''}`)
  g.def(`${prefix}BLesson`, esc(b.lesson)).def(`${prefix}BChapter`, esc(b.chapter)).def(`${prefix}CLesson`, esc(c.lesson)).def(`${prefix}CChapter`, esc(c.chapter))
  g.block(`${prefix}Board`, board(fen, { played: rec.uci, better: rec.bestUci, size: '11pt' }))
}

g.write(join(HERE, 'generated.tex'))
console.error('review-lessons: wrote paper/generated.tex')
