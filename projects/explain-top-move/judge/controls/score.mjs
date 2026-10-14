#!/usr/bin/env node
// The judge's controls, recomputed from the answers the records keep.
//
// The length check (the records' evals/explain-top-move/judge/controls/plan.md,
// fixed before any answer): 585 items built from rounds 7, 8 and 9, one fresh
// judge per batch. J1 asks whether the judge answers "same" to the same text on
// both sides; J2 whether filler as long as a round's change, added to the
// shorter text, beats the shorter text; J3 whether each round's longer text
// beats that decoy. Every round after the check deals a control into its own
// batches (controls/round<N>/): moments the round does not change, set against
// themselves with a decoy. A padding control's decoy is the text with filler
// as long as the round's change; a round that shortens its texts deals a trim
// control instead, whose decoy is the text with a point cut (trim.json).
//
//   node projects/explain-top-move/judge/controls/score.mjs
//
// It prints aggregates only: no item is named.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { records } from '../../../../bridge/lib/lab.mjs';
import { score } from '../pairwise.mjs';

const J = p => JSON.parse(readFileSync(p, 'utf8'));
const pct = (a, b) => (b === 0 ? null : Math.round((1000 * a) / b) / 10);

export const DRIFT_RULE = 'the judge has drifted if the decoy (the text with filler, or with a point cut) is preferred in at least 25% of the control\'s comparisons and in more than half of the decided ones.';
const lengthBiased = (decoy, n, decided) => n > 0 && decoy / n >= 0.25 && decided > 0 && decoy / decided > 0.5;

/**
 * The length check's report from its key (key.json) and its judges' answers
 * (out/*.judge.json), by the plan's rules. An answer other than X, Y or same is
 * missing, never a side.
 */
export function lengthCheck(dir) {
  const key = J(join(dir, 'key.json'));
  const outDir = join(dir, 'out');
  const files = existsSync(outDir) ? readdirSync(outDir).filter(f => f.endsWith('.judge.json')) : [];
  const answers = new Map();
  for (const f of files) for (const a of J(join(outDir, f)).answers ?? []) answers.set(a.id, a);

  const choice = id => { const a = answers.get(id); return a ? String(a.choice ?? '').trim() : null; };
  /** What the judge preferred in the item's own terms: the version it named, 'same', or null. */
  const pick = (id) => {
    const c = choice(id);
    if (c === 'same') return 'same';
    if (c === 'X' || c === 'Y') return key[id][c];
    return null;
  };
  const rows = Object.entries(key).map(([id, k]) => ({ id, ...k, pick: pick(id) }));
  const tally = (list, sides) => {
    const t = Object.fromEntries([...sides, 'same'].map(s => [s, 0]));
    for (const r of list) if (r.pick !== null) t[r.pick] = (t[r.pick] ?? 0) + 1;
    t.n = list.filter(r => r.pick !== null).length;
    return t;
  };
  const rounds = [...new Set(rows.map(r => r.round))];

  // J1: identity.
  const J1 = { same: 0, X: 0, Y: 0, n: 0 };
  for (const r of rows.filter(r => r.comparison === 'identity')) {
    const c = choice(r.id);
    if (c === 'same' || c === 'X' || c === 'Y') { J1[c]++; J1.n++; }
  }
  Object.assign(J1, { sameShare: pct(J1.same, J1.n), inventsDifferences: J1.n > 0 && J1.same / J1.n < 0.8 });

  // J2: padding, pooled, and by round and kind for reading.
  const padding = rows.filter(r => r.comparison === 'padding');
  const all = tally(padding, ['decoy', 'short']);
  const decided = all.decoy + all.short;
  const J2 = {
    ...all,
    decoyShareOfAll: pct(all.decoy, all.n),
    decoyShareOfDecided: pct(all.decoy, decided),
    lengthBiased: lengthBiased(all.decoy, all.n, decided),
    byRound: Object.fromEntries(rounds.map(round => [round, tally(padding.filter(r => r.round === round), ['decoy', 'short'])])),
    byKind: Object.fromEntries(['restate', 'generic'].map(kind => [kind, tally(padding.filter(r => r.decoyKind === kind), ['decoy', 'short'])])),
  };

  // J3: matched, per round, by split.
  const matched = rows.filter(r => r.comparison === 'matched');
  const holds = t => t.long + t.decoy > 0 && t.long > (t.long + t.decoy) / 2;
  const J3 = Object.fromEntries(rounds.map((round) => {
    const of = r => r.round === round;
    const per = { train: tally(matched.filter(r => of(r) && r.split === 'train'), ['long', 'decoy']), test: tally(matched.filter(r => of(r) && r.split === 'test'), ['long', 'decoy']) };
    return [round, {
      ...per,
      byKind: Object.fromEntries(['restate', 'generic'].map(kind => [kind, tally(matched.filter(r => of(r) && r.decoyKind === kind), ['long', 'decoy'])])),
      survives: holds(per.train) && holds(per.test),
    }];
  }));

  const missing = rows.filter(r => r.pick === null).length;
  return { items: rows.length, answered: rows.length - missing, missing, batches: files.length, J1, J2, J3 };
}

/**
 * A round's control (pairwise.mjs's layout, the decoys as the "new" version):
 * its kind (a trim control keeps trim.json beside its answers), the decoy's
 * share of the comparisons, pooled over both runs and both splits, and whether
 * the judge drifted by DRIFT_RULE.
 */
export function roundControl(dir) {
  const { tally } = score([dir]);
  const decoy = tally.train.new + tally.test.new, unchanged = tally.train.old + tally.test.old, same = tally.train.same + tally.test.same;
  const n = decoy + unchanged + same;
  return {
    kind: existsSync(join(dir, 'trim.json')) ? 'trim' : 'padding',
    comparisons: n, decoy, unchanged, same,
    decoyShareOfAll: pct(decoy, n),
    decoyShareOfDecided: pct(decoy, decoy + unchanged),
    drifted: lengthBiased(decoy, n, decoy + unchanged),
  };
}

/**
 * How often the judge's decided answers in some rounds picked the longer of
 * the two versions, by the characters of their texts: what made the length
 * check worth running.
 */
export function longerPicked(dirs) {
  const length = version => version.reduce((s, section) => s + section.text.length, 0);
  let longer = 0, decided = 0, ties = 0;
  for (const dir of dirs) {
    for (const r of ['r1', 'r2']) {
      const items = new Map(J(join(dir, `items-${r}.json`)).items.map(i => [i.id, i]));
      for (const a of J(join(dir, `out-${r}.judge.json`)).answers) {
        const item = items.get(a.id);
        if (!item || (a.choice !== 'X' && a.choice !== 'Y')) continue;
        decided++;
        const x = length(item.versionX), y = length(item.versionY);
        if (x === y) ties++;
        else if ((a.choice === 'X') === (x > y)) longer++;
      }
    }
  }
  return { longer, decided, ties };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const judgeDir = join(records(), 'evals', 'explain-top-move', 'judge');
  const controls = join(judgeDir, 'controls');
  const { J1, J2, J3, ...counts } = lengthCheck(join(controls, 'run1'));
  const perRound = Object.fromEntries(readdirSync(controls).filter(d => /^round\d+[a-z]?$/.test(d)).map(d => [d, roundControl(join(controls, d))]));
  console.log(JSON.stringify({ length: { ...counts, J1, J2, J3 }, perRound, rule: DRIFT_RULE }, null, 1));
}
