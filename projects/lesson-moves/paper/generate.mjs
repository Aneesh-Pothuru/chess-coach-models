#!/usr/bin/env node
// Writes paper/generated.tex for the lesson pick: the rule's verdict and the
// descriptions (results/lesson-moves.json), what the private rows add to them
// (the picks that keep a won game, the picks that differ from the engine's
// first line, the chapters named), and four positions. It refuses to write
// when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/lesson-moves/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, line, movesTex, percent, word } from '../../paper.mjs'
import { PROJECT, bootstrapMean, lineOf, readJsonl, sansOf } from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const C = await chess('src/core/chess/index.ts')
const E = await chess('src/services/engine/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const R = await chess('src/services/review/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveDays } = await chess('src/adapters/node/archive/days.ts')
const out = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'lesson-moves.json'), 'utf8'))
const rows = readJsonl(join(privateDir(PROJECT), 'rows.jsonl'))
const g = new Generated('projects/lesson-moves/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const ci = (e, d = 2) => `${fixed(e.mean, d)} (${fixed(e.ci[0], d)} to ${fixed(e.ci[1], d)})`
const points = (e) => ({ mean: 100 * e.mean, ci: [100 * e.ci[0], 100 * e.ci[1]] })
const count = (n) => n.toLocaleString('en-US')
const sharePct = (x) => (x == null || x < 0.005 ? 'under 1' : percent(x, 0))
const SPLITS = ['train', 'heldout']

// ---- what was measured ----
const D = out.design
const T = out.bySplit.train
const H = out.bySplit.heldout
g.def('AppCommit', out.app.commit.slice(0, 10)).def('Lessons', String(out.app.lessons)).def('Chapters', String(out.app.chapters))
g.def('TrainUntil', D.trainUntil).def('HeldoutUntil', D.heldoutUntil).def('Draws', count(D.draws))
g.def('CoverageBar', percent(D.coverageBar, 0)).def('CostBar', fixed(D.costBar, 1))
g.def('Window', String(E.ACCEPT_WINDOW_WP)).def('KeptWon', String(K.JUDGMENT_THRESHOLDS.keptWon)).def('Offset', String(E.DEFAULT_LICHESS_OFFSET))
claim(D.holds.join(',') === R.TEACHING_HOLDS.player.join(',') && D.holds.join(',') === 'best,keeps', "the holding verdicts are the review's for his moves: best and keeps")
claim(R.GRADE_BANDS.found === E.ACCEPT_WINDOW_WP, "best is the review's window")
claim(rows.length === out.examined && out.examined === T.turningPoints + H.turningPoints, 'every examined turning point is a row of one split')
const SKIP_DESIGN = 'game: a day read while designing'
const SKIP_LATER = 'game: after the held-out days'
claim(Object.keys(out.skipped).every((k) => k === SKIP_DESIGN || k === SKIP_LATER), 'only whole games were left out: those of the days read while designing and those after the held-out days')
const skippedLater = out.skipped[SKIP_LATER] ?? 0
g.def('Examined', count(out.examined)).def('SkippedGames', word(out.skipped[SKIP_DESIGN] ?? 0)).def('MaxCandidates', word(Math.max(...rows.map((r) => r.candidates))))
g.def('SkippedLater', skippedLater > 0 ? `, and so are the ${word(skippedLater)} games played after ${D.heldoutUntil}, when the held-out split ends` : '')
for (const [p, s] of [['Train', T], ['Held', H]]) g.def(`${p}TPs`, count(s.turningPoints)).def(`${p}Games`, String(s.games))

// ---- the verdict ----
claim(out.kept && T.kept && H.kept, 'the pick is kept on both splits')
for (const s of [T, H]) {
  claim(s.coverage.p >= D.coverageBar && s.cost.mean <= D.costBar && s.cost.outside === 0 && s.findability.ci[0] > 0, 'every measure passes its bar')
  claim(s.coverage.p > 0.7 && s.fresh.p > 0.5, 'a lesson teaches the pick at most turning points, and for a purpose his move lacked at most')
  claim(s.cost.ci[1] < 0.5, 'the pick costs under half a win% on average')
}
const f2 = (x) => fixed(x, 2)
for (const [p, s] of [['Train', T], ['Held', H]]) {
  g.def(`${p}Coverage`, percent(s.coverage.p)).def(`${p}NoLesson`, percent(1 - s.coverage.p)).def(`${p}Fresh`, percent(s.fresh.p))
  g.def(`${p}Cost`, ci(s.cost)).def(`${p}CostMean`, f2(s.cost.mean)).def(`${p}Worst`, fixed(s.cost.worst, 1))
  g.def(`${p}Find`, ci(points(s.findability), 1)).def(`${p}FindMean`, fixed(100 * s.findability.mean, 1))
  g.def(`${p}VsNatural`, ci(points(s.vsNatural), 1))
  g.def(`${p}IsTop`, percent(s.isTop.p, 0)).def(`${p}IsNatural`, percent(s.isNatural.p, 0)).def(`${p}TopTaught`, percent(s.topTaught.p, 0))
  g.def(`${p}LessonsNamed`, String(s.lessonsNamed)).def(`${p}ChaptersNamed`, String(s.chaptersNamed))
}
const ruleRow = (name, f) => `${name} & ${f(T)} & ${f(H)} \\\\`
g.block(
  'RuleTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    ' & Train & Held out \\\\',
    '\\midrule',
    ruleRow('Turning points (games)', (s) => `${count(s.turningPoints)} (${s.games})`),
    ruleRow(`\\textbf{Taught by a lesson} (bar: ${percent(D.coverageBar, 0)}\\%)`, (s) => `\\textbf{${percent(s.coverage.p)}\\%}`),
    ruleRow('\\quad for a purpose his move lacked', (s) => `${percent(s.fresh.p)}\\%`),
    ruleRow(`\\textbf{Loss against E}, win\\% (bar: ${fixed(D.costBar, 1)})`, (s) => `\\textbf{${ci(s.cost)}}`),
    ruleRow('\\quad largest; picks outside the holding verdicts', (s) => `${fixed(s.cost.worst, 1)}; ${s.cost.outside}`),
    ruleRow('\\textbf{Share of L minus share of E}, points (bar: above 0)', (s) => `\\textbf{${ci(points(s.findability), 1)}}`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The rule's three measures on each split. Intervals are 95\\% percentiles of ${count(D.draws)} bootstrap draws over games. A share is Maia-2's probability for the move at his band, so a point is one percent of his band's choices.}`,
    '\\label{tab:rule}',
    '\\end{table}',
  ].join('\n'),
)

// ---- what the private rows add ----
const keeps = rows.filter((r) => r.pick.verdict === 'keeps')
const overWindow = rows.filter((r) => r.pick.loss > E.ACCEPT_WINDOW_WP)
claim(overWindow.every((r) => r.pick.verdict === 'keeps'), "every pick that loses more than the window keeps a won game won")
claim(keeps.length < rows.length / 20, 'few picks rely on keeping a won game')
g.def('KeepsPicks', word(keeps.length)).def('OverWindow', word(overWindow.length))

const differs = (r) => r.pick.move !== r.top.move
const gainWhere = Object.fromEntries(SPLITS.map((s) => [s, bootstrapMean(rows.filter((r) => r.split === s && differs(r)), (r) => (r.pick.share ?? 0) - (r.top.share ?? 0))]))
for (const s of SPLITS) claim(gainWhere[s].ci[0] > 0.05, `where the pick is not the engine's first line, his band plays it far more often (${s})`)
g.def('TrainDiffers', count(gainWhere.train.n)).def('HeldDiffers', count(gainWhere.heldout.n))
g.def('TrainGainWhere', ci(points(gainWhere.train), 1)).def('HeldGainWhere', ci(points(gainWhere.heldout), 1))
for (const s of [T, H]) {
  claim(s.isTop.p > 0.7 && s.isNatural.p > s.isTop.p, 'the pick is mostly the engine\'s first line, and more often the natural move')
  claim(s.vsNatural.ci[1] < 0, 'the pick is a little less natural than the natural move')
}

const taught = rows.filter((r) => r.reason === 'lesson' || r.reason === 'lesson-shared')
const PURPOSE = {
  'meets-threat': 'meets a threat',
  'wins-material': 'wins material',
  'trades-queens': 'trades queens',
  'offers-queen-trade': 'offers a queen trade',
  'trades-into-ending': 'trades into a pawn ending',
  'trades-when-ahead': 'trades when ahead',
  'passed-pawn': 'pushes a passed pawn',
  'ending-technique': 'an ending technique',
  'seventh-rank': 'a rook to the seventh rank',
  'open-file': 'a rook to an open file',
  'pawn-break': 'a pawn break',
  outpost: 'takes an outpost',
  'improves-worst-piece': 'improves the worst piece',
  castles: 'castles',
  develops: 'develops',
  'takes-centre': 'takes the centre',
  mate: 'mates',
}
const kinds = [...new Set(taught.map((r) => r.purpose))]
claim(kinds.every((k) => PURPOSE[k]), 'every purpose has its words')
const byKind = (split, k) => taught.filter((r) => r.split === split && r.purpose === k).length
kinds.sort((a, b) => byKind('train', b) + byKind('heldout', b) - (byKind('train', a) + byKind('heldout', a)))
claim(kinds[0] === 'meets-threat', 'meeting a threat is the purpose lesson picks are most often taught for')
for (const s of SPLITS) claim(out.bySplit[s].purposes['meets-threat'] === byKind(s, 'meets-threat'), 'the rows agree with the report')
g.def('ThreatShare', percent(taught.filter((r) => r.purpose === 'meets-threat').length / taught.length, 0)).def('Purposes', word(kinds.length))

const chapterInfo = new Map()
for (const list of Object.values(out.lessonsByPurpose)) for (const c of list) chapterInfo.set(`${c.lesson}:${c.chapter}`, c)
const chapterKey = (r) => `${r.lesson.id}:${r.lesson.chapter}`
const perChapter = new Map()
for (const r of taught) perChapter.set(chapterKey(r), (perChapter.get(chapterKey(r)) ?? 0) + 1)
const ranked = [...perChapter.entries()].sort((a, b) => b[1] - a[1])
const [firstKey, firstN] = ranked[0]
const [secondKey, secondN] = ranked[1]
const first = chapterInfo.get(firstKey)
const second = chapterInfo.get(secondKey)
claim(firstN / taught.length > 0.3 && (firstN + secondN) / taught.length > 0.5, 'two chapters carry over half the lesson picks')
g.def('TaughtN', count(taught.length)).def('ChaptersAll', String(perChapter.size)).def('LessonsAll', String(new Set(taught.map((r) => r.lesson.id)).size))
g.def('FirstShare', percent(firstN / taught.length, 0)).def('TwoShare', percent((firstN + secondN) / taught.length, 0))
g.def('FirstTitle', esc(first.title)).def('FirstIdea', esc(first.idea)).def('SecondTitle', esc(second.title)).def('SecondIdea', esc(second.idea))
const firstRows = taught.filter((r) => chapterKey(r) === firstKey)
const kindsOfFirst = new Set(firstRows.map((r) => r.purpose))
claim(kindsOfFirst.has('meets-threat') && kindsOfFirst.has('wins-material'), 'the most named chapter is named for meeting a threat and for winning material')
const queenMove = (r) => /^Q/.test(line(r.fen, [r.pick.move]).sans[0])
const notQueen = firstRows.filter((r) => !queenMove(r)).length
claim(/queen/i.test(first.idea) && /pawn/i.test(first.idea) && notQueen / firstRows.length > 0.5, "most picks that name the queen chapter don't move the queen")
g.def('FirstNotQueen', percent(notQueen / firstRows.length, 0))

const purposeRow = (k) => `${PURPOSE[k]} & ${byKind('train', k)} & ${byKind('heldout', k)} \\\\`
g.block(
  'PurposeTable',
  [
    '\\begin{table}[ht]\\centering\\small',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    'The pick & Train & Held out \\\\',
    '\\midrule',
    ...kinds.map(purposeRow),
    '\\midrule',
    `Taught by a lesson, all purposes & ${taught.filter((r) => r.split === 'train').length} & ${taught.filter((r) => r.split === 'heldout').length} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{The purpose a lesson teaches the pick for, as the board code reads it from the move and its engine line. These counts describe; they carry no rule.}",
    '\\label{tab:purposes}',
    '\\end{table}',
  ].join('\n'),
)

// ---- four positions ----
const san = (fen, uci) => line(fen, [uci]).sans[0]
const side = (fen) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black')
const gain = (r) => (r.pick.share ?? 0) - (r.top.share ?? 0)
const heldLesson = rows.filter((r) => r.split === 'heldout' && r.reason === 'lesson' && differs(r))
const pickOf = (test) => heldLesson.filter(test).sort((a, b) => gain(b) - gain(a))[0]
const examples = [
  ['Ea', pickOf((r) => r.purpose === 'trades-queens' || r.purpose === 'offers-queen-trade')],
  ['Eb', pickOf((r) => r.purpose === 'improves-worst-piece' || r.purpose === 'outpost')],
  ['Ec', pickOf((r) => r.purpose === 'pawn-break')],
  ['Ed', pickOf((r) => chapterKey(r) === firstKey && !queenMove(r))],
]
claim(examples.every(([, r]) => r) && new Set(examples.map(([, r]) => `${r.game}:${r.ply}`)).size === examples.length, 'four different examples exist')
function arrows(fen, top, pick, size = '11pt') {
  const mark = (uci, color) => `pgfstyle=straightmove, arrow=to, linewidth=0.07em, color=${color}, markmoves={${uci.slice(0, 2)}-${uci.slice(2, 4)}}`
  return `\\chessboard[setfen={${fen}}, boardfontsize=${size}, ${mark(top, 'blue!60!black')}, ${mark(pick, 'green!50!black')}]`
}
const games = loadArchiveDays({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) }).flatMap((d) => d.games)
function purposeText(r) {
  const turning = games[r.game].deep.find((e) => e.ply === r.ply)
  claim(turning && turning.fen === r.fen, 'the row is the archive turning point it names')
  const pv = turning.alts.map((a) => lineOf(C, r.fen, sansOf(a.line))).find((ucis) => ucis[0] === r.pick.move)
  const purpose = K.movePurposes(r.fen, r.pick.move, { pv }).find((p) => p.kind === r.purpose)
  claim(purpose, 'the board code reads the purpose the pick was taught for again')
  return purpose.text
}
const sans = {}
for (const [prefix, r] of examples) {
  const info = chapterInfo.get(chapterKey(r))
  const pick = san(r.fen, r.pick.move)
  const top = san(r.fen, r.top.move)
  const played = r.played ? san(r.fen, r.played) : null
  sans[prefix] = { pick, top, played, r }
  g.def(`${prefix}Side`, side(r.fen)).def(`${prefix}Fen`, `\\fen{${r.fen}}`)
  g.def(`${prefix}Pick`, movesTex(r.fen, [pick])).def(`${prefix}PickUci`, `\\uci{${r.pick.move}}`)
  g.def(`${prefix}Top`, movesTex(r.fen, [top])).def(`${prefix}TopUci`, `\\uci{${r.top.move}}`)
  g.def(`${prefix}Played`, played ? movesTex(r.fen, [played]) : '--').def(`${prefix}PlayedUci`, played ? `\\uci{${r.played}}` : '--')
  g.def(`${prefix}PShare`, sharePct(r.pick.share)).def(`${prefix}TShare`, sharePct(r.top.share)).def(`${prefix}Loss`, fixed(r.pick.loss, 1))
  g.def(`${prefix}Purpose`, PURPOSE[r.purpose]).def(`${prefix}Says`, esc(purposeText(r))).def(`${prefix}Title`, esc(info.title)).def(`${prefix}Idea`, esc(info.idea))
  g.block(`${prefix}Board`, arrows(r.fen, r.top.move, r.pick.move))
  claim(r.pick.loss <= E.ACCEPT_WINDOW_WP && r.pick.verdict === 'best', `the ${prefix} pick is within the window`)
  claim(!r.playedKinds.includes(r.purpose), `in ${prefix} his move lacked the purpose the pick is taught for`)
}
claim(/^Q/.test(sans.Ea.pick), 'the queen-trade example moves the queen')
claim(/^N/.test(sans.Eb.pick), 'the worst-piece example moves a knight')
claim(/^[a-h]/.test(sans.Ec.pick), 'the pawn-break example moves a pawn')
claim(!/^Q/.test(sans.Ed.pick) && !/x/.test(sans.Ed.pick), "the last example's pick neither moves the queen nor takes")
claim(examples.every(([, r]) => r.played !== r.pick.move), 'in no example did he play the pick')

g.write(join(HERE, 'generated.tex'))
console.error('lesson-moves: wrote paper/generated.tex')
