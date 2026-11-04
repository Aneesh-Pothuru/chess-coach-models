#!/usr/bin/env node
// The lesson pick at every turning point of his archive, by the app's own
// code at CHESS_DIR: the purposes of each stored engine line's first move, the
// lesson chapters that teach them, the pick, and Maia-2's share of each move
// at his band. Writes one row per turning point to private/lesson-moves/ and
// the aggregates the README's rule reads to results/.
//
//   bridge/run.sh projects/lesson-moves/measure.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { COST_BAR, COVERAGE_BAR, DRAWS, HELDOUT_UNTIL, INSPECTED, PROJECT, SEED, TRAIN_UNTIL, bootstrapMean, gitCommit, lineOf, sansOf, share, splitOf } from './lib.mjs'

const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const E = await chess('src/services/engine/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const R = await chess('src/services/review/index.ts')
const St = await chess('src/services/study/index.ts')
const N = await chess('src/adapters/node/engine/index.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveDays } = await chess('src/adapters/node/archive/days.ts')
const { verdictTalk } = await chess('src/services/publishing/lint/verdictTalk.ts')

const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const study = buildStudyFromDisk(CHESS_DIR)
const chapters = St.lessonChapters(study.lessons, (spot, line) => K.movePurposes(spot.fen, spot.uci, { pv: line }))
const titles = new Map(study.lessons.map((l) => [l.id, l.title]))
const holds = new Set(R.TEACHING_HOLDS.player)

const skipped = {}
const skip = (why) => {
  skipped[why] = (skipped[why] ?? 0) + 1
}

const winFor = (e, me) => Sc.winPercentFor(e, me)

const days = loadArchiveDays({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })
const rows = []
let gameIndex = 0
let examined = 0
for (const day of days) {
  const split = splitOf(day.date)
  for (const g of day.games) {
    const game = gameIndex++
    if (!split) {
      skip(INSPECTED.includes(day.date) ? 'game: a day read while designing' : 'game: after the held-out days')
      continue
    }
    if (typeof g.myRating !== 'number') {
      skip('game: no rating')
      continue
    }
    const me = g.meIsWhite ? 'w' : 'b'
    const band = E.defaultMaiaElo(g.myRating, E.DEFAULT_LICHESS_OFFSET)
    const replayed = C.replaySans(C.START_FEN, g.sans ?? [])
    for (const e of g.deep ?? []) {
      examined++
      if (typeof e.ply !== 'number' || !e.fen || C.sideToMove(e.fen) !== me) {
        skip('turning point: not his move')
        continue
      }
      if (replayed.fens[e.ply] !== e.fen) {
        skip('turning point: the game does not reach it')
        continue
      }
      const pos = C.position(C.START_FEN, replayed.ucis.slice(0, e.ply))
      const alts = (e.alts ?? [])
        .map((a) => ({ pv: lineOf(C, e.fen, sansOf(a.line)), eval: Sc.fromArchiveCp(a.eval, me) }))
        .filter((a) => a.pv.length > 0 && a.eval)
      if (alts.length === 0) {
        skip('turning point: no stored line')
        continue
      }
      const hp = await engine.humanPolicy(pos, { bands: [band] })
      if (hp === 'unavailable') throw new Error('the human model is unavailable')
      const policy = hp.bands[0]?.policy ?? {}
      const bar = alts[0].eval
      const seen = new Set()
      const candidates = []
      for (const a of alts) {
        const move = a.pv[0]
        if (seen.has(move)) continue
        seen.add(move)
        const graded = R.gradeEvals(bar, a.eval, me)
        const purposes = K.movePurposes(e.fen, move, { pv: a.pv }).map((p) => ({ ...p, lessons: St.lessonsFor(chapters, p) }))
        candidates.push({ move, san: C.uciToSan(e.fen, move) ?? move, share: policy[move] ?? null, verdict: graded.verdict, lossPct: Math.max(0, winFor(bar, me) - winFor(a.eval, me)), purposes })
      }
      const played = C.sanToUci(e.fen, e.san)
      const playedLine = played ? lineOf(C, e.fen, [e.san, ...sansOf(e.punish)]) : []
      const playedPurposes = played ? K.movePurposes(e.fen, played, { pv: playedLine.length ? playedLine : [played] }) : []
      const pick = R.pickLessonMove(candidates, playedPurposes)
      if (!pick) {
        skip('turning point: no candidate graded')
        continue
      }
      const holding = candidates.filter((c) => holds.has(c.verdict))
      const natural = [...holding].sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || a.lossPct - b.lossPct)[0] ?? null
      const top = candidates[0]
      const L = pick.candidate
      const lesson = pick.purpose?.lessons?.[0] ?? null
      rows.push({
        day: day.date,
        split,
        game,
        ply: e.ply,
        band,
        candidates: candidates.length,
        holding: holding.length,
        taught: holding.filter((c) => c.purposes.some((p) => p.lessons.length > 0)).length,
        reason: pick.reason,
        purpose: pick.purpose?.kind ?? null,
        lesson: lesson ? { id: lesson.lesson, chapter: lesson.chapter, score: lesson.score } : null,
        playedKinds: playedPurposes.map((p) => p.kind),
        pick: { move: L.move, share: L.share, loss: L.lossPct, verdict: L.verdict, kinds: L.purposes.map((p) => p.kind) },
        top: { move: top.move, share: top.share, loss: top.lossPct, kinds: top.purposes.map((p) => p.kind), taught: top.purposes.some((p) => p.lessons.length > 0) },
        natural: natural ? { move: natural.move, share: natural.share, loss: natural.lossPct } : null,
        fen: e.fen,
        played: played,
      })
    }
  }
}
engine.dispose?.()

writeFileSync(join(privateDir(PROJECT), 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

const taughtReason = (r) => r.reason === 'lesson' || r.reason === 'lesson-shared'
function measures(list) {
  const coverage = share(list, taughtReason)
  const fresh = share(list, (r) => r.reason === 'lesson')
  const cost = bootstrapMean(list, (r) => r.pick.loss)
  const worst = Math.max(...list.map((r) => r.pick.loss))
  const outside = list.filter((r) => !holds.has(r.pick.verdict)).length
  const findability = bootstrapMean(list, (r) => (r.pick.share ?? 0) - (r.top.share ?? 0))
  const vsNatural = bootstrapMean(list.filter((r) => r.natural), (r) => (r.pick.share ?? 0) - (r.natural.share ?? 0))
  const isTop = share(list, (r) => r.pick.move === r.top.move)
  const isNatural = share(list, (r) => r.natural && r.pick.move === r.natural.move)
  const topTaught = share(list, (r) => r.top.taught)
  const purposes = {}
  for (const r of list.filter(taughtReason)) purposes[r.purpose] = (purposes[r.purpose] ?? 0) + 1
  const lessons = new Set(list.filter((r) => r.lesson).map((r) => r.lesson.id))
  const chaptersNamed = new Set(list.filter((r) => r.lesson).map((r) => `${r.lesson.id}:${r.lesson.chapter}`))
  const reasons = {}
  for (const r of list) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
  const games = new Set(list.map((r) => r.game)).size
  const passes = {
    coverage: coverage.p !== null && coverage.p >= COVERAGE_BAR,
    cost: cost.mean !== null && cost.mean <= COST_BAR && outside === 0,
    findability: findability.ci !== null && findability.ci[0] > 0,
  }
  return {
    turningPoints: list.length,
    games,
    coverage,
    fresh,
    cost: { ...cost, worst, outside },
    findability,
    vsNatural,
    isTop,
    isNatural,
    topTaught,
    reasons,
    purposes,
    lessonsNamed: lessons.size,
    chaptersNamed: chaptersNamed.size,
    passes,
    kept: passes.coverage && passes.cost && passes.findability,
  }
}

const bySplit = { train: measures(rows.filter((r) => r.split === 'train')), heldout: measures(rows.filter((r) => r.split === 'heldout')) }

const videos = days
  .filter((d) => d.date >= '2026-10-01')
  .map((d) => d.date)
let verdictLines = 0
let videoCount = 0
for (const date of videos) {
  const file = join(CHESS_DIR, 'coach-log', 'review-annotations', `${date}.video.json`)
  if (!existsSync(file)) continue
  videoCount++
  const script = JSON.parse(readFileSync(file, 'utf8'))
  for (const s of script.scenes ?? []) for (const b of s.beats ?? []) if (verdictTalk(b.say) || verdictTalk(b.caption)) verdictLines++
}

const named = {}
for (const r of rows.filter(taughtReason)) {
  const by = (named[r.purpose] ??= {})
  const key = `${r.lesson.id}:${r.lesson.chapter}`
  by[key] = (by[key] ?? 0) + 1
}
const chapterOf = new Map(chapters.map((c) => [`${c.lesson}:${c.chapter}`, c]))
const lessonsByPurpose = Object.fromEntries(
  Object.entries(named)
    .sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0))
    .map(([kind, by]) => [
      kind,
      Object.entries(by)
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => ({ lesson: chapterOf.get(key).lesson, title: chapterOf.get(key).title, chapter: chapterOf.get(key).chapter, idea: chapterOf.get(key).idea, n })),
    ]),
)

const out = {
  project: PROJECT,
  app: { commit: gitCommit(CHESS_DIR), archive: ARCHIVE_SUBDIR, lessons: study.lessons.length, chapters: chapters.length },
  design: { trainUntil: TRAIN_UNTIL, heldoutUntil: HELDOUT_UNTIL, inspected: INSPECTED, draws: DRAWS, seed: SEED, coverageBar: COVERAGE_BAR, costBar: COST_BAR, holds: [...holds] },
  examined,
  skipped,
  bySplit,
  kept: bySplit.train.kept && bySplit.heldout.kept,
  verdictTalk: { since: '2026-10-01', videos: videoCount, lines: verdictLines },
  lessonsByPurpose,
}
writeFileSync(join(resultsDir(PROJECT), 'lesson-moves.json'), JSON.stringify(out, null, 1) + '\n')

const pct = (x) => (x === null ? '--' : `${(100 * x).toFixed(1)}%`)
const ci = (b) => (b.mean === null ? '--' : `${b.mean.toFixed(3)} (${b.ci[0].toFixed(3)} to ${b.ci[1].toFixed(3)})`)
const md = [
  '# lesson-moves: the lesson pick at his turning points',
  '',
  `Written by \`measure.mjs\` on the app at \`${out.app.commit}\`: ${out.app.lessons} lessons, ${out.app.chapters} chapters, the archive's turning points with him to move.`,
  '',
  '| | train | held out |',
  '|---|---|---|',
  `| turning points (games) | ${bySplit.train.turningPoints} (${bySplit.train.games}) | ${bySplit.heldout.turningPoints} (${bySplit.heldout.games}) |`,
  `| taught by a lesson (\`lesson\` or \`lesson-shared\`) | ${pct(bySplit.train.coverage.p)} | ${pct(bySplit.heldout.coverage.p)} |`,
  `| taught for a purpose his move lacked (\`lesson\`) | ${pct(bySplit.train.fresh.p)} | ${pct(bySplit.heldout.fresh.p)} |`,
  `| the pick's loss against the engine's first line, win% | ${ci(bySplit.train.cost)} | ${ci(bySplit.heldout.cost)} |`,
  `| the pick's largest loss, and picks outside the holding verdicts | ${bySplit.train.cost.worst.toFixed(1)}, ${bySplit.train.cost.outside} | ${bySplit.heldout.cost.worst.toFixed(1)}, ${bySplit.heldout.cost.outside} |`,
  `| the pick's share minus the engine's first line's | ${ci(bySplit.train.findability)} | ${ci(bySplit.heldout.findability)} |`,
  `| the pick's share minus the natural move's | ${ci(bySplit.train.vsNatural)} | ${ci(bySplit.heldout.vsNatural)} |`,
  `| the pick is the engine's first line | ${pct(bySplit.train.isTop.p)} | ${pct(bySplit.heldout.isTop.p)} |`,
  `| the pick is the natural move | ${pct(bySplit.train.isNatural.p)} | ${pct(bySplit.heldout.isNatural.p)} |`,
  `| a lesson teaches the engine's first line | ${pct(bySplit.train.topTaught.p)} | ${pct(bySplit.heldout.topTaught.p)} |`,
  `| lessons named (chapters) | ${bySplit.train.lessonsNamed} (${bySplit.train.chaptersNamed}) | ${bySplit.heldout.lessonsNamed} (${bySplit.heldout.chaptersNamed}) |`,
  '',
  `By the README's rule: coverage ${bySplit.train.passes.coverage && bySplit.heldout.passes.coverage ? 'passes' : 'fails'}, cost ${bySplit.train.passes.cost && bySplit.heldout.passes.cost ? 'passes' : 'fails'}, findability ${bySplit.train.passes.findability && bySplit.heldout.passes.findability ? 'passes' : 'fails'}: the pick is ${out.kept ? 'kept' : 'not kept'}.`,
  '',
  `The reasons: train ${JSON.stringify(bySplit.train.reasons)}, held out ${JSON.stringify(bySplit.heldout.reasons)}.`,
  '',
  `The purposes a lesson pick is taught for: train ${JSON.stringify(bySplit.train.purposes)}, held out ${JSON.stringify(bySplit.heldout.purposes)}.`,
  '',
  'The lessons a lesson pick names, by what the pick is for (both splits; described, not tested):',
  '',
  '| purpose | lesson, chapter: picks |',
  '|---|---|',
  ...Object.entries(lessonsByPurpose).map(([kind, list]) => `| ${kind} | ${list.slice(0, 4).map((l) => `${l.lesson} "${l.title}", ch. ${l.chapter} "${l.idea}": ${l.n}`).join('; ')}${list.length > 4 ? `; ${list.length - 4} more` : ''} |`),
  '',
  `Verdict lines (the app's \`verdictTalk\`) in the ${videoCount} daily videos since 2026-10-01: ${verdictLines}.`,
  '',
  `Skipped: ${JSON.stringify(skipped)}.`,
  '',
].join('\n')
writeFileSync(join(resultsDir(PROJECT), 'lesson-moves.md'), md)
console.log(md)
