// Phase one's timing slice. No class, loss, accuracy, serious-error or
// agreement measure is read here. Whole review documents remain private.
// Run one process per profile with nice -n 10; run at most two at once.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CHESS_DIR, LAB_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { startReview } = await chess('src/services/review/index.ts')
const { gatherDeepEvidence } = await chess('src/services/review/pipeline/evidence.ts')
const { positionAt, replayGame } = await chess('src/services/review/pipeline/replay.ts')
const { profileSettings } = await chess('src/services/review/profiles.ts')

const ROOT = privateDir('second-look-fresh')
const PROFILES = ['phone', 'desktop', 'routine']
const pin = JSON.parse(readFileSync(join(LAB_DIR, 'bridge/chess.json'), 'utf8'))
const hash = (x) => createHash('sha256').update(x).digest('hex')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
function atomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(value) + '\n')
  renameSync(file + '.tmp', file)
}
function insist(ok, what) { if (!ok) throw new Error(what) }
function argsOf(argv) {
  const a = { variant: null, profile: null, reference: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--variant') a.variant = argv[++i]
    else if (argv[i] === '--profile') a.profile = argv[++i]
    else if (argv[i] === '--reference') a.reference = true
    else if (argv[i] === '--all') a.all = true
    else if (argv[i] === '--phase2') a.phase2 = true
    else if (argv[i] === '--shard') a.shard = argv[++i]
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  insist(a.reference || (['baseline', 'candidate'].includes(a.variant) && PROFILES.includes(a.profile)),
    'use --variant baseline|candidate --profile phone|desktop|routine, or --reference')
  insist(!a.reference || (!a.variant && !a.profile && !a.all), '--reference is a separate baseline timing command')
  insist(!a.all || (a.phase2 && !a.reference), '--all requires --phase2 and a review profile')
  insist(!a.shard || (a.all && /^[01]\/2$/.test(a.shard)), '--shard is 0/2 or 1/2 with --all')
  return a
}
const args = argsOf(process.argv.slice(2))
const expectedApp = args.variant === 'candidate'
  ? join(LAB_DIR, '.cache/chess/candidates/second-look-fresh')
  : join(LAB_DIR, '.cache/chess', pin.commit)
insist(resolve(CHESS_DIR) === expectedApp, 'CHESS_DIR does not name this variant of the pinned app')
if (args.variant === 'candidate') {
  const manifest = read(join(ROOT, 'candidate-manifest.json'))
  insist(manifest.appCommit === pin.commit && manifest.recordsCommit === pin.records, 'candidate manifest uses another pin')
  for (const r of manifest.replacements) insist(hash(readFileSync(join(CHESS_DIR, r.path))) === r.candidateSha256,
    'candidate app no longer matches its manifest')
}
const rows = read(join(ROOT, 'games.json'))
insist(rows.length === 60 && rows[0]?.game, 'prepare the frozen games first')
const item = rows[0]
const game = item.game
const replay = replayGame(game)
insist(!replay.partial, 'the timing game must replay completely')
const inputHash = hash(JSON.stringify(item))
const sourceHash = hash([
  'src/services/review/pipeline/run.ts', 'src/services/review/pipeline/evidence.ts',
  'src/services/review/ports.ts', 'src/adapters/node/engine/index.ts',
].map((p) => readFileSync(join(CHESS_DIR, p), 'utf8')).join('\n'))
const fingerprint = hash(JSON.stringify({ version: 1, inputHash, sourceHash, pin, args }))
const probeFile = (variant, profile) => join(ROOT, 'probe', variant, `${profile}.json`)

// Only the existence of an actual second look selects these positions. No
// verdict or strength of disagreement enters this timing slice.
function looked(variant, profile) {
  const p = probeFile(variant, profile)
  insist(existsSync(p), `finish the ${variant} ${profile} probe first`)
  const prior = read(p)
  insist(prior.inputHash === inputHash, 'probe input changed')
  return new Set(prior.looks.map((x) => x.index))
}
function baselineCommon() {
  const sets = PROFILES.map((p) => looked('baseline', p))
  const common = [...sets[0]].filter((i) => sets.every((s) => s.has(i))).sort((a, b) => a - b)
  insist(common.length >= 2, 'fewer than two common baseline second-look positions')
  return common.slice(0, 2)
}
function qualityCommon() {
  const union = new Set()
  for (const p of PROFILES) {
    const b = looked('baseline', p)
    const c = looked('candidate', p)
    for (const i of b) if (c.has(i)) union.add(i)
  }
  const common = [...union].sort((a, b) => a - b)
  insist(common.length >= 2, 'fewer than two reference timing positions')
  return common.slice(0, 2)
}

function instrument(engine) {
  const calls = []
  const state = { stage: 'sweep' }
  const timed = new Set(['evaluate', 'bestMoves', 'scoreMove', 'newGame', 'tablebase', 'humanPolicy', 'findability', 'compare'])
  const proxy = new Proxy(engine, {
    get(target, name) {
      const value = Reflect.get(target, name, target)
      if (typeof value !== 'function') return value
      if (!timed.has(name)) return value.bind(target)
      return async (...a) => {
        const t = performance.now()
        const budget = name === 'evaluate' ? a[1] : name === 'scoreMove' ? a[2]?.budget : a[1]?.budget
        const call = { method: name, stage: state.stage, index: a[0]?.moves?.length ?? null,
          budget: budget ?? null, multiPv: a[1]?.multiPv ?? null, seconds: null, depth: null, failed: false }
        calls.push(call)
        try {
          const result = await value.apply(target, a)
          call.depth = Number.isFinite(result?.depth) ? result.depth : null
          return result
        } catch (e) {
          call.failed = true
          throw e
        } finally { call.seconds = (performance.now() - t) / 1000 }
      }
    },
  })
  return { engine: proxy, calls, state }
}
function timing(calls) {
  const byMethod = {}
  for (const c of calls) {
    const k = `${c.stage}/${c.method}`
    const cell = byMethod[k] ??= { calls: 0, seconds: 0, depthN: 0, depthSum: 0, failed: 0 }
    cell.calls++
    cell.seconds += c.seconds
    cell.failed += Number(c.failed)
    if (c.depth !== null) { cell.depthN++; cell.depthSum += c.depth }
  }
  return byMethod
}

async function runReviewProbe() {
  const out = probeFile(args.variant, args.profile)
  if (existsSync(out)) {
    const prior = read(out)
    insist(prior.fingerprint === fingerprint, 'stale probe; move its private output aside before rerunning')
    console.log(JSON.stringify({ resumed: true, ...prior.summary }))
    return
  }
  const determinismIndices = args.variant === 'candidate' ? baselineCommon() : []
  const node = createNodeEngine({ root: CHESS_DIR, evalCache: false, pool: 1 })
  const { engine, calls, state } = instrument(node)
  const looks = []
  let lastLookCall = 0
  const started = performance.now()
  try {
    const run = startReview(engine, game, { profile: args.profile, playerColor: game.me ?? 'w' })
    const unsubscribe = run.subscribe((e) => {
      if (e.type === 'provisional') {
        state.stage = 'verify'
        lastLookCall = calls.length
      } else if (e.type === 'verified') {
        const own = calls.slice(lastLookCall)
        insist(own.every((c) => c.index === null || c.index === e.index), 'a look crossed positions')
        looks.push({ index: e.index, seconds: own.reduce((s, c) => s + c.seconds, 0),
          depth: e.evidence.depth, calls: own, evidence: e.evidence })
        lastLookCall = calls.length
      } else if (e.type === 'progress' && e.stage === 'verify' && e.stageDone === e.stageTotal) {
        state.stage = 'after-verification'
      }
    })
    const doc = await run.result
    unsubscribe()
    const seconds = (performance.now() - started) / 1000
    insist(doc?.schema === 'game-review/2' && doc.records.length === replay.played.length, 'incomplete review document')
    insist(doc.provenance.profile === args.profile, 'wrong review profile')
    const reviewCalls = calls.slice()
    const checks = []
    state.stage = 'determinism'
    const settings = profileSettings(args.profile)
    for (const index of determinismIndices) for (const nodes of [settings.verifyNodes, settings.verifyNodes * 2]) {
      await engine.newGame('analyst')
      const t = performance.now()
      const evidence = await gatherDeepEvidence(engine, positionAt(replay, index), replay.played[index].uci,
        { budget: { nodes }, multiPv: settings.verifyMultiPv, priority: 'batch' })
      checks.push({ index, nodes, seconds: (performance.now() - t) / 1000, evidence })
    }
    const summary = { variant: args.variant, profile: args.profile, plies: doc.records.length,
      seconds, looks: looks.length, verifySeconds: looks.reduce((s, x) => s + x.seconds, 0),
      verifyDepths: looks.map((x) => x.depth), calls: timing(reviewCalls),
      determinismSearches: checks.length, build: doc.provenance.build }
    atomic(out, { fingerprint, inputHash, sourceHash, app: pin.commit, records: pin.records,
      caseIndex: item.caseIndex, summary, looks, calls: reviewCalls, checks, doc })
    console.log(JSON.stringify(summary))
  } finally { node.dispose() }
}

async function runReferenceProbe() {
  const out = join(ROOT, 'probe', 'reference.json')
  if (existsSync(out)) {
    const prior = read(out)
    insist(prior.fingerprint === fingerprint, 'stale reference probe; move its private output aside before rerunning')
    console.log(JSON.stringify({ resumed: true, ...prior.summary }))
    return
  }
  const indices = qualityCommon()
  const settings = profileSettings('routine')
  const probes = []
  for (const index of indices) {
    const node = createNodeEngine({ root: CHESS_DIR, evalCache: false, pool: 1 })
    const { engine, calls, state } = instrument(node)
    state.stage = 'reference'
    try {
      await engine.newGame('analyst')
      const t = performance.now()
      const evidence = await gatherDeepEvidence(engine, positionAt(replay, index), replay.played[index].uci,
        { budget: { nodes: settings.verifyNodes * 10 }, multiPv: settings.verifyMultiPv, priority: 'batch' })
      probes.push({ index, seconds: (performance.now() - t) / 1000, evidence, calls })
    } finally { node.dispose() }
  }
  const summary = { positions: probes.length, nodes: settings.verifyNodes * 10,
    seconds: probes.reduce((s, x) => s + x.seconds, 0),
    depths: probes.map((x) => x.evidence.depth), calls: timing(probes.flatMap((x) => x.calls)) }
  atomic(out, { fingerprint, inputHash, sourceHash, app: pin.commit, records: pin.records,
    caseIndex: item.caseIndex, summary, probes })
  console.log(JSON.stringify(summary))
}

// Full timing is a second pass through the same pipeline after the actual CLI
// builder. This deliberately costs another build: a passive observer receives
// the exact pre-teaching evidence, without changing the app or its CLI. It is
// allowed only in phase two. Equality to the CLI's core document is required
// before a timing file can be kept; both files stay under private/.
async function runFullTiming() {
  const cases = read(join(ROOT, 'cases.json'))
  insist(cases.length === rows.length, 'case/game length mismatch')
  const shard = args.shard ? Number(args.shard.split('/')[0]) : null
  let completed = 0
  let resumed = 0
  const project = join(ROOT, args.variant)
  for (const [ordinal, one] of rows.entries()) {
    if (shard !== null && ordinal % 2 !== shard) continue
    const c = cases[ordinal]
    const canonicalFile = join(project, 'evidence', args.profile, `${c.id}.json`)
    insist(existsSync(canonicalFile), `CLI document missing for case ${ordinal + 1}`)
    const canonical = read(canonicalFile)
    const comparable = (doc) => ({ positions: doc.positions, records: doc.records,
      provenance: doc.provenance, coverage: doc.coverage })
    const canonicalHash = hash(JSON.stringify(comparable(canonical)))
    const oneInputHash = hash(JSON.stringify(one))
    const oneFingerprint = hash(JSON.stringify({ version: 1, inputHash: oneInputHash,
      sourceHash, pin, variant: args.variant, profile: args.profile, canonicalHash }))
    const out = join(project, 'timed', args.profile, `${c.id}.json`)
    if (existsSync(out)) {
      insist(read(out).fingerprint === oneFingerprint, `stale full timing for case ${ordinal + 1}`)
      resumed++
      continue
    }
    const oneReplay = replayGame(one.game)
    insist(!oneReplay.partial, `partial source game at case ${ordinal + 1}`)
    const node = createNodeEngine({ root: CHESS_DIR, evalCache: false, pool: 1 })
    const { engine, calls, state } = instrument(node)
    const looks = []
    let lastLookCall = 0
    const started = performance.now()
    try {
      const run = startReview(engine, one.game, { profile: args.profile, playerColor: one.game.me ?? 'w' })
      const unsubscribe = run.subscribe((e) => {
        if (e.type === 'provisional') {
          state.stage = 'verify'
          lastLookCall = calls.length
        } else if (e.type === 'verified') {
          const own = calls.slice(lastLookCall)
          insist(own.every((x) => x.index === null || x.index === e.index), 'a look crossed positions')
          looks.push({ index: e.index, seconds: own.reduce((s, x) => s + x.seconds, 0),
            depth: e.evidence.depth, calls: own, evidence: e.evidence })
          lastLookCall = calls.length
        } else if (e.type === 'progress' && e.stage === 'verify' && e.stageDone === e.stageTotal) {
          state.stage = 'after-verification'
        }
      })
      const doc = await run.result
      unsubscribe()
      const seconds = (performance.now() - started) / 1000
      insist(doc?.schema === 'game-review/2' && doc.records.length === oneReplay.played.length,
        `incomplete timed review at case ${ordinal + 1}`)
      insist(doc.provenance.profile === args.profile, 'wrong timed review profile')
      insist(hash(JSON.stringify(comparable(doc))) === canonicalHash,
        `timed review does not reproduce the CLI document at case ${ordinal + 1}; no timing kept`)
      const summary = { variant: args.variant, profile: args.profile, plies: doc.records.length,
        seconds, looks: looks.length, verifySeconds: looks.reduce((s, x) => s + x.seconds, 0),
        verifyDepths: looks.map((x) => x.depth), calls: timing(calls), build: doc.provenance.build }
      atomic(out, { fingerprint: oneFingerprint, inputHash: oneInputHash, sourceHash,
        app: pin.commit, records: pin.records, caseIndex: one.caseIndex,
        canonicalHash, summary, looks, calls, doc })
      completed++
      console.error(`[${args.variant}/${args.profile}] case ${ordinal + 1} timed; ${Math.round(seconds)}s`)
    } finally { node.dispose() }
  }
  console.log(JSON.stringify({ variant: args.variant, profile: args.profile, completed, resumed }))
}

await (args.all ? runFullTiming() : args.reference ? runReferenceProbe() : runReviewProbe())
