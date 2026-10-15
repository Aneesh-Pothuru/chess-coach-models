#!/usr/bin/env node
// The text defects the correctness rounds fix, counted in a variant's cases:
// round 11's five, which the player's calibration answers and the judges'
// notes flagged, round 14's two, the pieces an amount names, and round 17c's
// one, a move given two scores. Each is read off the texts the player sees;
// round 14's through the grader, which knows the line each amount is counted
// on.
//
//   lowercaseReveal      a sentence of the retry reveal after the first opens
//                        in lower case (one opening on a pawn's move or a
//                        square excepted)
//   recaptureOutright    a reply that takes back what the move captured,
//                        called a win "outright"
//   quietForcing         "a quiet improvement like X" where X captures or checks
//   unsettledVsOutright  "too short or unsettled" beside a capture the same
//                        lesson calls outright
//   pieceOverAmount      "(your rook on d7)" naming a piece worth more than
//                        the amount it says was lost
//   amountNamesUnwon     an amount said as pieces ("a rook", "a piece and a
//                        pawn") that are not the pieces that changed hands on
//                        its line ("a rook" for a bishop and two pawns), or a
//                        "won for given" phrase that names the wrong ones
//   fallenGivenBack      "the knight on c3 falls" beside an amount, where the
//                        line gives that piece back
//   gradeScoreDiffers    the folded grade text gives a move another score than
//                        "The difference" gives it (+4.5 there, +4.6 here)
//
//   bridge/run.sh projects/explain-top-move/defects.mjs <cases.json> [--out defects.json]
//
// Prints the counts. --out also writes the moments behind each count; that
// file names moments, so it stays under private/ or in the research records.

import { Chess } from 'chess.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VALUE, gradeMoment } from './grade.mjs'

const WORTH = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 }

/** The lesson's material phrases (knowledge/detectors/lesson.ts materialPhrase), in pawns. */
function amount(s) {
  if (s === 'a pawn') return 1
  if (s === "two pawns' worth of material") return 2
  if (s === 'a piece') return 3
  if (s === 'a rook') return 5
  if (s === 'a queen') return 9
  if (s === 'a piece and a pawn') return 4
  const pawns = /^a piece and (\d+) pawns$/.exec(s)
  if (pawns) return 3 + Number(pawns[1])
  const about = /^about (\d+) pawns of material$/.exec(s)
  return about ? Number(about[1]) : null
}

export const DEFECTS = ['lowercaseReveal', 'recaptureOutright', 'quietForcing', 'unsettledVsOutright', 'pieceOverAmount', 'amountNamesUnwon', 'fallenGivenBack', 'gradeScoreDiffers']

/** The two moves' scores in the grade text: "(+4.5 for you after Re5, +5.9 for you after Rxd8+)". */
function gradeScores(grade) {
  const m = grade && /\(([^()]*) after ([^,()]+), ([^()]*) after ([^()]+)\)/.exec(grade)
  return m ? new Map([[m[2], m[1]], [m[4], m[3]]]) : new Map()
}

/** The scores "The difference" gives: "much better after Re5 (+4.6)", "After Kg4 you are losing (-7.0)". */
function sentenceScores(difference) {
  const out = new Map()
  const text = (difference ?? []).join(' ')
  for (const m of text.matchAll(/after ([^ ()]+) \(([+-]?\d+\.\d)\)/g)) out.set(m[1], m[2])
  for (const m of text.matchAll(/After ([^ ]+) (?:you|they) (?:are|would be) [a-z ]+ \(([+-]?\d+\.\d)\)/g)) out.set(m[1], m[2])
  return out
}

/** The moments showing each defect, by moment id. */
export function defects(cases) {
  const out = Object.fromEntries(DEFECTS.map((d) => [d, []]))
  for (const c of cases) {
    const id = `${c.game}-${c.ply}`
    const lesson = c.texts?.lessonFor
    const reason = c.texts?.retryTeaching?.reason
    if (reason && /[.!?] (?![a-h](?:x[a-h])?[1-8])[a-z]/.test(reason)) out.lowercaseReveal.push(id)
    if (lesson?.allowed?.san && /outright/.test((lesson.allowed.points ?? []).join(' '))) {
      const g = new Chess(c.fenBefore)
      const mv = g.move({ from: c.uci.slice(0, 2), to: c.uci.slice(2, 4), promotion: c.uci[4] })
      let reply = null
      try {
        reply = g.move(lesson.allowed.san)
      } catch {
        reply = null
      }
      if (mv?.captured && reply?.captured && reply.to === mv.to && VALUE[mv.piece] <= VALUE[mv.captured]) out.recaptureOutright.push(id)
    }
    const quiet = lesson?.takeaway && /quiet improvement like (\S+)/.exec(lesson.takeaway)
    if (quiet && /x|\+|#/.test(quiet[1])) out.quietForcing.push(id)
    const said = [lesson?.headline, ...(lesson?.allowed?.points ?? []), ...(lesson?.better?.points ?? [])].join(' ')
    if ((lesson?.difference ?? []).some((d) => /too short or unsettled/.test(d)) && /outright/.test(said)) out.unsettledVsOutright.push(id)
    for (const d of lesson?.difference ?? []) {
      const m = /, (?:they|you) win (.+?) \((?:your|their) (pawn|knight|bishop|rook|queen) on [a-h][1-8]\) in the engine's line/.exec(d)
      if (m && amount(m[1]) !== null && WORTH[m[2]] > amount(m[1])) out.pieceOverAmount.push(id)
    }
    const claims = gradeMoment(c).claims
    if (claims.some((x) => x.named?.plain === false || /^the pieces that changed hands are /.test(x.reason))) out.amountNamesUnwon.push(id)
    if (claims.some((x) => x.fallen && !x.fallen.kept)) out.fallenGivenBack.push(id)
    const graded = gradeScores(lesson?.grade)
    const differs = [...sentenceScores(lesson?.difference)].some(([san, said]) => {
      const there = /[+-]?\d+\.\d/.exec(graded.get(san) ?? '')
      return there !== null && Number(there[0]) !== Number(said)
    })
    if (differs) out.gradeScoreDiffers.push(id)
  }
  return out
}

function main() {
  const args = process.argv.slice(2)
  const at = args.indexOf('--out')
  const outPath = at >= 0 ? resolve(args[at + 1]) : null
  const file = args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1))
  if (!file) throw new Error('usage: defects.mjs <cases.json> [--out defects.json]')
  const found = defects(JSON.parse(readFileSync(resolve(file), 'utf8')))
  const counts = Object.fromEntries(DEFECTS.map((d) => [d, found[d].length]))
  if (outPath) writeFileSync(outPath, `${JSON.stringify({ counts, moments: found }, null, 1)}\n`)
  console.log(JSON.stringify(counts))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
