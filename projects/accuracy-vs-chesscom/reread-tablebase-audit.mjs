// Count the tablebase exposure of the existing archive re-read sample. No
// engine is run. The real re-read script selects the rows; the app's reader
// restores them, and both eligibility predicates are imported from app code.
// Per-game output stays under private/lab-audit/accuracy-reread/.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/reread-tablebase-audit.mjs

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHESS_DIR, LAB_DIR, chess, privateDir, projectDir, records, resultsDir } from '../../bridge/lib/chess.mjs';
import { accuracy } from './models/lichess-v2.mjs';

const FLOW = 'accuracy-vs-chesscom';
const home = join(privateDir('lab-audit'), 'accuracy-reread');
mkdirSync(home, { recursive: true });
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const json = path => JSON.parse(readFileSync(path, 'utf8'));

// Import the historical app instrument, with only its score import redirected
// to the pinned app. Type-only imports do not load at runtime. Keep the source
// adaptation private, and reject a changed import rather than silently using
// a different instrument. Neither graded() nor any scoring code is copied.
const historicalPath = join(projectDir(FLOW), 'hillclimb/v1/accuracy.before.ts');
const historical = readFileSync(historicalPath, 'utf8');
const scoreImport = "from '../../core/score'";
assert.equal(historical.split(scoreImport).length, 2, 'historical score import changed');
const adapted = join(home, 'historical-accuracy.ts');
writeFileSync(adapted, historical.replace(scoreImport, `from '${pathToFileURL(join(CHESS_DIR, 'src/core/score/index.ts')).href}'`));
const [oldLib, lib, reader, level] = await Promise.all([
  import(pathToFileURL(adapted).href),
  chess('src/services/review/accuracy.ts'),
  chess('src/services/review/archive/read.ts'),
  chess('src/services/learner/level.ts'),
]);

// This script can print game identifiers. Capture all its output privately.
const log = openSync(join(home, 'reread.stdout.txt'), 'w');
try {
  execFileSync(join(LAB_DIR, 'bridge/run.sh'), [join(projectDir(FLOW), 'reread-check.mjs'), '--out', home], {
    cwd: LAB_DIR, env: { ...process.env, CHESS_DIR }, stdio: ['ignore', log, log],
  });
} finally {
  closeSync(log);
}
const rerun = json(join(home, 'summary.json'));
const details = json(join(home, 'sides.json'));
const recorded = json(join(resultsDir(FLOW), 'reproduction.json'));
const primary = details.sides.filter(s => s.set === 'archive');
const selected = new Map();
for (const side of primary) {
  const key = `${side.file}:${side.idx}`;
  if (!selected.has(key)) selected.set(key, { file: side.file, idx: side.idx, sides: [] });
  selected.get(key).sides.push(side);
}

const files = new Map();
const rawAt = (root, file, idx) => {
  const path = join(root, 'coach-log/review-analysis', file);
  if (!files.has(path)) files.set(path, json(path));
  return files.get(path)[idx];
};
const n = {
  archiveRows: selected.size,
  archiveSides: primary.length,
  scoredArchiveRows: 0,
  scoredArchiveSides: 0,
  scoredPlyRecords: 0,
  scoredStoredTablebasePositions: 0,
  scoredTablebasePlyRecords: 0,
  archiveReadFailures: details.failures.filter(s => s.set === 'archive').length,
  sameRowsInRecordsCheckout: 0,
  rowsWithStoredTablebasePositions: 0,
  storedTablebasePositions: 0,
  restoredPositionsWithTablebase: 0,
  restoredPlyRecords: 0,
  rowsWithTablebasePlyRecords: 0,
  tablebasePlyRecords: 0,
  currentGradedPlyRecords: 0,
  historicalGradedPlyRecords: 0,
  eligibilityDifferences: 0,
  changedAccuracySides: 0,
  maxAbsoluteAccuracyChange: 0,
};
const privateRows = [];
const recordsRoot = records();
for (const row of selected.values()) {
  assert.equal(row.sides.length, 2, 'the real re-read did not return both sides');
  const raw = rawAt(CHESS_DIR, row.file, row.idx);
  const reference = rawAt(recordsRoot, row.file, row.idx);
  if (JSON.stringify(raw) === JSON.stringify(reference)) n.sameRowsInRecordsCheckout++;
  const doc = reader.reviewFromArchiveRow(raw, { username: level.DEFAULT_USERNAME });
  assert(doc, 'a selected archive row no longer reads');
  const tablebase = doc.records.filter(r => !!r.tablebase).length;
  const differences = doc.records.filter(r => lib.graded(r) !== oldLib.graded(r)).length;
  const storedPositions = Array.isArray(raw.tablebase) ? raw.tablebase.length : 0;
  const recKey = rerun.primary === 'A' ? 'recA' : 'recB';
  const scored = row.sides.filter(s => Number.isFinite(s.storedAcc) && Number.isFinite(s[recKey]));
  n.scoredArchiveSides += scored.length;
  if (scored.length > 0) {
    n.scoredArchiveRows++;
    n.scoredPlyRecords += doc.records.length;
    n.scoredStoredTablebasePositions += storedPositions;
    n.scoredTablebasePlyRecords += tablebase;
  }
  n.rowsWithStoredTablebasePositions += Number(storedPositions > 0);
  n.storedTablebasePositions += storedPositions;
  n.restoredPositionsWithTablebase += doc.positions.filter(p => !!p.tablebase).length;
  n.restoredPlyRecords += doc.records.length;
  n.rowsWithTablebasePlyRecords += Number(tablebase > 0);
  n.tablebasePlyRecords += tablebase;
  n.currentGradedPlyRecords += doc.records.filter(lib.graded).length;
  n.historicalGradedPlyRecords += doc.records.filter(oldLib.graded).length;
  n.eligibilityDifferences += differences;
  for (const side of row.sides) {
    let changed = false;
    // Both seedings are part of the committed re-read rule. Check both, even
    // when only one is selected by that rule.
    for (const [key, rootWin] of [['recA', doc.rootWin], ['recB', 50]]) {
      const current = accuracy(doc.records, side.color, { lib, rootWin });
      const frozen = accuracy(doc.records, side.color, { lib: oldLib, rootWin });
      const native = oldLib.summarizeSide(doc.records, side.color, doc.division, rootWin).accuracy;
      assert.deepEqual(current, side[key], 'the real re-read and audit disagree');
      assert((native === null && frozen === null) || Math.abs(native - frozen) < 1e-9, 'historical instrument parity failed');
      assert.equal(current === null, frozen === null, 'eligibility changed a side to or from null');
      if (current !== null) {
        const delta = Math.abs(current - frozen);
        changed ||= delta > 1e-9;
        n.maxAbsoluteAccuracyChange = Math.max(n.maxAbsoluteAccuracyChange, delta);
      }
    }
    n.changedAccuracySides += Number(changed);
  }
  privateRows.push({ file: row.file, idx: row.idx, records: doc.records.length, storedPositions, tablebase, differences });
}
assert.equal(n.scoredArchiveSides, rerun.n, 'scored sample differs from the real re-read');

const report = {
  eval: 'accuracy archive re-read tablebase exposure',
  appCommit: git(CHESS_DIR, 'rev-parse', 'HEAD'),
  recordsCommit: git(recordsRoot, 'rev-parse', 'HEAD'),
  historicalInstrument: 'hillclimb/v1/accuracy.before.ts',
  historicalInstrumentSha256: createHash('sha256').update(historical).digest('hex'),
  sample: 'archive rows selected by reread-check.mjs; both acc2 sides v2-tagged or untagged, successfully read by the pinned app',
  counts: n,
  committedReread: recorded.reread,
  presentReread: { sides: rerun.n, mae: rerun.mae, p90: rerun.p90, primary: rerun.primary, holds: rerun.holds },
  historicalSampleLimit: `The original ${recorded.reread.recorded.sides}-side membership and the ${recorded.reread.rerun.sides}-side reproduction membership are not retained in the cached research records. Their aggregates alone cannot certify equality with the present sample.`,
};
writeFileSync(join(home, 'tablebase-rows.json'), JSON.stringify(privateRows, null, 2) + '\n');
writeFileSync(join(resultsDir(FLOW), 'reread-tablebase-audit.json'), JSON.stringify(report, null, 2) + '\n');
const fmt = value => value.toFixed(2);
const markdown = [
  '# Accuracy archive re-read: tablebase exposure',
  '',
  `Generated by \`reread-tablebase-audit.mjs\` on app commit \`${report.appCommit}\` and research records \`${report.recordsCommit}\`. No engine was run. The existing \`reread-check.mjs\` selected the sample; the app's archive reader restored its documents. The eligibility comparison imports the current app and the historical app instrument at \`hillclimb/v1/accuracy.before.ts\`. Only the historical source's score import is redirected to the pinned app.`,
  '',
  `The present input has ${n.archiveRows} archive rows, ${n.archiveSides} sides and ${n.restoredPlyRecords} ply records. Of those, ${n.scoredArchiveRows} rows and ${n.scoredArchiveSides} sides enter the error statistics; those rows contain ${n.scoredPlyRecords} ply records. The remaining ${n.archiveSides - n.scoredArchiveSides} sides lack finite stored or recomputed accuracy. There were ${n.archiveReadFailures} archive reader failures. All ${n.sameRowsInRecordsCheckout} selected rows also occur unchanged at the same locations in the cached research records.`,
  '',
  `There are ${n.storedTablebasePositions} stored tablebase position readings in ${n.rowsWithStoredTablebasePositions} rows. The reader retains ${n.restoredPositionsWithTablebase} of those on positions. There are ${n.tablebasePlyRecords} tablebase-marked ply records. This distinction matters: the accuracy filter reads the ply record's \`tablebase\` field, not the position's field.${n.tablebasePlyRecords === 0 ? ' Here the stored position readings produce no tablebase-marked ply records.' : ''}`,
  '',
  `Restricting to rows with a scored side gives ${n.scoredStoredTablebasePositions} stored tablebase positions and ${n.scoredTablebasePlyRecords} tablebase-marked ply records.`,
  '',
  `The current filter accepts ${n.currentGradedPlyRecords} records and the historical filter accepts ${n.historicalGradedPlyRecords}; they disagree on ${n.eligibilityDifferences}. Substituting the imported historical filter in the frozen model changes ${n.changedAccuracySides} sides, with a maximum absolute change of ${fmt(n.maxAbsoluteAccuracyChange)} accuracy points over either root seeding.${n.changedAccuracySides === 0 ? " Thus this filter defect cannot move the present sample's re-read numbers." : " The defect changes this sample's accuracy numbers; its verdict needs a corrected re-read."} The direct historical app instrument agrees with the frozen model when the historical filter is supplied.`,
  '',
  `The unchanged re-read rule currently selects seed ${rerun.primary}: MAE ${fmt(rerun.mae)}, 90th percentile ${fmt(rerun.p90)}, over ${rerun.n} sides, so it ${rerun.holds ? 'holds' : 'fails'}. These are a separate present-archive check, not replacements for the published aggregates. The committed reproduction reports ${recorded.reread.rerun.sides} sides (${fmt(recorded.reread.rerun.mae)}, ${fmt(recorded.reread.rerun.p90)}); the original record reports ${recorded.reread.recorded.sides} (${fmt(recorded.reread.recorded.mae)}, ${fmt(recorded.reread.recorded.p90)}).`,
  '',
  `The exact historical sample memberships are absent. To certify the old published runs directly, supply their private \`reread/sides.json\` with the corresponding raw archive rows and app reader checkout, or their already-restored documents with each record's \`tablebase\`, \`cls\`, \`before\` and \`after\` fields. The original aggregate reports do not count tablebase records. This audit changes no study rule, model or published result.`,
  '',
  'Run with `bridge/run.sh projects/accuracy-vs-chesscom/reread-tablebase-audit.mjs`. Per-game diagnostics stay under `private/lab-audit/accuracy-reread/`.',
  '',
].join('\n');
writeFileSync(join(resultsDir(FLOW), 'reread-tablebase-audit.md'), markdown);
console.log(markdown);
