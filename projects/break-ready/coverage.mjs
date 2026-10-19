import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { CHECKS, PIECE_CHECKS, PROJECT, SOURCE, analysisPositions, argOf, checksOf, leverOf, passed, piecesReady, ready } from './lib.mjs'

const K = await chess('src/services/knowledge/index.ts')

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const positions = analysisPositions(privateDir(SOURCE))

const breaks = {}
for (const [who, list] of Object.entries(positions)) {
  breaks[who] = list.flatMap((c) =>
    c.breaks.map((uci) => {
      const read = checksOf(c.fen, uci, K)
      return {
        id: c.id,
        gi: c.gi,
        half: c.half ?? null,
        phase: c.phase,
        structure: c.structure,
        lever: leverOf(c, uci, K),
        uci,
        playedIt: c.played === uci,
        ...read,
      }
    }),
  )
  writeFileSync(join(dir, `${who}-checks.jsonl`), breaks[who].map((b) => JSON.stringify(b)).join('\n') + '\n')
}

const share = (list, f) => ({ n: list.filter(f).length, of: list.length })
function countsOf(list) {
  const byLever = new Map()
  for (const b of list) {
    const key = `${b.structure}|${b.lever}`
    if (!byLever.has(key)) byLever.set(key, [])
    byLever.get(key).push(b)
  }
  return {
    positions: new Set(list.map((b) => b.id)).size,
    breaks: list.length,
    checks: Object.fromEntries(CHECKS.map((c) => [c, share(list, (b) => b.checks[c])])),
    passed: Array.from({ length: CHECKS.length + 1 }, (_, k) => list.filter((b) => passed(b.checks) === k).length),
    ready: share(list, (b) => ready(b.checks)),
    safe: share(list, (b) => b.checks.safe),
    piecesAmongSafe: share(
      list.filter((b) => b.checks.safe),
      (b) => piecesReady(b.checks),
    ),
    piecesPassed: Array.from({ length: PIECE_CHECKS.length + 1 }, (_, k) => list.filter((b) => passed(b.checks, PIECE_CHECKS) === k).length),
    noRooks: list.filter((b) => b.rooks === 0).length,
    noLever: list.filter((b) => b.lever === null).length,
    byLever: [...byLever.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([key, l]) => ({
        key,
        breaks: l.length,
        ready: l.filter((b) => ready(b.checks)).length,
        safe: l.filter((b) => b.checks.safe).length,
        piecesAmongSafe: l.filter((b) => b.checks.safe && piecesReady(b.checks)).length,
      })),
  }
}

const report = {
  note: 'Counted from the board alone: no score of any move was read.',
  his: [0, 1].map((h) => countsOf(breaks.his.filter((b) => b.half === h))),
  strong: countsOf(breaks.strong),
}
writeFileSync(join(out, 'coverage.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (s) => (s.of ? `${s.n} of ${s.of} (${((100 * s.n) / s.of).toFixed(1)}%)` : '--')
const lines = ['# Coverage: how often each question passes', '', report.note, '']
lines.push('| | His, first half | His, second half | Strong players |', '|---|---|---|---|')
const cols = [report.his[0], report.his[1], report.strong]
lines.push(`| Positions | ${cols.map((c) => c.positions).join(' | ')} |`)
lines.push(`| Breaks | ${cols.map((c) => c.breaks).join(' | ')} |`)
for (const c of CHECKS) lines.push(`| ${c} | ${cols.map((x) => pct(x.checks[c])).join(' | ')} |`)
lines.push(`| All five (ready) | ${cols.map((x) => pct(x.ready)).join(' | ')} |`)
lines.push(`| Pieces ready, among the safe | ${cols.map((x) => pct(x.piecesAmongSafe)).join(' | ')} |`)
lines.push(`| Questions passed, 0 to 5 | ${cols.map((x) => x.passed.join(' / ')).join(' | ')} |`)
lines.push(`| Piece questions passed, 0 to 3 | ${cols.map((x) => x.piecesPassed.join(' / ')).join(' | ')} |`)
lines.push(`| Breaks with no rook | ${cols.map((x) => x.noRooks).join(' | ')} |`)
lines.push(`| Breaks with no lever | ${cols.map((x) => x.noLever).join(' | ')} |`)
for (const [name, c] of [['His, first half', cols[0]], ['His, second half', cols[1]], ['Strong players', cols[2]]]) {
  lines.push('', `## ${name}, by break`, '', '| Break | Breaks | Ready | Safe | Pieces ready, among the safe |', '|---|---|---|---|---|')
  for (const l of c.byLever) lines.push(`| ${l.key} | ${l.breaks} | ${l.ready} | ${l.safe} | ${l.piecesAmongSafe} |`)
}
writeFileSync(join(out, 'coverage.md'), lines.join('\n') + '\n')
console.error(lines.join('\n'))
