// What a walk through a game stops at, against a walk through every marked
// move: the README's measures on the archive's reviews (the design set) and,
// once games.mjs has reviewed them, on the held-out phone reviews, with the
// rule's verdict. Writes results/measure.json and results/review-walk.md.
//
//   bridge/run.sh projects/review-walk/measure.mjs
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  CAPS,
  COVERAGE_MEDIAN_ABOVE,
  COVERAGE_QUARTILE_BAR,
  HELDOUT_BEFORE,
  HELDOUT_GAMES,
  LONG_WALK,
  PROJECT,
  TURN_BAR,
  gitCommit,
  interval,
  quantile,
  readJson,
  reviewPath,
} from './lib.mjs'

const { WALK_MAX_ERRORS, WALK_MAX_HONORS, WALK_MATE_WITHIN, WALK_QUIET_ERRORS, lessonFor, reviewFromArchiveRow, seenOf, takeawayKey, turnOf, walkOf } = await chess('src/services/review/index.ts')
const { SERIOUS_ERRORS } = await chess('src/services/review/moments.ts')
const { ARCHIVE_SUBDIR, playerName, readDay } = await chess('src/adapters/node/archive/index.ts')
const { readChapters } = await chess('src/adapters/content/study.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')
// The screen's own reading of a stop: its cause note and the chapter it links.
const { ERROR_CLASS } = await chess('src/features/gamereview/format.ts')
const { causeOf, walkPlies } = await chess('src/features/gamereview/walkWords.ts')
const { gameLessons, lessonLinkAt } = await chess('src/features/gamereview/lessonLink.ts')

const sum = (values) => values.reduce((a, b) => a + b, 0)
const share = (n, of) => (of > 0 ? n / of : null)

function topCost(doc, pool, cap) {
  return sum(
    pool
      .map((i) => doc.records[i].lossPct)
      .sort((a, b) => b - a)
      .slice(0, cap),
  )
}

/** One game's numbers: what its marked moves are, what the walk keeps, and what other caps and rankings would keep. */
function gameRow(doc) {
  const errors = doc.moments.filter((i) => ERROR_CLASS.has(doc.records[i].cls))
  const serious = errors.filter((i) => SERIOUS_ERRORS.has(doc.records[i].cls))
  const total = sum(errors.map((i) => doc.records[i].lossPct))
  const seriousTotal = sum(serious.map((i) => doc.records[i].lossPct))
  const walk = walkOf(doc)
  const errorStops = walk.stops.filter((s) => ERROR_CLASS.has(doc.records[s.ply].cls))
  const held = sum(errorStops.map((s) => doc.records[s.ply].lossPct))
  const seriousHeld = sum(errorStops.filter((s) => SERIOUS_ERRORS.has(doc.records[s.ply].cls)).map((s) => doc.records[s.ply].lossPct))
  const mates = walk.stops.filter((s) => s.kind === 'mate').length
  const ranked = serious.length > 0 ? serious : errors
  const capOf = (cap) => (serious.length > 0 ? cap : Math.min(cap, WALK_QUIET_ERRORS))
  const caps = Object.fromEntries(CAPS.map((cap) => [cap, total > 0 ? topCost(doc, ranked, capOf(cap)) / total : null]))
  if (mates === 0 && total > 0 && Math.abs(caps[WALK_MAX_ERRORS] - held / total) > 1e-9) {
    throw new Error(`the cap curve at ${WALK_MAX_ERRORS} is not the app's walk: ${caps[WALK_MAX_ERRORS]} against ${held / total}`)
  }
  const seen = seenOf(doc)
  const turn = turnOf(doc)
  const hisTurn = turn && turn.by === doc.playerColor ? turn : null
  return {
    moments: doc.moments.length,
    errors: errors.length,
    serious: serious.length,
    stops: walk.stops.length,
    errorStops: errorStops.length,
    mates,
    honors: walk.stops.filter((s) => s.kind === 'honor').length,
    coverage: total > 0 ? held / total : null,
    seriousCoverage: seriousTotal > 0 ? seriousHeld / seriousTotal : null,
    caps,
    byCostAlone: total > 0 ? topCost(doc, errors, WALK_MAX_ERRORS) / total : null,
    softenedAhead: serious.length > 0 && errors.some((i) => !SERIOUS_ERRORS.has(doc.records[i].cls) && doc.records[i].lossPct > Math.min(...errorStops.map((s) => doc.records[s.ply].lossPct))),
    seen: seen ? walk.stops.some((s) => s.ply === seen.ply) : null,
    seenAt: seen ? (seen.ply + 1) / doc.records.length : null,
    turn: hisTurn ? walk.stops.some((s) => s.ply >= hisTurn.fromPly && s.ply <= hisTurn.toPly) : null,
    firstStop: walk.stops.length > 0 ? (walk.stops[0].ply + 1) / doc.records.length : null,
    errorPlies: errorStops.map((s) => s.ply),
    stopPlies: walkPlies(walk),
  }
}

function spreadOf(values) {
  return { median: quantile(values, 0.5), p75: quantile(values, 0.75), p90: quantile(values, 0.9), max: values.length ? Math.max(...values) : null }
}

function aggregate(rows) {
  const covered = rows.filter((r) => r.coverage !== null)
  const coverage = covered.map((r) => r.coverage)
  const seriousCoverage = rows.filter((r) => r.seriousCoverage !== null).map((r) => r.seriousCoverage)
  const seen = rows.filter((r) => r.seen !== null)
  const seenAt = seen.map((r) => r.seenAt)
  const turned = rows.filter((r) => r.turn !== null)
  return {
    games: rows.length,
    gamesWithErrors: covered.length,
    moments: spreadOf(rows.map((r) => r.moments)),
    longerThanFive: share(rows.filter((r) => r.moments > LONG_WALK).length, rows.length),
    stops: spreadOf(rows.map((r) => r.stops)),
    walkLongerThanFive: rows.filter((r) => r.stops > LONG_WALK).length,
    noStops: rows.filter((r) => r.stops === 0).length,
    mateStops: sum(rows.map((r) => r.mates)),
    honorStops: sum(rows.map((r) => r.honors)),
    coverage: {
      p10: quantile(coverage, 0.1),
      p25: quantile(coverage, 0.25),
      median: quantile(coverage, 0.5),
      medianInterval: interval(coverage, (xs) => quantile(xs, 0.5)),
      p25Interval: interval(coverage, (xs) => quantile(xs, 0.25)),
    },
    seriousCoverage: {
      games: seriousCoverage.length,
      whole: share(seriousCoverage.filter((v) => v > 1 - 1e-9).length, seriousCoverage.length),
      p10: quantile(seriousCoverage, 0.1),
      least: seriousCoverage.length ? Math.min(...seriousCoverage) : null,
    },
    caps: Object.fromEntries(
      CAPS.map((cap) => {
        const values = covered.map((r) => r.caps[cap])
        return [cap, { median: quantile(values, 0.5), p25: quantile(values, 0.25), whole: share(values.filter((v) => v > 1 - 1e-9).length, values.length) }]
      }),
    ),
    byCostAlone: { median: quantile(covered.map((r) => r.byCostAlone), 0.5), gamesItChanges: share(covered.filter((r) => r.softenedAhead).length, covered.length) },
    seen: { in: seen.filter((r) => r.seen).length, of: seen.length },
    seenAt: { p10: quantile(seenAt, 0.1), p25: quantile(seenAt, 0.25), median: quantile(seenAt, 0.5), p75: quantile(seenAt, 0.75), p90: quantile(seenAt, 0.9) },
    turn: { in: turned.filter((r) => r.turn).length, of: turned.length, share: share(turned.filter((r) => r.turn).length, turned.length) },
    firstStop: quantile(rows.filter((r) => r.firstStop !== null).map((r) => r.firstStop), 0.5),
  }
}

/** What the screen says at the walk's errors, on reviews that carry the engine lines a lesson card reads. */
function teaching(docs, rows, chapters) {
  const counts = { stops: 0, card: 0, theirReply: 0, yourChance: 0, noCause: 0, lesson: 0, games: 0, gamesWithLesson: 0 }
  docs.forEach((doc, k) => {
    if (rows[k].errorPlies.length === 0) return
    counts.games++
    if (gameLessons(doc, rows[k].stopPlies, chapters).length > 0) counts.gamesWithLesson++
    for (const ply of rows[k].errorPlies) {
      counts.stops++
      const card = lessonFor(doc, ply)
      if (!card) continue
      counts.card++
      const cause = causeOf(takeawayKey(card.takeaway))
      if (cause === 'their-reply') counts.theirReply++
      else if (cause === 'your-chance') counts.yourChance++
      else counts.noCause++
      if (lessonLinkAt(doc, ply, chapters)) counts.lesson++
    }
  })
  return counts
}

function archiveDocs() {
  const username = playerName(CHESS_DIR)
  const dir = join(CHESS_DIR, ARCHIVE_SUBDIR)
  const docs = []
  let unread = 0
  for (const day of readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
    for (const row of readDay(join(dir, day)) ?? []) {
      let doc = null
      try {
        doc = reviewFromArchiveRow(row, { username })
      } catch {
        doc = null
      }
      if (doc) docs.push(doc)
      else unread++
    }
  }
  return { docs, unread }
}

function heldoutDocs() {
  const dir = privateDir(PROJECT)
  const split = readJson(join(dir, 'heldout.json'))
  if (!split) return null
  const docs = []
  let missing = 0
  for (const g of split.games) {
    const doc = readJson(reviewPath(dir, g.id))
    if (doc) docs.push(doc)
    else missing++
  }
  return { docs, missing, sampled: split.games.length, app: split.app }
}

function verdictOf(h) {
  const checks = [
    { id: 'coverage-median', kind: 'bar', pass: h.coverage.medianInterval[0] > COVERAGE_MEDIAN_ABOVE, says: `the walk's errors hold more than ${COVERAGE_MEDIAN_ABOVE * 100}% of what his errors cost in the median game, the whole 95% interval above it` },
    { id: 'coverage-quartile', kind: 'bar', pass: h.coverage.p25 >= COVERAGE_QUARTILE_BAR, says: `they hold at least ${COVERAGE_QUARTILE_BAR * 100}% at the lower quartile` },
    { id: 'turn', kind: 'bar', pass: h.turn.of === 0 || h.turn.share >= TURN_BAR, says: `a stop lies inside the turn in at least ${TURN_BAR * 100}% of the games that turned on his own moves` },
    { id: 'length', kind: 'guard', pass: h.walkLongerThanFive === 0 && h.stops.median <= WALK_MAX_ERRORS, says: `no walk is longer than ${LONG_WALK} stops, and the median walk is at most ${WALK_MAX_ERRORS}` },
    { id: 'seen', kind: 'guard', pass: h.seen.in === h.seen.of, says: 'the costliest error, the one the overview names, is a stop in every game that has an error' },
  ]
  return { kept: checks.every((c) => c.pass), checks }
}

const pct = (v) => (v === null ? 'none' : `${(v * 100).toFixed(0)}%`)
const num = (v) => (v === null ? 'none' : Number.isInteger(v) ? String(v) : v.toFixed(1))

function table(name, a) {
  return [
    `### ${name}`,
    '',
    `${a.games} games, ${a.gamesWithErrors} with an error of his.`,
    '',
    '| | median | 75th | 90th | most |',
    '|---|---|---|---|---|',
    `| his marked moves a game (a walk through every one) | ${num(a.moments.median)} | ${num(a.moments.p75)} | ${num(a.moments.p90)} | ${num(a.moments.max)} |`,
    `| the walk's stops | ${num(a.stops.median)} | ${num(a.stops.p75)} | ${num(a.stops.p90)} | ${num(a.stops.max)} |`,
    '',
    `- Games with more than ${LONG_WALK} marked moves: ${pct(a.longerThanFive)}. Walks longer than ${LONG_WALK} stops: ${a.walkLongerThanFive}. Games with no stop: ${a.noStops}.`,
    `- What the walk's errors hold of what all his errors cost, inaccuracies included: ${pct(a.coverage.median)} in the median game (95% interval ${pct(a.coverage.medianInterval?.[0] ?? null)} to ${pct(a.coverage.medianInterval?.[1] ?? null)}), ${pct(a.coverage.p25)} at the lower quartile (${pct(a.coverage.p25Interval?.[0] ?? null)} to ${pct(a.coverage.p25Interval?.[1] ?? null)}), ${pct(a.coverage.p10)} at the lowest tenth.`,
    `- Of what his mistakes, misses and blunders cost, the walk holds all of it in ${pct(a.seriousCoverage.whole)} of the ${a.seriousCoverage.games} games that have one, ${pct(a.seriousCoverage.p10)} at the lowest tenth and ${pct(a.seriousCoverage.least)} at the least.`,
    `- The costliest error is a stop in ${a.seen.in} of ${a.seen.of} games. It comes ${pct(a.seenAt.median)} of the way into the median game, and anywhere from ${pct(a.seenAt.p10)} to ${pct(a.seenAt.p90)} between the lowest and highest tenth.`,
    `- A stop lies inside the turn in ${a.turn.in} of the ${a.turn.of} games that turned on his own moves.`,
    `- Stops for a mate let slip: ${a.mateStops}. Stops for a best move of his: ${a.honorStops}. The first stop comes ${pct(a.firstStop)} of the way into the median game.`,
    `- Ranked by cost alone, whatever the grade, and always filled to four, the stops would hold ${pct(a.byCostAlone.median)} in the median game; a softened error would take a mistake's place in ${pct(a.byCostAlone.gamesItChanges)} of the games.`,
    '',
    '| errors the walk may stop at | 1 | 2 | 3 | 4 | 5 | 6 |',
    '|---|---|---|---|---|---|---|',
    `| held in the median game | ${CAPS.map((c) => pct(a.caps[c].median)).join(' | ')} |`,
    `| held at the lower quartile | ${CAPS.map((c) => pct(a.caps[c].p25)).join(' | ')} |`,
    `| games it holds whole | ${CAPS.map((c) => pct(a.caps[c].whole)).join(' | ')} |`,
    '',
  ]
}

const app = gitCommit(CHESS_DIR)
const archive = archiveDocs()
const archiveRows = archive.docs.map(gameRow)
const out = {
  app,
  rule: { errors: WALK_MAX_ERRORS, quiet: WALK_QUIET_ERRORS, honors: WALK_MAX_HONORS, mateWithin: WALK_MATE_WITHIN },
  bars: { coverageMedianAbove: COVERAGE_MEDIAN_ABOVE, coverageQuartile: COVERAGE_QUARTILE_BAR, turn: TURN_BAR, long: LONG_WALK },
  archive: { unread: archive.unread, ...aggregate(archiveRows) },
  heldout: null,
  verdict: null,
}
const md = [
  '# The walk through a game: what it keeps',
  '',
  `Written by \`measure.mjs\` on the app at \`${app}\`. The walk stops at up to ${WALK_MAX_ERRORS} of his errors (his costliest mistakes, misses and blunders, then a mate within ${WALK_MATE_WITHIN} moves he let slip; with none of those, his ${WALK_QUIET_ERRORS} costliest inaccuracies) and ${WALK_MAX_HONORS} best move of his.`,
  '',
  ...table("The design set: the archive's reviews", out.archive),
]
const heldout = heldoutDocs()
if (heldout && heldout.docs.length > 0) {
  const rows = heldout.docs.map(gameRow)
  const chapters = readChapters(buildStudyFromDisk(CHESS_DIR).lessons)
  out.heldout = { sampled: heldout.sampled, missing: heldout.missing, reviewedAt: heldout.app, before: HELDOUT_BEFORE, asked: HELDOUT_GAMES, ...aggregate(rows), teaching: teaching(heldout.docs, rows, chapters) }
  out.verdict = verdictOf(out.heldout)
  const t = out.heldout.teaching
  md.push(
    ...table(`Held out: phone reviews of ${heldout.docs.length} games played before ${HELDOUT_BEFORE}`, out.heldout),
    `- Of the walk's ${t.stops} error stops, ${t.card} have a lesson card: ${t.theirReply} say he missed their reply, ${t.yourChance} that he missed his own chance, ${t.noCause} name neither. ${t.lesson} link a lesson chapter, and ${t.gamesWithLesson} of the ${t.games} games with an error stop show at least one chapter on the overview.`,
    '',
    '## The verdict',
    '',
    out.verdict.kept ? 'Kept: every check of the rule holds on the held-out games.' : 'Not kept: a check of the rule fails on the held-out games.',
    '',
    ...out.verdict.checks.map((c) => `- ${c.pass ? 'holds' : 'FAILS'} (${c.kind}): ${c.says}`),
    '',
  )
} else {
  md.push('The held-out games are not reviewed yet (`games.mjs`), so there is no verdict.', '')
}
const results = resultsDir(PROJECT)
writeFileSync(join(results, 'measure.json'), `${JSON.stringify(out, null, 1)}\n`)
writeFileSync(join(results, 'review-walk.md'), md.join('\n'))
console.error(`archive ${out.archive.games} games${out.heldout ? `, held out ${out.heldout.games}` : ''}; ${out.verdict ? (out.verdict.kept ? 'kept' : 'not kept') : 'no verdict yet'}`)
