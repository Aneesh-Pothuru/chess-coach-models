#!/usr/bin/env node
// Writes paper/generated.tex for the rules of thumb: the preregistered
// verdicts (results/rules.json), the random-rule control (results/null.json),
// the held-out examples (results/examples.json) and their reading by the
// app's blunder check (results/why.json). It needs no app code beyond
// chess.js, and refuses to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/rules-of-thumb/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { Generated, board, esc, figurine, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESULTS = join(HERE, '..', 'results')
const read = (file) => JSON.parse(readFileSync(join(RESULTS, file), 'utf8'))
const RULES = read('rules.json')
const NULL = read('null.json')
const EX = read('examples.json')
const WHY = read('why.json')
const g = new Generated('projects/rules-of-thumb/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const pts = (x, d = 1) => percent(x, d)
const ci = (s, d = 1) => `${pts(s.lo, d)} to ${pts(s.hi, d)}`
const cell = (s, d = 1) => `${pts(s.value, d)} {\\scriptsize(${pts(s.lo, d)}, ${pts(s.hi, d)})}`
const above0 = (s) => s.lo > 0
const below0 = (s) => s.hi < 0
const head = (text) => `\\begin{tabular}[b]{@{}l@{}}${text.split('|').join(' \\\\ ')}\\end{tabular}`
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const rowName = (r) => cap(NAME[r].replace(/^the /, ''))

const NAME = {
  'active-king': 'the active king',
  opposition: 'the opposition',
  'square-rule': 'the rule of the square',
  'rook-behind-passer': 'the rook behind the passed pawn',
  'cut-off-king': 'cutting the king off',
  'outside-passer': 'the outside passed pawn',
  'trade-when-ahead': 'trading when ahead',
  lucena: 'the Lucena position',
  philidor: 'the Philidor position',
  'open-file': 'the open file',
  'rook-on-the-seventh': 'the rook on the seventh',
  outpost: 'the outpost',
  'pawn-break': 'the pawn break',
  'passed-pawn': 'the passed pawn',
  'worst-piece': 'the worst piece',
}

const byContentOf = (rule) => {
  const better = Object.entries(NULL.rules).filter(([, x]) => x.reading === 'points to better moves than chance')
  return better.every(([r, x]) => r === rule || x.heldout.content.value > NULL.rules[rule].heldout.content.value)
}

// ---- the design and the data ----
const app = RULES.app
claim(NULL.app === app && EX.app === app && WHY.app === app, 'every result names the same app commit')
claim(Object.keys(RULES.rules).every((r) => NAME[r]) && Object.keys(NAME).length === Object.keys(RULES.rules).length, 'the paper names every rule the run scored')
g.def('AppCommit', app.slice(0, 10))
const months = Object.values(RULES.data.gamesByMonth)
claim(months.length === 3 && months.every((n) => n === months[0]), 'each month scanned the same number of games')
g.def('GamesMonth', count(months[0])).def('GamesAll', count(months.reduce((a, b) => a + b, 0)))
g.def('PositionsAll', count(Object.values(RULES.data.positionsByMonth).reduce((a, b) => a + b, 0)))
claim(RULES.data.train.join() === '2026-07,2026-08' && RULES.data.heldout === '2026-09', 'train is July and August 2026 and the held-out month September')
g.def('TrainMonths', 'July and August 2026').def('HeldMonth', 'September 2026')
const [hisLow, hisHigh] = RULES.data.bands['1300']
const [aboveLow, aboveHigh] = RULES.data.bands['1500']
g.def('HisLow', String(hisLow)).def('HisHigh', String(hisHigh)).def('AboveLow', String(aboveLow)).def('AboveHigh', String(aboveHigh))
g.def('MaiaHis', '1300').def('MaiaAbove', '1500')
const retained = Object.values(RULES.rules).flatMap((r) => Object.values(r.countsByMonth).map((m) => m.retainedPositions))
const CAP = Math.max(...retained)
claim(Object.values(RULES.rules).every((r) => Object.values(r.countsByMonth).every((m) => m.retainedPositions === Math.min(CAP, m.gamesWithAvailability))), 'each rule kept one position a game up to the cap')
g.def('Cap', count(CAP))
const minHeld = Number(/fewer than (\d+)/.exec(NULL.readings.exclusion)?.[1])
claim(Number.isInteger(minHeld), 'the null report states its minimum')
g.def('MinHeld', String(minHeld))
const scorer = readFileSync(join(HERE, '..', 'score.mjs'), 'utf8')
const fixedInstruments = /E\.BUDGETS\.grade\.node\.nodes !== (\d+) \|\| E\.ACCEPT_WINDOW_WP !== (\d+)/.exec(scorer)
claim(fixedInstruments, 'the scorer refuses to run unless its budget and window are the fixed ones')
g.def('GradeNodes', count(Number(fixedInstruments[1]))).def('Window', fixedInstruments[2])
claim(RULES.bootstrap.draws === NULL.bootstrap.draws && RULES.bootstrap.seed === NULL.bootstrap.seed, 'the control resamples as the run did')
g.def('Draws', count(RULES.bootstrap.draws)).def('Seed', String(RULES.bootstrap.seed))
const scored = Object.values(RULES.rules).reduce((a, r) => a + r.train.positions + r.heldout.positions, 0)
claim(scored === NULL.coverage.scoredPositions, 'the control covers every scored position')
g.def('Scored', count(scored))

// ---- the verdicts ----
const ids = Object.keys(RULES.rules)
const judged = ids.filter((r) => !RULES.rules[r].verdict.startsWith('not enough data'))
const thin = ids.filter((r) => !judged.includes(r))
claim(thin.join() === 'lucena,philidor', 'only Lucena and Philidor fall short of the held-out minimum')
claim(judged.every((r) => RULES.rules[r].verdict === 'It misleads'), 'every rule with enough data misleads')
claim(judged.every((r) => below0(RULES.rules[r].train.lift) && below0(RULES.rules[r].heldout.lift)), "every judged rule's lift lies below 0 on both periods")
claim(judged.every((r) => RULES.rules[r].heldout.soundness.R.value < RULES.rules[r].heldout.soundness.A.value), 'the rule move is sound less often than the move played, for every judged rule')
g.def('NRules', word(ids.length)).def('Judged', word(judged.length))
g.def('LucenaHeld', String(RULES.rules.lucena.heldout.positions)).def('PhilidorHeld', String(RULES.rules.philidor.heldout.positions))
const byLift = [...judged].sort((a, b) => RULES.rules[b].heldout.lift.value - RULES.rules[a].heldout.lift.value)
const least = byLift[0]
const most = byLift[byLift.length - 1]
claim(least === 'square-rule' && most === 'pawn-break', 'the rule of the square trails least and the pawn break most')
g.def('LeastLift', pts(-RULES.rules[least].heldout.lift.value)).def('LeastLiftName', NAME[least])
g.def('MostLift', pts(-RULES.rules[most].heldout.lift.value)).def('MostLiftName', NAME[most])
const stepUps = judged.filter((r) => RULES.rules[r].stepUp)
claim(stepUps.join() === 'outpost', 'the outpost is the only step up')
g.def('StepUpName', NAME[stepUps[0]])
const op = RULES.rules.outpost.heldout.adoptionDifferenceAboveMinusHis
g.def('StepUpGap', pts(op.value)).def('StepUpGapCi', ci(op))
claim(judged.every((r) => RULES.rules[r].heldout.soundness.N.value > RULES.rules[r].heldout.soundness.A.value), 'the natural move is sound more often than the move played, for every judged rule')
const avail = (r) => RULES.rules[r].availability.heldout.share
claim(avail('open-file') > 0.5 && avail('worst-piece') > 0.5 && judged.filter((r) => avail(r) > 0.5).length === 2, 'only the open file and the worst piece are available in most positions')
g.def('OpenAvail', pts(avail('open-file'), 0)).def('WorstAvail', pts(avail('worst-piece'), 0))
claim(byContentOf('worst-piece'), 'the worst piece carries the least content of the rules that carry any')
const findable = judged.map((r) => RULES.rules[r].heldout.probabilityRAtHisBand.value)
g.def('FindLow', pts(Math.min(...findable), 0)).def('FindHigh', pts(Math.max(...findable), 0))

g.block(
  'VerdictTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrrrrrlll@{}}',
    '\\toprule',
    ` & ${head('Held-out|positions')} & ${head('$R$|sound')} & ${head('$N$|sound')} & ${head('$A$|sound')} & ${head('Lift,|train')} & ${head('Lift,|held out')} & Verdict & ${head('A step|up')} \\\\`,
    '\\midrule',
    ...ids.map((r) => {
      const x = RULES.rules[r]
      const h = x.heldout
      return `${rowName(r)} & ${count(h.positions)} & ${pts(h.soundness.R.value)} & ${pts(h.soundness.N.value)} & ${pts(h.soundness.A.value)} & ${pts(x.train.lift.value)} & ${cell(h.lift)} & ${esc(x.verdict.replace(/ \(n=\d+\)$/, ''))} & ${x.stepUp ? 'yes' : 'no'} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The preregistered verdicts. $R$, $N$ and $A$ sound: the share of held-out positions where the rule's move, the natural move and the move played are sound, in percent; the lift is $R$'s soundness minus $N$'s in points, held out with its 95\\% interval from ${count(RULES.bootstrap.draws)} bootstrap draws over games (for every judged rule the train interval lies below 0 as well). A step up: the band above plays $R$ more often than his band, on both periods.}`,
    '\\label{tab:verdicts}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the control ----
const N = NULL.rules
claim(Object.keys(N).join() === judged.join(), 'the control reads exactly the judged rules')
claim(judged.every((r) => below0(N[r].train.nullLift) && below0(N[r].heldout.nullLift)), "the random rule's lift lies below 0 on both periods for every rule")
const better = judged.filter((r) => N[r].reading === 'points to better moves than chance')
const same = judged.filter((r) => N[r].reading === 'no differently from chance')
claim(better.length + same.length === judged.length, 'no rule points to worse moves than chance')
claim(same.join() === 'cut-off-king', 'only cutting the king off reads no differently from chance')
claim(better.every((r) => above0(N[r].train.content) && above0(N[r].heldout.content)), 'the better rules carry content on both periods')
g.def('NBetter', word(better.length)).def('NoDiffName', NAME[same[0]])
g.def('NoDiffContent', pts(N[same[0]].heldout.content.value)).def('NoDiffContentCi', ci(N[same[0]].heldout.content))
g.def('NoDiffContentTrain', pts(N[same[0]].train.content.value)).def('NoDiffContentTrainCi', ci(N[same[0]].train.content))
const nullHeld = judged.map((r) => -N[r].heldout.nullLift.value)
g.def('NullLow', pts(Math.min(...nullHeld))).def('NullHigh', pts(Math.max(...nullHeld)))
const byContent = [...better].sort((a, b) => N[a].heldout.content.value - N[b].heldout.content.value)
g.def('ContentLow', pts(N[byContent[0]].heldout.content.value)).def('ContentLowName', NAME[byContent[0]])
g.def('ContentHigh', pts(N[byContent[byContent.length - 1]].heldout.content.value)).def('ContentHighName', NAME[byContent[byContent.length - 1]])
claim(byContent[byContent.length - 1] === 'trade-when-ahead', 'trading when ahead carries the most content')
claim(judged.every((r) => below0(N[r].train.liftWhenRDiffersFromN.lift) && below0(N[r].heldout.liftWhenRDiffersFromN.lift)), 'wherever the rule move differs from the natural move it is sound less often, for every rule on both periods')
const cond = [...judged].sort((a, b) => N[b].heldout.liftWhenRDiffersFromN.lift.value - N[a].heldout.liftWhenRDiffersFromN.lift.value)
g.def('CondLow', pts(-N[cond[0]].heldout.liftWhenRDiffersFromN.lift.value)).def('CondLowName', NAME[cond[0]])
g.def('CondHigh', pts(-N[cond[cond.length - 1]].heldout.liftWhenRDiffersFromN.lift.value)).def('CondHighName', NAME[cond[cond.length - 1]])
const sameShare = [...judged].sort((a, b) => N[a].heldout.shareRIsN.value - N[b].heldout.shareRIsN.value)
g.def('SameLow', pts(N[sameShare[0]].heldout.shareRIsN.value, 0)).def('SameLowName', NAME[sameShare[0]])
g.def('SameHigh', pts(N[sameShare[sameShare.length - 1]].heldout.shareRIsN.value, 0)).def('SameHighName', NAME[sameShare[sameShare.length - 1]])
const fresh = judged.reduce((a, r) => a + N[r].train.newBestDiffersFromStored.searches + N[r].heldout.newBestDiffersFromStored.searches, 0)
const changed = judged.reduce((a, r) => a + N[r].train.newBestDiffersFromStored.changed + N[r].heldout.newBestDiffersFromStored.changed, 0)
claim(changed === 0, 'every fresh search found the stored best')
g.def('FreshSearches', count(fresh))

g.block(
  'ControlTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{2pt}',
    '\\begin{tabular}{@{}lrlllrl@{}}',
    '\\toprule',
    ` & ${head("Random rule's|lift, held out")} & ${head('Content,|train')} & ${head('Content,|held out')} & Reading & ${head('$R$ is $N$,|held out')} & ${head('Lift where $R$ is|not $N$, held out')} \\\\`,
    '\\midrule',
    ...judged.map((r) => {
      const h = N[r].heldout
      return `${rowName(r)} & ${pts(h.nullLift.value)} & ${cell(N[r].train.content)} & ${cell(h.content)} & ${N[r].reading === 'points to better moves than chance' ? 'better' : 'no different'} & ${pts(h.shareRIsN.value, 0)} & ${cell(h.liftWhenRDiffersFromN.lift)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The control added after the run. The random rule's lift is the soundness of $R_0$ minus $N$'s, whose interval lies below 0 on both periods for every rule; the rule's content is $R$'s minus $R_0$'s, in points with 95\\% intervals from the same ${count(NULL.bootstrap.draws)} draws over games. Reading: better than chance when the content's interval lies above 0 on both periods, no different otherwise. $R$ is $N$: the share of held-out positions where the rule's move is the natural move, in percent.}`,
    '\\label{tab:control}',
    '\\end{table}',
  ].join('\n'),
)

// ---- where the rules fail ----
const SPLIT = {
  'opponentThreat:true': 'they threaten',
  'material:level': 'material level',
  'material:ahead': 'ahead',
  'material:behind': 'behind',
  'phase:middlegame': 'middlegame',
  'phase:endgame': 'endgame',
  'forcing:false': '$R$ quiet',
  'forcing:true': '$R$ forcing',
  'kingDanger:true': 'king in danger',
  'kingDanger:false': 'king safe',
  'opponentThreat:false': 'no threat',
}
const failures = Object.fromEntries(judged.map((r) => [r, RULES.rules[r].failureConditions.map((f) => ({ key: `${f.split}:${f.cell}`, f }))]))
claim(Object.values(failures).flat().every(({ key }) => SPLIT[key]), 'every failure condition has a name')
const failCount = (key) => judged.filter((r) => failures[r].some((f) => f.key === key)).length
g.def('FailThreat', word(failCount('opponentThreat:true'))).def('FailQuiet', word(failCount('forcing:false'))).def('FailLevel', word(failCount('material:level')))
g.def('FailMiddle', word(failCount('phase:middlegame'))).def('FailDanger', word(failCount('kingDanger:true')))
claim(failCount('opponentThreat:false') === 0 && failCount('forcing:true') === 0, 'no rule fails where there is no threat or where its move is forcing')
const noFail = judged.filter((r) => failures[r].length === 0)
claim(noFail.join() === 'square-rule,outside-passer,trade-when-ahead', 'three rules have no failure condition')
g.def('NoFailNames', `${NAME[noFail[0]]}, ${NAME[noFail[1]]} and ${NAME[noFail[2]]}`)
const threatGap = judged.filter((r) => failures[r].some((f) => f.key === 'opponentThreat:true')).map((r) => -failures[r].find((f) => f.key === 'opponentThreat:true').f.heldout.value)
g.def('ThreatGapLow', pts(Math.min(...threatGap), 0)).def('ThreatGapHigh', pts(Math.max(...threatGap), 0))
const ak = RULES.rules['active-king'].heldout.splits.opponentThreat
g.def('AkThreat', pts(ak.true.soundnessR.value, 0)).def('AkNoThreat', pts(ak.false.soundnessR.value, 0))
claim(failures['active-king'].some((f) => f.key === 'opponentThreat:true'), 'the active king fails when they threaten')

g.block(
  'FailureTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\begin{tabularx}{\\textwidth}{@{}lL@{}}',
    '\\toprule',
    'Rule & Failure conditions: the cell, and $R$\'s soundness there minus the rest, held out \\\\',
    '\\midrule',
    ...judged.map((r) => `${rowName(r)} & ${failures[r].length ? failures[r].map(({ key, f }) => `${SPLIT[key]} (${pts(f.heldout.value, 0)})`).join(', ') : 'none'} \\\\`),
    '\\bottomrule',
    '\\end{tabularx}',
    "\\caption{Where the rule's move fails: a cell of a split, read before the move, where $R$ is sound at least 10 points less often than in the rest of the split, with the difference's 95\\% interval below 0, on the train months and the held-out month. The difference shown is the held-out one, in points.}",
    '\\label{tab:failures}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the examples ----
const W = WHY.summary.all
claim(W.examples === EX.summary.positions && W.ruleSound === EX.summary.sound.R, 'the blunder check read every example')
claim(Object.keys(WHY.rules).join() === judged.join() && Object.values(EX.rules).every((r) => r.examples.length === EX.selection.positionsPerRule), 'each judged rule has its examples')
const K = W.kinds
claim(K['allows mate'] + K['loses material'] + K['passes over a forcing move'] + K['a quieter choice'] === W.ruleUnsound, 'every unsound rule move has a kind')
const caught = K['allows mate'] + K['loses material']
claim(caught > W.ruleUnsound / 2, 'the blunder check flags most unsound rule moves')
claim(K['a quieter choice'] < K['passes over a forcing move'] && K['passes over a forcing move'] < caught, 'few unsound rule moves are just quieter choices')
claim(W.naturalFlagged < W.ruleFlagged, 'the check flags the natural move less often than the rule move')
g.def('ExN', String(W.examples)).def('ExPer', word(EX.selection.positionsPerRule)).def('ExRules', word(judged.length))
g.def('ExSound', String(W.ruleSound)).def('ExUnsound', String(W.ruleUnsound)).def('ExMate', word(K['allows mate'])).def('ExLoses', String(K['loses material']))
g.def('ExCaught', String(caught)).def('ExForcing', String(K['passes over a forcing move'])).def('ExQuiet', word(K['a quieter choice']))
g.def('ExSoundFlagged', word(W.ruleSoundFlagged)).def('ExNFlagged', String(W.naturalFlagged)).def('ExRFlagged', String(W.ruleFlagged))
g.def('ExNSound', String(EX.summary.sound.N)).def('ExNForcing', String(W.naturalForcing)).def('ExRForcing', String(W.ruleForcing))
g.def('ExStockfish', String(EX.summary.referees.stockfish)).def('ExTablebase', word(EX.summary.referees.tablebase))

g.block(
  'ExampleTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrrrrrrr@{}}',
    '\\toprule',
    ` & ${head('$R$|sound')} & ${head('Allows|mate')} & ${head('Loses|material')} & ${head('Passes over|a forcing move')} & ${head('A quieter|choice')} & ${head('$N$|forcing')} & ${head('Flagged:|$R$ / $N$')} \\\\`,
    '\\midrule',
    ...judged.map((r) => {
      const s = WHY.summary.byRule[r]
      return `${rowName(r)} & ${s.ruleSound} & ${s.kinds['allows mate']} & ${s.kinds['loses material']} & ${s.kinds['passes over a forcing move']} & ${s.kinds['a quieter choice']} & ${s.naturalForcing} & ${s.ruleFlagged} / ${s.naturalFlagged} \\\\`
    }),
    '\\midrule',
    `All & ${W.ruleSound} & ${K['allows mate']} & ${K['loses material']} & ${K['passes over a forcing move']} & ${K['a quieter choice']} & ${W.naturalForcing} & ${W.ruleFlagged} / ${W.naturalFlagged} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The ${W.examples} held-out examples, ${EX.selection.positionsPerRule} a rule drawn at random where $R$ is not $N$, read after the results by the app's blunder check. Each unsound rule move is counted once, under the first kind that fits in the column order. $N$ forcing: the natural move is a check, a capture or a promotion. Flagged: the moves the check says allow mate or lose material, sound or not.}`,
    '\\label{tab:examples}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the positions shown ----
const exampleOf = (rule, number) => {
  const shown = EX.rules[rule].examples.find((x) => x.number === number)
  const read = WHY.rules[rule].examples.find((x) => x.number === number)
  claim(shown && read && shown.fen === read.fen, `${rule} example ${number} is in both reports`)
  return { shown, read }
}
const mover = (fen) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black')
const sound = (m) => (m.sound ? 'sound' : 'unsound')
const wp = (m) => percent(m.winPercent / 100, 0)
const show = (macro, rule, number, size) => {
  const { shown } = exampleOf(rule, number)
  const { R, best } = shown.moves
  g.block(`${macro}Board`, board(shown.fen, { played: R.uci, better: best.uci, size }))
  g.def(`${macro}Fen`, `\\fen{${shown.fen}}`).def(`${macro}Mover`, mover(shown.fen)).def(`${macro}Band`, String(shown.band))
  for (const [label, m] of Object.entries({ R: shown.moves.R, N: shown.moves.N, Best: best })) {
    g.def(`${macro}${label}`, figurine(m.san)).def(`${macro}${label}Wp`, wp(m)).def(`${macro}${label}Sound`, sound(m))
  }
  return exampleOf(rule, number)
}

const fa = show('Fa', 'rook-behind-passer', 1, '11pt')
claim(fa.read.kind === 'allows mate' && fa.shown.moves.N.uci === fa.shown.moves.best.uci && fa.shown.moves.N.sound, 'the first figure shows a rule move that allows mate, the natural move best')
const afterFa = new Chess(fa.shown.fen)
afterFa.move({ from: fa.shown.moves.R.uci.slice(0, 2), to: fa.shown.moves.R.uci.slice(2, 4) })
const mates = afterFa.moves({ verbose: true }).filter((m) => m.san.endsWith('#'))
claim(mates.length === 1, 'one reply mates after the rook goes behind the pawn')
g.def('FaMate', figurine(mates[0].san))

const fb = show('Fb', 'passed-pawn', 1, '11pt')
claim(fb.read.kind === 'loses material' && fb.shown.moves.N.uci === fb.shown.moves.best.uci && fb.shown.moves.N.sound, 'the second figure shows a rule move that loses material, the natural move best')
const fbBoard = new Chess(fb.shown.fen)
const fbQueen = fbBoard.get('d8')
claim(fbQueen && fbQueen.type === 'q' && fbQueen.color === fb.shown.fen.split(' ')[1] && fb.read.R.loose.includes('d8'), 'the queen left to be taken stands on d8')
claim(fbBoard.attackers('d8', fbQueen.color === 'w' ? 'b' : 'w').some((s) => fbBoard.get(s)?.type === 'b'), 'a bishop attacks the queen on d8')

const fc = show('Fc', 'opposition', 6, '11pt')
claim(fc.read.kind === 'passes over a forcing move' && fc.shown.moves.N.uci === fc.shown.moves.best.uci && /=Q\+$/.test(fc.shown.moves.N.san), 'the third figure shows the opposition taken while the pawn could queen with check')

const fd = show('Fd', 'outside-passer', 2, '14pt')
claim(fd.read.R.exchange < 0 && fd.read.kind === 'loses material' && fd.shown.moves.N.uci === fd.shown.moves.best.uci, "the fourth figure shows the outside passer's note on a capture that loses material")
g.def('FdLoss', String(-fd.read.R.exchange))
const opLosing = WHY.rules['outside-passer'].examples.filter((x) => x.R.exchange !== null && x.R.exchange < 0).length
claim(opLosing > EX.selection.positionsPerRule / 2, "most of the outside passer's examples give material for the pawn")
const rookForPawn = WHY.rules['outside-passer'].examples
  .filter((x) => x.R.exchange !== null && x.R.exchange < 0)
  .every((x) => {
    const uci = exampleOf('outside-passer', x.number).shown.moves.R.uci
    const move = new Chess(x.fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4) })
    return move.piece === 'r' && move.captured === 'p'
  })
claim(rookForPawn, "each losing capture of the outside passer's examples is a rook taking a pawn")
g.def('OpLosing', word(opLosing))
const opCaptures = WHY.rules['outside-passer'].examples.filter((x) => x.R.capture).length
g.def('OpCaptures', word(opCaptures))

const fe = show('Fe', 'cut-off-king', 3, '14pt')
claim(fe.read.kind === 'loses material' && fe.read.R.loose.includes('g2') && !fe.shown.moves.R.sound && fe.shown.moves.best.sound, 'the fifth figure shows a cut that leaves g2')
const feBoard = new Chess(fe.shown.fen)
const blackKing = feBoard.board().flat().find((p) => p && p.type === 'k' && p.color === 'b')
claim(blackKing && ['g', 'h'].includes(blackKing.square[0]) && fe.shown.moves.R.uci.slice(2, 3) === 'c', 'the cut is on the c-file with their king on the far wing')
g.def('FeKing', blackKing.square)

g.write(join(HERE, 'generated.tex'))
