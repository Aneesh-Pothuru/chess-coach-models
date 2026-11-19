// The truth check of review-writer's rule, in code. In each text a writer wrote
// for a moment, every move, square and number it names must be among the fact
// sheet's; every piece it places on a square must stand on that square in one of
// the positions the facts are about (before the move, or along the lines of the
// move played, the better move and the mistake's reply), unless the facts' own
// sentences place it there (a mate's last position can lie past the lines kept);
// and a mate it names must be one the facts name. Today's text is checked the
// same way, as a control.
//
//   bridge/run.sh projects/review-writer/check.mjs --texts <file.jsonl> --name <name>
//   bridge/run.sh projects/review-writer/check.mjs --today --split train|heldout
//
// A texts file holds one line a text: {"id": "<game>:<index>", "writer": "<name>", "text": "..."}.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { privateDir } from '../../bridge/lib/chess.mjs'
import { PROJECT, momentId, readFacts, readJsonl, todayText } from './lib.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const MOVE = /(?<![A-Za-z0-9])(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?(?![A-Za-z0-9])/g
const SQUARE = /(?<![A-Za-z0-9])[a-h][1-8](?![A-Za-z0-9])/g
const NUMBER = /(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?![A-Za-z0-9])/g
const PIECE_ON = /\b(king|queen|rook|bishop|knight|pawn)s?\s+(?:on|at)\s+([a-h][1-8])\b/gi
const MATE = /\b(?:mate|mates|mated|mating|checkmate|checkmates|checkmated)\b/i
const LETTER = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

const bare = (san) => san.replace(/[+#!?]+$/, '')

function play(fen, moves) {
  const board = new Chess(fen)
  for (const move of moves) {
    try {
      board.move(move)
    } catch {
      return null
    }
  }
  return board
}

/** Every position along a line of moves (SAN, or UCI when `uci`), the start included. */
function walk(fen, moves, uci = false) {
  const board = new Chess(fen)
  const out = [new Chess(board.fen())]
  for (const move of moves) {
    try {
      board.move(uci ? { from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] } : move)
    } catch {
      break
    }
    out.push(new Chess(board.fen()))
  }
  return out
}

const sansOf = (line) => (line ? line.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t)) : [])

function lineSans(fen, ucis) {
  const board = new Chess(fen)
  const out = []
  for (const uci of ucis) {
    try {
      out.push(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
    } catch {
      break
    }
  }
  return out
}

/** Everything the facts let a text name, and the positions they are about. */
function vocabularyOf(m) {
  const l = m.lesson
  const strings = [
    l.headline, ...l.yourMove, ...l.difference, l.takeaway ?? '',
    l.allowed?.san ?? '', ...(l.allowed?.points ?? []), l.allowed?.line ?? '',
    l.better?.san ?? '', ...(l.better?.points ?? []), l.better?.line ?? '',
    m.played.san, m.best.san ?? '',
    ...(m.reading?.fix ?? []).map((p) => p.text), ...(m.reading?.reply ?? []).map((p) => p.text),
    m.link?.title ?? '', m.link?.why ?? '',
  ].filter(Boolean)
  const joined = strings.join(' \n ')
  const moves = new Set([...joined.matchAll(MOVE)].map((x) => bare(x[0])))
  for (const san of lineSans(m.fen, m.best.pv ?? [])) moves.add(bare(san))
  const afterPlayed = play(m.fen, [m.played.san])
  const mistake = m.reading?.mistake
  if (mistake && afterPlayed) for (const san of lineSans(afterPlayed.fen(), mistake.line ?? [])) moves.add(bare(san))
  for (const s of [m.played.san, m.best.san, l.allowed?.san, l.better?.san]) if (s) moves.add(bare(s))
  const squares = new Set([...joined.matchAll(SQUARE)].map((x) => x[0]))
  for (const p of [...(m.reading?.fix ?? []), ...(m.reading?.reply ?? [])]) for (const sq of p.squares ?? []) squares.add(sq)
  if (mistake?.square) squares.add(mistake.square)
  for (const s of moves) for (const sq of s.match(/[a-h][1-8]/g) ?? []) squares.add(sq)
  const numbers = new Set([...joined.matchAll(NUMBER)].map((x) => Number(x[0])))
  for (const [word, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`, 'i').test(joined)) numbers.add(n)
  const amounts = [m.lossPct, l.allowed?.material, l.better?.material, mistake?.points].filter(Number.isFinite)
  for (const n of [Math.round(m.lossPct), Math.round(m.lossPct * 10) / 10, m.rating, m.opponentRating, m.moveNumber, ...amounts.map((a) => Math.abs(Math.round(a)))]) {
    if (Number.isFinite(n)) numbers.add(n)
  }
  const positions = [
    ...walk(m.fen, sansOf(l.allowed?.line ?? m.played.san)),
    ...walk(m.fen, sansOf(l.better?.line ?? m.best.san)),
    ...walk(m.fen, m.best.pv ?? [], true),
    ...(afterPlayed ? walk(afterPlayed.fen(), mistake?.line ?? [], true) : []),
  ]
  const stated = new Set([...joined.matchAll(PIECE_ON)].map((x) => `${x[1].toLowerCase()}@${x[2]}`))
  return { moves, squares, numbers, positions, stated, mate: MATE.test(joined) }
}

function verdictOf(text, v) {
  const misses = []
  for (const x of text.matchAll(MOVE)) if (!v.moves.has(bare(x[0]))) misses.push(`move ${x[0]} is not in the facts`)
  const placed = new Set()
  for (const x of text.matchAll(PIECE_ON)) {
    const type = LETTER[x[1].toLowerCase()]
    const square = x[2]
    placed.add(square)
    if (v.stated.has(`${x[1].toLowerCase()}@${square}`)) continue
    if (!v.positions.some((board) => board.get(square)?.type === type)) misses.push(`no ${x[1].toLowerCase()} stands on ${square}`)
  }
  for (const x of text.matchAll(SQUARE)) if (!v.squares.has(x[0]) && !placed.has(x[0])) misses.push(`square ${x[0]} is not in the facts`)
  for (const x of text.matchAll(NUMBER)) if (!v.numbers.has(Number(x[0]))) misses.push(`number ${x[0]} is not in the facts`)
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\s+(?:pawns?|pieces?|moves?|points?)\\b`, 'i').test(text) && !v.numbers.has(n)) misses.push(`"${word}" is not in the facts`)
  }
  if (MATE.test(text) && !v.mate) misses.push('a mate the facts do not name')
  return misses
}

const dir = privateDir(PROJECT)
const facts = new Map(readFacts(dir).map((m) => [momentId(m), m]))
let texts
let name
if (process.argv.includes('--today')) {
  const split = arg('split', 'train')
  const idsPath = arg('ids')
  const only = idsPath ? new Set(readJsonl(idsPath).map((r) => r.id)) : null
  name = idsPath ? `today-${split}-${only.size}` : `today-${split}`
  texts = [...facts.values()]
    .filter((m) => m.split === split && (!only || only.has(momentId(m))))
    .map((m) => ({ id: momentId(m), writer: 'today', text: todayText(m) }))
} else {
  const path = arg('texts')
  name = arg('name')
  if (!path || !name) throw new Error('usage: check.mjs --texts <file.jsonl> --name <name> | --today --split train|heldout')
  texts = readJsonl(path)
}

const wordsOf = (text) => text.split(/\s+/).filter(Boolean).length
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

const rows = []
const byWriter = {}
const words = {}
for (const t of texts) {
  const m = facts.get(t.id)
  if (!m) throw new Error(`no fact sheet for ${t.id}`)
  const misses = verdictOf(t.text ?? '', vocabularyOf(m))
  rows.push({ id: t.id, writer: t.writer, split: m.split, pass: misses.length === 0, misses, words: wordsOf(t.text ?? '') })
  const w = (byWriter[t.writer] ??= { texts: 0, passed: 0 })
  w.texts += 1
  w.passed += misses.length === 0 ? 1 : 0
  ;(words[t.writer] ??= []).push(wordsOf(t.text ?? ''))
}
for (const [writer, w] of Object.entries(byWriter)) {
  w.passRate = w.texts ? Math.round((w.passed / w.texts) * 10000) / 10000 : null
  w.medianWords = median(words[writer])
}
writeFileSync(join(dir, `check-${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
const summary = { name, texts: rows.length, byWriter }
writeFileSync(join(dir, `check-${name}.json`), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
