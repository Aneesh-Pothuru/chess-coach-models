// The evidence a grader reads beside a day's video scripts: the brief without its
// bulk (every citable fact kept), the video grammar's fixed milestone card, the
// day's games and turning points one line each, analyze.cjs's digest (the
// engine's lines, what was played, the lesson lines), each turning point's
// findability at his band (the Maia step's, which the live digest is printed
// before), and for every board scene of the scripts given: the position as the
// archive replays it, what was played there and next, the engine's best move and
// its best reply, how players at his band play there when the move is his (the
// Maia-2 reading `coach engine find` and `engine human` give), the engine's plan
// lines and the Maia step's human plan where the routine computed them, the
// threats and readings, what each piece hits and guards, and each move the scene
// plays, replayed in order, with whether it is the game's own move, what the
// knowledge service says it does, and after a move the game did not play, the
// engine's best reply and its line. The engine writes nothing into the case:
// its eval cache is off and the Maia weights come from EVIDENCE_MAIA_DIR.
// Run from a case checkout with its tsx:
//   (cd <case>/repo && node_modules/.bin/tsx <bin>/evidence.mts <D> [--scenes-only] <name>=<video.json> ...)
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const req = createRequire(join(root, 'package.json'))
const { Chess } = req('chess.js')
const review = await import(pathToFileURL(join(root, 'src/services/review/index.ts')).href)
const { runCli } = await import(pathToFileURL(join(root, 'src/cli/cli.ts')).href)

const [id, ...rest] = process.argv.slice(2)
const scenesOnly = rest.includes('--scenes-only')
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
  if (!uci || !fen) return null
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}
const moveLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}${san}`
const line = (sans: string[], from: number) => sans.map((s, i) => (i === 0 || (from + i) % 2 === 0 ? moveLabel(from + i, s) : s)).join(' ')
const pawns = (cp: unknown) => (typeof cp === 'number' ? `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}` : 'not stored')
const bare = (san: string) => String(san).replace(/[!?]+$/, '').replace(/[+#]+$/, '')

const rowsFile = join(root, 'coach-log', 'review-analysis', `${id}.json`)
const rows: any[] = existsSync(rowsFile) ? JSON.parse(readFileSync(rowsFile, 'utf8')) : []
const analysisFile = join(root, 'tools', 'coach-review', '.cache', 'analysis.json')
const analysis: any[] = existsSync(analysisFile) ? JSON.parse(readFileSync(analysisFile, 'utf8')) : []

const core = await import(pathToFileURL(join(root, 'src/core/chess/index.ts')).href)
const score = await import(pathToFileURL(join(root, 'src/core/score/index.ts')).href)
const { createNodeEngine, nodeHumanModel } = await import(pathToFileURL(join(root, 'src/adapters/node/engine/index.ts')).href)
const maiaDir = process.env.EVIDENCE_MAIA_DIR
let service: any = null
const engine = () => (service ??= createNodeEngine({ root, tablebase: false, evalCache: false, ...(maiaDir ? { human: nodeHumanModel({ dir: maiaDir }) } : {}) }))
const briefFile = join(root, 'coach-log', 'briefs', `${id}.json`)
const briefRecord = existsSync(briefFile) ? JSON.parse(readFileSync(briefFile, 'utf8')).record ?? {} : {}
const rapid = Math.round(Number(briefRecord.ratingTo ?? briefRecord.ratingFrom ?? 1150))
const pct = (p: number) => `${Math.round(p * 100)}%`
const uciOf = (fen: string, san: string): string | null => {
  try {
    const m = new Chess(fen).move(bare(san))
    return m.from + m.to + (m.promotion ?? '')
  } catch {
    return null
  }
}
const sansOf = (fen: string, ucis: string[], n: number): string[] => {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of ucis.slice(0, n)) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
    } catch {
      break
    }
  }
  return out
}
const hisView = (e: any, meIsWhite: boolean): string => {
  if (!e) return 'no reading'
  if (e.kind === 'terminal') return `the game is over, ${e.result}`
  const sign = meIsWhite ? 1 : -1
  if (e.kind === 'mate') return e.mate * sign > 0 ? `mate in ${Math.abs(e.mate)} for him` : `mate in ${Math.abs(e.mate)} for them`
  const cp = score.cpOf(e) * sign
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`
}

async function maia(fen: string, moves: Array<[string, string]>): Promise<string | null> {
  const pos = core.position(fen, [])
  let band: number | null = null
  const parts: string[] = []
  const seen = new Set<string>()
  for (const [label, san] of moves) {
    const uci = uciOf(fen, san)
    if (!uci || seen.has(uci)) continue
    seen.add(uci)
    const f = await engine().findability(pos, uci, rapid)
    if (f === 'unavailable') return null
    band = f.band
    parts.push(`${label} ${bare(san)} ${pct(f.p)} (rank ${f.rank ?? '-'})`)
  }
  if (band === null) return null
  const hp = await engine().humanPolicy(pos, { bands: [band] })
  if (hp === 'unavailable') return null
  const top = Object.entries(hp.bands[0].policy as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return `players at his level (Maia-2 band ${band}, for his chess.com rapid ${rapid}) play here most often ${top.map(([u, p]) => `${core.uciToSan(fen, u) ?? u} ${pct(p)}`).join(', ')}; ${parts.join('; ')}`
}

async function bestReply(fen: string, meIsWhite: boolean): Promise<string> {
  try {
    const set = await engine().bestMoves(core.position(fen, []), { budget: 'best', multiPv: 1, cache: 'use' })
    const l = set.lines?.[0]
    if (!l) return 'no legal reply'
    return `the engine's best reply ${sansOf(fen, [l.move], 1)[0] ?? l.move} (${hisView(l.eval, meIsWhite)} for him after it; its line ${sansOf(fen, l.pv ?? [l.move], 6).join(' ')})`
  } catch {
    return 'the engine could not read it'
  }
}

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const FILES = 'abcdefgh'

function relations(fen: string): string[] {
  const c = new Chess(fen)
  const occupied: Array<{ sq: string; color: string; type: string }> = []
  for (const row of c.board()) for (const x of row) if (x) occupied.push({ sq: x.square, color: x.color, type: x.type })
  const out: string[] = []
  for (const side of ['w', 'b']) {
    const parts: string[] = []
    for (const p of occupied.filter((x) => x.color === side)) {
      const hits: string[] = []
      const guards: string[] = []
      for (const t of occupied) {
        if (t.sq === p.sq || !c.attackers(t.sq, side).includes(p.sq)) continue
        ;(t.color === side ? guards : hits).push(`${PIECE[t.type]} ${t.sq}`)
      }
      parts.push(`${PIECE[p.type]} ${p.sq}${hits.length ? ` hits ${hits.join(', ')}` : ''}${guards.length ? `${hits.length ? ';' : ''} guards ${guards.join(', ')}` : ''}${!hits.length && !guards.length ? ' touches no piece' : ''}`)
    }
    out.push(`${side === 'w' ? 'White' : 'Black'}: ${parts.join('. ')}.`)
  }
  const files = [...FILES].map((f) => {
    const w = occupied.some((x) => x.type === 'p' && x.color === 'w' && x.sq[0] === f)
    const bl = occupied.some((x) => x.type === 'p' && x.color === 'b' && x.sq[0] === f)
    return `${f} ${!w && !bl ? 'open' : !w ? 'half-open for White' : !bl ? 'half-open for Black' : 'closed'}`
  })
  out.push(`Files (pawns only): ${files.join(', ')}.`)
  return out
}

async function does(fen: string, san: string): Promise<string> {
  const mv = await cli(['knowledge', 'move', '--fen', fen, '--move', bare(san)])
  if (!mv) return 'not a legal move in this position'
  const seen = new Set<string>()
  const texts: string[] = []
  for (const t of [mv.sentence, ...(mv.findings || []).map((f: any) => f.text)]) {
    if (typeof t !== 'string' || !t) continue
    const key = t.toLowerCase().replace(/[.\s]+$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    texts.push(t.replace(/[.\s]+$/, ''))
  }
  return texts.join('; ') || 'nothing the detectors name'
}

function play(fen: string, san: string): string | null {
  try {
    const c = new Chess(fen)
    c.move(bare(san))
    return c.fen()
  } catch {
    return null
  }
}

async function scene(where: string, s: any): Promise<string[]> {
  const out: string[] = []
  const b = s.board || {}
  const spec = String(b.game ?? '')
  out.push(`-- ${where}: "${s.eyebrow ?? ''}" / "${s.title ?? ''}", board.game "${spec}", ply ${b.ply ?? (b.fen ? 'from its fen' : 'none')}`)
  let g: any = null
  let ply = Number(b.ply)
  if (spec) {
    const ref = review.splitGameRef(spec)
    const hit = review.resolveGameRef(rows, ref.which, { date: ref.date ?? id })
    if (hit.error) {
      out.push(`   not in the archive: ${hit.error}`)
      return out
    }
    g = hit.game
  }
  if (!g) {
    if (b.fen) out.push(`   a free study position: ${b.fen}`)
    return out
  }
  const sans: string[] = g.sans || []
  const fens: string[] = review.archivedSeries(g).fens
  if (!Number.isFinite(ply) && b.fen) ply = fens.findIndex((f: string) => f.split(' ').slice(0, 4).join(' ') === String(b.fen).split(' ').slice(0, 4).join(' '))
  if (!Number.isFinite(ply) || ply < 0 || ply > sans.length) {
    out.push(`   ply ${b.ply} is outside the game (${sans.length} plies)`)
    return out
  }
  const fen = fens[ply]
  const toMove = ply % 2 === 0 ? 'White' : 'Black'
  out.push(`   game: he played ${g.meIsWhite ? 'White' : 'Black'} against ${g.opp}; result ${g.result}; ${sans.length} plies`)
  out.push(`   the position on screen (after ply ${ply}, ${toMove} to move${ply > 0 ? `, the last move ${moveLabel(ply - 1, sans[ply - 1])}` : ''}): ${fen}`)
  if (ply < sans.length) {
    const played = sans[ply]
    const best = sanOf(fen, (g.bestUcis || [])[ply])
    const reply = sanOf(fens[ply + 1], (g.bestUcis || [])[ply + 1])
    out.push(`   the move played here: ${moveLabel(ply, played)} (${(ply % 2 === 0) === !!g.meIsWhite ? 'his' : 'theirs'}); engine eval before and after (his view, in pawns: plus is good for him): ${pawns((g.evals || [])[ply])} -> ${pawns((g.evals || [])[ply + 1])}`)
    out.push(`   engine's best here: ${best ?? 'not stored'}${best === played ? ' (the move played)' : ''}; engine's best reply to ${played}: ${reply ?? 'not stored'}`)
    out.push(`   what was played from here: ${line(sans.slice(ply, ply + 10), ply)}${ply + 10 >= sans.length ? ` (game over, ${g.termination ?? g.result})` : ' ...'}`)
    if ((ply % 2 === 0) === !!g.meIsWhite) {
      const m = await maia(fen, [['his move', played], ...(best ? [["the engine's best", best] as [string, string]] : [])])
      if (m) out.push(`   ${m}`)
    }
  } else {
    out.push(`   the game ended here (${g.termination ?? g.result})`)
  }
  const desc = await cli(['knowledge', 'describe', '--fen', fen])
  const th = desc?.threats
  if (th) {
    const side = (k: 'w' | 'b') => {
      const mates = th.mateInOne?.[k] ?? []
      const caps = (th.winningCaptures?.[k] ?? []).map((c: any) => c.san)
      return `${k === 'w' ? 'White' : 'Black'}: ${mates.length ? `mate in one with ${mates.join(', ')}; ` : ''}${caps.length ? `captures that win material: ${caps.join(', ')}` : 'no winning capture'}`
    }
    out.push(`   threats on the board (if each side were to move): ${side('w')}. ${side('b')}.`)
  }
  const rd = await cli(['knowledge', 'readings', '--fen', fen])
  if (rd) {
    const r = (k: 'w' | 'b') => {
      const x = rd[k] || {}
      return `${k === 'w' ? 'White' : 'Black'} loose ${(x.loose || []).join(' ') || 'none'} (attacked ${(x.looseAttacked || []).join(' ') || 'none'}), king ${x.king?.square ?? '?'} with attackers near it ${(x.king?.ringAttackers || []).join(' ') || 'none'}, passed pawns ${(x.pawns?.passed || []).join(' ') || 'none'}`
    }
    out.push(`   readings: ${r('w')}; ${r('b')}`)
  }
  const ag = analysis.find((x: any) => x.url && x.url === g.url) ?? analysis.find((x: any) => x.opp === g.opp && (x.sans || []).join(' ') === sans.join(' '))
  for (const pl of ag?.plans || []) {
    if (pl.ply !== ply) continue
    for (const a of pl.alts || []) out.push(`   the engine's plan line here (analyze.cjs): ${a.line}`)
    const hp = pl.humanPlan
    if (hp?.steps?.length) out.push(`   the human plan here (the Maia step's plan walk at band ${hp.elo}): ${hp.steps.map((x: any) => `${x.san} (${x.who === 'you' ? 'his' : 'theirs'}, ${pct(x.prob ?? 0)})`).join(', ')}`)
  }
  out.push(`   what each piece hits and guards on screen (by line of sight, pins ignored):`)
  out.push(...relations(fen).map((l) => `     ${l}`))
  let cur = fen
  let gp = ply
  let k = 0
  for (const beat of s.beats || []) {
    k++
    for (const label of ['move', 'reply'] as const) {
      const san = beat?.insights?.[label]
      if (typeof san === 'string' && san) {
        out.push(`   beat ${k} reads a ${label === 'move' ? 'move he could play' : 'reply they could play'}, ${san}, from the board as it stands; what it does: ${await does(cur, san)}`)
      }
    }
    for (const san of Array.isArray(beat?.moves) ? beat.moves : []) {
      const next = play(cur, san)
      if (!next) {
        out.push(`   beat ${k} plays ${san}: not a legal move from ${cur}`)
        continue
      }
      const own = gp < sans.length && cur === fens[gp] && bare(sans[gp]) === bare(san)
      const what = await does(cur, san)
      out.push(`   beat ${k} plays ${san}: ${own ? `the game's own move ${moveLabel(gp, sans[gp])}` : 'not what the game played here (a line that could have happened)'}; what it does: ${what}${own ? '' : `; then ${await bestReply(next, !!g.meIsWhite)}`}`)
      cur = next
      if (own) gp++
    }
  }
  if (cur !== fen) {
    out.push(`   the board after the scene's moves: ${cur}; what each piece hits and guards then:`)
    out.push(...relations(cur).map((l) => `     ${l}`))
  }
  return out
}

const lines: string[] = []
if (!scenesOnly) {
  const brief = JSON.parse(readFileSync(join(root, 'coach-log', 'briefs', `${id}.json`), 'utf8'))
  const { games, clock, assignments, inputs, profile, ...lean } = brief
  lines.push('THE BRIEF (every key but games, clock, assignments, inputs and profile, which follow in short form or are left out; every citable number is in facts):')
  lines.push(JSON.stringify(lean))
  lines.push('')
  lines.push("THE VIDEO GRAMMAR'S FIXED CARD (a rule of the video contract every day may restate, not a fact of the day): the clock milestones 8:00 at move 10, 5:30 at 20, 3:00 at 30, 1:30 at 40.")
  lines.push('')
  lines.push(`THE ASSIGNMENTS (title, state, attempts): ${JSON.stringify((assignments || []).map((a: any) => [a.title, a.state, a.attempts?.attempts ?? null]))}`)
  lines.push('')
  if (clock) {
    const { stamps, ...summary } = clock
    lines.push(`THE CLOCK: ${JSON.stringify(summary)}`)
    lines.push("The day's turning points (opponent, move, class, win% lost, seconds thought, seconds left, sharpness, scan step):")
    for (const x of stamps || []) lines.push(`${x.opponent} ${x.moveNo}${x.ply % 2 === 0 ? '.' : '...'}${x.san} ${x.cls ?? ''} lost ${Math.round(x.lossPct ?? 0)} win%, thought ${x.think ?? '?'}s with ${x.clockBefore ?? '?'}s left${x.sharp ? `, ${x.sharp}` : ''}${x.cca ? `, scan step ${x.cca}` : ''}`)
    lines.push('')
  }
  lines.push(`THE DAY'S GAMES (${(games || []).length}), one line each: opponent, his colour, result, his and their accuracy, opening, moves:`)
  for (const g of games || []) lines.push(`${g.opponent} ${g.color} ${g.result} acc ${g.accuracy?.me ?? '?'}/${g.accuracy?.opp ?? '?'} ${g.opening ?? ''} ${g.moves} moves`)
  lines.push('')
  const digest = join(root, 'tools', 'coach-review', '.cache', 'digests', id, 'analyze.txt')
  if (existsSync(digest)) {
    lines.push("ANALYZE.CJS'S DIGEST OF THE DAY (the engine's lines, what was played next, the lesson lines):")
    lines.push(readFileSync(digest, 'utf8'))
  }
  lines.push('')
  const finds: string[] = []
  for (const g of rows) {
    for (const d of g.deep || []) {
      if (!d.find || typeof d.ply !== 'number') continue
      const best = String(d.alts?.[0]?.line ?? '').replace(/^\d+\.(\.\.)?/, '').split(' ')[0] || 'not stored'
      finds.push(`against ${g.opp}, ${moveLabel(d.ply, d.san)} (his move): the engine's best there, ${best}, is played by ${Math.round((d.find.best ?? 0) * 100)}% of players at about ${d.find.elo ?? '?'}, his move by ${Math.round((d.find.played ?? 0) * 100)}%`)
    }
  }
  lines.push("FINDABILITY AT HIS BAND (the routine's Maia step, written to .cache/analysis.json after the digest; how often players at his level play the engine's best move and the move he played, at each turning point it scored):")
  lines.push(...(finds.length ? finds : ['   (none scored)']))
  lines.push('')
}
for (const { name, file } of named) {
  const script = JSON.parse(readFileSync(file, 'utf8'))
  lines.push(`THE BOARD SCENES OF VIDEO ${name}, as the archive and the knowledge service read them:`)
  let n = 0
  for (const [i, s] of (script.scenes || []).entries()) {
    if (!s.board) continue
    n++
    lines.push(...(await scene(`video ${name}, scene ${i + 1}`, s)))
  }
  if (!n) lines.push('   (no board scenes)')
  lines.push('')
}
service?.dispose?.()
process.stdout.write(lines.join('\n') + '\n')
