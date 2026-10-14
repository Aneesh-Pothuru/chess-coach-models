// Reproduces the accuracy hill-climb's recorded numbers in the lab: the
// records' 60 games, evidence rebuilt by build-evidence.mjs on the pinned app,
// and the three instruments the hill-climb compared, each run as a candidate
// (bridge/candidate.sh) of the pinned app:
//
//   baseline  hillclimb/v1/accuracy.before.ts
//   v1        hillclimb/v1/accuracy.ts
//   v2        the pinned app's own src/services/review/accuracy.ts
//
// The two older instruments take the root position's win% as summarizeSide's
// fourth argument, as the app of their day passed it. The pinned app's
// document builder no longer passes it (its instrument has no use for it), so
// their candidates also get that builder with the argument put back; without
// it the model's tag lands where the root's win% belongs, and the baseline's
// volatility weights fail on any game whose first moves are graded.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
//   bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone
//   bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile routine
//   bridge/run.sh projects/accuracy-vs-chesscom/reproduce.mjs
//
// The per-game rows go to private/accuracy-vs-chesscom/reproduce/. What is
// committed is results/reproduction.{md,json}: each variant's aggregates as
// recorded and as reproduced, side by side.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHESS_DIR, LAB_DIR, hillclimbDir, privateDir, projectDir, records, resultsDir } from '../../bridge/lib/chess.mjs';
import { summarize } from './summarize.mjs';

const FLOW = 'accuracy-vs-chesscom';
const ACCURACY = 'src/services/review/accuracy.ts';
const DOCUMENT = 'src/services/review/pipeline/document.ts';
const VARIANTS = [
  { variant: 'baseline', file: join(hillclimbDir(FLOW), 'v1', 'accuracy.before.ts') },
  { variant: 'v1', file: join(hillclimbDir(FLOW), 'v1', 'accuracy.ts') },
  { variant: 'v2', file: null },
];
const PROFILES = ['phone', 'routine'];

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

/** The pinned document builder, passing the root's win% to summarizeSide again. */
function builderForOldInstruments(home) {
  const src = readFileSync(join(CHESS_DIR, DOCUMENT), 'utf8');
  let patched = src;
  for (const side of ['w', 'b']) {
    const call = `summarizeSide(records, '${side}', division, model)`;
    if (patched.split(call).length !== 2) throw new Error(`${DOCUMENT} at the pin does not call ${call} once: update reproduce.mjs`);
    patched = patched.replace(call, `summarizeSide(records, '${side}', division, rootWin)`);
  }
  const out = join(home, 'reproduce-src', 'document.ts');
  mkdirSync(join(home, 'reproduce-src'), { recursive: true });
  writeFileSync(out, patched);
  return out;
}

function main() {
  const home = privateDir(FLOW);
  const recorded = join(records(), '.claude', 'hillclimb', FLOW);
  for (const f of ['cases.json', 'gold.json']) {
    if (!existsSync(join(home, f))) throw new Error(`no ${f} under private/${FLOW}: run build-cases.mjs --frozen first`);
  }
  const cases = JSON.parse(readFileSync(join(home, 'cases.json'), 'utf8'));
  const frozen = JSON.parse(readFileSync(join(records(), 'evals', FLOW, 'cases.json'), 'utf8'));
  if (JSON.stringify(cases.map(c => c.id)) !== JSON.stringify(frozen.map(c => c.id))) {
    throw new Error(`private/${FLOW}/cases.json is not the records' sample: run build-cases.mjs --frozen`);
  }
  for (const p of PROFILES) {
    const dir = join(home, 'evidence', p);
    const have = existsSync(dir) ? readdirSync(dir).filter(f => /^\d+\.json$/.test(f)).length : 0;
    if (have !== cases.length) throw new Error(`${p} evidence for ${have} of ${cases.length} cases: run build-evidence.mjs --profile ${p}`);
  }

  // A fresh flow directory holding the records' split, with the harness paths
  // as this repository lays them out.
  const flow = join(home, 'reproduce');
  rmSync(flow, { recursive: true, force: true });
  mkdirSync(flow, { recursive: true });
  const state = JSON.parse(readFileSync(join(recorded, '_state.json'), 'utf8'));
  state.harness_paths = [
    `projects/${FLOW}/build-evidence.mjs`,
    `private/${FLOW}/cases.json`,
    `private/${FLOW}/gold.json`,
  ];
  state.harness_sha = null;
  writeFileSync(join(flow, '_state.json'), JSON.stringify(state, null, 2) + '\n');

  const pinned = git(CHESS_DIR, 'rev-parse', 'HEAD');
  const builder = builderForOldInstruments(home);
  const runs = [];
  for (const { variant, file } of VARIANTS) {
    const app = file
      ? execFileSync(join(LAB_DIR, 'bridge', 'candidate.sh'), [`accuracy-${variant}`, `${ACCURACY}=${file}`, `${DOCUMENT}=${builder}`], { encoding: 'utf8' }).trim()
      : CHESS_DIR;
    console.error(`[reproduce] ${variant} on ${file ? `a candidate with ${ACCURACY} from ${file.slice(LAB_DIR.length + 1)}` : 'the pinned app'}`);
    // The reproduction approves its own fresh harness: the check guards a
    // loop's unreviewed edits, and this flow directory was made just now.
    execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [
      join(projectDir(FLOW), 'run-eval.mjs'), '--flow', flow, '--variant', variant, '--approve-harness',
    ], { cwd: LAB_DIR, env: { ...process.env, CHESS_DIR: app }, stdio: ['ignore', 'ignore', 'inherit'] });
    runs.push({
      variant,
      accuracy: file ? file.slice(LAB_DIR.length + 1) : `${ACCURACY} at the pinned commit`,
      builder: file ? `${DOCUMENT} at the pinned commit, passing the root's win% to summarizeSide` : `${DOCUMENT} at the pinned commit`,
    });
  }

  // The archive re-read check, on the pinned app's archive (it names games, so its files stay private).
  const rereadDir = join(home, 'reread');
  execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [join(projectDir(FLOW), 'reread-check.mjs'), '--out', rereadDir], {
    cwd: LAB_DIR, env: { ...process.env, CHESS_DIR }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  const reread = JSON.parse(readFileSync(join(rereadDir, 'summary.json'), 'utf8'));
  const said = readFileSync(join(recorded, 'narrative.md'), 'utf8').replace(/\s+/g, ' ')
    .match(/whole-game mean gap ([\d.]+), 90th percentile ([\d.]+), over (\d+) sides/);
  if (!said) throw new Error("the records' narrative.md no longer states the re-read check's numbers");

  const before = summarize({ flow: recorded, records: recorded });
  const after = summarize({ flow, records: hillclimbDir(FLOW) });
  const key = r => `${r.profile} ${r.variant}`;
  const recordedRows = new Map(before.rows.map(r => [key(r), r]));
  const rows = after.rows.map(r => ({ profile: r.profile, variant: r.variant, recorded: pick(recordedRows.get(key(r))), reproduced: pick(r) }));
  const report = {
    eval: 'accuracy-vs-chesscom reproduction',
    chess: { pinned_commit: pinned, records_commit: git(records(), 'rev-parse', 'HEAD') },
    cases: cases.length,
    runs,
    largest_test_mae_change: Math.max(...rows.filter(r => r.recorded).map(r => Math.abs(r.reproduced.testMae - r.recorded.testMae))),
    rows,
    reread: {
      recorded: { sides: Number(said[3]), mae: Number(said[1]), p90: Number(said[2]) },
      rerun: {
        holds: reread.holds, sides: reread.n, mae: round(reread.mae), p90: round(reread.p90), max: round(reread.max),
        within05: round(reread.within05), untaggedMae: round(reread.untagged.mae), taggedMae: round(reread.tagged.mae),
        untaggedSides: reread.untagged.n, taggedSides: reread.tagged.n, leftOut: reread.leftOut,
      },
      rule: reread.rule,
    },
  };
  writeFileSync(join(resultsDir(FLOW), 'reproduction.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(resultsDir(FLOW), 'reproduction.md'), render(report));
  console.log(render(report));
}

const round = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
function pick(r) {
  if (!r) return null;
  return {
    testMae: round(r.testMae.point),
    testMaeCi: [round(r.testMae.lo), round(r.testMae.hi)],
    trainMae: round(r.trainMae.point),
    testWithin5: round(r.testWithin5.point),
    testBias: round(r.testBias.point),
    testR: round(r.testR.point),
    testMaeVsBaseline: r.testMaeVsBaseline ? round(r.testMaeVsBaseline.point) : null,
  };
}

function render(report) {
  const f = (x, d = 1) => (x == null ? '-' : x.toFixed(d));
  const cell = (rec, rep, d = 1) => `${f(rec, d)} → ${f(rep, d)}`;
  const lines = [
    '# Accuracy vs chess.com: the hill-climb reproduced in the lab',
    '',
    `The records' ${report.cases} games (train and held-out test as the hill-climb split them), engine evidence rebuilt on app commit \`${report.chess.pinned_commit.slice(0, 7)}\`, each instrument run as a candidate of that commit (the two older ones with the pinned document builder passing the root position's win% to summarizeSide, as the app of their day did). Each cell reads recorded → reproduced; MAE and bias are in accuracy points, ours minus chess.com, generated by \`projects/accuracy-vs-chesscom/reproduce.mjs\`.`,
    '',
    '| evidence | variant | test MAE | train MAE | test within 5 (%) | test bias | test r | test MAE vs baseline |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of report.rows) {
    const a = r.recorded ?? {}, b = r.reproduced;
    lines.push(`| ${r.profile} | ${r.variant} | ${cell(a.testMae, b.testMae)} | ${cell(a.trainMae, b.trainMae)} | ${cell(a.testWithin5, b.testWithin5, 0)} | ${cell(a.testBias, b.testBias)} | ${cell(a.testR, b.testR, 2)} | ${cell(a.testMaeVsBaseline, b.testMaeVsBaseline)} |`);
  }
  lines.push('', `The largest change in a test MAE is ${f(report.largest_test_mae_change, 2)} points.`, '');
  const { recorded: rr, rerun: rn, rule } = report.reread;
  const later = Object.entries(rn.leftOut).map(([tag, n]) => `${n} under \`${tag}\``).join(', ');
  lines.push(
    '## The archive re-read check',
    '',
    `Does the archive's stored accuracy, taken under the old instrument, come back from its stored per-ply evaluations? The rule: a whole-game mean gap of at most ${rule.mae} and a 90th percentile of at most ${rule.p90} points. Recorded: ${f(rr.mae, 2)} and ${f(rr.p90, 2)} over ${rr.sides} sides. On the pinned app's archive: ${f(rn.mae, 2)} and ${f(rn.p90, 2)} over ${rn.sides} sides (largest ${f(rn.max, 2)}), so the check ${rn.holds ? 'holds' : 'fails'}. Rows stored under later instruments are left out (${later || 'none'}).`,
    '',
  );
  return lines.join('\n');
}

main();
