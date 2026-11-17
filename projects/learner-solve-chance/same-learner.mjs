// Is the learner at another commit of the app still the one round 2 measured?
// (README.md, "The app changed while round 3's attempts were being recorded".)
// A round reads its attempts with the learner of the commit it runs at, so a
// change to the app while a round's attempts are being recorded leaves the
// round comparable with round 2 only if that learner still gives round 2's
// numbers. Here the profile and the bank round 2 read are read with the
// learner of the commit CHESS_DIR names, and everything round 2's rules 1 and
// 2 reported is computed again: both rules, the looks beside them, the
// learner's own self-check and the aim of each bucket's next set. Every value
// is held against results/round2.json.
//
//   CHESS_DIR="$(bridge/checkout.sh at <sha>)" bridge/run.sh projects/learner-solve-chance/same-learner.mjs
//
// The profile is the one at round 2's commit whatever CHESS_DIR's own holds,
// so no attempt recorded after round 2's last is read, and nothing is read by
// a puzzle's depth. results/same-learner.json and same-learner.md keep one
// entry per commit checked.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, LAB_DIR, resultsDir } from '../../bridge/lib/chess.mjs'
import { aims, byDay, halvesOf, heldAgainst, isPuzzle, lastAttemptAt, looks, replay, round1Root, rule1, rule2 } from './lib.mjs'

const { loadProfile } = await chess('src/adapters/node/profile/index.ts')
const { nodeLearner } = await chess('src/adapters/node/learner/index.ts')
const { channelOf } = await chess('src/services/learner/channels.ts')

const out = resultsDir('learner-solve-chance')
const round2 = JSON.parse(fs.readFileSync(join(out, 'round2.json'), 'utf8'))
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
const app = git(CHESS_DIR, 'rev-parse', 'HEAD')
if (git(CHESS_DIR, 'status', '--porcelain', '--', 'src')) throw new Error(`${CHESS_DIR} differs from its commit ${app}: a commit's learner is checked (bridge/checkout.sh at <sha>)`)

// The app as round 2 read it: its profile and its bank are what is read here.
const then = execFileSync(join(LAB_DIR, 'bridge', 'checkout.sh'), ['at', round2.rules.app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
if (git(then, 'rev-parse', 'HEAD') !== round2.rules.app || git(then, 'status', '--porcelain', '--', 'progress', 'src')) throw new Error(`${then} is not the app at ${round2.rules.app}, the commit round 2 read`)

const load = (file) => {
  const loaded = loadProfile(file)
  if (!loaded.ok) throw new Error(`${file} does not load: ${loaded.reason}`)
  return loaded.profile
}
const profile = load(join(then, 'progress', 'profile.json'))
const bankFile = join('src', 'data', 'puzzles.json')
const bank = JSON.parse(fs.readFileSync(join(then, bankFile), 'utf8'))
const now = profile.updatedAt

// ---------------------------------------------------------------- round 2 again, with this learner
// As round2.mjs builds what rules 1 and 2 report: the attempts after round 1's last, each scored on the record before it.
const cutoff = lastAttemptAt(load(join(round1Root(), 'progress', 'profile.json')))
const isRound2 = (o) => o.at > cutoff && isPuzzle(o) && channelOf(o.channel) === 'themed' && o.first === true
const rows = replay('round2', profile, true, { wanted: isRound2 })
const days = byDay(rows)
const learner = nodeLearner(then, { now })
const PARTS = ['rule1', 'rule2', 'halfDays', 'looks', 'selfCheck', 'today']
const again = JSON.parse(
  JSON.stringify({
    rule1: rule1(days),
    rule2: rule2(days),
    halfDays: halvesOf(days).map((h) => h.map((d) => d.rows.length)),
    looks: looks(rows),
    selfCheck: learner.calibration(),
    today: aims(learner, bank, now),
  }),
)
const held = heldAgainst(Object.fromEntries(PARTS.map((k) => [k, round2.rules[k]])), again)

// ---------------------------------------------------------------- the source files that differ
// Where the learner and a bucket's set live in the app, and the files that fold a record into its estimates and aim a set from them.
const SOURCE_DIRS = [join('src', 'services', 'learner'), join('src', 'services', 'exercises', 'families')]
const FOLD_FILES = ['ability.ts', 'channels.ts', 'evidence.ts', 'glicko.ts', 'serve.ts'].map((f) => join('src', 'services', 'learner', f))
/** The source files under the directories, tests left out, by their path in the app. */
function sourcesOf(root) {
  const files = new Map()
  const walk = (rel) => {
    for (const entry of fs.readdirSync(join(root, rel), { withFileTypes: true })) {
      const at = join(rel, entry.name)
      if (entry.isDirectory()) walk(at)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.set(at, fs.readFileSync(join(root, at)))
    }
  }
  for (const dir of SOURCE_DIRS) walk(dir)
  return files
}
const before = sourcesOf(then)
const after = sourcesOf(CHESS_DIR)
const changed = [...before.keys()].filter((f) => after.has(f) && !after.get(f).equals(before.get(f))).sort()
const added = [...after.keys()].filter((f) => !before.has(f)).sort()
const removed = [...before.keys()].filter((f) => !after.has(f)).sort()
for (const f of FOLD_FILES) if (!before.has(f)) throw new Error(`${f} is not in the app at ${round2.rules.app}`)

const check = {
  app,
  committed: new Date(Number(git(CHESS_DIR, 'show', '-s', '--format=%ct', 'HEAD')) * 1000).toISOString(),
  scored: { attempts: rows.length, days: days.length },
  values: held.values,
  differing: held.differing,
  bankSame: fs.readFileSync(join(CHESS_DIR, bankFile)).equals(fs.readFileSync(join(then, bankFile))),
  sources: { compared: before.size, changed, added, removed, fold: { files: FOLD_FILES, differ: FOLD_FILES.filter((f) => changed.includes(f) || removed.includes(f)) } },
}

// ---------------------------------------------------------------- the report
const file = join(out, 'same-learner.json')
const earlier = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).checks : []
const checks = [...earlier.filter((c) => c.app !== app), check].sort((a, b) => (a.committed < b.committed ? -1 : 1))
const report = { round2: { app: round2.rules.app, profileSyncedOn: round2.rules.profileSyncedOn, scored: { attempts: round2.rules.looks.attempts, days: round2.rules.looks.days } }, parts: PARTS, checks }

const short = (sha) => sha.slice(0, 7)
const when = (iso) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
const names = (files) => (files.length ? files.map((f) => `\`${f}\``).join(', ') : 'none')
const value = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
const md = [
  '# Is the learner still the one round 2 measured?',
  '',
  `Written by same-learner.mjs. Round 2 read the profile at app commit ${report.round2.app} (synced ${report.round2.profileSyncedOn}) with that commit's own learner: ${report.round2.scored.attempts} scored attempts on ${report.round2.scored.days} days. Below, that profile and that commit's bank are read with the learner of another commit of the app, and everything round 2's rules 1 and 2 reported is computed again: both rules, the looks beside them, the learner's own self-check and the aim of each bucket's next set. Every value is held against results/round2.json. No attempt recorded after round 2's last is read.`,
  '',
  '| App commit | Committed | Scored attempts | Values compared | That differ | Source files that differ | Only at this commit | Only at round 2\'s | Of the five that fold a record and aim a set | The bank |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
  ...checks.map((c) => `| \`${short(c.app)}\`${c.app === report.round2.app ? ', the commit round 2 read' : ''} | ${when(c.committed)} | ${c.scored.attempts} on ${c.scored.days} days | ${c.values} | ${c.differing.length} | ${c.sources.changed.length} of ${c.sources.compared} | ${c.sources.added.length} | ${c.sources.removed.length} | ${c.sources.fold.differ.length} | ${c.bankSame ? 'the same file' : 'another file'} |`),
  '',
  `The source files are those under ${SOURCE_DIRS.map((d) => `\`${d}\``).join(' and ')} in the app, tests left out; the five are ${names(FOLD_FILES)}.`,
  '',
  ...checks.flatMap((c) => [
    `## App commit ${c.app}`,
    '',
    ...(c.app === report.round2.app ? ['The commit round 2 read, as the script\'s control: here it must give round 2\'s own numbers.', ''] : []),
    c.differing.length === 0
      ? `Round 2 reproduces under this learner: all ${c.values} values are the ones round 2 recorded, so the chance each estimate gives an attempt and the aim of a set are computed as they were.`
      : `Round 2 does not reproduce under this learner: ${c.differing.length} of ${c.values} values differ from the ones round 2 recorded, so a round run at this commit is not scored as round 2 was.`,
    '',
    ...(c.differing.length
      ? ['| Value | Round 2 recorded | This learner gives |', '|---|---:|---:|', ...c.differing.slice(0, 40).map((d) => `| ${d.path} | ${value(d.recorded)} | ${value(d.again)} |`), ...(c.differing.length > 40 ? ['', `And ${c.differing.length - 40} more, in same-learner.json.`] : []), '']
      : []),
    `Source files that differ from round 2's commit: ${names(c.sources.changed)}. Only at this commit: ${names(c.sources.added)}. Only at round 2's: ${names(c.sources.removed)}.`,
    '',
  ]),
].join('\n')
fs.writeFileSync(file, JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'same-learner.md'), md)
console.log(md)
