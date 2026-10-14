// The instrument in README.md: his puzzle first tries rebuilt from the memory
// cards, the app's learner folded on the record before each one, and the two
// solve chances it gives (the headline rating's and the view of the
// attempt's channel). The same replay runs over the profile as the app holds
// it. Also the learner's own self-check and the difficulty each estimate would
// aim a set at today. Rows go to private/, since the attempts are his.
//
//   bridge/run.sh projects/learner-solve-chance/replay.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'

const { loadProfile } = await chess('src/adapters/node/profile/index.ts')
const { nodeLearner } = await chess('src/adapters/node/learner/index.ts')
const { LEARNER_CONTENT } = await chess('src/data/learnerContent.ts')
const { catalogue } = await chess('src/services/learner/competencies.ts')
const { observations, byCompetency } = await chess('src/services/learner/evidence.ts')
const { foldAbilities } = await chess('src/services/learner/ability.ts')
const { channelOf } = await chess('src/services/learner/channels.ts')
const { solveChance, serveTarget, MIN_ATTEMPTS, LADDER_START } = await chess('src/services/learner/index.ts')
const { ptDayKey } = await chess('src/core/time/index.ts')

const loaded = loadProfile(join(CHESS_DIR, 'progress', 'profile.json'))
if (!loaded.ok) throw new Error(`the profile does not load: ${loaded.reason}`)
const held = loaded.profile
const cat = catalogue(LEARNER_CONTENT.buckets)
const endgameIds = new Set(LEARNER_CONTENT.endgameDrills.map((d) => d.id))

// The bank: each puzzle's bucket and Lichess rating.
const bank = JSON.parse(fs.readFileSync(join(CHESS_DIR, 'src', 'data', 'puzzles.json'), 'utf8'))
const itemOf = new Map()
for (const [bucket, items] of Object.entries(bank)) for (const it of items) itemOf.set(it.id, { bucket, rating: it.rating })

// ---------------------------------------------------------------- the rebuilt record
const cards = Object.entries(held.srs ?? {})
  .filter(([k]) => k.startsWith('puzzle:'))
  .map(([k, s]) => ({ id: k.slice('puzzle:'.length), reviews: (s.passes ?? 0) + (s.fails ?? 0), passes: s.passes ?? 0, lastAt: s.lastAt }))
const missingFromBank = cards.filter((c) => !itemOf.has(c.id)).length
if (missingFromBank) throw new Error(`${missingFromBank} puzzle cards are not in the bank`)
const isAttempt = (e) => e.type === 'attempt'
const puzzleEvents = new Map()
for (const e of held.events ?? []) if (isAttempt(e) && e.item.kind === 'puzzle') puzzleEvents.set(e.item.id, [...(puzzleEvents.get(e.item.id) ?? []), e])

const once = cards.filter((c) => c.reviews === 1)
const more = cards.filter((c) => c.reviews > 1)
// How the misses sit on the cards: a miss comes back as a redemption card, so
// a card reviewed once is nearly always a solve.
const failsOf = (set) => ({ cards: set.length, withFail: set.filter((c) => c.reviews - c.passes > 0).length, fails: set.reduce((a, c) => a + c.reviews - c.passes, 0) })
const selection = { once: failsOf(cards.filter((c) => c.reviews === 1)), more: failsOf(cards.filter((c) => c.reviews > 1)) }
const checks = { cards: cards.length, once: once.length, more: more.length, fromEvents: 0, rebuilt: 0, eventDisagree: 0, eventsOnMultiCards: 0 }
const rebuiltEvents = []
for (const c of once) {
  const evs = puzzleEvents.get(c.id)
  if (evs) {
    checks.fromEvents++
    // The card's one review and the event are the same attempt: one event, a first exposure, the same result.
    if (evs.length !== 1 || evs[0].first !== true || (evs[0].score >= 1 ? 1 : 0) !== c.passes || evs[0].at !== c.lastAt) checks.eventDisagree++
    continue
  }
  const { bucket, rating } = itemOf.get(c.id)
  checks.rebuilt++
  // The event the app's puzzle credit writes for a first try in a bucket's own set.
  rebuiltEvents.push({
    id: `rebuilt-${c.id}`,
    at: c.lastAt,
    v: 1,
    src: 'app',
    type: 'attempt',
    item: { kind: 'puzzle', id: c.id },
    tags: [{ c: bucket, role: 'primary' }],
    channel: 'themed',
    difficulty: { r: rating, src: 'lichess' },
    score: c.passes,
    first: true,
  })
}
for (const c of more) if (puzzleEvents.has(c.id)) checks.eventsOnMultiCards++
if (checks.eventDisagree || checks.eventsOnMultiCards) throw new Error(`events and cards disagree: ${JSON.stringify(checks)}`)

// The legacy log against the cards: an entry within a second of a
// once-reviewed card's review, with its bucket and rating, is that attempt
// (older builds stamped the two a few milliseconds apart); any other belongs to
// a card reviewed more than once.
const MATCH_MS = 1000
const log = { entries: (held.attempts ?? []).length, onceCards: 0, onceDisagree: 0, multiCards: 0, unexplained: 0 }
const matched = new Set()
for (const a of held.attempts ?? []) {
  const c = once.find((x) => !matched.has(x.id) && Math.abs(x.lastAt - a.at) <= MATCH_MS && itemOf.get(x.id).bucket === a.bucket && itemOf.get(x.id).rating === a.rating)
  if (c) {
    matched.add(c.id)
    log.onceCards++
    if (c.passes !== a.ok) log.onceDisagree++
    continue
  }
  const owner = more.find((m) => m.lastAt >= a.at && itemOf.get(m.id).bucket === a.bucket && itemOf.get(m.id).rating === a.rating)
  if (owner) log.multiCards++
  else log.unexplained++
}
if (log.onceDisagree || log.unexplained) throw new Error(`the legacy log and the cards disagree: ${JSON.stringify(log)}`)

const buckets = new Set([...Object.keys(held.puzzleStats ?? {}), ...rebuiltEvents.map((e) => e.tags[0].c)])
const rebuilt = {
  ...held,
  attempts: [],
  events: [...(held.events ?? []), ...rebuiltEvents].sort((a, b) => a.at - b.at),
  // No seed: the rebuilt record holds the first tries the totals count, and no working rating reaches the fold.
  puzzleStats: Object.fromEntries([...buckets].map((b) => [b, { attempts: 0, correct: 0 }])),
}

// ---------------------------------------------------------------- the replay
const isPuzzle = (o) => o.from === 'log' || (o.item ?? '').startsWith('puzzle:')
const rated = (o) => channelOf(o.channel) !== null && o.first !== false
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

/** The once-reviewed card a legacy log attempt is (its bucket and rating, within a second), or null. */
const cardAt = (o) => once.find((c) => Math.abs(c.lastAt - o.at) <= MATCH_MS && itemOf.get(c.id).bucket === o.competency && itemOf.get(c.id).rating === o.difficulty)?.id ?? null

/** The profile as it stood just before `t`, with the seed the whole record gives each skill. */
function before(profile, t, seeds) {
  const cut = { ...profile, attempts: (profile.attempts ?? []).filter((a) => a.at < t), events: (profile.events ?? []).filter((e) => e.at < t) }
  if (!seeds) return cut
  // The stored totals count every logged attempt too: keep them at the seed
  // plus what is logged before t, so the seed is the same at every moment and
  // nothing after t reaches it.
  const obs = observations(cut, cat)
  const stats = {}
  for (const [b, st] of Object.entries(profile.puzzleStats ?? {})) {
    const counted = obs.filter((o) => o.competency === b && isPuzzle(o))
    const seed = seeds.get(b) ?? { attempts: 0, correct: 0 }
    stats[b] = { ...st, attempts: seed.attempts + counted.length, correct: seed.correct + counted.filter((o) => o.score >= 1).length }
  }
  return { ...cut, puzzleStats: stats }
}

function replay(name, profile, withSeed) {
  const all = observations(profile, cat)
  let seeds = null
  if (withSeed) {
    const full = foldAbilities({ profile, catalogue: cat, observations: byCompetency(all), endgameIds, now: profile.updatedAt ?? 0 })
    seeds = new Map([...full].filter(([, st]) => st.seed).map(([id, st]) => [id, { attempts: st.seed.attempts, correct: st.seed.correct }]))
  }
  const rows = []
  const earlier = new Map()
  for (const o of all) {
    if (!rated(o)) continue
    const key = `${o.competency}|${channelOf(o.channel)}`
    const prior = earlier.get(key) ?? { n: 0, solved: 0 }
    if (isPuzzle(o) && prior.n > 0) {
      const t = o.at
      const cut = before(profile, t, seeds)
      const states = foldAbilities({ profile: cut, catalogue: cat, observations: byCompetency(observations(cut, cat)), endgameIds, now: t })
      const st = states.get(o.competency)
      if (!st) throw new Error(`${name}: no state for ${o.competency} at ${t}`)
      if (seeds) {
        const want = seeds.get(o.competency) ?? null
        const got = st.seed ? { attempts: st.seed.attempts, correct: st.seed.correct } : null
        if (JSON.stringify(want) !== JSON.stringify(got)) throw new Error(`${name}: the seed moved for ${o.competency} at ${t}`)
      }
      const view = st.channels[channelOf(o.channel)]
      if (!view) throw new Error(`${name}: no ${channelOf(o.channel)} view for ${o.competency} at ${t}`)
      rows.push({
        record: name,
        item: o.item ? o.item.slice('puzzle:'.length) : cardAt(o),
        day: ptDayKey(t),
        at: t,
        bucket: o.competency,
        channel: channelOf(o.channel),
        difficulty: o.difficulty,
        rd: o.difficultyRd,
        first: o.first,
        s: o.score >= 0.5 ? 1 : 0,
        head: solveChance(st.ability, o.difficulty, o.difficultyRd),
        view: solveChance({ rating: view.rating, rd: view.rd, volatility: st.ability.volatility }, o.difficulty, o.difficultyRd),
        run: clamp(prior.solved / prior.n, 0.01, 0.99),
        headRating: st.ability.rating,
        headRd: st.ability.rd,
        viewRating: view.rating,
        viewRd: view.rd,
        viewN: view.n,
      })
    }
    earlier.set(key, { n: prior.n + 1, solved: prior.solved + (o.score >= 0.5 ? 1 : 0) })
  }
  return rows
}

const rows = [...replay('rebuilt', rebuilt, false), ...replay('held', held, true)]

// ---------------------------------------------------------------- the record's shape
const firstTries = observations(rebuilt, cat).filter((o) => isPuzzle(o) && rated(o))
const shape = {
  firstTries: firstTries.length,
  firstTriesByBucket: Object.fromEntries([...new Set(firstTries.map((o) => o.competency))].sort().map((b) => [b, firstTries.filter((o) => o.competency === b).length])),
  span: { from: ptDayKey(firstTries[0].at), to: ptDayKey(firstTries[firstTries.length - 1].at) },
  heldPuzzleTotals: Object.values(held.puzzleStats ?? {}).reduce((a, s) => ({ attempts: a.attempts + (s?.attempts ?? 0), correct: a.correct + (s?.correct ?? 0) }), { attempts: 0, correct: 0 }),
}

// ---------------------------------------------------------------- the learner today
const now = held.updatedAt
const learner = nodeLearner(CHESS_DIR, { now })
const selfCheck = learner.calibration()
const today = learner
  .skills(now)
  .filter((s) => bank[s.id])
  .map((s) => {
    const pool = bank[s.id].map((p) => ({ id: p.id, rating: p.rating }))
    const phase = s.attempts < MIN_ATTEMPTS ? 'new' : 'core'
    const view = s.channels.themed
    return {
      bucket: s.id,
      phase,
      head: { rating: s.ability.rating, rd: s.ability.rd, target: serveTarget(s.ability, phase, pool, LADDER_START) },
      view: view ? { rating: view.rating, rd: view.rd, n: view.n, target: serveTarget({ ...s.ability, rating: view.rating, rd: view.rd }, phase, pool, LADDER_START) } : null,
      bankMax: Math.max(...pool.map((p) => p.rating)),
      bankSize: pool.length,
    }
  })

// Round 2 scores what the profile records after its last attempt here.
shape.lastAttempt = ptDayKey(Math.max(...(held.attempts ?? []).map((a) => a.at), ...(held.events ?? []).filter(isAttempt).map((e) => e.at)))
const pin = JSON.parse(fs.readFileSync(join(LAB_DIR, 'bridge', 'chess.json'), 'utf8'))
const dir = privateDir('learner-solve-chance')
fs.writeFileSync(join(dir, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
fs.writeFileSync(join(dir, 'state.json'), JSON.stringify({ app: pin.commit, checks, log, selection, shape, selfCheck, today, now }, null, 1) + '\n')
console.log(JSON.stringify({ rows: { rebuilt: rows.filter((r) => r.record === 'rebuilt').length, held: rows.filter((r) => r.record === 'held').length }, checks, log }, null, 1))
