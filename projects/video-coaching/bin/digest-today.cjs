// analyze.cjs's digest of a day's archived rows, with each side's accuracy (and
// its phase split) read by today's instrument, the facts builder's classifier,
// as the brief reads it. A case's brief is computed with today's code; printing
// the stored accuracy beside it would hand the writer two numbers for one game.
// The live routine prints this digest during prepare, before the optional Maia
// step adds each turning point's findability to .cache/analysis.json, so the
// archived rows' findability is left out of it here too; the case's
// analysis.json keeps it, as the live one has it after that step.
//   node digest-today.cjs <root> <day>
'use strict';
const fs = require('fs');
const path = require('path');
const [root, day] = process.argv.slice(2);
require(path.join(root, 'tools/coach-review/lib/ts.cjs'));
const { loadFactsDeps } = require(path.join(root, 'src/cli/factsDeps.ts'));
const { archiveFacts } = require(path.join(root, 'src/adapters/node/metrics/index.ts'));
const rows = JSON.parse(fs.readFileSync(path.join(root, 'coach-log', 'review-analysis', `${day}.json`), 'utf8'));
const facts = archiveFacts({ root, deps: loadFactsDeps(root, false), seed: false, rows });
const byUrl = new Map(facts.primaries.map((g) => [g.url, g]));
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
let patched = 0;
const changes = [];
for (const r of rows) {
  const g = byUrl.get(r.url);
  if (!g || !r.acc2) continue;
  for (const [side, q] of [['mine', g.qualityMe], ['opp', g.qualityOpp]]) {
    if (!q || !r.acc2[side]) continue;
    const was = r.acc2[side].accuracy;
    r.acc2[side].accuracy = r1(q.accuracy);
    r.acc2[side].phases = Object.fromEntries(Object.entries(q.phases || {}).map(([k, v]) => [k, r1(v)]));
    patched++;
    if (was !== r.acc2[side].accuracy) changes.push(`${r.opp} ${side}: ${was} -> ${r.acc2[side].accuracy}`);
  }
}
process.stderr.write(`accuracy re-read for ${patched} sides of ${rows.length} games; changed: ${changes.join('; ') || 'none'}\n`);
let unfound = 0;
for (const r of rows) for (const d of r.deep || []) if (d.find) { delete d.find; unfound++; }
process.stderr.write(`findability left out of ${unfound} turning points, as the live digest prints before the Maia step\n`);
require(path.join(root, 'tools/coach-review/analyze.cjs')).printDigest(rows);
