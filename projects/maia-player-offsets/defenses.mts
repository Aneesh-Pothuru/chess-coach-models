// Descriptive sensitivity beside the frozen verdict. All selection, bands,
// probabilities, rounding and probe construction come from the app.
import fs from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { CHESS_DIR, LAB_DIR, chess } from '../../bridge/lib/chess.mjs'
import { dir, pin, read, hash } from './io.mjs'

async function main() {
const project = join(LAB_DIR, 'projects/maia-player-offsets')
const home = join(dir, 'defenses')
const manifestFile = join(project, 'defenses-manifest.json')
const inputsFile = join(home, 'inputs.json')
const args = process.argv.slice(2)
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
function atomic(file: string, value: unknown) {
  fs.mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}
function preserve(file: string, value: unknown) {
  if (fs.existsSync(file)) check(digest(read(file)) === digest(value), 'frozen defense inputs or source changed')
  else atomic(file, value)
}
const labFiles = [
  'bridge/chess.json', 'bridge/run.sh', 'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs',
  'projects/maia-player-offsets/io.mjs', 'projects/maia-player-offsets/defenses.mts',
  'projects/maia-player-offsets/launch-defenses.py',
]
const appFiles = [
  'src/services/review/pipeline/defenses.ts', 'src/services/review/lessons.ts',
  'src/services/review/pipeline/replay.ts', 'src/services/review/pipeline/evidence.ts',
  'src/services/review/profiles.ts', 'src/services/review/pipeline/run.ts',
  'src/services/review/moments.ts', 'src/services/review/contracts.ts',
  'src/services/knowledge/detectors/lesson.ts', 'src/services/engine/maia/levels.ts',
  'src/services/engine/maia/human.ts', 'src/services/engine/maia/encode.ts',
  'src/services/engine/maia/model.ts', 'src/services/engine/service.ts',
  'src/services/engine/budgets.ts', 'src/services/review/archive/read.ts',
  'src/services/publishing/review/lessons.ts', 'src/adapters/node/engine/index.ts',
  'src/adapters/node/engine/human.ts', 'src/services/publishing/contracts.ts',
  'package-lock.json',
]
const sources = () => ({
  lab: Object.fromEntries(labFiles.map(p => [p, hash(join(LAB_DIR, p))])),
  app: Object.fromEntries(appFiles.map(p => [p, hash(join(CHESS_DIR, p))])),
})
const [{ defenseProbes }, { naturalDefense }, { defaultMaiaElo }, { positionAt },
  { fenOf }, { profileSettings }, { gameIdOf }, { momentsOf },
  { maiaCacheDir, maiaWeightsFile }, { MAIA_MODEL }] = await Promise.all([
  chess('src/services/review/pipeline/defenses.ts'), chess('src/services/knowledge/index.ts'),
  chess('src/services/engine/maia/levels.ts'), chess('src/services/review/pipeline/replay.ts'),
  chess('src/core/chess/index.ts'), chess('src/services/review/profiles.ts'),
  chess('src/services/archive/index.ts'),
  chess('src/services/review/moments.ts'), chess('src/adapters/node/engine/index.ts'),
  chess('src/services/engine/maia/model.ts'),
])
const settings = profileSettings('routine')
check(settings.teaching && settings.punishOdds, 'routine no longer computes defenses')
const original = read(join(project, 'results/offsets.json'))
check(original.adopted === 'A' && original.kept.him === 250 && original.kept.opp === 400, 'stored verdict no longer selects the requested port')
const evidence = read(join(dir, 'evidence/manifest.json'))
function validateInputs() {
  const cases = read(join(dir, 'held-cases.json')), games = read(join(dir, 'games.json'))
  check(evidence.app === original.app && evidence.records === original.records && original.records === pin.records, 'review provenance differs')
  check(hash(join(dir, 'evidence/manifest.json')) === original.sources.evidenceManifestSha256, 'review manifest changed')
  check(hash(join(dir, 'games.json')) === original.sources.gamesSha256 && evidence.gamesSha256 === original.sources.gamesSha256, 'games changed')
  check(hash(join(dir, 'held-cases.json')) === evidence.heldCasesSha256, 'held cases changed')
  const held = games.filter((g: any) => g.half === 'held')
  check(cases.length === original.data.held.games && cases.length === held.length, 'held coverage differs')
  const lookup = new Map(held.map((g: any) => [gameIdOf(g.id), g]))
  check(lookup.size === cases.length && new Set(cases.map((c: any) => c.game)).size === cases.length, 'held cases are not unique')
  const docs = cases.map((c: any, k: number) => {
    const g: any = lookup.get(c.game)
    check(g && /^\d+$/.test(c.id) && c.game === `cc:${c.id}` && c.playerColor === g.me &&
      c.myRating === (g.me === 'w' ? g.white : g.black) && c.oppRating === (g.me === 'w' ? g.black : g.white) &&
      c.plies === g.plies, 'held game metadata differs')
    const file = join(dir, 'evidence/routine', `${c.id}.json`), doc = read(file)
    check(doc.schema === 'game-review/2' && doc.id === c.game && doc.playerColor === c.playerColor &&
      doc.provenance.profile === 'routine' && doc.fens.length === doc.records.length + 1 &&
      doc.records.length === c.plies && !doc.partial, 'incomplete or mismatched routine review')
    check(new Set(doc.moments).size === doc.moments.length &&
      doc.moments.every((i: number) => Number.isInteger(i) && i >= 0 && i < doc.records.length), 'invalid review moments')
    check(digest(doc.moments) === digest(momentsOf(doc.records, c.playerColor)), 'stored review moment selection differs from app')
    return { k, ...c, sha256: hash(file), moments: doc.moments.length }
  })
  return { schema: 'maia-player-offsets-defense-inputs/1', reviewApp: evidence.app,
    records: evidence.records, gamesSha256: hash(join(dir, 'games.json')),
    heldCasesSha256: hash(join(dir, 'held-cases.json')), evidenceManifestSha256: hash(join(dir, 'evidence/manifest.json')),
    originalResultSha256: hash(join(project, 'results/offsets.json')), docs }
}
function currentManifest(inputs: any) {
  const sourceHashes = sources()
  const oldRoot = join(LAB_DIR, '.cache/chess', evidence.app)
  const reviewAppSourceHashes = Object.fromEntries(appFiles.map(p => [p, hash(join(oldRoot, p))]))
  check(digest(reviewAppSourceHashes) === digest(sourceHashes.app), 'a measured defense dependency changed between review and current app')
  const weights = maiaWeightsFile(maiaCacheDir(CHESS_DIR))
  check(fs.existsSync(weights) && hash(weights) === MAIA_MODEL.sha256 &&
    fs.statSync(weights).size === MAIA_MODEL.bytes, 'pinned Maia weights missing or changed; no implicit download')
  return {
    schema: 'maia-player-offsets-defenses/1', app: pin.commit, reviewApp: evidence.app, records: pin.records,
    inputsSha256: digest(inputs), sources: sourceHashes, reviewAppSourceHashes,
    weights: { sha256: MAIA_MODEL.sha256, bytes: MAIA_MODEL.bytes }, heldGames: inputs.docs.length,
    originalResultSha256: inputs.originalResultSha256,
    method: {
      baselineOffset: 250, portPlayerOffset: 250, portOpponentOffset: 400,
      instrument: 'imported defenseProbes, with imported defaultMaiaElo applied to the defender in the humanPolicy adapter',
      conditioning: 'app options unchanged except selected band; opponentBand omitted, so equal-band conditioning',
      positions: 'stored review moments and best moves, with complete game history via imported positionAt',
      probability: 'DefenseProbe.p returned by the app, rounded there to three decimals; candidate minus baseline',
      missing: 'null is absence, never zero probability; distributions require probes at both offsets',
      changes: 'different non-null moves and appearance/disappearance reported separately',
      quantiles: 'sort; zero-based index Math.round(q * (n - 1)); q = 0.25, 0.5, 0.75',
      thresholds: [],
      thresholdFinding: 'No numerical probability threshold in defense selection or its lesson consumers; the modal move must pass the board-based defense classifier.',
      decisionRule: null, calibrationOrLessonQualityTest: false,
      scoreBudget: settings.punish, enginePoolPerWorker: 1, maxWorkers: 2, niceIncrement: 10,
      tablebase: false, evalCache: false, reviewStore: false,
      scoreReuse: 'identical position and defense within a moment share the same app scoreMove reading between variants',
    },
  }
}
function loaded() {
  const inputs = read(inputsFile), expected = read(manifestFile)
  check(digest(validateInputs()) === digest(inputs), 'review inputs changed')
  check(digest(currentManifest(inputs)) === digest(expected), 'defense manifest does not match source or inputs')
  return { inputs, manifest: expected, manifestSha256: hash(manifestFile) }
}
function summarize(rows: any[]) {
  const computed = rows.filter(r => r.before.called)
  const both = computed.filter(r => r.before.probe && r.after.probe)
  const diffs = both.map(r => Math.round(1000 * r.after.probe.p) - Math.round(1000 * r.before.probe.p)).sort((a, b) => a - b)
  const quantile = (q: number) => diffs.length ? diffs[Math.round(q * (diffs.length - 1))] / 1000 : null
  return {
    moments: rows.length, policyComputedMoments: computed.length,
    convertedBandChanged: computed.filter(r => r.before.band !== r.after.band).length,
    naturalDefenseBefore: computed.filter(r => r.before.natural !== null).length,
    naturalDefenseAfter: computed.filter(r => r.after.natural !== null).length,
    naturalDefenseBoth: computed.filter(r => r.before.natural !== null && r.after.natural !== null).length,
    changedMoveWhenBothPresent: computed.filter(r => r.before.natural !== null && r.after.natural !== null && r.before.natural !== r.after.natural).length,
    defenseAppears: computed.filter(r => r.before.natural === null && r.after.natural !== null).length,
    defenseDisappears: computed.filter(r => r.before.natural !== null && r.after.natural === null).length,
    changedIncludingAbsence: computed.filter(r => r.before.natural !== r.after.natural).length,
    noDefenseEither: computed.filter(r => r.before.natural === null && r.after.natural === null).length,
    reportedProbesBefore: computed.filter(r => r.before.probe).length,
    reportedProbesAfter: computed.filter(r => r.after.probe).length,
    selectedWithoutReportedProbeBefore: computed.filter(r => r.before.natural !== null && !r.before.probe).length,
    selectedWithoutReportedProbeAfter: computed.filter(r => r.after.natural !== null && !r.after.probe).length,
    probabilityChange: {
      pairedReportedProbes: both.length, minimum: quantile(0), lowerQuartile: quantile(.25),
      median: quantile(.5), upperQuartile: quantile(.75), maximum: quantile(1),
      maximumAbsolute: diffs.length ? Math.max(...diffs.map(Math.abs)) / 1000 : null,
      decreased: diffs.filter(d => d < 0).length, unchanged: diffs.filter(d => d === 0).length,
      increased: diffs.filter(d => d > 0).length,
      changedNaturalMovePairs: both.filter(r => r.before.natural !== r.after.natural).length,
    },
    probabilityThresholdCrossings: null,
  }
}
  if (args.length === 1 && args[0] === '--prepare') {
    const inputs = validateInputs()
    preserve(inputsFile, inputs)
    preserve(manifestFile, currentManifest(inputs))
    console.log(JSON.stringify({ prepared: true, games: inputs.docs.length, storedMoments: inputs.docs.reduce((n: number, d: any) => n + d.moments, 0) }))
  } else if (args.length === 2 && args[0] === '--worker') {
    const [shard, total] = args[1].split('/').map(Number)
    check(total === 2 && [0, 1].includes(shard), 'use exactly two shards')
    check(Number(execFileSync('ps', ['-p', String(process.pid), '-o', 'nice='], { encoding: 'utf8' }).trim()) === 10, 'heavy worker must run at nice 10')
    const { inputs, manifestSha256 } = loaded()
    const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
    check(fs.existsSync(maiaWeightsFile(maiaCacheDir(CHESS_DIR))), 'pinned Maia weights missing; no implicit download')
    const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
    const started = performance.now()
    let written = 0, reused = 0
    try {
      for (const c of inputs.docs.filter((d: any) => d.k % 2 === shard)) {
        const output = join(home, 'games', `${c.k}.json`)
        if (fs.existsSync(output)) {
          const cached = read(output)
          check(cached.manifestSha256 === manifestSha256 && cached.reviewSha256 === c.sha256 && cached.k === c.k, 'defense checkpoint differs')
          reused++; continue
        }
        const began = performance.now(), doc = read(join(dir, 'evidence/routine', `${c.id}.json`))
        const game = c.playerColor === 'w'
          ? { white: { rating: c.myRating }, black: { rating: c.oppRating } }
          : { white: { rating: c.oppRating }, black: { rating: c.myRating } }
        const history = { rootFen: doc.rootFen, ucis: doc.records.map((r: any) => r.uci) }
        const rows = [], counters = { policyCalls: 0, scoreCalls: 0, reusedVariants: 0 }
        for (const index of doc.moments) {
          const r = doc.records[index], opponentDefender = r.mover === c.playerColor
          const rating = opponentDefender ? c.oppRating : c.myRating
          const pos = positionAt(history, index)
          check(fenOf(pos) === doc.fens[index], 'review history differs from stored position')
          const scores = new Map<string, any>()
          const run = async (offset: number) => {
            const trace: any = { called: false, band: null, natural: null, policy: null, scoreReading: null, probe: null }
            let failed = false
            const adapter = {
              humanPolicy: async (after: any, opts: any) => {
                try {
                  check(!trace.called && opts.bands.length === 1 && opts.bands[0] === defaultMaiaElo(rating) &&
                    opts.opponentBand === undefined, 'app defense policy request changed')
                  trace.called = true
                  const band = defaultMaiaElo(rating, offset)
                  const hp = await engine.humanPolicy(after, { ...opts, bands: [band] })
                  check(hp !== 'unavailable' && hp.bands.length === 1 && hp.bands[0].band === band, 'Maia unavailable or wrong band')
                  const policy = hp.bands[0].policy, ps = Object.values(policy) as number[]
                  check(ps.length > 0 && ps.every(p => Number.isFinite(p) && p >= 0) &&
                    Math.abs(ps.reduce((a, b) => a + b, 0) - 1) < 1e-5, 'invalid Maia policy')
                  trace.band = band; trace.policy = policy
                  trace.natural = naturalDefense(doc.fens[index], r.bestUci, policy)
                  counters.policyCalls++
                  return hp
                } catch (e) { failed = true; throw e }
              },
              scoreMove: async (after: any, uci: string, opts: any) => {
                try {
                  const key = JSON.stringify([after, uci, opts.budget, opts.cache, opts.priority])
                  if (!scores.has(key)) { scores.set(key, await engine.scoreMove(after, uci, opts)); counters.scoreCalls++ }
                  trace.scoreReading = scores.get(key)
                  return trace.scoreReading
                } catch (e) { failed = true; throw e }
              },
            }
            const out = await defenseProbes(adapter, { ...doc, moments: [index] }, () => pos, game, settings.punish, { priority: 'batch' })
            check(!failed, 'app defense enrichment encountered an engine failure')
            check(out.length <= 1, 'multiple defense probes for one moment')
            if (out.length) {
              check(trace.called && out[0].defense === trace.natural && out[0].band === trace.band &&
                out[0].ply === index && out[0].best === r.bestUci && out[0].pv[0] === out[0].defense, 'unexpected app defense output')
              trace.probe = out[0]
            }
            return trace
          }
          const before = await run(250)
          let after = before
          if (before.called && opponentDefender && defaultMaiaElo(rating, 400) !== before.band) after = await run(400)
          else counters.reusedVariants++
          check(before.called === after.called, 'conversion changed pre-policy eligibility')
          rows.push({ index, opponentDefender, rating, before, after })
        }
        atomic(output, { k: c.k, manifestSha256, reviewSha256: c.sha256, rows, counters, seconds: (performance.now() - began) / 1000 })
        written++
        if (written % 10 === 0) console.log(JSON.stringify({ shard, written, reused, elapsedSeconds: Math.round((performance.now() - started) / 1000) }))
      }
      console.log(JSON.stringify({ complete: true, shard, written, reused, elapsedSeconds: (performance.now() - started) / 1000 }))
    } finally { engine.dispose() }
  } else if (args.length === 1 && args[0] === '--report') {
    const { inputs, manifest, manifestSha256 } = loaded()
    const docs = inputs.docs.map((c: any) => {
      const d = read(join(home, 'games', `${c.k}.json`))
      check(d.k === c.k && d.manifestSha256 === manifestSha256 && d.reviewSha256 === c.sha256 &&
        d.rows.length === c.moments, 'missing or mismatched defense checkpoint')
      return d
    })
    // Replay the app instrument on cached app readings, without new inference,
    // to check every checkpoint's selection, rounded p and emission gate.
    for (const c of inputs.docs) {
      const doc = read(join(dir, 'evidence/routine', `${c.id}.json`)), cached = docs[c.k]
      check(digest(cached.rows.map((r: any) => r.index)) === digest(doc.moments), 'checkpoint moments differ')
      const game = c.playerColor === 'w'
        ? { white: { rating: c.myRating }, black: { rating: c.oppRating } }
        : { white: { rating: c.oppRating }, black: { rating: c.myRating } }
      const history = { rootFen: doc.rootFen, ucis: doc.records.map((r: any) => r.uci) }
      for (const row of cached.rows) {
        const r = doc.records[row.index], opponentDefender = r.mover === c.playerColor
        const rating = opponentDefender ? c.oppRating : c.myRating
        check(row.opponentDefender === opponentDefender && row.rating === rating, 'cached defender identity differs')
        for (const [trace, offset] of [[row.before, 250], [row.after, opponentDefender ? 400 : 250]] as const) {
          let calls = 0, scoreCalls = 0, failed = false
          const pos = positionAt(history, row.index)
          const out = await defenseProbes({
            humanPolicy: async (_after: any, opts: any) => {
              try {
                check(trace.called && opts.bands[0] === defaultMaiaElo(rating) && opts.opponentBand === undefined &&
                  trace.band === defaultMaiaElo(rating, offset), 'cached policy request differs')
                calls++
                check(trace.natural === naturalDefense(doc.fens[row.index], r.bestUci, trace.policy), 'cached natural defense differs')
                return { bands: [{ band: trace.band, policy: trace.policy }] }
              } catch (e) { failed = true; throw e }
            },
            scoreMove: async () => {
              scoreCalls++
              if (!trace.scoreReading) { failed = true; throw new Error('missing cached score reading') }
              return trace.scoreReading
            },
          }, { ...doc, moments: [row.index] }, () => pos, game, settings.punish, { priority: 'batch' })
          check(!failed && calls === (trace.called ? 1 : 0) && scoreCalls === (trace.scoreReading ? 1 : 0) &&
            digest(out[0] ?? null) === digest(trace.probe), 'cached defense does not reproduce the app output')
        }
      }
    }
    const rows = docs.flatMap((d: any) => d.rows)
    check(rows.every((r: any) => r.opponentDefender || digest(r.before) === digest(r.after)), 'player-defender output changed')
    const all = summarize(rows), opponent = summarize(rows.filter((r: any) => r.opponentDefender)), player = summarize(rows.filter((r: any) => !r.opponentDefender))
    const result = {
      schema: 'maia-player-offsets-defense-results/1', app: pin.commit, reviewApp: evidence.app, records: pin.records,
      manifestSha256, provenance: manifest, data: { heldGames: docs.length, storedMoments: rows.length,
        gamesWithPolicyCalls: docs.filter((d: any) => d.rows.some((r: any) => r.before.called)).length },
      all, opponentDefender: opponent, playerDefender: player,
      work: { policyCalls: docs.reduce((n: number, d: any) => n + d.counters.policyCalls, 0),
        scoreCalls: docs.reduce((n: number, d: any) => n + d.counters.scoreCalls, 0),
        completedGameWorkerSeconds: docs.reduce((n: number, d: any) => n + d.seconds, 0),
        shards: [0, 1].map(k => ({ shard: k, games: docs.filter((d: any) => d.k % 2 === k).length,
          completedGameWorkerSeconds: docs.filter((d: any) => d.k % 2 === k).reduce((n: number, d: any) => n + d.seconds, 0) })) },
      notes: [
        'Description beside the existing verdict; no new adoption rule or calibration claim.',
        'Existing reviews and moments are fixed at reviewApp; defense enrichment is measured at app. No full review is rebuilt.',
        'Natural defense is the app-classified modal move, not the modal move among defenses. Null is absence.',
        'The app reports probability rounded to three decimals. Changes compare each variant’s selected defense, which can differ.',
        'Probability distributions omit moments without reported probes at both settings; appearance and disappearance are counted separately.',
        'No numerical probability threshold is applied by the pinned selection or lesson consumers; crossings are not applicable.',
        'These defenses follow a counterfactual better move; actual game replies are not calibration outcomes for them.',
        'Complete position history, app routine score budget, no tablebase or persistent eval/review cache. Score readings for an unchanged defense within a moment are shared.',
        'Worker elapsed times can include scheduling delays or suspension and are not CPU time.',
        'Call counts and worker durations cover completed-game checkpoints; discarded incomplete-game work is excluded.',
      ],
    }
    atomic(join(project, 'results/defenses.json'), result)
    const p = (x: number | null) => x === null ? 'not applicable' : `${(x * 100).toFixed(2)}`
    const groups = [['All', all], ['Opponent defender', opponent], ['Player defender', player]] as const
    const text = `# Lesson defenses beside the verdict

Written by defenses.mts. App commit ${pin.commit}; existing routine reviews at ${evidence.app}; records commit ${pin.records}. Manifest SHA-256 ${manifestSha256}. This is a description, not an additional decision rule or a calibration test.

All ${docs.length} rebuilt held-out reviews are retained, with ${rows.length} stored moments. The imported app pipeline requests a defense policy at ${all.policyComputedMoments} moments in ${result.data.gamesWithPolicyCalls} games; ${opponent.policyComputedMoments} have the opponent as defender and ${player.policyComputedMoments} have the player as defender. The converted band changes at ${opponent.convertedBandChanged} opponent-defender moments.

The app reads the position after the engine's better move, with the defender's band in both Maia inputs. It takes the modal move in the whole policy, preserving policy order on exact ties, and keeps it only if the app's board code calls it a move-away or block defense. It reports that move's probability rounded to three decimals. The port uses +400 only for an opponent defender; a player defender stays at +250.

| Group | Policy moments | Natural defense before | Natural defense after | Different moves, both present | Appears | Disappears | Any selection change, including absence |
|---|---:|---:|---:|---:|---:|---:|---:|
${groups.map(([name, s]) => `| ${name} | ${s.policyComputedMoments} | ${s.naturalDefenseBefore} | ${s.naturalDefenseAfter} | ${s.changedMoveWhenBothPresent} | ${s.defenseAppears} | ${s.defenseDisappears} | ${s.changedIncludingAbsence} |`).join('\n')}

Changes in the app-reported probability are after minus before, in percentage points. Each pair uses its own selected defense, which may change. A missing defense is not assigned zero probability. Quartiles use sorted values at zero-based index round(q * (n - 1)).

| Group | Paired reported probes | Minimum | Lower quartile | Median | Upper quartile | Maximum signed change | Largest absolute change |
|---|---:|---:|---:|---:|---:|---:|---:|
${groups.map(([name, s]) => { const d = s.probabilityChange; return `| ${name} | ${d.pairedReportedProbes} | ${p(d.minimum)} | ${p(d.lowerQuartile)} | ${p(d.median)} | ${p(d.upperQuartile)} | ${p(d.maximum)} | ${p(d.maximumAbsolute)} |` }).join('\n')}

Among opponent-defender pairs, ${opponent.probabilityChange.decreased} probabilities fall, ${opponent.probabilityChange.unchanged} stay equal after app rounding, and ${opponent.probabilityChange.increased} rise. ${opponent.probabilityChange.changedNaturalMovePairs} paired probes select different moves. The app emits ${all.reportedProbesBefore} baseline and ${all.reportedProbesAfter} port probes; ${all.selectedWithoutReportedProbeBefore} and ${all.selectedWithoutReportedProbeAfter} selected defenses respectively lack a usable continuation and therefore emit no probe.

There is no numerical probability threshold in the pinned defense selector or its lesson consumers. Threshold crossings are not applicable. Defense availability can change through the modal-move and board-classification gates, as counted above; it is not a probability-cutoff crossing. The consumers match the ply, better move and defense continuation, without using p as a cutoff.

Completed-game checkpoints contain ${result.work.policyCalls} app Node human-policy calls and ${result.work.scoreCalls} scoreMove calls at the imported routine budget, with at most two nice-10 workers. Discarded work from incomplete or interrupted games is excluded. Completed-game worker elapsed time sums to ${result.work.completedGameWorkerSeconds.toFixed(2)} seconds; concurrent worker times overlap and may include scheduling or suspension. Checkpoints resume by completed game. All per-game policies, selections and probes stay private.

The existing review selection and better moves are fixed. This does not rerun the review or measure lesson quality. These are counterfactual positions, so the game's next move is not an observed response to this defense position. The main study's verdict and punish guard are unchanged.
`
    fs.writeFileSync(join(project, 'results/defenses.md'), text)
    console.log(JSON.stringify({ complete: true, games: docs.length, all, opponentDefender: opponent, playerDefender: player }))
  } else throw new Error('use --prepare, --worker 0/2|1/2, or --report')
}
main().catch(e => {
  // Even preparation/report errors can contain private JSON parse previews.
  const errors = join(dir, 'defenses', 'errors.log')
  fs.mkdirSync(join(dir, 'defenses'), { recursive: true })
  fs.appendFileSync(errors, `${new Date().toISOString()} ${e instanceof Error ? e.stack : String(e)}\n`)
  console.error('Defense description stopped; inspect private/maia-player-offsets/defenses/errors.log.')
  process.exitCode = 1
})
