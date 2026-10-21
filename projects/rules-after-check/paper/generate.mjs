#!/usr/bin/env node
// Writes paper/generated.tex for the rules after the check: the registered
// control and the descriptions (results/rules.json), the run's execution
// (results/operations.json) and the rule's registered minimum (README.md). It
// needs no app code, and refuses to write when a claim the paper makes no
// longer holds.
//
//   bridge/run.sh projects/rules-after-check/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Generated, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT = join(HERE, '..')
const read = (file) => JSON.parse(readFileSync(join(PROJECT, 'results', file), 'utf8'))
const RULES = read('rules.json')
const OPS = read('operations.json')
const README = readFileSync(join(PROJECT, 'README.md'), 'utf8')
const g = new Generated('projects/rules-after-check/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const pts = (x, d = 1) => percent(x, d)
const ci = (s, d = 1) => `${pts(s.lo, d)} to ${pts(s.hi, d)}`
const cell = (s, d = 1) => `${pts(s.value, d)} {\\scriptsize(${pts(s.lo, d)}, ${pts(s.hi, d)})}`
const above0 = (s) => s.lo > 0
const below0 = (s) => s.hi < 0
const across0 = (s) => s.lo <= 0 && s.hi >= 0
const head = (text) => `\\begin{tabular}[b]{@{}l@{}}${text.split('|').join(' \\\\ ')}\\end{tabular}`
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const PERIODS = ['train', 'heldout']

const NAME = {
  'active-king': 'the active king',
  opposition: 'the opposition',
  'square-rule': 'the rule of the square',
  'rook-behind-passer': 'the rook behind the passed pawn',
  'cut-off-king': 'cutting the king off',
  'outside-passer': 'the outside passed pawn',
  'trade-when-ahead': 'trading when ahead',
  'open-file': 'the open file',
  'rook-on-the-seventh': 'the rook on the seventh',
  outpost: 'the outpost',
  'pawn-break': 'the pawn break',
  'passed-pawn': 'the passed pawn',
  'worst-piece': 'the worst piece',
}
const rowName = (r) => cap(NAME[r].replace(/^the /, ''))
const names = (rules) => {
  const all = rules.map((r) => NAME[r])
  return all.length < 2 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

// ---- the design and the data ----
const ids = Object.keys(RULES.rules)
claim(ids.length === Object.keys(NAME).length && ids.every((r) => NAME[r]), 'the paper names every rule the run scored')
claim(RULES.datasetKind === 'rules-after-check' && OPS.datasetKind === 'rules-after-check-operations', 'the reports are this study\'s')
const { check, score, records } = RULES.apps
claim(OPS.apps.check === check && OPS.apps.score === score && OPS.apps.records === records, 'the run and its report name the same apps')
claim(README.includes(check) && README.includes(score) && README.includes(records), 'the README names the apps the run used')
g.def('CheckCommit', check.slice(0, 10)).def('ScoreCommit', score.slice(0, 10)).def('RecordsCommit', records.slice(0, 10))
claim(RULES.data.train.join() === '2026-07,2026-08' && RULES.data.heldout === '2026-09' && RULES.data.license === 'CC0', 'train is July and August 2026, September 2026 held out, from CC0 games')
g.def('TrainMonths', 'July and August 2026').def('HeldMonth', 'September 2026')
const [hisLow, hisHigh] = RULES.data.bands['1300']
const [, aboveHigh] = RULES.data.bands['1500']
g.def('BandLow', String(hisLow)).def('BandHigh', String(aboveHigh)).def('HisHigh', String(hisHigh))
g.def('Inherited', count(RULES.coverage.retainedPositions)).def('NRules', word(ids.length))
claim(RULES.bootstrap.draws === 2000 && RULES.bootstrap.seed === 20261018 && RULES.bootstrap.unit === 'game', 'the bootstrap resamples games as registered')
g.def('Draws', count(RULES.bootstrap.draws)).def('Seed', String(RULES.bootstrap.seed))
const minHeld = Number(/fewer than (\d+) held-out quiet positions/.exec(README)?.[1])
claim(Number.isInteger(minHeld), 'the README states its minimum')
g.def('MinHeld', String(minHeld))
claim(OPS.run.status === 'complete' && OPS.provenance.measurementManifestSha256 === RULES.provenance.contentManifestSha256, 'the run completed under the freeze the results name')
const scoredSeconds = Object.values(OPS.workers.scored).reduce((a, m) => a + m.workerSeconds, 0)
claim(Object.keys(OPS.workers.scored).length === 3 && Object.values(OPS.workers.scored).every((m) => m.stoppedJobs === 0), 'every scoring month ran without a stop')
g.def('RunHours', fixed(OPS.run.elapsedUtcSeconds / 3600, 1)).def('WorkerHours', fixed(scoredSeconds / 3600, 1))

// ---- the control ----
const C = RULES.control
claim(C.passed === false && PERIODS.every((p) => across0(C[p].lift)), 'the control fails, its interval across 0 on both periods')
for (const [p, macro] of [['train', 'Train'], ['heldout', 'Held']]) {
  g.def(`Control${macro}`, pts(C[p].lift.value)).def(`Control${macro}Ci`, ci(C[p].lift))
  g.def(`Control${macro}N`, count(C[p].positions)).def(`Control${macro}Games`, count(C[p].games))
}
claim(ids.every((r) => RULES.rules[r].verdict === null && RULES.rules[r].verdictReason === 'control failed'), 'no rule receives a verdict')
const primary = (p) => ids.reduce((a, r) => a + RULES.rules[r][p].primary.positions, 0)
const controlShare = (p) => C[p].positions / primary(p)
claim(PERIODS.every((p) => controlShare(p) < 0.02), 'the rule move fails the check in under 2% of the quiet positions with a safe rule move')
g.def('ControlShareTrain', pts(controlShare('train'))).def('ControlShareHeld', pts(controlShare('heldout')))
g.def('PrimaryTrain', count(primary('train'))).def('PrimaryHeld', count(primary('heldout')))

g.block(
  'ControlTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\begin{tabular}{@{}lrrrl@{}}',
    '\\toprule',
    `Period & ${head('Quiet positions with|a safe rule move')} & ${head('Control|positions')} & Games & ${head('$R_s$ minus $R$,|points')} \\\\`,
    '\\midrule',
    ...PERIODS.map((p) => `${p === 'train' ? 'Train' : 'Held out'} & ${count(primary(p))} & ${count(C[p].positions)} & ${count(C[p].games)} & ${cell(C[p].lift)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{The control, pooled over the ${word(ids.length)} rules: the quiet positions where the rule's move $R$ fails the app's blunder check and some rule move passes it, and the soundness of $R_s$, the rule's move after the check, minus $R$'s, paired by position, with its 95\\% interval from ${count(RULES.bootstrap.draws)} draws over games. The rule asked for the interval to lie above 0 on both periods.}`,
    '\\label{tab:control}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the descriptions ----
const H = (r) => RULES.rules[r].heldout
const T = (r) => RULES.rules[r].train
const withData = ids.filter((r) => H(r).primary.positions >= minHeld)
const thin = ids.filter((r) => !withData.includes(r))
claim(thin.join() === 'outside-passer', 'only the outside passed pawn falls short of the minimum')
g.def('NWith', word(withData.length)).def('ThinName', NAME[thin[0]]).def('ThinHeld', String(H(thin[0]).primary.positions))
g.def('ThinTrain', String(T(thin[0]).primary.positions))
claim(withData.every((r) => below0(T(r).primary.lift) && below0(H(r).primary.lift)), "every rule with data has its lift's interval below 0 on both periods")
const byLift = [...withData].sort((a, b) => H(b).primary.lift.value - H(a).primary.lift.value)
claim(byLift[0] === 'square-rule' && byLift[byLift.length - 1] === 'pawn-break', 'the rule of the square trails least and the pawn break most')
g.def('LiftLow', pts(-H(byLift[0]).primary.lift.value)).def('LiftLowName', NAME[byLift[0]])
g.def('LiftHigh', pts(-H(byLift[byLift.length - 1]).primary.lift.value)).def('LiftHighName', NAME[byLift[byLift.length - 1]])
const share = (r, p, key) => RULES.rules[r][p].primary[key].value
const shares = (key) => ids.flatMap((r) => PERIODS.map((p) => share(r, p, key)))
g.def('RsRLow', pts(Math.min(...shares('shareRsIsR')))).def('RsRHigh', pts(Math.max(...shares('shareRsIsR'))))
g.def('NsNLow', pts(Math.min(...shares('shareNsIsN')))).def('NsNHigh', pts(Math.max(...shares('shareNsIsN'))))
claim(Math.min(...shares('shareRsIsR')) > 0.95, 'where a rule move passes the check, the rule move itself passes it in over 95% of quiet positions')
const natural = withData.flatMap((r) => PERIODS.map((p) => Math.abs(RULES.rules[r][p].primary.naturalAfterCheckMinusBefore.value)))
claim(Math.max(...natural) < 0.01, 'the check moves the natural move\'s soundness by under a point')
g.def('NaturalMax', pts(Math.max(...natural)))
const safeQuiet = (r) => H(r).coverage.safeRuleShareAmongQuiet.value
g.def('ThinSafe', pts(safeQuiet(thin[0]), 0))
const lowSafe = withData.filter((r) => safeQuiet(r) < 0.85)
claim(lowSafe.join() === 'cut-off-king,passed-pawn,worst-piece', 'three rules with data have no safe rule move in over 15% of their quiet positions')
g.def('LowSafeNames', names(lowSafe)).def('LowSafeLow', pts(Math.min(...lowSafe.map(safeQuiet)), 0)).def('LowSafeHigh', pts(Math.max(...lowSafe.map(safeQuiet)), 0))
const quietShares = ids.map((r) => H(r).coverage.quietShare.value)
g.def('QuietLow', pts(Math.min(...quietShares), 0)).def('QuietHigh', pts(Math.max(...quietShares), 0))
const byQuiet = [...ids].sort((a, b) => H(a).coverage.quietShare.value - H(b).coverage.quietShare.value)
g.def('QuietLowName', NAME[byQuiet[0]]).def('QuietHighName', NAME[byQuiet[byQuiet.length - 1]])
const cond = [...withData].sort((a, b) => H(b).primary.liftWhereRsDiffersFromNs.lift.value - H(a).primary.liftWhereRsDiffersFromNs.lift.value)
claim(withData.every((r) => PERIODS.every((p) => below0(RULES.rules[r][p].primary.liftWhereRsDiffersFromNs.lift))), 'wherever the two moves differ the rule move is sound less often, for every rule with data on both periods')
g.def('CondLow', pts(-H(cond[0]).primary.liftWhereRsDiffersFromNs.lift.value)).def('CondLowName', NAME[cond[0]])
g.def('CondHigh', pts(-H(cond[cond.length - 1]).primary.liftWhereRsDiffersFromNs.lift.value)).def('CondHighName', NAME[cond[cond.length - 1]])

const contentBetter = withData.filter((r) => PERIODS.every((p) => above0(RULES.rules[r][p].primary.content)))
const contentNot = withData.filter((r) => !contentBetter.includes(r))
claim(contentNot.join() === 'rook-behind-passer,cut-off-king', 'all but the rook behind the passed pawn and cutting the king off carry content on both periods')
claim(contentNot.every((r) => across0(H(r).primary.content)) && above0(T('rook-behind-passer').primary.content) && across0(T('cut-off-king').primary.content), 'of the two, only the rook behind the passed pawn carries content, and only on the train months')
g.def('NContent', word(contentBetter.length)).def('ContentNotNames', names(contentNot))
const byContent = [...contentBetter].sort((a, b) => H(a).primary.content.value - H(b).primary.content.value)
g.def('ContentLow', pts(H(byContent[0]).primary.content.value)).def('ContentLowName', NAME[byContent[0]])
g.def('ContentHigh', pts(H(byContent[byContent.length - 1]).primary.content.value)).def('ContentHighName', NAME[byContent[byContent.length - 1]])
claim(byContent[byContent.length - 1] === 'trade-when-ahead', 'trading when ahead carries the most content')
g.def('RbpContentTrain', pts(T('rook-behind-passer').primary.content.value)).def('RbpContentTrainCi', ci(T('rook-behind-passer').primary.content))
g.def('RbpContentHeld', pts(H('rook-behind-passer').primary.content.value)).def('RbpContentHeldCi', ci(H('rook-behind-passer').primary.content))
g.def('CutContentHeld', pts(H('cut-off-king').primary.content.value)).def('CutContentHeldCi', ci(H('cut-off-king').primary.content))

const ratio = (r, p) => RULES.rules[r][p].allEligible.lift.value / RULES.rules[r][p].primary.lift.value
const ratios = withData.flatMap((r) => PERIODS.map((p) => ratio(r, p)))
claim(withData.every((r) => PERIODS.every((p) => RULES.rules[r][p].allEligible.lift.value < RULES.rules[r][p].primary.lift.value)), 'over all positions the gap is larger than in quiet ones, for every rule with data on both periods')
g.def('RatioLow', fixed(Math.min(...ratios), 1)).def('RatioHigh', fixed(Math.max(...ratios), 1))
const byRatio = [...withData].sort((a, b) => ratio(a, 'heldout') - ratio(b, 'heldout'))
g.def('RatioLowName', NAME[byRatio[0]]).def('RatioHighName', NAME[byRatio[byRatio.length - 1]])
const allHeld = withData.map((r) => -H(r).allEligible.lift.value)
g.def('AllLow', pts(Math.min(...allHeld))).def('AllHigh', pts(Math.max(...allHeld)))
const fresh = ids.reduce((a, r) => a + PERIODS.reduce((b, p) => b + RULES.rules[r][p].allEligible.freshBestDiffersFromStored.positions, 0), 0)
const changed = ids.reduce((a, r) => a + PERIODS.reduce((b, p) => b + RULES.rules[r][p].allEligible.freshBestDiffersFromStored.changed, 0), 0)
claim(changed === 0, 'every fresh search found the stored best')
g.def('FreshSearches', count(fresh))

g.block(
  'DescriptionTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrrrrrlrl@{}}',
    '\\toprule',
    ` & ${head('Held-out|positions')} & ${head('Quiet|share')} & ${head('$R_s$|sound')} & ${head('$N_s$|sound')} & ${head('Lift,|train')} & ${head('Lift,|held out')} & ${head('Lift, all|positions')} & ${head('Content,|held out')} \\\\`,
    '\\midrule',
    ...ids.map((r) => {
      const h = H(r)
      return `${rowName(r)} & ${count(h.primary.positions)} & ${pts(h.coverage.quietShare.value, 0)} & ${pts(h.primary.soundness.Rs.value)} & ${pts(h.primary.soundness.Ns.value)} & ${pts(T(r).primary.lift.value)} & ${cell(h.primary.lift)} & ${pts(h.allEligible.lift.value)} & ${cell(h.primary.content)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{What the measures describe, with no verdict. Held-out positions: quiet ones where some rule move passes the check. Quiet share: of all the rule's held-out positions, in percent. $R_s$ and $N_s$ sound: the share of those positions where the rule's move and the natural move after the check are sound, in percent. The lift is $R_s$'s soundness minus $N_s$'s in points, with its 95\\% interval from ${count(RULES.bootstrap.draws)} draws over games (for every rule with data the train interval lies below 0 as well); over all positions it is the same lift over every position with a safe rule move, quiet or not. The content is $R_s$'s soundness minus that of $R_{0s}$, the move Maia-2 likes best among as many safe moves drawn at random.}`,
    '\\label{tab:descriptions}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the splits ----
const split = (r, p, s, c) => RULES.rules[r][p].splits[s][c]
const both = (r, s, cells) => PERIODS.every((p) => cells.every((c) => split(r, p, s, c).positions > 0))
const forcingRules = withData.filter((r) => both(r, 'forcing', ['true', 'false']))
claim(forcingRules.join() === 'square-rule,rook-behind-passer,open-file,rook-on-the-seventh,outpost,pawn-break,passed-pawn,worst-piece', 'eight rules have forcing and quiet moves on both periods')
claim(forcingRules.every((r) => PERIODS.every((p) => split(r, p, 'forcing', 'true').lift.value > split(r, p, 'forcing', 'false').lift.value)), 'a forcing rule move trails less than a quiet one, for each of them on both periods')
g.def('NForcing', word(forcingRules.length))
const FORCING_MIN = 50
const bigForcing = forcingRules.filter((r) => PERIODS.every((p) => split(r, p, 'forcing', 'true').positions >= FORCING_MIN))
claim(bigForcing.join() === 'open-file,rook-on-the-seventh,outpost,passed-pawn', 'four rules have at least 50 forcing moves in each period')
const forcingAcross = bigForcing.filter((r) => PERIODS.every((p) => across0(split(r, p, 'forcing', 'true').lift)))
claim(forcingAcross.join() === 'open-file,rook-on-the-seventh', 'the open file and the rook on the seventh do not trail when forcing')
g.def('ForcingAcrossNames', names(forcingAcross)).def('ForcingMin', String(FORCING_MIN)).def('NBigForcing', word(bigForcing.length))
g.def('OfForcing', pts(split('open-file', 'heldout', 'forcing', 'true').lift.value)).def('OfQuiet', pts(split('open-file', 'heldout', 'forcing', 'false').lift.value))
const phaseRules = withData.filter((r) => both(r, 'phase', ['middlegame', 'endgame']))
claim(phaseRules.length === 8 && phaseRules.every((r) => PERIODS.every((p) => split(r, p, 'phase', 'middlegame').lift.value < split(r, p, 'phase', 'endgame').lift.value)), 'eight rules trail more in the middlegame than in the endgame, on both periods')
g.def('NPhase', word(phaseRules.length))
const endgameOnly = withData.filter((r) => PERIODS.every((p) => split(r, p, 'phase', 'middlegame').positions <= 1))
claim(endgameOnly.join() === 'active-king,opposition,square-rule,cut-off-king', 'four rules come up only in endgames')
g.def('EndgameOnlyNames', names(endgameOnly))
g.def('PpMiddle', pts(split('passed-pawn', 'heldout', 'phase', 'middlegame').lift.value)).def('PpEnd', pts(split('passed-pawn', 'heldout', 'phase', 'endgame').lift.value))
const materialRules = withData.filter((r) => both(r, 'material', ['ahead', 'level', 'behind']))
const levelWorst = materialRules.filter((r) => PERIODS.every((p) => ['ahead', 'behind'].every((c) => split(r, p, 'material', 'level').lift.value < split(r, p, 'material', c).lift.value)))
const levelNot = materialRules.filter((r) => !levelWorst.includes(r))
claim(materialRules.length === 11 && levelNot.join() === 'square-rule,cut-off-king', 'level material trails most for all but two of the eleven rules with every cell')
g.def('NMaterial', word(materialRules.length)).def('NLevel', word(levelWorst.length)).def('LevelNotNames', names(levelNot))

const SPLITS = [
  ['forcing', 'false'],
  ['forcing', 'true'],
  ['phase', 'middlegame'],
  ['phase', 'endgame'],
  ['material', 'ahead'],
  ['material', 'level'],
  ['material', 'behind'],
]
const splitCell = (x) => (x.positions === 0 ? '--' : `${pts(x.lift.value, 0)} {\\scriptsize(${count(x.positions)})}`)
g.block(
  'SplitTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrrrrrrr@{}}',
    '\\toprule',
    ` & ${head('$R_s$|quiet')} & ${head('$R_s$|forcing')} & ${head('Middle-|game')} & Endgame & Ahead & Level & Behind \\\\`,
    '\\midrule',
    ...withData.map((r) => `${rowName(r)} & ${SPLITS.map(([s, c]) => splitCell(split(r, 'heldout', s, c))).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{The lift in quiet positions in each cell of a split, held out, in points, with the cell's positions in brackets; a dash is a cell with none. Forcing: $R_s$ is a capture or gives check. The phase is the app's divider's, and material is the mover's, both read before the move by the app at the check's commit. The splits describe and decide nothing.}",
    '\\label{tab:splits}',
    '\\end{table}',
  ].join('\n'),
)

g.write(join(HERE, 'generated.tex'))
