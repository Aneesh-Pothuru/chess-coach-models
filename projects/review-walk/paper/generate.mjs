#!/usr/bin/env node
// Writes paper/generated.tex for the walk through a game: the rule's bars and
// its verdict, the design set and the held-out games as measure.mjs wrote them
// (results/measure.json), and what each cap would hold. It refuses to write
// when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/review-walk/paper/generate.mjs
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, fixed, percent, word } from '../../paper.mjs'
import { CAPS, COVERAGE_MEDIAN_ABOVE, COVERAGE_QUARTILE_BAR, DRAWS, HELDOUT_BEFORE, HELDOUT_GAMES, LONG_WALK, PROJECT, TURN_BAR, readJson } from '../lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const m = readJson(join(resultsDir(PROJECT), 'measure.json'))
const g = new Generated('projects/review-walk/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const pct = (x) => percent(x, 0)
const num = (x) => (Number.isInteger(x) ? String(x) : fixed(x, 1))
const count = (n) => n.toLocaleString('en-US')

claim(m && m.heldout && m.verdict, 'the held-out games are measured')
const A = m.archive
const H = m.heldout
claim(H.missing === 0 && H.games === H.sampled && H.sampled === HELDOUT_GAMES, 'every sampled held-out game was reviewed')
claim(H.reviewedAt === m.app, 'the held-out games were reviewed at the commit measured')
claim(A.unread === 0, 'every archive row was read')

g.def('AppCommit', m.app.slice(0, 10))
g.def('MaxErrors', word(m.rule.errors)).def('QuietErrors', word(m.rule.quiet)).def('MaxHonors', word(m.rule.honors)).def('MateWithin', word(m.rule.mateWithin))
g.def('LongWalk', word(LONG_WALK)).def('MaxStops', word(m.rule.errors + m.rule.honors))
g.def('HeldBefore', HELDOUT_BEFORE).def('HeldAsked', String(HELDOUT_GAMES)).def('Draws', count(DRAWS))
g.def('MedianAbove', pct(COVERAGE_MEDIAN_ABOVE)).def('QuartileBar', pct(COVERAGE_QUARTILE_BAR)).def('TurnBar', pct(TURN_BAR))

function set(prefix, a) {
  g.def(`${prefix}Games`, count(a.games)).def(`${prefix}WithErrors`, count(a.gamesWithErrors))
  g.def(`${prefix}MomentsMedian`, num(a.moments.median)).def(`${prefix}MomentsNinety`, num(a.moments.p90)).def(`${prefix}MomentsMost`, num(a.moments.max))
  g.def(`${prefix}StopsMedian`, num(a.stops.median)).def(`${prefix}StopsNinety`, num(a.stops.p90)).def(`${prefix}StopsMost`, num(a.stops.max))
  g.def(`${prefix}Longer`, pct(a.longerThanFive)).def(`${prefix}NoStops`, String(a.noStops))
  g.def(`${prefix}Coverage`, pct(a.coverage.median)).def(`${prefix}CoverageLow`, pct(a.coverage.medianInterval[0])).def(`${prefix}CoverageHigh`, pct(a.coverage.medianInterval[1]))
  g.def(`${prefix}Quartile`, pct(a.coverage.p25)).def(`${prefix}Tenth`, pct(a.coverage.p10))
  g.def(`${prefix}SeriousGames`, count(a.seriousCoverage.games)).def(`${prefix}SeriousWhole`, pct(a.seriousCoverage.whole)).def(`${prefix}SeriousTenth`, pct(a.seriousCoverage.p10))
  g.def(`${prefix}SeenIn`, count(a.seen.in)).def(`${prefix}SeenOf`, count(a.seen.of))
  g.def(`${prefix}SeenAt`, pct(a.seenAt.median)).def(`${prefix}SeenAtLow`, pct(a.seenAt.p10)).def(`${prefix}SeenAtHigh`, pct(a.seenAt.p90))
  g.def(`${prefix}TurnIn`, count(a.turn.in)).def(`${prefix}TurnOf`, count(a.turn.of)).def(`${prefix}TurnShare`, a.turn.share === null ? '--' : pct(a.turn.share))
  g.def(`${prefix}Mates`, count(a.mateStops)).def(`${prefix}Honors`, count(a.honorStops)).def(`${prefix}FirstStop`, pct(a.firstStop))
  g.def(`${prefix}ByCost`, pct(a.byCostAlone.median)).def(`${prefix}Softened`, pct(a.byCostAlone.gamesItChanges))
  const gain = (cap) => 100 * (a.caps[cap].median - a.caps[cap - 1].median)
  g.def(`${prefix}FourthAdds`, fixed(gain(4), 1)).def(`${prefix}FifthAdds`, fixed(gain(5), 1))
}
set('Design', A)
set('Held', H)

for (const a of [A, H]) {
  claim(CAPS.every((cap, k) => k === 0 || a.caps[cap].median >= a.caps[CAPS[k - 1]].median - 1e-9), 'a larger cap never holds less')
  claim(a.stops.max <= m.rule.errors + m.rule.honors, 'no walk is longer than the caps allow')
  claim(a.moments.p90 > a.stops.max, 'a walk through every marked move is longer than the longest walk in a tenth of the games')
}
claim(A.caps[4].median - A.caps[3].median > A.caps[5].median - A.caps[4].median, 'on the design set the fourth error adds more than a fifth would')
claim(H.moments.median === A.moments.median, 'the phone marks as many moves as the routine in the median game')

const t = H.teaching
claim(t.card === t.theirReply + t.yourChance + t.noCause, 'every lesson card is counted once')
g.def('TeachStops', count(t.stops)).def('TeachCards', count(t.card)).def('TeachCardShare', pct(t.card / t.stops))
g.def('TeachReply', count(t.theirReply)).def('TeachReplyShare', pct(t.theirReply / t.card))
g.def('TeachChance', count(t.yourChance)).def('TeachChanceShare', pct(t.yourChance / t.card))
g.def('TeachNeither', count(t.noCause)).def('TeachNeitherShare', pct(t.noCause / t.card))
g.def('TeachLesson', count(t.lesson)).def('TeachLessonShare', pct(t.lesson / t.stops))

const check = Object.fromEntries(m.verdict.checks.map((c) => [c.id, c.pass]))
claim(['coverage-median', 'coverage-quartile', 'turn', 'length', 'seen'].every((id) => id in check), 'the verdict has the five checks the paper names')
g.def('Kept', m.verdict.kept ? 'kept' : 'not kept')
const holds = (pass) => (pass ? 'holds' : 'fails')
g.def('CheckMedian', holds(check['coverage-median'])).def('CheckQuartile', holds(check['coverage-quartile'])).def('CheckTurn', holds(check.turn))
g.def('CheckLength', holds(check.length)).def('CheckSeen', holds(check.seen))

const row = (label, cells) => `${label} & ${cells.join(' & ')} \\\\`
g.block(
  'MeasureTable',
  [
    '\\begin{table}[h]\\centering\\small',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    ' & design set & held out \\\\',
    '\\midrule',
    row('games', [count(A.games), count(H.games)]),
    row('his marked moves a game: median, 90th, most', [`${num(A.moments.median)}, ${num(A.moments.p90)}, ${num(A.moments.max)}`, `${num(H.moments.median)}, ${num(H.moments.p90)}, ${num(H.moments.max)}`]),
    row("the walk's stops: median, 90th, most", [`${num(A.stops.median)}, ${num(A.stops.p90)}, ${num(A.stops.max)}`, `${num(H.stops.median)}, ${num(H.stops.p90)}, ${num(H.stops.max)}`]),
    row(`games with more than ${word(LONG_WALK)} marked moves`, [`${pct(A.longerThanFive)}\\%`, `${pct(H.longerThanFive)}\\%`]),
    row('cost held, median game (95\\% interval)', [`${pct(A.coverage.median)}\\% (${pct(A.coverage.medianInterval[0])} to ${pct(A.coverage.medianInterval[1])})`, `${pct(H.coverage.median)}\\% (${pct(H.coverage.medianInterval[0])} to ${pct(H.coverage.medianInterval[1])})`]),
    row('cost held, lower-quartile game', [`${pct(A.coverage.p25)}\\%`, `${pct(H.coverage.p25)}\\%`]),
    row('a stop inside the turn, of games that turned on his moves', [`${count(A.turn.in)} of ${count(A.turn.of)}`, `${count(H.turn.in)} of ${count(H.turn.of)}`]),
    row('the costliest error is a stop', [`${count(A.seen.in)} of ${count(A.seen.of)}`, `${count(H.seen.in)} of ${count(H.seen.of)}`]),
    row('mistakes, misses and blunders all held', [`${pct(A.seriousCoverage.whole)}\\% of ${count(A.seriousCoverage.games)}`, `${pct(H.seriousCoverage.whole)}\\% of ${count(H.seriousCoverage.games)}`]),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The walk on the design set (the archive's reviews) and on the held-out phone reviews. Cost held is the \\texttt{lossPct} of the errors the walk stops at over that of all his errors, inaccuracies included.}`,
    '\\label{tab:measures}',
    '\\end{table}',
  ].join('\n'),
)

const coords = (a, key) => CAPS.map((cap) => `(${cap},${(100 * a.caps[cap][key]).toFixed(1)})`).join(' ')
g.block(
  'CapFigure',
  [
    '\\begin{figure}[h]\\centering',
    '\\begin{tikzpicture}',
    `\\begin{axis}[width=0.78\\linewidth, height=5.2cm, xmin=0.7, xmax=${CAPS.length + 0.3}, ymin=0, ymax=100, xtick={${CAPS.join(',')}}, xlabel={errors the walk may stop at}, ylabel={cost held (\\%)}, legend pos=south east, legend cell align=left, legend style={font=\\small, draw=none}, ymajorgrids, grid style={black!12}]`,
    `\\addplot[thick, black, mark=*, mark size=1.6pt] coordinates {${coords(A, 'median')}};`,
    '\\addlegendentry{design set, median game}',
    `\\addplot[thick, black, dashed, mark=o, mark size=1.6pt] coordinates {${coords(A, 'p25')}};`,
    '\\addlegendentry{design set, lower quartile}',
    `\\addplot[thick, red!70!black, mark=square*, mark size=1.5pt] coordinates {${coords(H, 'median')}};`,
    '\\addlegendentry{held out, median game}',
    `\\addplot[thick, red!70!black, dashed, mark=square, mark size=1.5pt] coordinates {${coords(H, 'p25')}};`,
    '\\addlegendentry{held out, lower quartile}',
    `\\draw[black!45, densely dotted] (axis cs:${m.rule.errors},0) -- (axis cs:${m.rule.errors},100);`,
    '\\end{axis}',
    '\\end{tikzpicture}',
    `\\caption{What the walk would hold of what his errors cost if it stopped at one to six of them, ranked as the walk ranks them. The dotted line is the cap the app uses.}`,
    '\\label{fig:caps}',
    '\\end{figure}',
  ].join('\n'),
)

g.write(join(HERE, 'generated.tex'))
console.error(`generated.tex: ${m.verdict.kept ? 'kept' : 'not kept'}, held out ${H.games} games at ${m.app.slice(0, 10)}`)
