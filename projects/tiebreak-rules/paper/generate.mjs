#!/usr/bin/env node
// Writes paper/generated.tex for the tie-break rules: the registered control,
// verdicts and descriptions (results/rules.json), the held-out examples
// (results/examples.json) and the rule's registered constants (the README as
// frozen, frozen-readme.md). It needs no app code, and refuses to write when a
// claim the paper makes no longer holds.
//
//   bridge/run.sh projects/tiebreak-rules/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Generated, board, fixed, movesTex, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT = join(HERE, '..')
const read = (file) => JSON.parse(readFileSync(join(PROJECT, 'results', file), 'utf8'))
const RULES = read('rules.json')
const EXAMPLES = read('examples.json')
const RULE_TEXT = readFileSync(join(PROJECT, 'frozen-readme.md'), 'utf8')
const g = new Generated('projects/tiebreak-rules/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const count = (n) => n.toLocaleString('en-US')
const pts = (x, d = 1) => percent(x, d)
const ci = (s, d = 1) => `${pts(s.lo, d)} to ${pts(s.hi, d)}`
const cell = (s, d = 1) => `${pts(s.value, d)} {\\scriptsize(${pts(s.lo, d)}, ${pts(s.hi, d)})}`
const defined = (s) => s.value != null && s.lo != null && s.hi != null
const above0 = (s) => defined(s) && s.lo > 0
const below0 = (s) => defined(s) && s.hi < 0
const across0 = (s) => defined(s) && s.lo <= 0 && s.hi >= 0
const head = (text) => `\\begin{tabular}[b]{@{}l@{}}${text.split('|').join(' \\\\ ')}\\end{tabular}`
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const PERIODS = ['train', 'heldout']
const both = (f) => PERIODS.every(f)
const registered = (phrase, what) => {
  const found = new RegExp(phrase.replace(/ /g, '\\s+')).exec(RULE_TEXT)
  claim(found, `the rule states ${what}`)
  return found
}
const integer = (text) => Number(text.replace(/,/g, ''))

const RULE_NAME = {
  tension: 'keep the tension',
  'trades-development': 'trades and development',
  'bishop-knight': 'bishop over knight',
  'bishop-colour': "pawns off the bishop's colour",
}
const UNIT_NAME = {
  tension: 'tension',
  'trades-ahead': 'ahead in development',
  'trades-behind': 'behind in development',
  'bishop-for-knight': 'bishop for knight',
  'knight-for-bishop': 'knight for bishop',
  'bishop-colour': "bishop's colour",
  'trades-level': 'level development',
  hang: 'the control',
}
const RULE_UNITS = {
  tension: ['tension'],
  'trades-development': ['trades-ahead', 'trades-behind'],
  'bishop-knight': ['bishop-for-knight', 'knight-for-bishop'],
  'bishop-colour': ['bishop-colour'],
}
const RULE_UNIT_IDS = Object.values(RULE_UNITS).flat()
const UNITS = [...RULE_UNIT_IDS, 'trades-level', 'hang']
const R = (r, p = 'heldout') => RULES.rules[r][p]
const U = (u, p = 'heldout') => RULES.units[u][p]
const M = (x, name) => x.measures[name]
const S = (u, field, c, p = 'heldout') => RULES.units[u][p].splits[field][c]

// ---- the design and the data ----
claim(RULES.datasetKind === 'tiebreak-rules' && RULES.schema === 1, "the report is this study's")
claim(Object.keys(RULES.rules).join() === Object.keys(RULE_NAME).join(), 'the paper names every rule the run scored, in its order')
claim(Object.entries(RULE_UNITS).every(([r, units]) => RULES.rules[r].units.join() === units.join()), "each rule's units are the registered ones")
claim(Object.keys(RULES.units).join() === UNITS.join(), 'the report reads every registered unit, the reference and the control')
claim(RULE_TEXT.includes(RULES.app), 'the rule names the app commit the run used')
claim(EXAMPLES.datasetKind === 'tiebreak-rules-examples' && EXAMPLES.app === RULES.app, 'the examples come from the same app')
g.def('AppCommit', RULES.app.slice(0, 10))
claim(RULES.data.train.join() === '2026-07,2026-08' && RULES.data.heldout === '2026-09', 'train is July and August 2026, September 2026 held out')
g.def('TrainMonths', 'July and August 2026').def('HeldMonth', 'September 2026')
const [hisLow, hisHigh] = RULES.data.bands['1300']
const [aboveLow, aboveHigh] = RULES.data.bands['1500']
claim(hisHigh + 1 === aboveLow, 'the two bands meet')
g.def('BandLow', String(hisLow)).def('HisHigh', String(hisHigh)).def('AboveLow', String(aboveLow)).def('BandHigh', String(aboveHigh))
claim(RULES.bootstrap.draws === 2000 && RULES.bootstrap.seed === 20261021 && RULES.bootstrap.unit === 'game', 'the bootstrap resamples games as registered')
g.def('Draws', count(RULES.bootstrap.draws)).def('Seed', String(RULES.bootstrap.seed))

const [, minHeld, minOrder] = registered('fewer than (\\d+) held-out positions, or fewer than (\\d+) held-out positions in either order', 'its minimum counts')
g.def('MinHeld', minHeld).def('MinOrder', minOrder)
const [, perMonth] = registered('the first ([\\d,]+) such games of each month', 'its games a month')
const [, capText] = registered('keeps the first ([\\d,]+) of its drawn positions a month', 'its cap')
g.def('PerMonth', perMonth).def('Cap', capText)
const [, minPly] = registered('from ply (\\d+) on', 'where the scan starts')
const [, minPlies] = registered('at least (\\d+) plies', "the games' minimum length")
const [, nodes] = registered('\\(([\\d,]+) nodes\\)', "the referee's budget")
const [, windowWp] = registered('no more than `ACCEPT_WINDOW_WP` \\((\\d+)\\)', "the referee's window")
const [, lead] = registered('ahead in development by (\\d+) or more', 'the development lead')
const [, levelWithin] = registered("points within (\\d+) of the opponent's", 'level material')
const [, men] = registered('with (\\w+) men or fewer', 'the tablebase limit')
const [, coach] = registered('the coach\'s "four games in five" would read (\\d+)%', "the coach's share")
const [, noInfo] = registered('A rule with no information reads (\\d+)%', 'the share with no information')
g.def('MinPly', minPly).def('MinPlies', minPlies).def('Nodes', nodes).def('WindowWp', windowWp)
g.def('LeadMin', lead).def('LevelWithin', levelWithin).def('TablebaseMen', men).def('CoachShare', coach).def('NoInfoShare', noInfo)

// ---- the scan ----
const months = Object.keys(RULES.coverage)
claim(months.join() === '2026-07,2026-08,2026-09', 'the scan covers the three registered months')
const C = (m) => RULES.coverage[m]
const sum = (f) => months.reduce((a, m) => a + f(C(m)), 0)
claim(months.every((m) => C(m).games === integer(perMonth)), 'every month reads its registered games')
g.def('Games', count(sum((c) => c.games))).def('Skipped', count(sum((c) => c.skippedInitial)))
g.def('Entering', count(sum((c) => c.positionsEntering))).def('InUnit', count(sum((c) => c.positionsInAUnit)))
g.def('MaiaCalls', count(sum((c) => c.maiaCalls)))
claim(months.every((m) => C(m).maiaCalls === C(m).positionsInAUnit), 'Maia-2 read every entering position in a unit and no other')
const occurrences = Object.values(RULES.counts.occurrencesByMonth).reduce((a, n) => a + n, 0)
const unitRows = Object.values(RULES.counts.unitRowsByMonth).reduce((a, n) => a + n, 0)
claim(unitRows > occurrences, 'some positions serve several units')
g.def('Scored', count(occurrences)).def('UnitRows', count(unitRows))
g.def('GamesTrain', count(RULES.counts.unionGamesByPeriod.train)).def('GamesHeld', count(RULES.counts.unionGamesByPeriod.heldout))
const kept = (u, period) => (period === 'train' ? ['2026-07', '2026-08'] : ['2026-09']).reduce((a, m) => a + C(m).units[u].kept, 0)
claim(UNITS.every((u) => both((p) => U(u, p).positions === kept(u, p))), "the measures read every unit's kept positions")
claim(UNITS.every((u) => RULES.units[u].enoughData.passed), 'every unit has enough data by the registered counts')
const capped = RULE_UNIT_IDS.filter((u) => months.every((m) => C(m).units[u].kept === integer(capText)))
claim(capped.join() === 'tension,bishop-for-knight,knight-for-bishop,bishop-colour', 'four rule units fill the cap every month')
const thinnest = [...RULE_UNIT_IDS].sort((a, b) => U(a).positions - U(b).positions)[0]
claim(thinnest === 'trades-ahead', 'being ahead in development is the rarest split')
g.def('ThinName', UNIT_NAME[thinnest]).def('ThinHeld', count(U(thinnest).positions))
g.def('ThinHeldFollow', count(U(thinnest).orders['follow-first']))

const coverageRow = (u) => {
  const held = C('2026-09').units[u]
  return `${cap(UNIT_NAME[u])} & ${count(held.situation)} & ${count(held.splits)} & ${count(kept(u, 'train'))} & ${count(held.kept)} & ${count(held.followFirst)} & ${count(held.breakFirst)} \\\\`
}
g.block(
  'CoverageTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\begin{tabular}{@{}lrrrrrr@{}}',
    '\\toprule',
    ` & ${head('In situation,|held out')} & ${head('Split,|held out')} & ${head('Kept,|train')} & ${head('Kept,|held out')} & ${head('Follow-|first')} & ${head('Break-|first')} \\\\`,
    '\\midrule',
    ...RULE_UNIT_IDS.map(coverageRow),
    '\\midrule',
    coverageRow('trades-level'),
    coverageRow('hang'),
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Where each unit comes up. In situation: the held-out quiet positions in the unit's situation. Split: those where one of the two natural moves follows the unit's rule and the other breaks it. Kept: at most one position a game, drawn at random among its splits, and at most ${capText} a month. The last two columns divide the held-out kept positions by the move Maia-2 rates first: the one that follows, or the one that breaks.}`,
    '\\label{tab:coverage}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the control ----
const control = RULES.control
claim(control.passed === true && control.status === 'passes' && both((p) => above0(M(control[p], 'balancedLift'))), 'the control passes, its interval above 0 on both periods')
for (const [p, macro] of [['train', 'Train'], ['heldout', 'Held']]) {
  const m = control[p].measures
  g.def(`Control${macro}`, pts(m.balancedLift.value)).def(`Control${macro}Ci`, ci(m.balancedLift))
  g.def(`Control${macro}N`, count(control[p].positions))
  g.def(`ControlOne${macro}`, pts(m.oneSoundFollowShare.value, 0))
}
claim(both((p) => above0(M(control[p], 'breakFirstLift'))), 'the control is worth switching to as well')
claim(Object.keys(RULES.rules).every((r) => both((p) => M(R(r, p), 'balancedLift').hi < M(control[p], 'balancedLift').lo)), "every rule's interval lies below the control's on both periods")

// ---- the verdicts ----
const verdicts = Object.fromEntries(Object.keys(RULE_NAME).map((r) => [r, RULES.rules[r].verdict]))
claim(verdicts['bishop-knight'] === 'breaks the tie' && verdicts['bishop-colour'] === 'breaks the tie', 'bishop over knight and the bishop\'s colour break the tie')
claim(verdicts.tension === "does no better than Maia-2's order" && verdicts['trades-development'] === "does no better than Maia-2's order", 'the tension and trades by development do no better than Maia-2\'s order')
const winners = ['bishop-knight', 'bishop-colour']
claim(winners.every((r) => both((p) => above0(M(R(r, p), 'balancedLift')))), 'both winners have their intervals above 0 on both periods')
claim(both((p) => across0(M(R('tension', p), 'balancedLift'))), "the tension's interval spans 0 on both periods")
claim(above0(M(R('trades-development', 'train'), 'balancedLift')) && across0(M(R('trades-development'), 'balancedLift')), 'trades by development break the tie on the train months only')
const macroOf = { tension: 'Ten', 'trades-development': 'Tr', 'bishop-knight': 'Bk', 'bishop-colour': 'Col' }
for (const r of Object.keys(RULE_NAME)) {
  for (const [p, suffix] of [['train', 'Train'], ['heldout', 'Held']]) {
    const s = M(R(r, p), 'balancedLift')
    g.def(`${macroOf[r]}${suffix}`, pts(s.value)).def(`${macroOf[r]}${suffix}Ci`, ci(s))
  }
}

// ---- a tie-breaker, not a reason to switch ----
claim(Object.keys(RULE_NAME).every((r) => !RULES.rules[r].worthSwitching.criterionMet && !RULES.rules[r].worthSwitching.descriptiveOnly), 'no rule is worth switching to, and the criterion is read with the gates passed')
claim(Object.keys(RULE_NAME).every((r) => both((p) => below0(M(R(r, p), 'breakFirstLift')))), "every rule's break-first lift lies below 0 on both periods")
for (const r of winners) g.def(`${macroOf[r]}BfHeld`, pts(-M(R(r), 'breakFirstLift').value, 0))
claim(winners.every((r) => both((p) => above0(M(R(r, p), 'followFirstLift')))), 'where the rule agrees with the first choice, the winners lift on both periods')
const one = (r, p) => M(R(r, p), 'oneSoundFollowShare')
claim(winners.every((r) => both((p) => one(r, p).lo > 0.5 && one(r, p).hi < integer(coach) / 100)), "the winners' share when only one is sound lies above an even split and below the coach's")
const oneValues = winners.flatMap((r) => PERIODS.map((p) => one(r, p).value))
g.def('OneLow', pts(Math.min(...oneValues), 0)).def('OneHigh', pts(Math.max(...oneValues), 0))
for (const r of winners) g.def(`${macroOf[r]}OneTrain`, pts(one(r, 'train').value, 0)).def(`${macroOf[r]}OneHeld`, pts(one(r, 'heldout').value, 0))
claim(Object.keys(RULE_NAME).every((r) => both((p) => below0(M(R(r, p), 'againstFirst')))), 'following any rule over the first choice in every position costs soundness on both periods')
const against = Object.keys(RULE_NAME).map((r) => -M(R(r), 'againstFirst').value)
g.def('AgainstLow', pts(Math.min(...against), 0)).def('AgainstHigh', pts(Math.max(...against), 0))

g.block(
  'RuleTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\footnotesize',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabularx}{\\textwidth}{@{}llllL@{}}',
    '\\toprule',
    `Rule & ${head('Balanced lift,|train')} & ${head('Balanced lift,|held out')} & ${head('Break-first lift,|held out')} & Verdict \\\\`,
    '\\midrule',
    ...Object.keys(RULE_NAME).map((r) => `${cap(RULE_NAME[r])} & ${cell(M(R(r, 'train'), 'balancedLift'))} & ${cell(M(R(r), 'balancedLift'))} & ${cell(M(R(r), 'breakFirstLift'))} & ${RULES.rules[r].verdict} \\\\`),
    '\\midrule',
    `The control & ${cell(M(control.train, 'balancedLift'))} & ${cell(M(control.heldout, 'balancedLift'))} & ${cell(M(control.heldout, 'breakFirstLift'))} & passes \\\\`,
    '\\bottomrule',
    '\\end{tabularx}',
    `\\caption{The verdicts. The balanced lift is the mean, over the two orders, of the share of positions where the move that follows the rule is sound less the share where the move that breaks it is, in points, with its 95\\% interval from ${count(RULES.bootstrap.draws)} draws over games; a rule of two units takes the mean of its units' lifts on every draw. The break-first lift is the same difference where Maia-2 rates the move that breaks the rule first: a rule is worth switching to when its interval lies above 0 on both periods, and none does.}`,
    '\\label{tab:rules}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the halves ----
const bal = (u, p = 'heldout') => M(U(u, p), 'balancedLift')
claim(both((p) => above0(bal('bishop-for-knight', p))) && both((p) => across0(bal('knight-for-bishop', p))), 'keeping the bishop breaks the tie and taking a bishop with a knight does not')
claim(both((p) => above0(bal('trades-behind', p))) && above0(bal('trades-ahead', 'train')) && across0(bal('trades-ahead')), 'trading when behind breaks the tie on both periods, and avoiding trades when ahead on the train months only')
claim(both((p) => across0(bal('trades-level', p))), 'the reference reads no lift on either period')
for (const [u, macro] of [['bishop-for-knight', 'Bfn'], ['knight-for-bishop', 'Nfb'], ['trades-behind', 'Behind'], ['trades-ahead', 'Ahead'], ['trades-level', 'Level']]) {
  for (const [p, suffix] of [['train', 'Train'], ['heldout', 'Held']]) g.def(`${macro}${suffix}`, pts(bal(u, p).value)).def(`${macro}${suffix}Ci`, ci(bal(u, p)))
}

const unitRow = (u) => {
  const h = U(u).measures
  return `${cap(UNIT_NAME[u])} & ${count(U(u).positions)} & ${pts(h.soundnessF.value, 0)} & ${pts(h.soundnessB.value, 0)} & ${cell(h.followFirstLift)} & ${cell(h.breakFirstLift)} & ${cell(h.balancedLift)} & ${pts(h.oneSoundFollowShare.value, 0)} \\\\`
}
g.block(
  'UnitTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{3pt}',
    '\\begin{tabular}{@{}lrrrlllr@{}}',
    '\\toprule',
    ` & ${head('Held-out|positions')} & ${head('F|sound')} & ${head('B|sound')} & ${head('Lift,|follow-first')} & ${head('Lift,|break-first')} & ${head('Balanced|lift')} & ${head('F when only|one is sound')} \\\\`,
    '\\midrule',
    ...RULE_UNIT_IDS.map(unitRow),
    '\\midrule',
    unitRow('trades-level'),
    unitRow('hang'),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{Each unit apart, held out. F and B sound: the share of positions where the move that follows and the move that breaks the unit's rule is sound, in percent. The lifts are F's share less B's in points, in each order and as their mean, with 95\\% intervals. F when only one is sound: among the positions where exactly one of the two is sound, the share where it is F, as the mean of the two orders' shares, in percent.}",
    '\\label{tab:units}',
    '\\end{table}',
  ].join('\n'),
)

// ---- where the rules count ----
const closeBf = (u, c, p = 'heldout') => M(S(u, 'close', c, p), 'breakFirstLift')
claim(above0(closeBf('bishop-for-knight', 'true', 'train')) && across0(closeBf('bishop-for-knight', 'true')), 'in close calls keeping the bishop against the first choice is sounder on the train months, and no different held out')
claim(closeBf('bishop-for-knight', 'true').value > 0, 'held out, the point estimate still favours keeping the bishop in close calls')
claim(both((p) => across0(closeBf('bishop-colour', 'true', p))), "in close calls the bishop's colour against the first choice is about even on both periods")
claim(['bishop-for-knight', 'bishop-colour'].every((u) => both((p) => below0(closeBf(u, 'false', p)))), 'where the first choice is clear, it wins on both periods for both units')
for (const [u, macro] of [['bishop-for-knight', 'Bfn'], ['bishop-colour', 'Col']]) {
  for (const [p, suffix] of [['train', 'Train'], ['heldout', 'Held']]) {
    g.def(`${macro}CloseBf${suffix}`, pts(closeBf(u, 'true', p).value)).def(`${macro}CloseBf${suffix}Ci`, ci(closeBf(u, 'true', p)))
  }
  g.def(`${macro}ClearBfHeld`, pts(-closeBf(u, 'false').value, 0))
}
const closeBal = (u, p) => M(S(u, 'close', 'true', p), 'balancedLift')
claim(both((p) => above0(closeBal('trades-level', p))), 'in close calls the quiet move beats an even trade with development level, on both periods')
claim(above0(closeBal('tension', 'train')) && across0(closeBal('tension', 'heldout')), 'in close calls keeping the tension lifts on the train months only')
g.def('LevelCloseTrain', pts(closeBal('trades-level', 'train').value)).def('LevelCloseHeld', pts(closeBal('trades-level', 'heldout').value))
g.def('TenCloseTrain', pts(closeBal('tension', 'train').value)).def('TenCloseHeld', pts(closeBal('tension', 'heldout').value))
const closeShare = (u) => S(u, 'close', 'true').positions / U(u).positions
g.def('CloseShareLow', pts(Math.min(...RULE_UNIT_IDS.map(closeShare)), 0)).def('CloseShareHigh', pts(Math.max(...RULE_UNIT_IDS.map(closeShare)), 0))

const phase = (u, c, p = 'heldout') => M(S(u, 'phase', c, p), 'balancedLift')
claim(both((p) => phase('bishop-for-knight', 'opening', p).value > phase('bishop-for-knight', 'middlegame', p).value) && both((p) => above0(phase('bishop-for-knight', 'middlegame', p))), 'keeping the bishop lifts most in the opening, and still in the middlegame')
claim(both((p) => across0(phase('bishop-colour', 'opening', p))) && both((p) => above0(phase('bishop-colour', 'middlegame', p)) && above0(phase('bishop-colour', 'endgame', p))), "the bishop's colour lifts in the middlegame and the endgame, not the opening")
claim(both((p) => above0(phase('knight-for-bishop', 'opening', p)) && below0(phase('knight-for-bishop', 'middlegame', p))), 'taking a bishop with a knight lifts in the opening and misleads in the middlegame, on both periods')
const band = (u, c, p = 'heldout') => M(S(u, 'band', c, p), 'balancedLift')
claim(both((p) => band('bishop-for-knight', '1300', p).value > band('bishop-for-knight', '1500', p).value), 'keeping the bishop lifts more in his band than the one above, on both periods')
claim(both((p) => above0(band('bishop-colour', '1300', p)) && above0(band('bishop-colour', '1500', p))), "the bishop's colour lifts in both bands")
g.def('BfnOpenHeld', pts(phase('bishop-for-knight', 'opening').value)).def('BfnMiddleHeld', pts(phase('bishop-for-knight', 'middlegame').value))
g.def('ColOpenHeld', pts(phase('bishop-colour', 'opening').value)).def('ColMiddleHeld', pts(phase('bishop-colour', 'middlegame').value)).def('ColEndHeld', pts(phase('bishop-colour', 'endgame').value))
g.def('NfbOpenHeld', pts(phase('knight-for-bishop', 'opening').value)).def('NfbMiddleHeld', pts(phase('knight-for-bishop', 'middlegame').value))
g.def('BfnHisHeld', pts(band('bishop-for-knight', '1300').value)).def('BfnAboveHeld', pts(band('bishop-for-knight', '1500').value))

const piece = (u, c, p = 'heldout') => M(S(u, 'tradePiece', c, p), 'balancedLift')
const tradeTakesBishopBetter = (u, quietFollows) => both((p) => (quietFollows ? piece(u, 'b', p).value < piece(u, 'n', p).value : piece(u, 'b', p).value > piece(u, 'n', p).value))
claim(tradeTakesBishopBetter('trades-ahead', true) && tradeTakesBishopBetter('trades-level', true) && tradeTakesBishopBetter('trades-behind', false), 'in all three trade units a trade that takes a bishop fares better against the quiet move than one that takes a knight, on both periods')
claim(both((p) => above0(piece('trades-behind', 'b', p)) && below0(piece('trades-behind', 'n', p))), 'trading when behind lifts where the trade takes a bishop and misleads where it takes a knight')
g.def('BehindBishopHeld', pts(piece('trades-behind', 'b').value)).def('BehindKnightHeld', pts(-piece('trades-behind', 'n').value))

const closeRow = (u) => {
  const close = S(u, 'close', 'true'), clear = S(u, 'close', 'false')
  return `${cap(UNIT_NAME[u])} & ${count(close.positions)} & ${cell(M(close, 'balancedLift'))} & ${cell(M(close, 'breakFirstLift'))} & ${count(clear.positions)} & ${cell(M(clear, 'balancedLift'))} & ${cell(M(clear, 'breakFirstLift'))} \\\\`
}
g.block(
  'CloseTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{2pt}',
    '\\begin{tabular}{@{}lrllrll@{}}',
    '\\toprule',
    ` & \\multicolumn{3}{c}{Close calls} & \\multicolumn{3}{c}{Clear first choice} \\\\`,
    '\\cmidrule(lr){2-4}\\cmidrule(l){5-7}',
    ` & Positions & ${head('Balanced|lift')} & ${head('Break-first|lift')} & Positions & ${head('Balanced|lift')} & ${head('Break-first|lift')} \\\\`,
    '\\midrule',
    ...RULE_UNIT_IDS.map(closeRow),
    '\\midrule',
    closeRow('trades-level'),
    closeRow('hang'),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{Close calls against a clear first choice, held out, in points with 95\\% intervals. A close call: Maia-2's probability of its second move is at least half its probability of its first. The break-first lift is F's soundness less B's where Maia-2 rates B first. The splits describe and decide nothing.}",
    '\\label{tab:close}',
    '\\end{table}',
  ].join('\n'),
)

const whole = (x) => (pts(x, 0) === pts(-0.001, 0) ? pts(0, 0) : pts(x, 0))
const splitCell = (x) => (x.positions === 0 ? '--' : `${whole(x.measures.balancedLift.value)} {\\scriptsize(${count(x.positions)})}`)
const SPLITS = [
  ['band', '1300'],
  ['band', '1500'],
  ['phase', 'opening'],
  ['phase', 'middlegame'],
  ['phase', 'endgame'],
]
g.block(
  'SplitTable',
  [
    '\\begin{table}[ht]',
    '\\centering\\scriptsize',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{@{}lrrrrr@{}}',
    '\\toprule',
    ` & ${head(`${hisLow} to|${hisHigh}`)} & ${head(`${aboveLow} to|${aboveHigh}`)} & Opening & ${head('Middle-|game')} & Endgame \\\\`,
    '\\midrule',
    ...RULE_UNIT_IDS.map((u) => `${cap(UNIT_NAME[u])} & ${SPLITS.map(([f, c]) => splitCell(S(u, f, c))).join(' & ')} \\\\`),
    '\\midrule',
    ...['trades-level', 'hang'].map((u) => `${cap(UNIT_NAME[u])} & ${SPLITS.map(([f, c]) => splitCell(S(u, f, c))).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
    "\\caption{The balanced lift by the mover's band and by phase, held out, in points, with the cell's positions in brackets; a dash is a cell with none. The bands are the mover's Lichess rating; the phase is the app's divider's. The splits describe and decide nothing; every cell's interval is in \\texttt{results/rules.json}.}",
    '\\label{tab:splits}',
    '\\end{table}',
  ].join('\n'),
)

// ---- the examples ----
claim(EXAMPLES.summary.positions === 6 * UNITS.length && EXAMPLES.selection.positionsPerUnit === 6, 'six held-out examples a unit')
const example = (u, n) => {
  const found = EXAMPLES.units[u].examples.find((e) => e.number === n)
  claim(found && found.referee === 'stockfish', `example ${n} of ${u} is refereed by Stockfish`)
  return found
}
const exampleShares = (u) => EXAMPLES.units[u].summary
g.def('BfnExamplesF', word(exampleShares('bishop-for-knight').soundF)).def('BfnExamplesB', word(exampleShares('bishop-for-knight').soundB))
g.def('ColExamplesF', word(exampleShares('bishop-colour').soundF)).def('ColExamplesB', word(exampleShares('bishop-colour').soundB))
const SHOWN = [
  ['bishop-for-knight', 4, 'BfnFour'],
  ['bishop-colour', 2, 'ColTwo'],
  ['bishop-for-knight', 6, 'BfnSix'],
]
const sanLine = (e, m) => movesTex(e.fen, [m.san])
const side = (e) => (e.fen.split(' ')[1] === 'w' ? 'White' : 'Black')
const cases = SHOWN.map(([u, n, name]) => {
  const e = example(u, n)
  const ruleSound = e.moves.F.sound
  return { u, n, name, e, ruleSound, sound: ruleSound ? e.moves.F : e.moves.B, unsound: ruleSound ? e.moves.B : e.moves.F }
})
claim(cases[0].e.stratum === 'break-first' && cases[0].ruleSound, "the first example is a first choice that gives the bishop, rescued by the rule")
claim(cases[1].e.stratum === 'break-first' && cases[1].ruleSound, "the second example is a first choice on the bishop's colour, rescued by the rule")
claim(cases[2].e.stratum === 'follow-first' && !cases[2].ruleSound, 'the third example is a first choice that keeps the bishop, where the rule is wrong')
const BAND_NAME = { 1300: 'his band', 1500: 'the band above his' }
claim(cases.every((c) => c.e.band in BAND_NAME), "every example's mover is in one of the two bands")
for (const c of cases) {
  g.def(`${c.name}Side`, side(c.e)).def(`${c.name}Band`, BAND_NAME[c.e.band])
  g.def(`${c.name}F`, sanLine(c.e, c.e.moves.F)).def(`${c.name}B`, sanLine(c.e, c.e.moves.B))
  g.def(`${c.name}Played`, sanLine(c.e, c.e.moves.played)).def(`${c.name}Best`, sanLine(c.e, c.e.moves.best))
  g.def(`${c.name}FWin`, fixed(c.e.moves.F.winPercent, 0)).def(`${c.name}BWin`, fixed(c.e.moves.B.winPercent, 0))
}
claim(cases[0].e.moves.played.uci !== cases[0].e.moves.F.uci && cases[0].e.moves.played.uci !== cases[0].e.moves.B.uci, 'in the first example a third move was played')
claim(cases[1].e.moves.played.uci === cases[1].e.moves.F.uci && cases[1].e.moves.best.uci === cases[1].e.moves.F.uci, "in the second example the rule's move was played and is the best")
claim(cases[2].e.moves.best.uci === cases[2].e.moves.B.uci && cases[2].e.moves.played.uci === cases[2].e.moves.F.uci, 'in the third example the trade was the best and the rule\'s move was played')
const panel = (c) =>
  [
    '\\begin{subfigure}[t]{0.32\\textwidth}',
    '\\centering',
    board(c.e.fen, { played: c.unsound.uci, better: c.sound.uci, size: '11pt' }),
    `\\caption{${UNIT_NAME[c.u] === "bishop's colour" ? "The bishop's colour" : 'Bishop for knight'}, ${c.e.stratum}: ${sanLine(c.e, c.sound)} is sound, ${sanLine(c.e, c.unsound)} is not.}`,
    '\\end{subfigure}',
  ].join('\n')
g.block(
  'ExampleFigure',
  [
    '\\begin{figure}[ht]',
    '\\centering',
    cases.map(panel).join('\\hfill\n'),
    "\\caption{Three of the held-out examples, drawn at random among the positions where exactly one of the two natural moves is sound. Green: the sound move; red: the unsound one.}",
    '\\label{fig:examples}',
    '\\end{figure}',
  ].join('\n'),
)

g.write(join(HERE, 'generated.tex'))
