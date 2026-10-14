#!/usr/bin/env node
// A variant's per-moment record, small enough to keep: one JSON line per key
// moment with its three grades and a hash of the texts the player can read
// (the card, the lesson, the comment, the Why sheet and the retry), so a
// later summary can count the moments a change touched without the variant's
// full cases.json and grades.json, which are rebuilt from the code on demand.
//
//   node projects/explain-top-move/results.mjs <variant dir>

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: results.mjs <variant dir>');
const cases = new Map(JSON.parse(readFileSync(join(dir, 'cases.json'), 'utf8')).map(m => [`${m.game}-${m.ply}`, m]));
const grades = JSON.parse(readFileSync(join(dir, 'grades.json'), 'utf8'));
/** The texts the player can read for a moment, as summarize.mjs compares them. */
const visible = m => JSON.stringify([m.texts?.cardShows, m.texts?.commentFor, m.texts?.lessonFor, m.texts?.retryTeaching, m.texts?.whyLabel]);
const lines = grades.map(g => JSON.stringify({
  id: g.id,
  cls: g.cls,
  faithful: g.faithful,
  faithfulAll: g.faithfulAll,
  concrete: g.concrete,
  named_deep: g.named_deep,
  textHash: createHash('sha256').update(visible(cases.get(g.id) ?? {})).digest('hex').slice(0, 16),
}));
writeFileSync(join(dir, 'results.jsonl'), `${lines.join('\n')}\n`);
console.log(`wrote ${join(dir, 'results.jsonl')}: ${lines.length} moments`);
