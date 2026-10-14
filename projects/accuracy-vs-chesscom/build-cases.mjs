// Builds the input set for the accuracy-vs-chess.com eval. The eval compares the
// app's per-game accuracy with chess.com's, so only games that carry chess.com's
// accuracy for both sides can be graded: those are the eligible games.
//
// Every day file of the routine archive is read in date order, and a game id
// keeps the row from the latest file it appears in. SAMPLE_SIZE eligible games
// are drawn as a proportional stratified sample over length bucket x result; the
// rest form the dev pool. gold.json holds chess.com's accuracy for every eligible
// game, sampled or not, so the dev pool can be graded as well.
//
// The output is a pure function of the archive. Nothing reads the clock or
// Math.random, and every collection is walked in an explicit order, so a re-run
// reproduces the files byte for byte.
//
// The archive is the app's (coach-log/review-analysis at the commit
// bridge/chess.json pins, or --archive DIR), and every file this writes holds
// the player's games, so it all goes to private/accuracy-vs-chesscom/.
// --frozen takes the research records' sample instead (the 60 games the
// accuracy and explanation hill-climbs ran on), so their numbers can be
// reproduced; a newer archive draws different games.
//
// Usage: bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs [--frozen] [--archive DIR]

import fs from 'node:fs';
import path from 'node:path';
import { CHESS_DIR, privateDir, records } from '../../bridge/lib/chess.mjs';

const SEED = 20261009;
const SAMPLE_SIZE = 60;

const FLOW = 'accuracy-vs-chesscom';
const OUT_DIR = privateDir(FLOW);
const FROZEN_FILES = ['cases.json', 'gold.json', 'dev-pool.json'];

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const GAME_URL = /\/game\/live\/(\d+)\/?$/;
const RESULT_WORD = { W: 'win', L: 'loss', D: 'draw' };
const BUCKETS = ['short', 'medium', 'long'];
const RESULTS = ['win', 'loss', 'draw'];
// The cell order is part of the sample's definition: it breaks ties in the
// allocation and fixes the order in which the generator is consumed.
const CELLS = BUCKETS.flatMap((bucket) => RESULTS.map((result) => ({ bucket, result })));

// The Pacific day a game ended on, from its end time in unix seconds.
const PT_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const ptDay = (unixSeconds) => PT_DAY.format(new Date(unixSeconds * 1000));

// chess.com's public API is the source of truth for the gold: it is what the
// player sees. For a few games the routine's stored copy no longer matches it
// (no swap: neither pairing matches, and the stored pair occurs under no other
// game), most likely a later re-review on chess.com, so the API's numbers are
// used. Those corrections name games, so they live with the research records in
// the app's private repository: the records' own build script holds them.
function goldCorrections() {
  const file = path.join(records(), 'evals', FLOW, 'build-cases.cjs');
  const block = /const GOLD_CORRECTIONS = \{([\s\S]*?)\n\};/.exec(fs.readFileSync(file, 'utf8'));
  assert(block !== null, `no GOLD_CORRECTIONS in the records' ${FLOW}/build-cases.cjs`);
  const corrections = {};
  const entry = /^\s*(\d+): \{ white: ([\d.]+), black: ([\d.]+) \},$/;
  for (const line of block[1].split('\n').filter((l) => l.trim())) {
    const e = entry.exec(line);
    assert(e !== null, 'a GOLD_CORRECTIONS line is not `id: { white: n, black: n },`');
    corrections[e[1]] = { white: Number(e[2]), black: Number(e[3]) };
  }
  return corrections;
}

const lengthBucket = (plies) => (plies <= 40 ? 'short' : plies <= 80 ? 'medium' : 'long');

// The first eligibility test a row fails, or null when the row is eligible.
function ineligibility(row) {
  const acc = row.accuracies;
  if (acc === undefined) return 'no accuracies field';
  if (acc === null) return 'accuracies null';
  if (typeof acc !== 'object' || Array.isArray(acc)) return 'accuracies not an object';
  const inRange = (x) => Number.isFinite(x) && x >= 0 && x <= 100;
  if (!inRange(acc.mine) || !inRange(acc.opp)) return 'accuracy not a number in [0, 100]';
  if (!Array.isArray(row.sans) || row.sans.length === 0) return 'empty move list';
  if (typeof row.meIsWhite !== 'boolean') return 'meIsWhite not a boolean';
  return null;
}

// Chronological by date, then by numeric id.
const byDateThenId = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id));

// Largest-remainder allocation of k seats over the cells. Integer arithmetic keeps
// float error from moving a seat, and a tie on the remainder goes to the earlier cell.
function allocate(counts, k) {
  const total = counts.reduce((s, n) => s + n, 0);
  const seats = counts.map((n, i) => ({ i, base: Math.floor((k * n) / total), rem: (k * n) % total }));
  const extra = k - seats.reduce((s, x) => s + x.base, 0);
  for (const x of [...seats].sort((a, b) => b.rem - a.rem || a.i - b.i).slice(0, extra)) seats[x.i].base++;
  return seats.map((x) => x.base);
}

// mulberry32. The seed is part of the sample's definition, so this must not change.
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rand) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// The last segment of the opening's path, or null when there is none.
function openingSlug(ecoUrl) {
  if (typeof ecoUrl !== 'string') return null;
  let pathname = ecoUrl;
  try {
    pathname = new URL(ecoUrl).pathname;
  } catch {
    // Not an absolute URL: the string is taken as the path.
  }
  const parts = pathname.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function assert(ok, message) {
  if (!ok) throw new Error(`build-cases: ${message}`);
}

function readArchive(ARCHIVE_DIR) {
  const files = fs.readdirSync(ARCHIVE_DIR).filter((f) => DAY_FILE.test(f)).sort();
  const rowsPerId = new Map();
  const latest = new Map(); // game id -> { id, file, date, row }
  let rowsRead = 0;
  for (const file of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, file), 'utf8'));
    assert(Array.isArray(rows), `${file} is not a JSON array`);
    for (const [i, row] of rows.entries()) {
      rowsRead++;
      const m = typeof row.url === 'string' ? GAME_URL.exec(row.url) : null;
      assert(m !== null, `${file}[${i}] has no chess.com live game id in its url`);
      const id = m[1];
      rowsPerId.set(id, (rowsPerId.get(id) ?? 0) + 1);
      // Files are read in date order, so a later row replaces an earlier one.
      latest.set(id, { id, file, date: DAY_FILE.exec(file)[1], row });
    }
  }
  return {
    files,
    rowsRead,
    games: [...latest.values()],
    idsInMoreThanOneRow: [...rowsPerId.values()].filter((n) => n > 1).length,
  };
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function inputsMarkdown({ archive, eligible, ineligible, members, alloc, sampled, devCount, laterFile, corrections }) {
  const notEligible = archive.games.length - eligible;
  const why = [...ineligible].map(([label, n]) => `${n} with ${label}`).join(', ');
  const ours = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
  const chesscom = (x) => String(Math.round(x * 100) / 100);
  return [
    '# Accuracy vs chess.com: input set',
    '',
    `The archive holds ${archive.rowsRead} rows in ${archive.files.length} day files (coach-log/review-analysis). They cover ${archive.games.length} unique chess.com games; ${archive.idsInMoreThanOneRow} appear in more than one day file, and the row from the later file is kept. ${eligible} games are eligible: chess.com's accuracy for both sides, a non-empty move list and a boolean meIsWhite. The other ${notEligible} are not (${why}). ${SAMPLE_SIZE} eligible games are sampled into cases.json and the other ${devCount} form the dev pool (dev-pool.json). gold.json holds chess.com's accuracy for all ${eligible} eligible games.`,
    '',
    '## Strata',
    '',
    '| cell | eligible | sampled |',
    '|---|---:|---:|',
    ...CELLS.map((c, i) => `| ${c.bucket} / ${c.result} | ${members[i].length} | ${alloc[i]} |`),
    `| total | ${eligible} | ${SAMPLE_SIZE} |`,
    '',
    `Length buckets by plies: short 1–40, medium 41–80, long over 80. The 60 seats are allocated over the cells by largest remainder of 60 × eligible ÷ ${eligible} (a tie goes to the earlier cell). Within each cell the games are sorted by numeric id and shuffled with Fisher–Yates driven by mulberry32(${SEED}), one generator for all cells in table order; the first k are taken.`,
    '',
    '## Sampled games',
    '',
    '| # | id | date | color | result | plies | termination | opening | chess.com mine | chess.com opp | ours (archived, older code) mine | ours (archived, older code) opp |',
    '|---:|---|---|---|---|---:|---|---|---:|---:|---:|---:|',
    ...sampled.map((g, i) => {
      const acc = g.row.accuracies;
      return `| ${i + 1} | [${g.id}](${g.row.url}) | ${g.date} | ${g.isWhite ? 'white' : 'black'} | ${g.result} | ${g.plies} | ${g.row.termination ?? '—'} | ${openingSlug(g.row.ecoUrl) ?? '—'} | ${chesscom(acc.mine)}${g.row.accuraciesCorrected ? '*' : ''} | ${chesscom(acc.opp)}${g.row.accuraciesCorrected ? '*' : ''} | ${ours(g.row.acc2?.mine?.accuracy)} | ${ours(g.row.acc2?.opp?.accuracy)} |`;
    }),
    '',
    `The date column is the Pacific day the game ended, as \`coach games\` dates it. The routine files a game under a later day for ${laterFile} of the ${eligible} eligible games; gold.json keeps that day file. For ${Object.keys(corrections).length} games the routine's stored chess.com accuracy no longer matches chess.com's API, which is what the player sees, so the gold uses the API's numbers (marked * below).`,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const a = { frozen: false, archive: path.join(CHESS_DIR, 'coach-log', 'review-analysis') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--frozen') a.frozen = true;
    else if (argv[i] === '--archive' && argv[i + 1] !== undefined) a.archive = argv[++i];
    else {
      console.error('usage: build-cases.mjs [--frozen] [--archive DIR]');
      process.exit(2);
    }
  }
  return a;
}

// The records' sample as it was drawn, copied into private/ for the other scripts.
function useFrozen() {
  const from = path.join(records(), 'evals', FLOW);
  for (const f of FROZEN_FILES) fs.copyFileSync(path.join(from, f), path.join(OUT_DIR, f));
  const inputs = path.join(records(), '.claude', 'hillclimb', FLOW, 'inputs.md');
  fs.copyFileSync(inputs, path.join(OUT_DIR, 'inputs.md'));
  const cases = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'cases.json'), 'utf8'));
  console.log(JSON.stringify({ frozen: true, records: path.basename(records()), sampled: cases.length, outputs: [...FROZEN_FILES, 'inputs.md'].map((f) => path.join('private', FLOW, f)) }, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.frozen) return useFrozen();
  const archive = readArchive(args.archive);
  const GOLD_CORRECTIONS = goldCorrections();

  const ineligible = new Map();
  const eligible = [];
  for (const g of archive.games) {
    const why = ineligibility(g.row);
    if (why !== null) {
      ineligible.set(why, (ineligible.get(why) ?? 0) + 1);
      continue;
    }
    const result = RESULT_WORD[g.row.result];
    assert(result !== undefined, `game ${g.id} has result ${JSON.stringify(g.row.result)}`);
    const plies = g.row.sans.length;
    const fix = GOLD_CORRECTIONS[g.id];
    if (fix) {
      const mine = g.row.meIsWhite ? fix.white : fix.black;
      const opp = g.row.meIsWhite ? fix.black : fix.white;
      g.row = { ...g.row, accuracies: { mine, opp }, accuraciesCorrected: true };
    }
    eligible.push({
      id: g.id,
      file: g.file,
      date: Number.isFinite(g.row.endTime) ? ptDay(g.row.endTime) : g.date,
      dayFile: g.date,
      row: g.row,
      isWhite: g.row.meIsWhite,
      plies,
      result,
      bucket: lengthBucket(plies),
    });
  }
  eligible.sort(byDateThenId);
  assert(eligible.length >= SAMPLE_SIZE, `only ${eligible.length} eligible games for a sample of ${SAMPLE_SIZE}`);

  const members = CELLS.map(() => []);
  for (const g of eligible) {
    members[CELLS.findIndex((c) => c.bucket === g.bucket && c.result === g.result)].push(g);
  }
  const alloc = allocate(
    members.map((m) => m.length),
    SAMPLE_SIZE,
  );

  const rand = mulberry32(SEED);
  const sampled = [];
  members.forEach((cell, i) => {
    // Sorting by id before the shuffle makes the permutation depend only on the cell's membership.
    const order = [...cell].sort((a, b) => Number(a.id) - Number(b.id));
    sampled.push(...shuffle(order, rand).slice(0, alloc[i]));
  });
  sampled.sort(byDateThenId);
  const sampledIds = new Set(sampled.map((g) => g.id));
  const devPool = eligible.filter((g) => !sampledIds.has(g.id));

  const cases = sampled.map((g) => ({
    id: g.id,
    game: `cc:${g.id}`,
    url: g.row.url,
    date: g.date,
    playerColor: g.isWhite ? 'w' : 'b',
    result: g.result,
    plies: g.plies,
    timeControl: g.row.time_control ?? null,
    termination: g.row.termination ?? null,
    opponent: g.row.opp ?? null,
    oppRating: g.row.oppRating ?? null,
    myRating: g.row.myRating ?? null,
    opening: openingSlug(g.row.ecoUrl),
    tags: [g.bucket, g.result, g.isWhite ? 'white' : 'black', g.row.termination ?? null],
  }));

  const gold = {};
  for (const g of eligible) {
    const { mine, opp } = g.row.accuracies;
    gold[g.id] = {
      white: g.isWhite ? mine : opp,
      black: g.isWhite ? opp : mine,
      mine,
      opp,
      file: g.file,
    };
  }
  const dev = devPool.map((g) => ({ id: g.id, file: g.file }));

  // The three files must agree with each other before anything is written.
  const caseIds = cases.map((c) => c.id);
  assert(cases.length === SAMPLE_SIZE && new Set(caseIds).size === SAMPLE_SIZE, 'the cases are not 60 unique games');
  assert(caseIds.every((id) => Object.hasOwn(gold, id)), 'a case has no gold entry');
  assert(dev.every((d) => !sampledIds.has(d.id)), 'the dev pool overlaps the cases');
  assert(cases.length + dev.length === eligible.length, 'the cases and the dev pool do not cover the eligible games');

  const laterFile = eligible.filter((g) => {
    const endedDay = Number.isFinite(g.row.endTime) ? ptDay(g.row.endTime) : null;
    return endedDay !== null && g.dayFile > endedDay;
  }).length;

  const markdown = inputsMarkdown({
    archive,
    eligible: eligible.length,
    ineligible,
    members,
    alloc,
    sampled,
    devCount: dev.length,
    laterFile,
    corrections: GOLD_CORRECTIONS,
  });

  fs.writeFileSync(path.join(OUT_DIR, 'cases.json'), json(cases));
  fs.writeFileSync(path.join(OUT_DIR, 'gold.json'), json(gold));
  fs.writeFileSync(path.join(OUT_DIR, 'dev-pool.json'), json(dev));
  fs.writeFileSync(path.join(OUT_DIR, 'inputs.md'), markdown);

  console.log(
    JSON.stringify(
      {
        rowsRead: archive.rowsRead,
        dayFiles: archive.files.length,
        uniqueGames: archive.games.length,
        idsInMoreThanOneRow: archive.idsInMoreThanOneRow,
        eligible: eligible.length,
        ineligible: Object.fromEntries(ineligible),
        sampled: cases.length,
        devPool: dev.length,
        strata: CELLS.map((c, i) => ({ cell: `${c.bucket} / ${c.result}`, eligible: members[i].length, sampled: alloc[i] })),
        laterFileThanGameDay: laterFile,
        outputs: [...FROZEN_FILES, 'inputs.md'].map((f) => path.join('private', FLOW, f)),
      },
      null,
      2,
    ),
  );
}

main();
