// Persistence and error observation only. The registered review calls, evidence,
// timing calculations and exact-reproduction gate stay byte-for-byte intact.
import { readFileSync } from 'node:fs'
const replaceOnce = (source, before, after) => {
  if (source.split(before).length !== 2) throw new Error('second probe patch anchor changed')
  return source.replace(before, after)
}

export function secondProbeSource() {
  let source = readFileSync(new URL('./probe.mjs', import.meta.url), 'utf8')
  source = replaceOnce(source, 'const args = argsOf(process.argv.slice(2))', `const args = argsOf(process.argv.slice(2))
insist(args.all && args.phase2 && args.variant === 'candidate' && args.profile === 'routine' && !args.shard,
  'the second acquisition wrapper is only for one candidate routine observation')
const selectedOrdinal = Number(process.env.SECOND_LOOK_ORDINAL)
const selectedAttempt = Number(process.env.SECOND_LOOK_ATTEMPT)
insist(Number.isInteger(selectedOrdinal) && selectedOrdinal >= 1 && selectedOrdinal <= 60
  && [1, 2].includes(selectedAttempt), 'one prescribed game and attempt are required')
const receipt = read(process.env.SECOND_LOOK_QUIET_RECEIPT)
insist(receipt.schema === 'second-look-fresh-quiet-receipt/1'
  && receipt.quietSeconds >= 300 && /^[0-9a-f]{64}$/.test(receipt.receiptSha256 ?? ''),
  'a quiet-window receipt is required')
function retainedError(error, seen = new Set()) {
  if (error === null || typeof error !== 'object') return { thrown: String(error) }
  if (seen.has(error)) return { circular: true }
  seen.add(error)
  const out = {}
  for (const key of ['name', 'message', 'stack']) {
    try { if (error[key] !== undefined) out[key] = String(error[key]) }
    catch { out[key] = '[unreadable property]' }
  }
  try { if (error.cause !== undefined) out.cause = retainedError(error.cause, seen) }
  catch { out.cause = { unreadable: true } }
  return out
}`)
  source = replaceOnce(source, '        calls.push(call)', `        call.startedAt = new Date().toISOString()
        call.startedMonotonicMs = performance.now()
        calls.push(call)`)
  source = replaceOnce(source, '          call.failed = true', `          call.failed = true
          call.error = retainedError(e)`)
  source = replaceOnce(source,
    '        } finally { call.seconds = (performance.now() - t) / 1000 }',
    `        } finally {
          call.seconds = (performance.now() - t) / 1000
          call.endedAt = new Date().toISOString()
          call.endedMonotonicMs = performance.now()
        }`)
  source = replaceOnce(source, '  for (const [ordinal, one] of rows.entries()) {',
    `  for (const [ordinal, one] of rows.entries()) {
    if (ordinal + 1 !== selectedOrdinal) continue`)
  source = replaceOnce(source,
    "    const out = join(project, 'timed', args.profile, `${c.id}.json`)",
    `    const out = join(project, 'timed', args.profile, \`\${c.id}.json\`)
    const journal = join(ROOT, 'second-acquisition', 'replays',
      selectedAttempt === 1 ? 'first' : 'retry', \`\${c.id}.json\`)
    insist(!existsSync(journal), 'a produced observation cannot be searched again')
    insist(!existsSync(out), 'an accepted observation cannot be replaced')`)
  source = replaceOnce(source, '    const started = performance.now()', `    const startedAt = new Date().toISOString()
    const started = performance.now()`)
  const saved = `      const summary = { variant: args.variant, profile: args.profile, plies: doc.records.length,
        seconds, looks: looks.length, verifySeconds: looks.reduce((s, x) => s + x.seconds, 0),
        verifyDepths: looks.map((x) => x.depth), calls: timing(calls), build: doc.provenance.build }
      atomic(out, { fingerprint: oneFingerprint, inputHash: oneInputHash, sourceHash,
        app: pin.commit, records: pin.records, caseIndex: one.caseIndex,
        canonicalHash, summary, looks, calls, doc })`
  const journal = `      const observedSummary = { variant: args.variant, profile: args.profile, plies: doc?.records?.length,
        seconds, looks: looks.length, verifySeconds: looks.reduce((s, x) => s + x.seconds, 0),
        verifyDepths: looks.map((x) => x.depth), calls: timing(calls), build: doc?.provenance?.build }
      const produced = { fingerprint: oneFingerprint, inputHash: oneInputHash, sourceHash,
        app: pin.commit, records: pin.records, caseIndex: one.caseIndex,
        canonicalHash, summary: observedSummary, looks, calls, doc,
        observation: { ordinal: selectedOrdinal, attempt: selectedAttempt, startedAt,
          endedAt: new Date().toISOString(), quietReceiptSha256: receipt.receiptSha256 } }
      mkdirSync(dirname(journal), { recursive: true })
      writeFileSync(journal, JSON.stringify(produced) + '\\n', { flag: 'wx' })
`
  source = replaceOnce(source,
    "      insist(doc?.schema === 'game-review/2' && doc.records.length === oneReplay.played.length,",
    journal + "      insist(doc?.schema === 'game-review/2' && doc.records.length === oneReplay.played.length,")
  source = replaceOnce(source, saved,
    "      insist(existsSync(journal), 'the observation must be saved before acceptance')")
  return source
}
