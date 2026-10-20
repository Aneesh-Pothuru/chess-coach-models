// Reporting only: format the already-validated aggregates supplied by the
// paper generator. This module reads no file and computes no study measure.
import { esc, fixed, percent } from '../../paper.mjs'

const PROFILES = ['phone', 'desktop', 'routine']
const DEVICES = ['phone', 'desktop']
const ARMS = ['baseline', 'candidate']
const count = n => Number.isInteger(n) && n >= 0 ? String(n) : '--'
// paper.mjs's percent helper multiplies its input; guard null before calling
// it so missing evidence is never displayed as a zero percentage.
const pct = (n, digits = 2) => Number.isFinite(n) ? percent(n, digits) : '--'
const stack = (lines, align = 'r') => `\\shortstack[${align}]{${lines.join(' \\\\ ')}}`
const text = value => value == null ? '--' : esc(value)
const interval = bounds => bounds && Number.isFinite(bounds.lo) && Number.isFinite(bounds.hi)
  ? `[${pct(bounds.lo)}, ${pct(bounds.hi)}]` : '--'
const ratio = value => {
  if (!value) return '--'
  const estimate = value.valid === false ? 'unresolved' : `${pct(value.value)} ${interval(value.interval95)}`
  return stack([`${count(value.num)}/${count(value.den)}`, estimate])
}
const errorRate = value => !value ? '--' : value.valid === false ? 'unresolved' : stack([
  `${count(value.num)}/${count(value.den)}`,
  pct(value.value),
])
const effect = value => !value ? '--' : value.valid === false ? 'unresolved'
  : stack([pct(value.value), `{${interval(value.corrected)}}`])
const distribution = (value, digits) => !value ? '--'
  : `${fixed(value.mean, digits)} / ${fixed(value.median, digits)} / ${fixed(value.p90, digits)}`
const qualityStatus = status => status === 'worse beyond margin'
  ? stack(['worse beyond', 'margin'], 'l') : text(status)

function table(columns, headers, rows, note = '') {
  return [
    '{\\footnotesize', '\\setlength{\\tabcolsep}{3pt}',
    `\\begin{tabularx}{\\textwidth}{@{}${columns}@{}}`, '\\toprule',
    `${headers.join(' & ')} \\\\`, '\\midrule',
    ...rows.map(row => Array.isArray(row) ? `${row.join(' & ')} \\\\` : row),
    '\\bottomrule', '\\end{tabularx}',
    ...(note ? [`\\par\\smallskip\\raggedright ${note}\\par`] : []),
    '}',
  ].join('\n')
}

/** Add execution time without requiring a completed comparison report. */
export function addExecutionTable(g, execution) {
  const left = '>{\\raggedright\\arraybackslash}X'
  const executionStages = ['preparation', ...ARMS.flatMap(arm => ['CLI', 'observed'].flatMap(kind =>
    PROFILES.map(profile => `${arm}/${kind}/${profile}`))), 'references', 'analysis']
  const stageName = stage => stage === 'preparation' ? 'preparation'
    : stage === 'references' ? 'references'
    : stage === 'analysis' ? 'analysis'
    : esc(stage.replaceAll('/', ', '))
  const hours = seconds => fixed(Number.isFinite(seconds) ? seconds / 3600 : null, 3)
  g.block('ExecutionTable', table(`${left}rrr`, ['stage', 'monotonic h', 'calendar h', 'difference h'], [
    ...executionStages.map(stage => {
      const row = execution?.stages?.find(r => r.stage === stage)
      return [stageName(stage) + (row?.endUnknown ? ' (lower bounds)' : ''), hours(row?.activeWallSecondsLowerBound),
        hours(row?.calendarElapsedSecondsLowerBound), hours(row?.observedClockDifferenceSeconds)]
    }),
    '\\midrule',
    [execution?.timingIsLowerBound ? 'invocation totals (lower bounds)' : 'invocation totals', hours(execution?.activeWallSecondsLowerBound),
      hours(execution?.calendarElapsedSecondsLowerBound), hours(execution?.observedClockDifferenceSeconds)],
    ['known gaps between invocations', '--', hours(execution?.knownBetweenInvocationSeconds), '--'],
    ['unallocated gaps after unknown ends', '--', hours(execution?.unallocatedGapSeconds), '--'],
    ['full observed calendar span', '--', hours(execution?.calendarObservedSeconds), '--'],
  ], 'Both clocks use the same output-observation boundaries, including launch and exit overhead. An unobserved end leaves both durations as lower bounds. Calendar minus monotonic elapsed is an unattributed difference over observed windows, not a bound on an unobserved difference. Neither clock measures CPU time. Between-invocation gaps are separate.'))
  return g
}

/** Add all numeric table blocks to a projects/paper.mjs Generated instance. */
export function addTables(g, report, execution) {
  const confidence = Number.isFinite(report?.rule?.alpha) ? pct(1 - report.rule.alpha, 0) : '--'
  const corrected = pct(report?.correctedCoverage, 6)
  const right = '>{\\raggedleft\\arraybackslash}X'
  const left = '>{\\raggedright\\arraybackslash}X'

  g.block('GapTable', table(`ll${right}${right}l`, [
    'device', 'arm', stack(['miss: n/N', `\\% [${confidence}\\% CI]`]),
    stack(['extra: n/N', `\\% [${confidence}\\% CI]`]), 'absolute bar',
  ], DEVICES.flatMap(profile => ARMS.map(arm => {
    const row = report?.gaps?.[profile]?.[arm]
    return [esc(profile), esc(arm), ratio(row?.miss), ratio(row?.extra), text(row?.predecessorStatus)]
  })), 'Counts give the numerator and its own denominator. Each arm uses its own routine.'))

  g.block('GapChangeTable', table(`ll${right}l`, [
    'device', 'share', stack(['change (percentage points)', 'corrected CI']), 'device narrows',
  ], DEVICES.flatMap(profile => [
    [esc(profile), 'miss', effect(report?.gaps?.[profile]?.deltaMiss),
      typeof report?.gaps?.[profile]?.narrows === 'boolean' ? report.gaps[profile].narrows ? 'yes' : 'no' : '--'],
    [esc(profile), 'extra', effect(report?.gaps?.[profile]?.deltaExtra), ''],
  ]), `Changes are candidate minus baseline. Decision intervals have ${corrected}\\% coverage.`))

  g.block('QualityTable', table(`lr${right}${right}${right}${left}`, [
    'profile', 'common', stack(['baseline wrong', 'n/N; \\%']), stack(['candidate wrong', 'n/N; \\%']),
    stack(['change (points)', 'corrected CI']), 'guard',
  ], PROFILES.map(profile => {
    const row = report?.quality?.[profile]
    return [esc(profile), count(row?.common), errorRate(row?.baselineError), errorRate(row?.candidateError),
      effect(row?.deltaError), qualityStatus(row?.status)]
  }), `Wrong verdicts are measured against the fixed reference on common attempted looks. Changes are candidate minus baseline in percentage points; corrected intervals have ${corrected}\\% coverage.`))

  g.block('CostTable', table(`llr${right}${right}`, [
    'profile', 'arm', 'looks', stack(['seconds/look', 'mean / median / p90']),
    stack(['retained depth', 'mean / median / p90 (n)']),
  ], PROFILES.flatMap(profile => ARMS.map(arm => {
    const row = report?.cost?.[profile]?.[arm]
    return [esc(profile), esc(arm), count(row?.looks), distribution(row?.secondsPerLook, 3),
      stack([distribution(row?.acceptedDepth, 1), `n = ${count(row?.acceptedDepth?.n)}`])]
  })), 'Seconds include the reset, candidate and restricted played-move searches, and any adaptive retry. Depth is retained at verification, before teaching.'))

  g.block('PairedCostTable', table(`llr${right}${right}${right}`, [
    'profile', 'paired change', 'n', 'mean', 'median', 'p90',
  ], PROFILES.flatMap(profile => ['seconds', 'acceptedDepth'].map(kind => {
    const row = report?.cost?.[profile]?.commonLookChange?.[kind]
    const digits = kind === 'seconds' ? 3 : 1
    return [esc(profile), kind === 'seconds' ? 'seconds/look' : 'retained depth', count(row?.n),
      fixed(row?.mean, digits), fixed(row?.median, digits), fixed(row?.p90, digits)]
  })), 'Candidate minus baseline on the same attempted plies. These are descriptive distributions, without an adoption threshold.'))

  addExecutionTable(g, execution)

  g.block('CoverageTable', table(`llrrrrrr${right}`, [
    'profile', 'arm', 'flags', 'looks', 'retries', 'unknown', stack(['incomplete', 'looks']),
    stack(['TB', 'positions']), stack(['TB', 'plies']),
  ], PROFILES.flatMap(profile => ARMS.map(arm => {
    const row = report?.coverage?.[profile]?.[arm]
    return [esc(profile), esc(arm), count(row?.flags), count(row?.initialLooks), count(row?.adaptiveRetries),
      count(row?.unknownRecords), count(row?.incompleteSecondLooks), count(row?.tablebasePositions), count(row?.tablebaseRecords)]
  })), 'TB denotes tablebase coverage. Counts are descriptive and use the final review, except attempted and incomplete second looks.'))

  g.block('ReferenceTable', table(`${left}${right}`, ['reference work', 'value'], [
    ['distinct positions', count(report?.reference?.positions)],
    ['attempts', count(report?.reference?.attempts)],
    ['unresolved positions', count(report?.reference?.unresolved)],
    ['summed search and reset seconds', fixed(report?.reference?.seconds, 2)],
    ['seconds/attempt: mean / median / p90', distribution(report?.reference?.secondsPerAttempt, 3)],
    ['depth: mean / median / p90', distribution(report?.reference?.depth, 1)],
  ], 'The reference is shared across profiles at a common game and ply. Summed search seconds are worker time; the execution table reports elapsed wall time.'))
  return g
}
