// Observation persistence only. The app calls, budgets, evidence selection
// and exact reproduction check are inherited unchanged from the prior probe.
import { secondProbeSource } from './second-probe-source.mjs'

const once = (text, before, after) => {
  if (text.split(before).length !== 2) throw new Error('fourth probe anchor differs')
  return text.replace(before, after)
}
export function fourthProbeSource() {
  let source = secondProbeSource()
    .replaceAll('process.env.SECOND_LOOK_', 'process.env.FOURTH_LOOK_')
    .replaceAll("'second-acquisition'", "'fourth-acquisition'")
    .replace('the second acquisition wrapper', 'the fourth acquisition wrapper')
  source = once(source, 'function retainedError(error, seen = new Set()) {',
    `const powerReceipt = read(process.env.FOURTH_LOOK_POWER_RECEIPT)
insist(powerReceipt.schema === 'second-look-fresh-power-receipt/1'
  && powerReceipt.quietReceiptSha256 === receipt.receiptSha256
  && powerReceipt.beforeQuiet.ready && powerReceipt.beforeLaunch.ready
  && /^[0-9a-f]{64}$/.test(powerReceipt.receiptSha256 ?? ''),
  'a power and open-lid receipt is required')
function retainedError(error, seen = new Set()) {`)
  source = once(source, 'endedAt: new Date().toISOString(), quietReceiptSha256: receipt.receiptSha256 } }',
    `endedAt: new Date().toISOString(), quietReceiptSha256: receipt.receiptSha256,
          powerReceiptSha256: powerReceipt.receiptSha256, acquisition: 'fourth' } }`)
  return source
}
