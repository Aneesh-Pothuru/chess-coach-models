#!/usr/bin/env node
// Writes paper/generated.tex for the think-time paper from what analyze.py
// wrote (results/analysis.json). It refuses to write when a claim the paper
// makes no longer holds.
//
//   bridge/run.sh projects/think-time-rapid/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, esc, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const res = JSON.parse(readFileSync(join(resultsDir('think-time-rapid'), 'analysis.json'), 'utf8'))
const g = new Generated('projects/think-time-rapid/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const TRIGGERS = ['book-end', 'conversion', 'forcing', 'structure']
const NAMES = { 'book-end': 'Book end', conversion: 'Conversion', forcing: 'Forcing', structure: 'Structure', none: 'None' }
const count = (n) => n.toLocaleString('en-US')
const ok = (x) => x != null && Number.isFinite(x)
/** A difference in rates as signed percentage points. */
const pp = (x, d = 1) => (!ok(x) ? '--' : `${x > 0 ? '$+$' : ''}${fixed(100 * x, d)}`)
/** A difference with its interval: "+2.0 (+1.1, +2.9)". */
const ci = (r) => (!ok(r.delta) ? '--' : `${pp(r.delta)} {\\footnotesize (${pp(r.lo)}, ${pp(r.hi)})}`)
const pval = (p) => (!ok(p) ? '--' : p < 0.001 ? '$<$0.001' : fixed(p, 3))
const commandName = (s) => s.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())

g.def('AppCommit', res.appCommit.slice(0, 10)).def('Month', res.month)

// ---- the study's parameters and the app's constants ----
const P = res.params
const C = res.constants
g.def('WindowLo', String(P.window[0])).def('WindowHi', String(P.window[1])).def('MinClock', String(P.minClock))
g.def('Strata', word(P.strata)).def('Draws', count(P.draws)).def('Seed', String(P.seed)).def('Plateau', String(P.plateau))
g.def('BarShare', percent(P.barShare, 0)).def('DefendingPawns', fixed(-P.defendingCp / 100, 0)).def('EarlyOwn', word(P.earlyOwnMoves))
g.def('WindowCentre', String((P.window[0] + P.window[1] + 1) / 2)).def('RatingLo', String(P.ratingBins[0][0])).def('RatingHi', String(P.ratingBins.at(-1)[1]))
g.def('Rushed', String(C.RUSHED_SECONDS)).def('Deep', String(C.DEEP_THINK_SECONDS)).def('BookEnd', String(C.BOOK_END_SECONDS)).def('Decided', String(C.decidedSeconds))

// ---- the data ----
const G = res.games
const M = res.moves
const kept = Object.values(G.kept).reduce((a, b) => a + b, 0)
g.def('GamesRead', count(G.read)).def('GamesRapid', count(G.rapid)).def('GamesWithEvals', count(G.rapidWithEvalsAndClocks))
g.def('GamesKept', count(kept)).def('GamesBuilt', count(G.built)).def('BlackChecked', count(G.blackBuildsChecked))
claim(G.built === kept && Object.keys(G.skipped).length === 0, 'every kept game was built')
g.def('MovesTimed', count(M.timed)).def('MovesAnalysed', count(M.analysed)).def('MovesPrimary', count(M.primary))
g.def('PlayerGames', count(M.primaryPlayerGames)).def('PrimaryQuick', count(M.primaryQuick)).def('PrimaryLong', count(M.primaryLong))
g.def('LongShare', percent(M.primaryLong / M.primary, 0)).def('QuickShare', percent(M.primaryQuick / M.primary, 0))
g.block(
  'KeptTable',
  [
    '\\begin{tabular}{l' + 'r'.repeat(Object.keys(G.kept).length) + '}',
    '\\toprule',
    `mean rating & ${Object.keys(G.kept).map((b) => b.replace('-', '--')).join(' & ')} \\\\`,
    '\\midrule',
    `games & ${Object.values(G.kept).map(count).join(' & ')} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)

// ---- the danger score ----
const D = res.danger
g.def('AucQuick', fixed(D.aucQuick, 3)).def('AucOther', fixed(D.aucOther, 3)).def('Trees', String(D.params.n_estimators))
g.def('SeriousQuick', percent(D.seriousQuick, 1))

// ---- the triggers ----
const T = res.triggers
const N = res.none
const triggerRow = (name, r, vs) =>
  `${name} & ${fixed(r.perGame, 1)} & ${count(r.quick)} & ${count(r.long)} & ${percent(r.rateQuick, 1)} & ${percent(r.rateLong, 1)} & ${ci(r)} & ${vs ? ci(r.vsNone) : ''} & ${vs ? pval(r.vsNone.pHolm) : ''} \\\\`
g.block(
  'TriggerTable',
  [
    '\\begin{tabular}{lrrrrrllr}',
    '\\toprule',
    ' & per & \\multicolumn{2}{c}{moves} & \\multicolumn{2}{c}{serious errors} & & & Holm \\\\',
    '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}',
    'moment & game & quick & long & quick & long & $\\Delta$ & $\\Delta - \\Delta_{\\text{none}}$ & $p$ \\\\',
    '\\midrule',
    ...TRIGGERS.map((t) => triggerRow(NAMES[t], T[t], true)),
    '\\midrule',
    triggerRow('none', N, false),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
for (const t of TRIGGERS) {
  const r = T[t]
  const k = commandName(t)
  g.def(`${k}Delta`, pp(r.delta)).def(`${k}Lo`, pp(r.lo)).def(`${k}Hi`, pp(r.hi)).def(`${k}VsNone`, pp(r.vsNone.delta))
  g.def(`${k}VsNoneLo`, pp(r.vsNone.lo)).def(`${k}VsNoneHi`, pp(r.vsNone.hi)).def(`${k}PHolm`, pval(r.vsNone.pHolm))
  g.def(`${k}PerGame`, fixed(r.perGame, 1)).def(`${k}Verdict`, esc(r.verdict)).def(`${k}ThinkGap`, fixed(r.thinkGap, 0))
  g.def(`${k}RateQuick`, percent(r.rateQuick, 1)).def(`${k}RateLong`, percent(r.rateLong, 1)).def(`${k}Dropped`, percent(r.dropped, 1))
  g.def(`${k}Saved`, fixed(r.savedPerMinute.value, 3)).def(`${k}SavedLo`, fixed(r.savedPerMinute.lo, 3)).def(`${k}SavedHi`, fixed(r.savedPerMinute.hi, 3))
}
g.def('NoneDelta', pp(N.delta)).def('NoneLo', pp(N.lo)).def('NoneHi', pp(N.hi)).def('NonePerGame', fixed(N.perGame, 1))
g.def('NoneRateQuick', percent(N.rateQuick, 1)).def('NoneRateLong', percent(N.rateLong, 1)).def('NoneThinkGap', fixed(N.thinkGap, 0))
const verdicts = TRIGGERS.map((t) => T[t].verdict)
g.def('Kept', word(verdicts.filter((v) => v === 'keep').length)).def('NoSign', word(verdicts.filter((v) => v === 'no sign it pays').length))

// ---- the candidates ----
const K = res.candidates
const CAND = Object.keys(K)
// The candidates' names as a table has room for them.
const SHORT = { 'in-check': 'in check', 'after-capture': 'after a capture', 'own-hanging': 'his piece hanging', 'opp-hanging': "opponent's piece hanging", 'after-opp-error': "after the opponent's error", defending: 'defending, $-$3 or worse', early: 'book end and his next four', 'high-danger': 'high danger, top fifth' }
claim(CAND.every((k) => SHORT[k]), 'every candidate has a short name')
g.block(
  'CandidateTable',
  [
    '\\begin{tabular}{lrrrllrc}',
    '\\toprule',
    ' & per & \\multicolumn{2}{c}{moves} & & & Holm & \\\\',
    '\\cmidrule(lr){3-4}',
    'before the move & game & quick & long & $\\Delta$ & $\\Delta - \\Delta_{\\text{none}}$ & $p$ & joins \\\\',
    '\\midrule',
    ...CAND.map((k) => {
      const r = K[k]
      return `${SHORT[k]} & ${fixed(r.perGame, 1)} & ${count(r.quick)} & ${count(r.long)} & ${ci(r)} & ${ci(r.vsNone)} & ${pval(r.vsNone.pHolm)} & ${r.join ? 'yes' : 'no'} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
g.def('CandidatesJoin', word(CAND.filter((k) => K[k].join).length)).def('CandidatesPay', word(CAND.filter((k) => K[k].pays).length))
for (const k of CAND) {
  const r = K[k]
  const n = `Cand${commandName(k)}`
  g.def(`${n}Delta`, pp(r.delta)).def(`${n}Lo`, pp(r.lo)).def(`${n}Hi`, pp(r.hi)).def(`${n}VsNone`, pp(r.vsNone.delta)).def(`${n}PHolm`, pval(r.vsNone.pHolm))
}
g.def('HighDangerCut', percent(D.highDangerCut, 1))

// ---- the bars: Δ by think bin ----
const B = res.bars
const binLabels = B[TRIGGERS[0]].bins.map((r) => r.bin.replace('-', '--'))
const barPlot = (t) => {
  const rows = B[t].bins
  // Each point with its interval as asymmetric error bars, in percentage points.
  const pts = rows
    .map((r, i) => (ok(r.delta) && ok(r.lo) ? `(${i}, ${(100 * r.delta).toFixed(2)}) += (0, ${(100 * (r.hi - r.delta)).toFixed(2)}) -= (0, ${(100 * (r.delta - r.lo)).toFixed(2)})` : null))
    .filter(Boolean)
  return [
    '\\begin{tikzpicture}',
    `\\begin{axis}[scale only axis, width=0.8\\linewidth, height=3.6cm, title={${NAMES[t]}}, xtick={0,...,${rows.length - 1}}, xticklabels={${binLabels.join(',')}},`,
    `  xmin=-0.5, xmax=${rows.length - 0.5}, x tick label style={font=\\scriptsize}, ylabel={$\\Delta$, points}, xlabel={think, seconds}, grid=major]`,
    '\\addplot[only marks, mark=*, mark size=1.5pt, black, error bars/.cd, y dir=both, y explicit] coordinates {',
    pts.join('\n'),
    '};',
    `\\draw[gray, densely dotted] (axis cs:-1,0) -- (axis cs:${rows.length},0);`,
    '\\end{axis}',
    '\\end{tikzpicture}',
  ].join('\n')
}
for (const t of TRIGGERS) g.block(`${commandName(t)}BarPlot`, barPlot(t))
for (const t of TRIGGERS) {
  const b = B[t]
  const k = commandName(t)
  g.def(`${k}Plateau`, pp(b.plateau.delta)).def(`${k}PlateauLo`, pp(b.plateau.lo)).def(`${k}PlateauHi`, pp(b.plateau.hi))
  g.def(`${k}Bar`, b.bar == null ? 'none' : `${b.bar} seconds`).def(`${k}AppBar`, String(b.appBar)).def(`${k}BarVerdict`, esc(b.verdict))
}
g.def('Bars', word(TRIGGERS.filter((t) => B[t].bar != null).length))

// ---- the trend with rating ----
const R = res.trend
g.block(
  'TrendTable',
  [
    '\\begin{tabular}{l' + 'l'.repeat(TRIGGERS.length + 1) + '}',
    '\\toprule',
    `mover's rating & none & ${TRIGGERS.map((t) => NAMES[t].toLowerCase()).join(' & ')} \\\\`,
    '\\midrule',
    ...Object.entries(R).map(([band, row]) => `${band.replace('-', '--')} & ${ci(row.none)} & ${TRIGGERS.map((t) => ci(row[t])).join(' & ')} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)

// ---- the same position ----
const S = res.samePosition
g.def('SamePositions', count(S.positions)).def('SameQuick', count(S.quick)).def('SameLong', count(S.long))
g.def('SameDelta', pp(S.delta)).def('SameLo', pp(S.lo)).def('SameHi', pp(S.hi)).def('SameCutBound', fixed(-100 * S.lo, 1))
claim(S.top.length === 3, 'three positions to show')
// The book-exit positions most of the primary set's games reached, with what was played in them.
g.block(
  'SameBoards',
  [
    ...S.top.map((pos, i) => {
      const side = pos.fen.split(' ')[1] === 'w' ? 'White' : 'Black'
      return [
        `\\begin{subfigure}[t]{0.32\\textwidth}\\centering`,
        board(`${pos.fen} 0 1`, { size: '11pt' }),
        `\\caption*{${side} to move: ${count(pos.quick)} quick moves, ${percent(pos.rateQuick, 1)}\\% serious; ${count(pos.long)} long, ${percent(pos.rateLong, 1)}\\%.\\\\[0.2em]\\fen{${pos.fen}}}`,
        `\\end{subfigure}${i < S.top.length - 1 ? '\\hfill' : ''}`,
      ].join('\n')
    }),
  ].join('\n'),
)

// ---- the sensitivity ----
const Z = res.sensitivity
g.block(
  'SensitivityTable',
  [
    '\\begin{tabular}{lllll}',
    '\\toprule',
    ` & \\multicolumn{2}{c}{ten strata} & \\multicolumn{2}{c}{quick from ${Z.quickFrom + 1} seconds} \\\\`,
    '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}',
    'moment & $\\Delta$ & $\\Delta - \\Delta_{\\text{none}}$ & $\\Delta$ & $\\Delta - \\Delta_{\\text{none}}$ \\\\',
    '\\midrule',
    ...TRIGGERS.map((t) => `${NAMES[t]} & ${ci(Z.strata10[t])} & ${ci(Z.strata10[t].vsNone)} & ${ci(Z.quick6to10[t])} & ${ci(Z.quick6to10[t].vsNone)} \\\\`),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)

// ---- where the errors are (added after the rule; tests nothing) ----
const E = res.concentration
g.def('SeriousRate', percent(E.seriousRate, 1))
const shareRow = (name, r) => `${name} & ${count(r.moves)} & ${percent(r.moveShare, 1)} & ${percent(r.errorShare, 1)} & ${fixed(r.errorShare / r.moveShare, 2)} \\\\`
g.block(
  'ConcentrationTable',
  [
    '\\begin{tabular}{lrrrr}',
    '\\toprule',
    'moment & moves & share of moves & share of serious errors & ratio \\\\',
    '\\midrule',
    ...[...TRIGGERS, 'none'].map((t) => shareRow(NAMES[t].toLowerCase(), E.triggers[t])),
    '\\midrule',
    ...CAND.map((k) => shareRow(SHORT[k], E.candidates[k])),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n'),
)
// The clock a game's triggers ask for, at the app's bars, among the moves analysed.
const asked = TRIGGERS.reduce((s, t) => s + T[t].perGame * (t === 'book-end' ? C.BOOK_END_SECONDS : C.DEEP_THINK_SECONDS), 0)
g.def('AskedSeconds', fixed(asked, 0)).def('AskedShare', percent(asked / 600, 0))

// ---- his games ----
const H = res.archive
if (H) {
  g.def('HisGames', count(H.games)).def('HisMoves', count(H.moves))
  // His errors come from the routine's engine, not Lichess's, so they are set beside each other, not beside his level's.
  const hisRow = (t) => {
    const r = H.byTrigger[t]
    return `${NAMES[t].toLowerCase()} & ${fixed(r.perGame, 1)} & ${fixed(r.peersPerGame, 1)} & ${percent(r.his.longShare, 1)} & ${percent(r.peers.longShare, 1)} & ${percent(r.his.seriousQuick, 1)} {\\footnotesize (${count(r.his.quickN)})} & ${percent(r.his.seriousLong, 1)} {\\footnotesize (${count(r.his.longN)})} \\\\`
  }
  g.block(
    'HisTable',
    [
      '\\begin{tabular}{lrrrrrr}',
      '\\toprule',
      ' & \\multicolumn{2}{c}{per game} & \\multicolumn{2}{c}{share of long thinks} & \\multicolumn{2}{c}{his serious errors} \\\\',
      '\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}',
      'moment & his & his level & his & his level & quick {\\footnotesize ($n$)} & long {\\footnotesize ($n$)} \\\\',
      '\\midrule',
      ...[...TRIGGERS, 'none'].map(hisRow),
      '\\bottomrule',
      '\\end{tabular}',
    ].join('\n'),
  )
  const conv = H.byTrigger.conversion
  // His games meet the moments about as often as his level, think long about as often except when converting, and
  // where he has enough long thinks to read, err more after them.
  const HIS_MIN_LONG = 50
  g.def('HisMinLong', String(HIS_MIN_LONG))
  for (const t of [...TRIGGERS, 'none']) {
    const r = H.byTrigger[t]
    if (t === 'structure') claim(r.perGame > 1.25 * r.peersPerGame, 'pawn captures outside the endgame come up more often in his games')
    else claim(r.perGame >= 0.8 * r.peersPerGame && r.perGame <= 1.25 * r.peersPerGame, `his games meet ${t} about as often as his level`)
    if (t !== 'conversion') claim(Math.abs(r.his.longShare - r.peers.longShare) < 0.01, `his long share at ${t} is close to his level's`)
    if (r.his.longN >= HIS_MIN_LONG) claim(r.his.seriousLong > r.his.seriousQuick, `his errors after a long think at ${t} run above those after a quick one`)
  }
  claim(conv.his.longShare > conv.peers.longShare + 0.01, 'he thinks long more often when converting')
  g.def('HisConversionLong', percent(conv.his.longShare, 1)).def('PeersConversionLong', percent(conv.peers.longShare, 1))
}

// ---- the claims the paper's prose makes ----
claim(TRIGGERS.every((t) => T[t].verdict === 'no sign it pays' && !(T[t].hi < 0)), 'no trigger pays')
claim(N.lo > 0, 'at ordinary moves a long think is followed by more serious errors')
for (const t of ['conversion', 'forcing']) {
  claim(T[t].lo > 0 && T[t].vsNone.lo > 0 && T[t].vsNone.pHolm < 0.05, `${t}: more errors after a long think, and more than at ordinary moves`)
  const bins = B[t].bins
  claim(bins.filter((r) => r.from >= 30).every((r) => r.delta > bins[0].delta), `${t}: every bin from 30 seconds is above the 10-14 bin`)
}
for (const t of ['book-end', 'structure']) {
  claim(T[t].lo < 0 && T[t].hi > 0, `${t}: its interval holds zero`)
  claim(T[t].vsNone.hi < 0 && T[t].vsNone.pHolm < 0.05, `${t}: below ordinary moves`)
}
claim(CAND.every((k) => K[k].lo > 0 && !K[k].join), 'at every candidate a long think is followed by more serious errors')
claim(TRIGGERS.every((t) => B[t].bar == null), 'no trigger has a bar')
claim(Object.values(R).every((row) => row.none.lo > 0 && row.conversion.lo > 0 && row.forcing.lo > 0), 'at every rating band: ordinary, conversion and forcing moves are worse after a long think')
claim(S.lo < 0 && S.hi > 0, 'within one position the book-end difference holds zero')
for (const z of [Z.strata10, Z.quick6to10]) {
  claim(TRIGGERS.every((t) => !(z[t].hi < 0)), 'no trigger pays in the sensitivity runs')
  claim(TRIGGERS.every((t) => Math.sign(z[t].vsNone.delta) === Math.sign(T[t].vsNone.delta)), 'the sensitivity runs keep each comparison with ordinary moves on its side')
}
claim(D.aucQuick > 0.75, 'the danger score separates quick serious errors well')
const after = E.candidates['after-opp-error']
const high = E.candidates['high-danger']
const be = E.triggers['book-end']
claim(after.errorShare > 2 * after.moveShare && high.errorShare > 2 * high.moveShare, 'errors concentrate after the opponent error and in high danger')
claim(be.errorShare < be.moveShare / 2, 'the book exit holds under half its share of the errors')
claim(asked > 0.8 * 600, 'the triggers ask for most of the clock')
g.def('AfterMoves', percent(after.moveShare, 0)).def('AfterErrors', percent(after.errorShare, 0))
g.def('HighMoves', percent(high.moveShare, 0)).def('HighErrors', percent(high.errorShare, 0))
g.def('BookEndMoves', percent(be.moveShare, 1)).def('BookEndErrors', percent(be.errorShare, 1))
const fired = TRIGGERS.reduce((x, t) => x + T[t].perGame, 0)
claim(after.errorShare > 0.3 && after.errorShare < 0.37 && after.moveShare > 0.12 && after.moveShare < 0.16, 'a third of the errors on a seventh of the moves')
claim(E.triggers.forcing.moveShare > 0.4 && E.triggers.forcing.moveShare < 0.5, 'the forcing trigger fires on almost half the moves')
claim(asked / 600 > 0.85 && asked / 600 < 0.95, 'the triggers ask for nine tenths of the clock')
const byDelta = CAND.slice().sort((a, b) => K[b].delta - K[a].delta)
claim(byDelta.slice(0, 2).sort().join() === ['after-opp-error', 'high-danger'].sort().join(), 'the two largest candidate excesses: after the opponent error and high danger')
for (const t of ['conversion', 'forcing']) claim(T[t].savedPerMinute.hi < 0, `${t}: a long think's minute goes with errors added`)
claim(S.top.every((pos) => pos.long / (pos.quick + pos.long) < 0.02 && pos.rateQuick < E.seriousRate && pos.rateLong < E.seriousRate), 'in the most common book exits long thinks are rare and errors below the average')
g.def('TriggersPerGame', fixed(fired, 0)).def('AnalysedPerGame', fixed(fired + N.perGame, 0))
const perGameErrors = (r) => r.serious / M.primaryPlayerGames
g.def('BookEndErrorsPerGame', fixed(perGameErrors(be), 2)).def('AfterErrorsPerGame', fixed(perGameErrors(after), 1)).def('ErrorsPerGame', fixed((E.seriousRate * M.primary) / M.primaryPlayerGames, 1))
g.def('TriggerShare', percent(TRIGGERS.reduce((x, t) => x + E.triggers[t].moveShare, 0), 0)).def('ForcingShare', percent(E.triggers.forcing.moveShare, 0))

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/think-time-rapid/paper/generated.tex')
