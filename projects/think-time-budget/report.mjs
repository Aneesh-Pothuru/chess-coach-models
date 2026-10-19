// Publish saved aggregates. This script does not estimate an effect.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadReport, claim, project, lab, names, triggerOrder, candidateOrder,
  intervalText, signed, readJSON, sha256, checkFindings } from './publication.mjs'

const { analysis: a, phase1: p, cohort: c, rule } = loadReport()
const order = [...triggerOrder, ...candidateOrder]
const cmp = a.comparisons
checkFindings({ analysis: a, rule })

const checks = [
  ['all', 'More time at all', 'pass'], ['placebo', 'Under-five-second placebo', a.checks.placeboStatus],
]
const gateTable = ['| Check | Δerr (percentage points; 95% interval) | Verdict |', '|---|---|---|',
  ...checks.map(([k, label, verdict]) => `| ${label} | ${intervalText(a.checks[k].err, 100)} | ${verdict} |`)].join('\n')
const table = (intervals = false) => {
  const fmt = (x, scale = 1) => intervals ? intervalText(x, scale) : x === null ? 'cannot tell' : signed(scale * x.value)
  return ['| Moment | Δthink (s) | Δerr (pp) | v | v minus paired none | Verdict |', '|---|---:|---:|---:|---:|---|',
    ...order.map(k => `| ${names[k]} | ${fmt(cmp[k].moment.think)} | ${fmt(cmp[k].moment.err, 100)} | ${fmt(cmp[k].moment.valuePerMinute)} | ${fmt(cmp[k].contrast)} | ${cmp[k].verdict} |`)].join('\n')
}

const answer = `**The answer.** Leave the app's triggers alone. The larger budget cuts
serious errors overall, but the placebo does not pass. Its interval crosses
the lower tolerance boundary of ${signed(-100 * rule.placeboMargin)} percentage point. The design cannot
tell which moments deserve extra time under the fixed rule.

${gateTable}

These are the registered within-player estimates for the primary players.
Differences are slow minus fast. The v columns are serious errors saved per
extra minute. Each comparison uses its own paired none cohort.

${table()}

Forcing and high danger have positive value contrasts that pass their family
tests (Holm p ${cmp.forcing.pHolm.toFixed(5)} and ${cmp['high-danger'].pHolm.toFixed(5)}). Their separate error-difference
intervals lie below zero, but the placebo blocks both. The move after the opponent's
serious error has no resolved reduction or value advantage. Book exit,
structure, in check and defending lack enough coverage for a contrast;
their individual ratios pass the extra-think floor. The overall error
interval crosses zero in both descriptive sensitivity runs. Neither those
runs nor the favorable comparisons change the verdict.

The app took **Not yet**. A trigger change would need a separate pull
request. This result does not change either think-time bar.

The full intervals, paired support, rating descriptions and sensitivities
are in [the effect report](results/analysis.md); the ordered summary is in
[the result report](results/report.md). The scripts measured app
\`${a.appCommit}\` on the frozen ${a.months.join(' and ')}
source prefixes, with ${c.selected.primaryPlayers.toLocaleString('en-US')} primary players. The data and rule below are
unchanged from phase one. Its original documents are preserved in
\`phase1/\` against the original content manifest.
`

const original = readFileSync(join(project, 'phase1/README.md'), 'utf8')
const introduction = original.slice(0, original.indexOf('**This run.**'))
const registered = original.slice(original.indexOf('## The data\n'), original.indexOf('## Files\n'))
let files = original.slice(original.indexOf('## Files\n'), original.indexOf('## Running it\n'))
files = files.replace('The phase-one paper: design, counts and limits.', 'The result paper: gates, comparisons and limits.')
files = files.replace('| `paper/paper.tex`', '| `publication.mjs` | Checks the original content freeze using its archived documents, input identities, unchanged registered text and saved rule application. It cannot authorize an effects run. |\n| `report.mjs` | Writes the README answer, lab table row and ordered result report from saved aggregates, refusing claims that no longer hold. `--record-run` also records completed detached-job timings. |\n| `test_publication.mjs` | Checks that changed evidence is refused and missing intervals are never printed as zero. |\n| `phase1/` | Exact original README, paper files and freeze checker; their hashes remain in the unchanged manifest. |\n| `paper/paper.tex`')
const running = `## Running it

Regenerate the published text from the saved aggregate reports, without
opening private moves or estimating another effect:

\`\`\`bash
node projects/think-time-budget/report.mjs
bridge/run.sh projects/think-time-budget/paper/generate.mjs
node projects/think-time-budget/test_publication.mjs
.venv/bin/python projects/think-time-budget/test_freeze.py
.venv/bin/python scripts/check_private.py
\`\`\`

The original phase-one commands and the reviewed phase-two commands remain
in [the archived README](phase1/README.md). Phase two ran the original
committed freeze check, resumed the saved bridge build, then ran effects,
each long job detached. The execution receipt is in \`results/run.json\`.
No sampling, model, estimator, threshold or comparison changed after an
effect was seen. Only the reporting files and this lab's project row changed.

The manifest and all its hashes remain unchanged. \`freeze.py check\` reads
the original README, paper files and original checker from \`phase1/\`.
Only those explicitly named files use snapshots; every numerical instrument
and other frozen dependency is checked in place. The archived checker keeps
its original hash while the current checker resolves the published paths.
\`publication.mjs\` uses the same snapshot set and also checks that the
registered data through caveats above are byte-for-byte unchanged.

Repeat the reviewed phase-two commands directly from the lab root, using
the existing private checkpoints, app checkout and Python environment.
Do not refetch, resample or overlap another job:

\`\`\`bash
set -e
.venv/bin/python projects/think-time-budget/freeze.py check --require-committed
.venv/bin/python projects/think-time-budget/detached.py start build run_build.py --months 2026-09 2026-08
.venv/bin/python projects/think-time-budget/detached.py wait build
.venv/bin/python projects/think-time-budget/detached.py start effects analyze.py --months 2026-09 2026-08 --effects
.venv/bin/python projects/think-time-budget/detached.py wait effects
\`\`\`

Every long job starts in its own session with private logs and a completion
record. The bridge uses at most two nice-10 workers; effects uses one numeric
thread at nice 10. Use \`detached.py status effects\` and the private log to
monitor it after an interruption. The manifest must remain tracked and clean.
Content hashes, not commits from this branch, establish provenance. No PDF
is built. \`test_freeze.py\` checks that changes to a snapshot or to live
numerical code still fail verification.
`
const readme = introduction + answer + '\n' + registered + files + running
const row = '| [think-time-budget](projects/think-time-budget/) ([paper](projects/think-time-budget/paper/paper.tex)) | For the same players, does a larger rapid clock budget make extra time at a trigger save more errors than at an ordinary move? | Not yet: errors fall overall, but the placebo is inconclusive, so the triggers stay as they are |'
const rootPath = join(lab, 'README.md')
const root = readFileSync(rootPath, 'utf8')
const rootLines = root.split('\n')
const ownIndex = rootLines.findIndex(line => line.startsWith('| [think-time-budget]('))
if (ownIndex >= 0) rootLines[ownIndex] = row
else {
  const predecessor = rootLines.findIndex(line => line.startsWith('| [think-time-rapid]('))
  claim(predecessor >= 0, 'lab table has the predecessor row')
  rootLines.splice(predecessor + 1, 0, row)
}

const report = `# The larger-budget result

Written by \`report.mjs\` from \`analysis.json\`; no new estimates. App
\`${a.appCommit}\`. Data: ${a.months.join(', ')}; frozen input
\`${a.fingerprint}\`, cohort \`${c.fingerprint}\`.

${gateTable}

The overall check passes. The placebo is inconclusive, so every verdict is
cannot tell; leave unchanged. It is not the rule's untrustworthy outcome:
the interval crosses the boundary rather than lying wholly beyond it.

All intervals below are the registered 95% intervals from ${rule.draws.toLocaleString('en-US')} shared player bootstrap draws.
Δthink is seconds, Δerr percentage points, and v serious errors saved per
extra minute. Each contrast uses none on that moment's same players.

${table(true)}

Book exit, structure, in check and defending fail coverage, so their
contrasts are unavailable. All moment and paired-none denominators pass.
The unavailable contrasts are not zero estimates.

Forcing has Holm p ${cmp.forcing.pHolm.toFixed(5)}, and high danger ${cmp['high-danger'].pHolm.toFixed(5)}.
Both cut errors and have positive paired contrasts, but neither can pass the
placebo gate. Their paired-none point values are negative. The contrast is
not the same as the amount saved at the moment alone.

The all-move sensitivity estimates are ${intervalText(a.sensitivity.tenStrata.all.err, 100)} pp
with ten strata and ${intervalText(a.sensitivity.zeroIncrementSlow.all.err, 100)} pp
with zero-increment slow games. Both intervals cross zero. These descriptions
do not revise the registered verdict.

No sampling, estimator or rule changed after effects were seen. Publication
added claim checks and reordered candidates to put the leading question
first. The original manifest still verifies the original documents in
\`phase1/\` and every frozen analysis dependency in place. No app change is made.
`

if (process.argv.includes('--record-run')) {
  const jobs = ['build', 'effects'].map(name => {
    const job = readJSON(join(lab, 'private/think-time-budget/jobs', `${name}.json`))
    claim(job.state === 'complete' && job.exitCode === 0, `${name} completed successfully`)
    return { name, script: job.script, arguments: job.arguments, exitCode: job.exitCode,
      elapsedSeconds: job.endedEpochSeconds - job.startedEpochSeconds }
  })
  const lines = readFileSync(join(lab, 'private/think-time-budget/effects.log'), 'utf8').trim().split('\n')
  const finished = lines.filter(s => s.startsWith('{')).map(s => JSON.parse(s)).filter(s => s.phase === 2).at(-1)
  claim(finished?.output === 'analysis', 'completed analysis timing is logged')
  writeFileSync(join(project, 'results/run.json'), JSON.stringify({ appCommit: a.appCommit, months: a.months,
    fingerprint: a.fingerprint, freezeManifestSha256: sha256(readFileSync(join(project, 'freeze-manifest.json'))),
    jobs, analysisSeconds: finished.seconds, analysisSha256: sha256(readFileSync(join(project, 'results/analysis.json'))),
    notes: 'Original committed freeze passed before data were loaded. Build resumed saved facts. No rule or estimator changed.' }, null, 2) + '\n')
}
writeFileSync(join(project, 'results/report.md'), report)
writeFileSync(join(project, 'README.md'), readme)
writeFileSync(rootPath, rootLines.join('\n'))
console.log('Wrote result report, README answer and lab table row from saved aggregates.')
