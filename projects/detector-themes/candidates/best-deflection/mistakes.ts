import { Chess } from 'chess.js'
import { replaySans } from '../../../core/chess'
import { MATE_CP_MIN, winPercent } from '../../../core/score'
import { explainMove, themeOfBest } from '../../knowledge'
import type { ReviewRow } from '../review/game'
import { ACCEPT_WINDOW_WP, difficultyOf, gradeMisses, winPctOfCp, type DeckOption, type ProbeMap } from './gate'

export type DeckGame = ReviewRow & { day: string }

export function clockAfter(g: Pick<DeckGame, 'clocks'>, ply: number): number | null {
  const v = g.clocks?.[ply]
  return typeof v === 'number' ? v : null
}

export type RepertoireNote = (repId: string, path: readonly string[]) => string | null

export type DeckProbes = ProbeMap | ((fens: readonly string[]) => ProbeMap)

export interface MistakeItem {
  opp?: string
  date?: string
  url?: string
  flip: boolean
  result?: string
  id: string
  kind: 'blunder' | 'missedMate' | 'deviation'
  moveNo: number
  ply: number
  fen: string
  played: string | null | undefined
  best: string
  bestUci: string
  options: DeckOption[]
  punish: string | null
  why: string | null
  wpBefore?: number
  wpAfter?: number
  wpDrop?: number
  find?: { best?: number | null; played?: number | null } | null
  theme: string
  clock?: number | null
  repId?: string
  drill?: { difficulty: ReturnType<typeof difficultyOf>; gap: number | null }
  priority?: number
}

export type MistakeCandidate = MistakeItem & { _v2?: boolean; _uniqueGap?: number | null; _mateVerified?: boolean }

export interface MistakeGateReport {
  gated: number
  admitted: number
  heldOut: number
  dropped: Record<string, number>
}

function winPctFrom(cp: unknown): number | undefined {
  return typeof cp === 'number' ? Math.round(winPercent({ cp, mate: null })) : undefined
}

export function firstSan(line: unknown): string {
  const raw = (String(line || '').split(/\s+/)[0] || '').replace(/^\d+\.+/, '').replace(/^\.+/, '')
  return raw.replace(/[!?]+$/, '')
}

function fenAtPly(sans: unknown, ply: number): string | null {
  if (!Array.isArray(sans) || ply > sans.length) return null
  const c = new Chess()
  for (let i = 0; i < ply && i < sans.length; i++) {
    try {
      c.move(sans[i] as string)
    } catch {
      return null
    }
  }
  return c.fen()
}

function whyFor(fen: string, move: { from: string; to: string; promotion?: string }): string | null {
  try {
    return explainMove(fen, move.from + move.to + (move.promotion || '')) || null
  } catch {
    return null
  }
}

type DeepMoment = NonNullable<ReviewRow['deep']>[number] & {
  why?: string | null
  before?: number
  after?: number
  mateVerified?: boolean
}

export function mistakeCandidates(games: readonly DeckGame[], note: RepertoireNote | null = null): MistakeCandidate[] {
  const items: MistakeCandidate[] = []
  for (const g of games) {
    const base = { opp: g.opp as string, date: g.day, url: g.url as string, flip: !g.meIsWhite, result: g.result as string }
    for (const m of (g.deep || []) as DeepMoment[]) {
      const best = firstSan(m.alts && m.alts[0] && m.alts[0].line)
      if (!best || !m.fen) continue
      let verified: { from: string; to: string; promotion?: string } | null = null
      try {
        verified = new Chess(m.fen).move(best)
      } catch {
        verified = null
      }
      if (!verified) continue
      if (best === m.san) continue
      const gap =
        typeof m.gapToSecond === 'number'
          ? m.gapToSecond
          : (() => {
              const wps = (m.alts || []).map((a) => winPctFrom(a.eval)).filter((w): w is number => typeof w === 'number')
              return wps.length >= 2 ? wps[0] - wps[1] : null
            })()
      const alt0 = m.alts && m.alts[0]
      items.push({
        ...base,
        _v2: !!g.division,
        _uniqueGap: gap,
        _mateVerified: !!m.mateSlipped && (m.mateVerified === true || (typeof (alt0 && alt0.eval) === 'number' && (alt0 as { eval: number }).eval >= MATE_CP_MIN)),
        id: `md-${String(g.opp ?? 'unknown').toLowerCase()}-${m.moveNo}-${g.endTime ?? 0}`,
        kind: m.mateSlipped ? 'missedMate' : 'blunder',
        moveNo: m.moveNo as number,
        ply: m.ply,
        fen: m.fen,
        played: m.san,
        best,
        bestUci: verified.from + verified.to + (verified.promotion || ''),
        options: (m.alts || []).map((a) => ({ move: firstSan(a.line), line: a.line, eval: a.eval })),
        punish: m.punish || null,
        why: m.why || whyFor(m.fen, verified),
        wpBefore: (m.wpBefore ?? winPctFrom(m.before)) as number | undefined,
        wpAfter: (m.wpAfter ?? winPctFrom(m.after)) as number | undefined,
        wpDrop:
          (m.wpDrop ??
            (() => {
              const b = winPctFrom(m.before)
              const a = winPctFrom(m.after)
              return typeof b === 'number' && typeof a === 'number' ? b - a : undefined
            })()) as number | undefined,
        find: (m.find as MistakeItem['find']) || null,
        theme: themeOfBest(m.fen, best, replaySans(m.fen, (alt0?.line ?? '').split(/\s+/).map(firstSan).filter(Boolean)).ucis),
        clock: m.clock ?? clockAfter(g, m.ply),
      })
    }
    const book = (g.book || {}) as { deviator?: string; expected?: string; path?: string[]; repId?: string; seen?: string }
    if (note && book.deviator === 'me' && book.expected && book.path) {
      const fen = fenAtPly(g.sans || [], book.path.length)
      let verified: { from: string; to: string; promotion?: string } | null = null
      try {
        if (fen) verified = new Chess(fen).move(book.expected)
      } catch {
        verified = null
      }
      if (fen && verified) {
        items.push({
          ...base,
          id: `md-dev-${String(g.opp ?? 'unknown').toLowerCase()}-${g.endTime ?? 0}`,
          kind: 'deviation',
          moveNo: Math.floor(book.path.length / 2) + 1,
          ply: book.path.length,
          fen,
          played: book.seen,
          best: book.expected,
          bestUci: verified.from + verified.to + (verified.promotion || ''),
          options: [],
          punish: null,
          why: note(book.repId as string, [...book.path, book.expected]) || `The ${book.repId} tree plays ${book.expected} here.`,
          repId: book.repId,
          theme: 'repertoire',
        })
      }
    }
  }
  const byFen = new Map<string, MistakeCandidate>()
  for (const it of items) if (!byFen.has(it.fen)) byFen.set(it.fen, it)
  return [...byFen.values()]
}

export function buildMistakeDeck(games: readonly DeckGame[], opts: { note?: RepertoireNote | null; probes?: DeckProbes } = {}): { deck: MistakeItem[]; gate: MistakeGateReport | null } {
  let deck = mistakeCandidates(games, opts.note ?? null)
  let report: MistakeGateReport | null = null
  const gated = deck.filter((it) => it._v2 && it.kind !== 'deviation')
  if (gated.length > 0) {
    const dropped: Record<string, number> = {}
    const admitted: MistakeCandidate[] = []
    const out = new Set<string>()
    for (const it of gated) {
      const verdict = gradeMisses({ kind: it.kind, wpBefore: it.wpBefore, wpDrop: it.wpDrop, mateVerified: it._mateVerified, options: it.options, played: it.played })
      if (verdict.pass) admitted.push(it)
      else {
        out.add(it.fen)
        const why = verdict.why as string
        dropped[why] = (dropped[why] || 0) + 1
      }
    }
    const probes = typeof opts.probes === 'function' ? opts.probes(admitted.map((it) => it.fen)) : (opts.probes ?? {})
    for (const it of admitted) it.drill = { difficulty: difficultyOf(it, probes), gap: it._uniqueGap ?? null }
    report = { gated: gated.length, admitted: admitted.length, heldOut: out.size, dropped }
    deck = deck.filter((it) => !out.has(it.fen))
  }
  for (const it of deck) {
    delete it._v2
    delete it._uniqueGap
    delete it._mateVerified
  }
  for (const it of deck) {
    const drop = typeof it.wpDrop === 'number' ? it.wpDrop : 12
    const findable = it.find && typeof it.find.best === 'number' ? it.find.best : 0.35
    it.priority = Math.round(drop * (0.25 + findable) * 100) / 100
  }
  deck.sort((a, b) => (b.priority as number) - (a.priority as number))
  return { deck, gate: report }
}

export function mistakeGateLine(r: MistakeGateReport): string {
  return `mistake-deck gate: ${r.admitted} of ${r.gated} new-format items admitted${r.heldOut > 0 ? `; ${r.heldOut} held out (${Object.entries(r.dropped).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`
}

export function acceptSanFor(item: Pick<MistakeItem, 'options' | 'played' | 'best'>): string[] {
  const rated = (item.options || []).filter((o) => o && typeof o.move === 'string' && o.move.length > 0 && typeof o.eval === 'number')
  const accept = new Set<string>()
  if (rated.length > 0) {
    const wps = rated.map((o) => ({ move: o.move, wp: winPctOfCp(o.eval) }))
    const best = Math.max(...wps.map((w) => w.wp))
    for (const w of wps) if (best - w.wp <= ACCEPT_WINDOW_WP) accept.add(w.move)
  }
  accept.delete(item.played as string)
  accept.add(item.best)
  return [...accept]
}
