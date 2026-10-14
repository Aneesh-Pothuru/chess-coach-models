#!/usr/bin/env node
// What the judge preferred: the shipped verdict or the one under the
// mover-rated curve, on the sampled flips, from the judge rounds the records
// keep. Each run's X and Y map back to old (shipped) and new (proposed)
// through that run's key; a move's kind of change is its old and new labels.
//
//   node projects/judge-in-context/tally.mjs [--judge DIR] [--json]
//
// --judge defaults to the records' evals/judge-in-context/judge/. Prints
// aggregates only.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { records } from '../../bridge/lib/lab.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));

/** The judge's answers per run, as old/new/unsure per sampled move, and their tallies. */
export function tally(judgeDir) {
  const runs = ['r1', 'r2'].filter(r => existsSync(join(judgeDir, `flips-${r}.judge.json`)));
  if (!runs.length) throw new Error(`no judge runs in ${judgeDir}`);
  const items = read(join(judgeDir, `flips-${runs[0]}.json`)).items;
  const picks = {};
  const labels = new Map();
  for (const r of runs) {
    const key = read(join(judgeDir, `flips-${r}.key.json`));
    const answers = read(join(judgeDir, `flips-${r}.judge.json`)).answers;
    picks[r] = new Map(answers.map(a => [a.id, a.choice === 'unsure' ? 'unsure' : key[a.id][a.choice]]));
    for (const item of read(join(judgeDir, `flips-${r}.json`)).items) {
      const k = key[item.id];
      const old = k.X === 'old' ? item.labelX : item.labelY;
      const now = k.X === 'new' ? item.labelX : item.labelY;
      const seen = labels.get(item.id);
      if (seen && (seen.old !== old || seen.new !== now)) throw new Error(`${item.id}: the runs show different labels`);
      labels.set(item.id, { old, new: now });
    }
  }
  const count = m => {
    const v = [...m.values()];
    return { shipped: v.filter(x => x === 'old').length, proposed: v.filter(x => x === 'new').length, unsure: v.filter(x => x === 'unsure').length };
  };
  const perRun = Object.fromEntries(runs.map(r => [r, count(picks[r])]));
  const identical = runs.length > 1 ? items.filter(i => picks[runs[0]].get(i.id) === picks[runs[1]].get(i.id)).length : null;

  // By kind of change: how many moves both runs gave to each side, and how many they split.
  const kinds = new Map();
  for (const item of items) {
    const { old, new: now } = labels.get(item.id);
    const kind = `${old} → ${now}`;
    const row = kinds.get(kind) ?? { kind, moves: 0, bothShipped: 0, bothProposed: 0, split: 0 };
    const answers = runs.map(r => picks[r].get(item.id));
    row.moves++;
    if (answers.every(a => a === 'old')) row.bothShipped++;
    else if (answers.every(a => a === 'new')) row.bothProposed++;
    else row.split++;
    kinds.set(kind, row);
  }
  return { moves: items.length, runs: perRun, identical, byKind: [...kinds.values()].sort((a, b) => b.moves - a.moves || a.kind.localeCompare(b.kind)) };
}

export function render(t) {
  const runs = Object.keys(t.runs);
  const L = [
    `| | ${runs.map(r => `run ${r.slice(1)}`).join(' | ')} |`,
    `|---|${runs.map(() => '---').join('|')}|`,
    `| shipped verdict preferred | ${runs.map(r => t.runs[r].shipped).join(' | ')} |`,
    `| proposed verdict preferred | ${runs.map(r => t.runs[r].proposed).join(' | ')} |`,
    `| unsure | ${runs.map(r => t.runs[r].unsure).join(' | ')} |`,
    '',
  ];
  if (t.identical != null) L.push(`The two runs gave the same answer on ${t.identical} of ${t.moves} moves.`, '');
  L.push('| kind of change (shipped → proposed) | moves | both runs: shipped | both runs: proposed | split |', '|---|---|---|---|---|');
  for (const k of t.byKind) L.push(`| ${k.kind} | ${k.moves} | ${k.bothShipped} | ${k.bothProposed} | ${k.split} |`);
  L.push('');
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--judge');
  const judgeDir = i >= 0 ? resolve(args[i + 1]) : join(records(), 'evals', 'judge-in-context', 'judge');
  const t = tally(judgeDir);
  console.log(args.includes('--json') ? JSON.stringify(t, null, 2) : render(t));
}
