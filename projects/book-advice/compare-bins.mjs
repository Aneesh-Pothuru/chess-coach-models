// Compare the corrected 6b runs with the aggregates reviewed before the rerun.
// Run after both complete: node projects/book-advice/compare-bins.mjs
// This reads aggregates only. It does not rerun or change either rule.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { LAB_DIR, resultsDir } from '../../bridge/lib/lab.mjs'

const BEFORE = '6daa221'
const out = resultsDir('book-advice')
const groups = ['both', 'his', 'above', 'archive']
const runs = ['lost-trades.json', 'lost-trades-2026-08.json'].map((file) => {
  const before = JSON.parse(execFileSync('git', ['show', `${BEFORE}:projects/book-advice/results/${file}`], {
    cwd: LAB_DIR, encoding: 'utf8',
  }))
  const after = JSON.parse(readFileSync(join(out, file), 'utf8'))
  // The only changed calculation is post-move stratification. Refuse a
  // comparison if the source, selection or any other estimate has changed.
  function unaffected(run) {
    const copy = structuredClone(run)
    delete copy.seconds
    delete copy.holdsAfter
    for (const group of groups) delete copy.groups[group].evalAfter
    return copy
  }
  assert.deepEqual(unaffected(after), unaffected(before), `${file}: a quantity outside the corrected bins changed`)
  const withoutRuntime = (run) => {
    const copy = structuredClone(run)
    delete copy.seconds
    return copy
  }
  return {
    file, app: after.app, month: after.month, archive: after.archive, rule: after.rule,
    allQuantitiesUnchanged: isDeepStrictEqual(withoutRuntime(after), withoutRuntime(before)),
    verdicts: {
      enough: { before: before.enough, after: after.enough },
      primary: { before: before.holds, after: after.holds },
      evalAfter: { before: before.holdsAfter, after: after.holdsAfter },
    },
    groups: Object.fromEntries(groups.map((group) => [group, {
      playerGames: after.groups[group].playerGames,
      positions: after.groups[group].positions,
      primary: { before: before.groups[group].primary, after: after.groups[group].primary },
      evalAfter: { before: before.groups[group].evalAfter, after: after.groups[group].evalAfter },
    }])),
  }
})

const summary = { beforeLabCommit: execFileSync('git', ['rev-parse', BEFORE], { cwd: LAB_DIR, encoding: 'utf8' }).trim(), runs }
const points = (value) => value === null ? 'not estimated' : (value * 100).toFixed(2)
const interval = (value) => value === null ? 'not estimated' : value.map(points).join(' to ')
const rows = runs.flatMap((run) => ['primary', 'evalAfter'].flatMap((measure) => {
  const pair = run.groups.both[measure]
  return [
    `| ${run.month} | ${measure === 'primary' ? 'Before the move' : 'After the move'} | Matched plain trades | ${pair.before.trades} | ${pair.after.trades} | at least ${run.rule.minTrades} |`,
    `| ${run.month} | ${measure === 'primary' ? 'Before the move' : 'After the move'} | Dropped plain trades | ${pair.before.dropped} | ${pair.after.dropped} | reported |`,
    `| ${run.month} | ${measure === 'primary' ? 'Before the move' : 'After the move'} | Difference, points | ${points(pair.before.d)} | ${points(pair.after.d)} | at or below −${points(run.rule.drop)} |`,
    `| ${run.month} | ${measure === 'primary' ? 'Before the move' : 'After the move'} | 95% interval, points | ${interval(pair.before.ci)} | ${interval(pair.after.ci)} | upper end below zero |`,
    `| ${run.month} | ${measure === 'primary' ? 'Before the move' : 'After the move'} | Holds | ${run.verdicts[measure].before} | ${run.verdicts[measure].after} | all three tests |`,
  ]
}))
const md = [
  '# 6b after correcting the post-move bins', '',
  runs[1].verdicts.evalAfter.after === true
    ? 'The August recheck still holds after the bin correction. It is the evidence used by chess PR 124. The original September rule still does not hold.'
    : 'The August recheck no longer holds after the bin correction. Chess PR 124 depends on that recheck. The original September rule still does not hold.', '',
  `The old aggregates are from lab commit \`${summary.beforeLabCommit}\`. Both reruns measured app \`${runs[0].app}\`. September includes the archive; August does not.`, '',
  runs.every((run) => run.allQuantitiesUnchanged)
    ? 'The original rules are unchanged. Every stored count, estimate, interval and verdict is identical, including every post-move estimate. The source commit and all rule constants are identical too. Only runtime changed. Equality is at the precision written by the study; this comparison does not count individual positions that changed bins.'
    : 'The original rules are unchanged. Every field outside the post-move estimates and their verdict is identical, apart from runtime. This check includes the source commit, the selection constants, the counts, and the other estimates and intervals.', '',
  '| Month | Strata | Quantity | Old | Corrected | Rule |',
  '| --- | --- | --- | ---: | ---: | --- |', ...rows, '',
  'September’s before-move estimate decides the original 6b rule. August’s after-move estimate decides the recheck. The other two estimates are reported without a decision rule for that month.', '',
  'The JSON beside this file retains both estimates for every band and the archive, and all rule constants.', '',
].join('\n')
writeFileSync(join(out, 'bin-rerun.json'), JSON.stringify(summary, null, 2) + '\n')
writeFileSync(join(out, 'bin-rerun.md'), md)
console.log(md)
