// The evidence a grader reads beside a weekly or monthly review: the brief without
// its bulk (every citable fact kept), a one-line table of the period's games, the
// aggregate's digest, and for every board exhibit of the reviews given, the
// position as the archive replays it, what was played there and next, the engine's
// best move and its best reply, the board's threats and readings, and what the
// knowledge service says each move does. Run from a case checkout with its tsx:
//   (cd <case>/repo && node_modules/.bin/tsx <bin>/evidence.mts <ID> [--boards-only] <name>=<annotations.json> ...)
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const req = createRequire(join(root, 'package.json'))
const { Chess } = req('chess.js')
const review = await import(pathToFileURL(join(root, 'src/services/review/index.ts')).href)
const publishing = await import(pathToFileURL(join(root, 'src/services/publishing/index.ts')).href)
const { runCli } = await import(pathToFileURL(join(root, 'src/cli/cli.ts')).href)

const [id, ...rest] = process.argv.slice(2)
const boardsOnly = rest.includes('--boards-only')
const named = rest.filter((a) => a.includes('=')).map((a) => {
  const i = a.indexOf('=')
  return { name: a.slice(0, i), file: a.slice(i + 1) }
})

async function cli(args: string[]): Promise<any> {
  let out = ''
  await runCli(args, { stdout: (t: string) => { out += t }, stderr: () => {} })
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

const sanOf = (fen: string, uci: string | null | undefined): string | null => {
  if (!uci) return null
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}
const moveLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}${san}`
const line = (sans: string[], from: number) => sans.map((s, i) => (i === 0 || (from + i) % 2 === 0 ? moveLabel(from + i, s) : s)).join(' ')
const pawns = (cp: unknown) => (typeof cp === 'number' ? `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}` : 'not stored')

const dayRows = new Map<string, any[] | null>()
function day(date: string): any[] | null {
  if (!dayRows.has(date)) {
    const f = join(root, 'coach-log', 'review-analysis', `${date}.json`)
    dayRows.set(date, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)
  }
  return dayRows.get(date) ?? null
}

async function board(where: string, b: any): Promise<string[]> {
  const out: string[] = []
  const spec = String(b?.board?.game ?? '')
  const ply = Number(b?.board?.ply)
  const ref = review.splitGameRef(spec)
  const rows = ref.date ? day(ref.date) : null
  const hit = rows ? review.resolveGameRef(rows, ref.which, { date: ref.date }) : { error: 'no archived day' }
  out.push(`-- ${where}: board.game "${spec}", ply ${Number.isFinite(ply) ? ply : 'none'}`)
  if (hit.error || !Number.isFinite(ply)) {
    out.push(`   not in the archive: ${hit.error ?? 'no ply'}`)
    return out
  }
  const g = hit.game
  const sans: string[] = g.sans || []
  const fens: string[] = review.archivedSeries(g).fens
  if (ply < 0 || ply >= sans.length) {
    out.push(`   ply ${ply} is outside the game (${sans.length} plies)`)
    return out
  }
  const fen = fens[ply]
  const his = (ply % 2 === 0) === !!g.meIsWhite
  const played = sans[ply]
  const best = sanOf(fen, (g.bestUcis || [])[ply])
  const reply = sanOf(fens[ply + 1], (g.bestUcis || [])[ply + 1])
  out.push(`   he played ${g.meIsWhite ? 'White' : 'Black'}; result ${g.result}; this is ${his ? 'his' : 'their'} move ${moveLabel(ply, played)}`)
  out.push(`   position before it: ${fen}`)
  out.push(`   engine eval before and after (White's view, pawns): ${pawns((g.evals || [])[ply])} -> ${pawns((g.evals || [])[ply + 1])}`)
  out.push(`   engine's best there: ${best ?? 'not stored'}${best === played ? ' (the move played)' : ''}; engine's best reply to ${played}: ${reply ?? 'not stored'}`)
  const next = sans.slice(ply, ply + 9)
  out.push(`   what was played from there: ${line(next, ply)}${ply + 9 >= sans.length ? ` (game over, ${g.termination ?? g.result})` : ' ...'}`)
  const desc = await cli(['knowledge', 'describe', '--fen', fen])
  const th = desc?.threats
  if (th) {
    const side = (s: 'w' | 'b') => {
      const mates = th.mateInOne?.[s] ?? []
      const caps = (th.winningCaptures?.[s] ?? []).map((c: any) => c.san)
      return `${s === 'w' ? 'White' : 'Black'}: ${mates.length ? `mate in one with ${mates.join(', ')}; ` : ''}${caps.length ? `captures that win material: ${caps.join(', ')}` : 'no winning capture'}`
    }
    out.push(`   threats on the board before the move (if each side were to move): ${side('w')}. ${side('b')}.`)
  }
  const rd = await cli(['knowledge', 'readings', '--fen', fen])
  if (rd) {
    const s = (k: 'w' | 'b') => {
      const x = rd[k] || {}
      return `${k === 'w' ? 'White' : 'Black'} loose ${(x.loose || []).join(' ') || 'none'} (attacked ${(x.looseAttacked || []).join(' ') || 'none'}), king ${x.king?.square ?? '?'} with attackers near it ${(x.king?.ringAttackers || []).join(' ') || 'none'}, passed pawns ${(x.pawns?.passed || []).join(' ') || 'none'}`
    }
    out.push(`   readings: ${s('w')}; ${s('b')}`)
  }
  const firstMove = (l: unknown) => {
    const tok = String(l ?? '').trim().split(/\s+/)[0] ?? ''
    return tok.replace(/^\d+\.(\.\.)?/, '') || null
  }
  const own = (b.lines || []).filter((l: any) => l && l.tag !== 'Played').map((l: any) => firstMove(l.line)).filter((s: string | null): s is string => !!s)
  const asked: Array<[string, string]> = [['the move played', played]]
  if (best && best !== played) asked.push(["the engine's best", best])
  for (const s of own) if (!asked.some(([, x]) => x === s)) asked.push(["the review's better move", s])
  for (const [label, san] of asked) {
    const mv = await cli(['knowledge', 'move', '--fen', fen, '--move', san])
    if (!mv) {
      out.push(`   ${label} (${san}) is not a legal move in this position`)
      continue
    }
    const seen = new Set<string>()
    const texts: string[] = []
    for (const t of [mv.sentence, ...(mv.findings || []).map((f: any) => f.text)]) {
      if (typeof t !== 'string' || !t) continue
      const key = t.toLowerCase().replace(/[.\s]+$/, '')
      if (seen.has(key)) continue
      seen.add(key)
      texts.push(t.replace(/[.\s]+$/, ''))
    }
    out.push(`   what ${label} (${san}) does: ${texts.join('; ') || 'nothing the detectors name'}`)
  }
  return out
}

const lines: string[] = []
if (!boardsOnly) {
  const brief = JSON.parse(readFileSync(join(root, 'coach-log', 'briefs', `${id}.json`), 'utf8'))
  const { games, clock, ...lean } = brief
  const stamps = (xs: any[] | undefined) => (xs || []).map((x: any) => `${x.opponent} ${x.moveNo}${x.ply % 2 === 0 ? '.' : '...'}${x.san} ${x.cls ?? ''} lost ${Math.round(x.lossPct ?? 0)} win%, thought ${x.think ?? '?'}s with ${x.clockBefore ?? '?'}s left${x.sharp ? `, ${x.sharp}` : ''}`)
  const sc = lean.scorecards?.clock
  const prevStamps = sc?.prev?.stamps
  if (sc?.now) delete sc.now.stamps
  if (sc?.prev) delete sc.prev.stamps
  lines.push(`THE BRIEF (every key but games and clock, which follow in short form; every citable number is in facts):`)
  lines.push(JSON.stringify(lean))
  lines.push('')
  if (clock) {
    const { stamps: now, ...summary } = clock
    lines.push(`THE CLOCK: ${JSON.stringify(summary)}`)
    lines.push(`This period's turning points with his think time (opponent, move, class, win% lost, seconds thought, seconds left):`)
    lines.push(...stamps(now))
    if (prevStamps?.length) {
      lines.push(`The period before's turning points, the same way:`)
      lines.push(...stamps(prevStamps))
    }
    lines.push('')
  }
  lines.push(`THE PERIOD'S GAMES (${(games || []).length}), one line each: day, opponent, his colour, result, his and their accuracy, opening, moves, his turning points (move, class, win% lost):`)
  for (const g of games || []) {
    const m = (g.moments || []).map((x: any) => `${x.moveNo}${x.ply % 2 === 0 ? '.' : '...'}${x.san} ${x.cls} -${Math.round(x.lossPct ?? 0)}`).join(', ')
    lines.push(`${g.ptDay} ${g.opponent} ${g.color} ${g.result} acc ${g.accuracy?.me ?? '?'}/${g.accuracy?.opp ?? '?'} ${g.opening ?? ''} ${g.moves} moves${m ? `; ${m}` : ''}`)
  }
  lines.push('')
  const agg = join(root, 'tools', 'coach-review', '.cache', 'digests', id, 'aggregate.txt')
  if (existsSync(agg)) {
    lines.push("THE AGGREGATE'S DIGEST:")
    lines.push(readFileSync(agg, 'utf8'))
  }
  const days = [...new Set((games || []).map((g: any) => g.ptDay).filter(Boolean))].sort() as string[]
  if (id.includes('-W')) {
    lines.push("THE WEEK'S DAILY LOGS, which the weekly audits:")
    for (const d of days) {
      const f = join(root, 'coach-log', `${d}.md`)
      if (existsSync(f)) lines.push(`--- coach-log/${d}.md`, readFileSync(f, 'utf8'))
    }
  } else {
    lines.push("THE MONTH'S WEEKLY REVIEWS, which the monthly audits (headline, summary and each section's title and takeaway):")
    const dir = join(root, 'coach-log', 'review-annotations')
    const month = publishing.periodWindow(id)
    for (const f of (await import('node:fs')).readdirSync(dir).filter((n: string) => /^\d{4}-W\d{2}\.json$/.test(n)).sort()) {
      const w = publishing.periodWindow(f.replace(/\.json$/, ''))
      if (!(w.since < month.until && w.until > month.since)) continue
      const a = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      lines.push(`--- ${f}: ${a.headline ?? ''}`, `summary: ${JSON.stringify(a.summary ?? {})}`)
      for (const s of a.sections || []) lines.push(`  ${s.title ?? s.id}: ${s.takeaway ?? ''}`)
    }
  }
  lines.push('')
}
for (const { name, file } of named) {
  const ann = JSON.parse(readFileSync(file, 'utf8'))
  lines.push(`THE BOARD EXHIBITS OF REVIEW ${name}, as the archive and the knowledge service read them:`)
  let k = 0
  for (const s of ann.sections || []) {
    for (const [i, b] of (s.boards || []).entries()) {
      k++
      lines.push(...(await board(`review ${name}, section "${s.id}", board ${i + 1}`, b)))
    }
  }
  if (!k) lines.push('   (no boards)')
  lines.push('')
}
process.stdout.write(lines.join('\n') + '\n')
