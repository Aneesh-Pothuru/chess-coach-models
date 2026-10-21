// Reads the held-out examples with the app's own blunder check, after the
// results: what an unsound rule move did, and what the natural move did
// instead. It describes the examples and changes no verdict.
//
//   CHESS_DIR="$PWD/.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a" \
//     bridge/run.sh projects/rules-of-thumb/why.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, LAB_DIR, chess } from '../../bridge/lib/chess.mjs'

const PROJECT = join(LAB_DIR, 'projects/rules-of-thumb')
export const KINDS = ['allows mate', 'loses material', 'passes over a forcing move', 'a quieter choice']

/** How a move reads by the app's blunder check, and whether it is forcing. */
export function readingOf(K, fen, uci) {
  const board = K.boardOf(fen)
  const move = board.findUci(uci)
  if (!move) throw new Error('an example move is illegal')
  const safety = K.safetyCheck(fen, uci)
  if (!safety) throw new Error('the blunder check rejected a legal move')
  const check = /[+#]$/.test(move.san)
  const exchange = move.isCapture() ? K.captureExchangeByMove(fen, uci) : null
  const trade = exchange !== null && exchange >= 0
  const loose = safety.leavesLoose.map((h) => h.square).filter((s) => !(trade && s === move.to)).sort()
  return {
    san: move.san,
    capture: move.isCapture(),
    check,
    promotion: move.isPromotion(),
    forcing: move.isCapture() || check || move.isPromotion(),
    verdict: safety.verdict,
    exchange,
    loose,
    losesMaterial: (exchange !== null && exchange < 0) || loose.length > 0,
  }
}

/** The first kind that fits, in the order the check asks. */
export function kindOf(rule, natural) {
  if (rule.verdict === 'allows-mate') return 'allows mate'
  if (rule.losesMaterial) return 'loses material'
  if (natural.forcing) return 'passes over a forcing move'
  return 'a quieter choice'
}

const tally = () => Object.fromEntries(KINDS.map((k) => [k, 0]))
/** The check flags a move that allows mate or loses material. */
export const flags = (reading) => reading.verdict === 'allows-mate' || reading.losesMaterial

export function summarise(rules) {
  const all = { examples: 0, ruleSound: 0, ruleUnsound: 0, kinds: tally(), naturalForcing: 0, ruleForcing: 0, ruleSoundFlagged: 0, naturalFlagged: 0, ruleFlagged: 0 }
  const byRule = {}
  for (const [rule, entry] of Object.entries(rules)) {
    const s = { examples: 0, ruleSound: 0, ruleUnsound: 0, kinds: tally(), naturalForcing: 0, ruleForcing: 0, ruleSoundFlagged: 0, naturalFlagged: 0, ruleFlagged: 0 }
    for (const x of entry.examples) {
      s.examples++
      const flagged = flags(x.R)
      if (flagged) s.ruleFlagged++
      if (flags(x.N)) s.naturalFlagged++
      if (x.N.forcing) s.naturalForcing++
      if (x.R.forcing) s.ruleForcing++
      if (x.R.sound) {
        s.ruleSound++
        if (flagged) s.ruleSoundFlagged++
      } else {
        s.ruleUnsound++
        s.kinds[x.kind]++
      }
    }
    byRule[rule] = s
    for (const key of Object.keys(all)) {
      if (key === 'kinds') for (const k of KINDS) all.kinds[k] += s.kinds[k]
      else all[key] += s[key]
    }
  }
  return { all, byRule }
}

function markdown(out) {
  const lines = [
    '# Held-out examples, read by the blunder check',
    '',
    `Written by \`why.mjs\` on app \`${out.app}\`, from \`results/examples.json\` (Lichess standard rated 600+0, ${out.heldout}, CC0). Read after the results; it describes the examples and changes no verdict.`,
    '',
    "Each move is read by the app's blunder check (`safetyCheck`) and its capture war (`captureExchangeByMove`): it **allows mate** when the reply can mate at once, and it **loses material** when it is a capture the capture war says loses, or when, after it, a piece of the mover's can be taken for a gain (`leavesLoose`, newly loose or loose already; the capturing piece of an even or winning capture is not counted, since taking it back is the trade). An unsound rule move that does neither **passes over a forcing move** when the natural move is a check, a capture or a promotion, and is **a quieter choice** otherwise.",
    '',
    `| Rule | Examples | R sound | R unsound | ${KINDS.map((k) => k[0].toUpperCase() + k.slice(1)).join(' | ')} | N forcing | R flagged | N flagged |`,
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  const row = (name, s) => `| ${name} | ${s.examples} | ${s.ruleSound} | ${s.ruleUnsound} | ${KINDS.map((k) => s.kinds[k]).join(' | ')} | ${s.naturalForcing} | ${s.ruleFlagged} | ${s.naturalFlagged} |`
  for (const [rule, s] of Object.entries(out.summary.byRule)) lines.push(row(rule, s))
  lines.push(row('all', out.summary.all), '')
  lines.push(`R flagged counts the rule moves the check flags, sound or not; ${out.summary.all.ruleSoundFlagged} of them were sound. N flagged counts the same for the natural move.`, '')
  for (const [rule, entry] of Object.entries(out.rules)) {
    lines.push(`## ${rule}`, '', '| Example | R | R sound | R check | R capture war | Loose after R | N | N sound | N forcing | Kind |', '|---:|---|---|---|---:|---|---|---|---|---|')
    for (const x of entry.examples) {
      lines.push(`| ${x.number} | ${x.R.san} | ${x.R.sound ? 'yes' : 'no'} | ${x.R.verdict} | ${x.R.exchange ?? '-'} | ${x.R.loose.join(' ') || '-'} | ${x.N.san} | ${x.N.sound ? 'yes' : 'no'} | ${x.N.forcing ? 'yes' : 'no'} | ${x.kind ?? 'sound'} |`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  const examples = JSON.parse(readFileSync(join(PROJECT, 'results/examples.json'), 'utf8'))
  const commit = execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (commit !== examples.app) throw new Error(`run at the app the examples were read at (${examples.app}), not ${commit}`)
  const K = await chess('src/services/knowledge/index.ts')
  const rules = {}
  for (const [rule, entry] of Object.entries(examples.rules)) {
    rules[rule] = {
      verdict: entry.verdict,
      examples: entry.examples.map((x) => {
        const R = { ...readingOf(K, x.fen, x.moves.R.uci), sound: x.moves.R.sound }
        const N = { ...readingOf(K, x.fen, x.moves.N.uci), sound: x.moves.N.sound }
        if (R.san !== x.moves.R.san || N.san !== x.moves.N.san) throw new Error('the board reads the examples differently')
        return { number: x.number, fen: x.fen, R, N, kind: R.sound ? null : kindOf(R, N) }
      }),
    }
  }
  const out = { app: commit, heldout: examples.data.heldout, source: 'results/examples.json', kinds: KINDS, summary: summarise(rules), rules }
  writeFileSync(join(PROJECT, 'results/why.json'), `${JSON.stringify(out, null, 1)}\n`)
  writeFileSync(join(PROJECT, 'results/why.md'), markdown(out))
  process.stdout.write(`${JSON.stringify(out.summary.all)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
