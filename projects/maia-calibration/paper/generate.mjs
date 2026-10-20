#!/usr/bin/env node
// Writes paper/generated.tex for the calibration paper: the rule's three tests,
// each band's temperature and the top choice's confidence before and after
// (results/calibration.json, from fit.mjs), the app's offsets for the player
// and his opponents, and the lab's benchmark of its own Maia-2 on the same
// Lichess moves.
//
//   bridge/run.sh projects/maia-calibration/paper/generate.mjs
//
// It reads only aggregates. What it writes names no game.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, chess, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, percent } from '../../paper.mjs'
import { appOffsets } from '../bands.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const r = json(join(resultsDir('maia-calibration'), 'calibration.json'))
const bench = json(join(LAB_DIR, 'reports', 'maia_benchmark_metrics.json'))
const pin = json(join(LAB_DIR, 'bridge', 'chess.json'))
const engineApi = await chess('src/services/engine/index.ts')
const { maiaBands, MAIA_ELO_START, MAIA_ELO_END } = engineApi
const offsets = appOffsets(engineApi)
const g = new Generated('projects/maia-calibration/paper/generate.mjs')
/** A count with a thousands separator: 25{,}000. */
const count = (x) => x.toLocaleString('en-US').replace(/,/g, '{,}')

if (r.app !== pin.commit) throw new Error('the results measured another app commit than the lab pins: rerun fit.mjs')
if (r.data.his.offsets?.player !== offsets.player || r.data.his.offsets?.opponents !== offsets.opponents) throw new Error("the player's games were scored at other offsets than the app's")
if (!(offsets.opponents > offsets.player)) throw new Error('the paper says the app reads the opponents at a larger offset than the player')
g.def('AppCommit', `\\texttt{${pin.commit.slice(0, 7)}}`).def('Draws', count(r.draws)).def('Seed', String(r.seed)).def('MinFitMoves', String(r.minFitMoves))

// ---- the data ----
const d = r.data
g.def('LichessMoves', count(d.lichess.moves)).def('LichessGames', count(d.lichess.games))
g.def('FitMoves', count(d.lichess.fitMoves)).def('HeldMoves', count(d.lichess.heldMoves))
g.def('HisMoves', count(d.his.moves)).def('HisGames', count(d.his.games)).def('PlayerOffset', String(offsets.player)).def('OpponentOffset', String(offsets.opponents))
g.def('PunishExact', String(d.punish.exact)).def('PunishAll', String(d.punish.all)).def('PunishGames', String(d.punish.games))
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const [year, month] = bench.protocol.month.split('-').map(Number)
g.def('BenchMonth', `${MONTHS[month - 1]} ${year}`).def('BenchPerBand', count(bench.protocol.moves_per_band_target)).def('BenchPerGame', String(bench.protocol.max_moves_per_game))
g.def('BenchSeen', count(bench.sampling.games_seen)).def('BenchMinPly', String(bench.protocol.min_ply)).def('BenchMinClock', String(Math.round(bench.protocol.min_clock_seconds)))
if (bench.overall.n !== d.lichess.moves) throw new Error("the benchmark's sample is not the one the fit scored")

// ---- the overconfidence the benchmark found, band by band ----
const coarse = Object.values(bench.move_match_by_band)
const gaps = coarse.map((b) => b.mean_maia_top1_probability - b.top1_move_match_accuracy)
if (!gaps.every((x) => x > 0)) throw new Error('the benchmark no longer finds Maia-2 overconfident in every band')
g.def('BenchGapMin', fixed(100 * Math.min(...gaps), 1)).def('BenchGapMax', fixed(100 * Math.max(...gaps), 1))
g.def('BenchTop', percent(bench.overall.top1_move_match_accuracy, 1)).def('BenchConf', percent(bench.overall.mean_maia_top1_probability, 1))
// Parity: the paper says the app's Maia-2 has the same first choice as the benchmark's on every one of these moves' counts.
if (r.firstChoice.moves !== bench.overall.n || r.firstChoice.played !== bench.overall.correct) throw new Error("the app's Maia-2 no longer matches the benchmark's first-choice count")
g.def('FirstChoice', count(r.firstChoice.played))

// ---- the tests ----
const t = r.tests
const iv = (x, dp = 4) => `[${fixed(x.interval[0], dp)}, ${fixed(x.interval[1], dp)}]`
const pass = (x) => (x ? 'passes' : 'fails')
g.block('TestTable', [
  '\\begin{tabular}{lrrrl}',
  '\\toprule',
  'test & raw & tempered & tempered $-$ raw & \\\\',
  '\\midrule',
  `1. Lichess, held-out half (log-likelihood per move) & ${fixed(t.lichessHeld.raw, 4)} & ${fixed(t.lichessHeld.tempered, 4)} & ${fixed(t.lichessHeld.observed, 4)} ${iv(t.lichessHeld)} & ${pass(t.lichessHeld.pass)} \\\\`,
  `2. the player's games (log-likelihood per move) & ${fixed(t.his.raw, 4)} & ${fixed(t.his.tempered, 4)} & ${fixed(t.his.observed, 4)} ${iv(t.his)} & ${pass(t.his.pass)} \\\\`,
  `3. punish events, verified (Brier score) & ${fixed(t.punish.raw, 4)} & ${fixed(t.punish.tempered, 4)} & ${fixed(t.punish.observed, 4)} ${iv(t.punish)} & ${pass(t.punish.pass)} \\\\`,
  `\\phantom{3.} punish events, all (Brier score) & ${fixed(t.punishAll.raw, 4)} & ${fixed(t.punishAll.tempered, 4)} & ${fixed(t.punishAll.observed, 4)} ${iv(t.punishAll)} & \\\\`,
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
g.def('TestOneDiff', fixed(t.lichessHeld.observed, 4)).def('TestOneCI', iv(t.lichessHeld))
g.def('TestTwoLoss', fixed(-t.his.observed, 4)).def('TestTwoLossCI', `[${fixed(-t.his.interval[1], 4)}, ${fixed(-t.his.interval[0], 4)}]`)
g.def('TestThreeDiff', fixed(t.punish.observed, 4)).def('TestThreeCI', iv(t.punish))
g.def('TestThreeAllDiff', fixed(t.punishAll.observed, 4)).def('TestThreeAllCI', iv(t.punishAll))
g.def('PunishRaw', fixed(t.punish.raw, 3)).def('PunishTempered', fixed(t.punish.tempered, 3))
if (r.adopted !== (t.lichessHeld.pass && t.his.pass && t.punish.pass)) throw new Error('the verdict does not follow from the three tests')
// The paper says: not adopted, the first and third tests pass, the second fails, and the Brier score rose without the interval clearing zero.
if (r.adopted || !t.lichessHeld.pass || t.his.pass || !t.punish.pass) throw new Error('the verdict is not the one the paper reports')
if (!(t.his.interval[1] < 0)) throw new Error("the paper says tempering lowers the likelihood of the player's moves")
if (!(t.punish.observed > 0 && t.punish.interval[0] < 0)) throw new Error('the paper says the Brier score rose by an amount whose interval holds zero')

// ---- each band's temperature ----
const bands = maiaBands()
const bandName = (b) => (b < MAIA_ELO_START ? `<${MAIA_ELO_START}` : b >= MAIA_ELO_END ? `${MAIA_ELO_END}+` : String(b))
const temps = bands.map((b) => r.temperature[b])
if (!temps.every((x) => x > 1)) throw new Error('the paper says every band is softened')
if (!bands.every((b) => r.fitMoves[b] >= r.minFitMoves)) throw new Error('the paper says every band had enough fitting moves')
g.def('TempMin', fixed(Math.min(...temps), 2)).def('TempMax', fixed(Math.max(...temps), 2))
g.def('FitMovesMin', count(Math.min(...bands.map((b) => r.fitMoves[b]))))
const ticks = bands.map((_, i) => i).join(',')
const labels = bands.map((b) => `{${esc(bandName(b))}}`).join(',')
g.block('TempFigure', [
  '\\begin{tikzpicture}',
  `\\begin{axis}[ybar, bar width=9pt, width=0.85\\textwidth, height=0.36\\textwidth, ymin=0.95, ymax=${(Math.max(...temps) + 0.03).toFixed(2)},`,
  `  xmin=-0.6, xmax=${bands.length - 0.4}, xtick={${ticks}}, xticklabels={${labels}}, xticklabel style={font=\\scriptsize},`,
  '  ylabel={temperature $T$}, xlabel={Maia-2 band (Lichess rating)}, ymajorgrids, enlarge x limits=false,',
  '  y tick label style={/pgf/number format/fixed, /pgf/number format/precision=2}]',
  `\\addplot[fill=black!35, draw=black] coordinates {${bands.map((b, i) => `(${i},${temps[i].toFixed(4)})`).join(' ')}};`,
  `\\draw[dashed, red!70!black] (axis cs:-0.6,1) -- (axis cs:${bands.length - 0.4},1);`,
  '\\end{axis}',
  '\\end{tikzpicture}',
].join('\n'))

// ---- the top choice's confidence against how often it is played, before and after ----
const gapOf = (c, key) => 100 * (c[key] - c.played)
const lich = bands.map((b) => r.confidence.lichessHeld[b])
const his = bands.map((b) => r.confidence.his[b] ?? null)
const lichRaw = lich.map((c) => gapOf(c, 'raw')), lichT = lich.map((c) => gapOf(c, 'tempered'))
const hisBands = bands.filter((_, i) => his[i])
const hisRaw = his.filter(Boolean).map((c) => gapOf(c, 'raw')), hisT = his.filter(Boolean).map((c) => gapOf(c, 'tempered'))
if (!lichRaw.every((x) => x > 0)) throw new Error('the paper says Maia-2 is overconfident on Lichess in every band')
if (!hisT.every((x) => x < 0)) throw new Error("the paper says tempering makes Maia-2 underconfident in every band of the player's games")
if (!(Math.max(...hisRaw.map(Math.abs)) < Math.min(...lichRaw))) throw new Error("the paper says the player's games show a smaller gap than any Lichess band")
g.def('LichGapMin', fixed(Math.min(...lichRaw), 1)).def('LichGapMax', fixed(Math.max(...lichRaw), 1))
g.def('LichTGapMin', fixed(Math.min(...lichT), 1)).def('LichTGapMax', fixed(Math.max(...lichT), 1))
g.def('HisGapMin', fixed(Math.min(...hisRaw), 1)).def('HisGapMax', fixed(Math.max(...hisRaw), 1))
g.def('HisTGapMin', fixed(-Math.max(...hisT), 1)).def('HisTGapMax', fixed(-Math.min(...hisT), 1))
g.def('HisBandLow', esc(bandName(hisBands[0]))).def('HisBandHigh', esc(bandName(hisBands.at(-1))))
const coords = (vals, idx) => vals.map((v, j) => `(${idx[j]},${v.toFixed(2)})`).join(' ')
const allIdx = bands.map((_, i) => i)
const hisIdx = bands.map((b, i) => (his[i] ? i : null)).filter((i) => i !== null)
const panel = (title, raw, tempered, idx, extra) => [
  `\\begin{axis}[${extra}width=0.48\\textwidth, height=0.4\\textwidth, xmin=-0.6, xmax=${bands.length - 0.4}, ymin=-6, ymax=6,`,
  `  xtick={${ticks}}, xticklabels={${labels}}, xticklabel style={font=\\tiny, rotate=60, anchor=east}, grid=major,`,
  `  title={${title}}, legend pos=south west, legend cell align=left, legend style={font=\\scriptsize}]`,
  `\\addplot[black, mark=*, mark size=1.2pt] coordinates {${coords(raw, idx)}};`,
  '\\addlegendentry{raw}',
  `\\addplot[red!70!black, dashed, mark=square*, mark size=1.2pt] coordinates {${coords(tempered, idx)}};`,
  '\\addlegendentry{tempered}',
  `\\draw[gray] (axis cs:-0.6,0) -- (axis cs:${bands.length - 0.4},0);`,
  '\\end{axis}',
]
if (![...lichRaw, ...lichT, ...hisRaw, ...hisT].every((x) => Math.abs(x) < 6)) throw new Error('a gap falls outside the figure')
g.block('GapFigure', [
  '\\begin{tikzpicture}',
  ...panel('Lichess, held-out half', lichRaw, lichT, allIdx, 'name=lichess, ylabel={confidence $-$ played, points}, '),
  ...panel("the player's games", hisRaw, hisT, hisIdx, 'at={(lichess.east)}, anchor=west, xshift=0.8cm, '),
  '\\end{tikzpicture}',
].join('\n'))

const cell = (c) => (c ? `${percent(c.played, 1)} & ${percent(c.raw, 1)} & ${percent(c.tempered, 1)}` : '& &')
g.block('BandTable', [
  '\\begin{tabular}{lrrrrrrrrr}',
  '\\toprule',
  ' & & & \\multicolumn{3}{c}{Lichess, held-out half} & \\multicolumn{4}{c}{the player\'s games} \\\\',
  '\\cmidrule(lr){4-6}\\cmidrule(lr){7-10}',
  'band & fitting moves & $T$ & played & raw & tempered & moves & played & raw & tempered \\\\',
  '\\midrule',
  ...bands.map((b) => {
    const h = r.confidence.his[b]
    return `${esc(bandName(b))} & ${count(r.fitMoves[b])} & ${fixed(r.temperature[b], 3)} & ${cell(r.confidence.lichessHeld[b])} & ${h ? count(h.moves) : ''} & ${cell(h)} \\\\`
  }),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

g.write(join(HERE, 'generated.tex'))
console.log(`wrote ${join(HERE, 'generated.tex')}`)
process.exit(0)
