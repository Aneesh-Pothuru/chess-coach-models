#!/usr/bin/env node
// Reproduces the punish-odds check in the lab, two ways.
//
// Recomputed: analyze.mjs over the events the records keep, its results held
// byte for byte to the records' results.json.
//
// Rerun: the routine evidence rebuilt on the pinned app
// (accuracy-vs-chesscom/build-evidence.mjs --profile routine, into
// private/maia-punish/evidence/<app commit>/: it resumes, and a complete build
// costs nothing), then events.mts on it, which prices each reply as that app
// does, then analyze.mjs, its verdicts and scores set beside the recorded ones.
// A build from scratch takes about an hour at the build's default concurrency.
//
//   bridge/run.sh projects/maia-punish/reproduce.mjs [--no-rerun]
//
// The evidence and the events (which name games) stay in private/maia-punish/;
// results/reproduction.{md,json} hold aggregates only.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CHESS_DIR, LAB_DIR, privateDir, projectDir, records, resultsDir } from '../../bridge/lib/chess.mjs';

const FLOW = 'maia-punish';
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const analyze = (events, out) => {
  mkdirSync(out, { recursive: true });
  execFileSync(process.execPath, [join(projectDir(FLOW), 'analyze.mjs'), '--events', events, '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
};

/** The numbers a reader checks: per set and direction, the events, the punish rate, the Brier scores and the verdict. */
function headline(results) {
  const rows = [];
  for (const [key, r] of Object.entries(results)) {
    if (key.endsWith('|step5')) continue;
    const step5 = results[`${key}|step5`];
    rows.push({
      key,
      events: r.n,
      games: r.games,
      punished: r.k1,
      meanQ: r.mq,
      brierMaia: r.e1.bq,
      brierBaseRate: r.e1.bb,
      brierLossOnly: r.e1.bl,
      verdict: r.verdict,
      aucStep5: step5?.aucPoint ?? null,
    });
  }
  return rows;
}

function main() {
  const recorded = join(records(), 'evals', FLOW);
  const home = privateDir(FLOW);

  const recompute = join(home, 'recompute');
  analyze(join(recorded, 'events.json'), recompute);
  const identical = readFileSync(join(recompute, 'results.json'), 'utf8') === readFileSync(join(recorded, 'results.json'), 'utf8');

  const rerun = join(home, 'rerun');
  if (!process.argv.includes('--no-rerun')) {
    const evidence = join(home, 'evidence', git(CHESS_DIR, 'rev-parse', 'HEAD'));
    console.error(`[reproduce] routine evidence on the pinned app, in ${relative(LAB_DIR, evidence)}`);
    execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [join(projectDir('accuracy-vs-chesscom'), 'build-evidence.mjs'), '--profile', 'routine', '--out', evidence], { cwd: LAB_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
    console.error('[reproduce] events: errors, punishing replies and Maia odds on the rebuilt routine evidence');
    execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [join(projectDir(FLOW), 'events.mts'), '--evidence', join(evidence, 'routine')], { cwd: LAB_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
    analyze(join(home, 'events.json'), rerun);
  }
  if (!existsSync(join(rerun, 'results.json'))) throw new Error(`no rerun in ${rerun}: run without --no-rerun`);

  // The rerun's evidence and its odds come from one app commit, the one the report names.
  const rerunEvents = read(join(home, 'events.json'));
  if (rerunEvents.evidence !== relative(LAB_DIR, join(home, 'evidence', rerunEvents.app ?? '', 'routine'))) throw new Error(`the rerun's events read ${rerunEvents.evidence}, not evidence built on the app they ran on: run without --no-rerun`);
  const before = new Map(headline(read(join(recorded, 'results.json'))).map(r => [r.key, r]));
  const events = { recorded: read(join(recorded, 'events.json')).events.length, rerun: rerunEvents.events.length };
  const report = {
    eval: 'maia-punish reproduction',
    chess: { pinned_commit: rerunEvents.app, records_commit: git(records(), 'rev-parse', 'HEAD') },
    offsets: rerunEvents.offsets,
    appOdds: rerunEvents.appOdds,
    recomputedIdentical: identical,
    events,
    rows: headline(read(join(rerun, 'results.json'))).map(r => ({ key: r.key, recorded: before.get(r.key) ?? null, rerun: r })),
    // The calibration bins (aggregates only), for the recorded events and the rerun.
    calibration: { recorded: read(join(recompute, 'calibration.json')), rerun: read(join(rerun, 'calibration.json')) },
  };
  writeFileSync(join(resultsDir(FLOW), 'reproduction.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(resultsDir(FLOW), 'reproduction.md'), render(report));
  console.log(render(report));
}

/** A results key ("EXACT|player-err") as a reader names it. */
function label(key) {
  const [set, dir] = key.split('|');
  const who = dir === 'player-err' ? "the player's errors" : "the opponents' errors";
  return `${who}, ${set === 'EXACT' ? 'verified replies' : 'all non-book replies'}`;
}

function render(report) {
  const f = (x, d = 3) => (x == null ? '-' : x.toFixed(d));
  const cell = (a, b, d) => `${f(a, d)} → ${f(b, d)}`;
  const L = [
    '# Punish odds: the check reproduced in the lab',
    '',
    `Generated by \`projects/maia-punish/reproduce.mjs\` on app commit \`${report.chess.pinned_commit.slice(0, 7)}\`, reading the records at \`${report.chess.records_commit.slice(0, 7)}\`.`,
    '',
    `Recomputed from the recorded events, the analysis ${report.recomputedIdentical ? 'matches the records\' results.json byte for byte' : 'differs from the records\' results.json'}.`,
    '',
    `Rerun on the routine evidence the lab rebuilt on that commit: ${report.events.rerun} events (recorded: ${report.events.recorded}). Each reply is priced as the app prices it, at the replier's band with chess.com ratings converted at +${report.offsets.player} for the player and +${report.offsets.opponents} for his opponents; the band and the odds match the app's own review for ${report.appOdds.checked} of the ${report.events.rerun} events${report.appOdds.absent ? ` (${report.appOdds.absent} carry none)` : ''}. Each cell reads recorded → rerun. Brier scores are for "the punishing reply is played": Maia's odds, the base rate, and a fit on the size of the error alone (both baselines leave one game out).`,
    '',
    '| replies to | events | punished | Brier, Maia | Brier, base rate | Brier, error size | AUC (errors of 10+) | verdict |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const { key, recorded: a, rerun: b } of report.rows) {
    L.push(`| ${label(key)} | ${a?.events ?? '-'} → ${b.events} | ${a?.punished ?? '-'} → ${b.punished} | ${cell(a?.brierMaia, b.brierMaia)} | ${cell(a?.brierBaseRate, b.brierBaseRate)} | ${cell(a?.brierLossOnly, b.brierLossOnly)} | ${cell(a?.aucStep5, b.aucStep5)} | ${a?.verdict ?? '-'} → ${b.verdict} |`);
  }
  L.push('');
  return L.join('\n');
}

main();
