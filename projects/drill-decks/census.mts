// Read the misses deck's theme words and the guess-the-plan quiz against the
// decks' own engine lines, by the rules in the README.
//
//   bridge/run.sh projects/drill-decks/census.mts
//
// Writes results/census.json (counts only); the per-item rows, which carry the
// deck's ids, go to private/drill-decks/.
import fs from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { classify } from './lib.mts'

const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)
const K = await load('src/services/knowledge/index.ts')
const L = await load('src/services/learner/index.ts')
const S = await load('src/services/exercises/index.ts')

const read = (rel: string) => JSON.parse(fs.readFileSync(join(CHESS_DIR, rel), 'utf8'))
const misses: any[] = read('public/coach/mistake-deck.json')
const quizzes: any[] = read('public/coach/plan-quizzes.json')

const rows: any[] = []
const unreadable = { best: 0, played: 0 }
// RETHEME=1 files each position again with the checkout's own labeller (a candidate's, under CHESS_DIR).
const retheme = process.env.RETHEME === '1'
for (const raw of misses) {
  if (raw.kind === 'deviation') continue
  const it = retheme && raw.kind !== 'missedMate' ? { ...raw, theme: K.themeOfBest(raw.fen, raw.best) } : raw
  const me: 'w' | 'b' = new Chess(it.fen).turn()
  const { best, played, shape, bestDelta, playedDelta, readable } = classify(it)
  if (!readable.best) unreadable.best++
  if (!readable.played) unreadable.played++
  const fits =
    it.theme === 'defensiveMove'
      ? shape === 'defensive'
      : ['hangingPiece', 'fork', 'attackingF2F7', 'skewer', 'discoveredAttack', 'pin'].includes(it.theme)
        ? best !== 'holds'
        : it.theme === 'mateIn1' || it.theme === 'backRankMate'
          ? best === 'mates'
          : null

  // What the explanations' reader says the best move does (gain findings for him).
  let named: string[] = []
  try {
    const facts = K.describeMove(it.fen, it.bestUci, { replyPv: [] })
    named = [...new Set<string>((facts?.findings ?? []).filter((f: any) => f.tone === 'gain' && f.actor === me).map((f: any) => f.conceptId))]
  } catch {
    named = []
  }
  rows.push({ id: it.id, kind: it.kind, theme: it.theme, best, played, shape, fits, named, competency: L.THEME_COMPETENCY[it.theme] ?? null, wpDrop: it.wpDrop ?? null, wpBefore: it.wpBefore ?? null, bestDelta, playedDelta })
}

const count = (xs: string[]) => Object.fromEntries(Object.entries(xs.reduce((m: Record<string, number>, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]))
const themes = [...new Set(rows.map((r) => r.theme))]
const byTheme: any = {}
for (const t of themes) {
  const rs = rows.filter((r) => r.theme === t)
  const scored = rs.filter((r) => r.fits !== null)
  byTheme[t] = {
    items: rs.length,
    competency: rs[0].competency,
    shape: count(rs.map((r) => r.shape)),
    best: count(rs.map((r) => r.best)),
    played: count(rs.map((r) => r.played)),
    fits: scored.length ? { k: scored.filter((r) => r.fits).length, n: scored.length } : null,
    // The full best x played table the shapes are read from.
    cross: count(rs.map((r) => `${r.best}/${r.played}`)),
    // Sensitivity, not a rule: the best line's gain when it is under the 2-point bar.
    smallGain: count(rs.filter((r) => r.best === 'holds').map((r) => String(r.bestDelta))),
    // What describeMove names on the attacking misses filed under this word.
    namedOnAttacking: count(rs.filter((r) => r.shape === 'attacking').flatMap((r) => (r.named.length ? r.named : ['(nothing)']))),
  }
}

// The quiz.
const quizRows = quizzes.map((q) => {
  const evals = q.options.map((o: any) => o.eval)
  const order = [...evals.keys()].sort((a, b) => evals[b] - evals[a])
  const right = q.options.filter((_: any, i: number) => S.planCorrect(q, i)).length
  const top = q.options[order[0]]
  const forcing = /[x+#]/.test(top.move)
  const lead = evals[order[0]] - evals[order[1]]
  const material = lead >= 200
  const playedBest = q.played === top.move
  return { id: q.id, phase: q.phase, right, forcing, material, lead, playedBest, plan: right === 1 && !forcing && !material }
})
const quiz = {
  items: quizRows.length,
  margin: S.PLAN_QUIZ_MARGIN,
  right: count(quizRows.map((r) => String(r.right))),
  forcing: quizRows.filter((r) => r.forcing).length,
  material: quizRows.filter((r) => r.material).length,
  forcingOrMaterial: quizRows.filter((r) => r.forcing || r.material).length,
  playedBest: quizRows.filter((r) => r.playedBest).length,
  plan: quizRows.filter((r) => r.plan).length,
  byPhase: count(quizRows.map((r) => r.phase)),
  planByPhase: count(quizRows.filter((r) => r.plan).map((r) => r.phase)),
}

const out = {
  project: 'drill-decks',
  app: (await import('node:child_process')).execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  misses: {
    items: misses.length,
    kinds: count(misses.map((m) => m.kind)),
    scored: rows.length,
    unreadable,
    themes: count(misses.map((m) => m.theme)),
    shape: count(rows.map((r) => r.shape)),
    cross: count(rows.map((r) => `${r.best}/${r.played}`)),
    feedsSkill: rows.filter((r) => r.competency !== null).length,
    byTheme,
  },
  quiz,
}
const tag = process.env.CANDIDATE ? `-${process.env.CANDIDATE}` : ''
fs.writeFileSync(join(resultsDir('drill-decks'), `census${tag}.json`), JSON.stringify({ ...out, candidate: process.env.CANDIDATE ?? null, retheme }, null, 1) + '\n')
fs.writeFileSync(join(privateDir('drill-decks'), `census-rows${tag}.json`), JSON.stringify({ misses: rows, quiz: quizRows }))
console.error(`census: ${rows.length} misses, ${quizRows.length} quizzes`)
