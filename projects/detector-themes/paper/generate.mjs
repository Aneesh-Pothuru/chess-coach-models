#!/usr/bin/env node
// Writes paper/generated.tex for the motif-labels paper: the scores on the
// app's pool and the held-out set (results/score-*.json), and three held-out
// puzzles read from the rebuilt labels (data/processed/). It refuses to write
// when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/detector-themes/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { LAB_DIR, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, board, esc, fixed, line, movesTex } from '../../paper.mjs'

// The later sample is deliberately not substituted into the historical boards.
// This branch preserves the historical artifact and checks the round-two test.
if (process.argv.includes('--round2')) {
  await import('./generate-round2.mjs')
  process.exit(0)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const score = { app: json(join(resultsDir('detector-themes'), 'score-app.json')), heldout: json(join(resultsDir('detector-themes'), 'score-heldout.json')) }
const g = new Generated('projects/detector-themes/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
if (score.app.app !== score.heldout.app) throw new Error('the two sets were scored on different app commits')
g.def('AppCommit', score.app.app.slice(0, 10))
g.def('AppPuzzles', score.app.puzzles.toLocaleString('en-US')).def('HeldPuzzles', score.heldout.puzzles.toLocaleString('en-US'))
claim(score.app.skipped === 0 && score.heldout.skipped === 0, 'every puzzle replays')

const cell = (set, l, c) => score[set].table[l][c] ?? { tp: 0, fp: 0, fn: 0, precision: null, recall: null }
const said = (x) => x.tp + x.fp
const real = (x) => x.tp + x.fn

// ---- the tables: concepts both vocabularies have a word for ----
const CONCEPTS = ['checkmate', 'fork', 'discovered-attack', 'skewer', 'pin', 'hanging-piece', 'defensive-move', 'back-rank-mate', 'trapped-piece', 'deflection', 'attraction', 'f7-raid', 'double-check', 'zwischenzug', 'removing-the-defender', 'promotion', 'passed-pawn']
const pr = (x) => (said(x) === 0 ? '\\multicolumn{2}{c}{never said}' : `${fixed(x.precision, 2)} & ${fixed(x.recall, 2)}`)
const table = (l) =>
  [
    '\\begin{tabular}{lrrrrrrrr}',
    '\\toprule',
    ' & \\multicolumn{4}{c}{the app\'s pool} & \\multicolumn{4}{c}{held out} \\\\',
    '\\cmidrule(lr){2-5}\\cmidrule(lr){6-9}',
    'concept & tagged & said & precision & recall & tagged & said & precision & recall \\\\',
    '\\midrule',
    ...CONCEPTS.filter((c) => !(l === 'blunder' && c === 'checkmate')).map((c) => {
      const a = cell('app', l, c)
      const h = cell('heldout', l, c)
      return `${esc(c)} & ${real(a)} & ${said(a)} & ${pr(a)} & ${real(h)} & ${said(h)} & ${pr(h)} \\\\`
    }),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n')
g.block('TableBest', table('best')).block('TableBlunder', table('blunder')).block('TableMove', table('move'))

// ---- the claims the text makes ----
for (const set of ['app', 'heldout']) {
  for (const c of ['pin', 'skewer', 'discovered-attack', 'deflection', 'attraction', 'trapped-piece']) claim(said(cell(set, 'best', c)) === 0, `the misses deck's labeller never names ${c} (${set})`)
  claim(cell(set, 'best', 'defensive-move').precision < 0.1, `defensive move is right under one time in ten (${set})`)
  for (const c of ['pin', 'skewer', 'back-rank-mate', 'trapped-piece']) claim(said(cell(set, 'blunder', c)) === 0, `the review scan never tags ${c} (${set})`)
  const hp = cell(set, 'blunder', 'hanging-piece')
  claim(hp.precision < 0.5 && said(hp) > 2 * real(hp), `the review scan tags a hanging piece on more than twice the puzzles that have one (${set})`)
  for (const l of ['best', 'blunder', 'move']) claim(cell(set, l, 'fork').precision > 0.85, `fork is named precisely by ${l} (${set})`)
  for (const c of ['skewer', 'discovered-attack']) claim(cell(set, 'move', c).precision > 0.6 && cell(set, 'move', c).recall > 0.5, `describeMove names ${c} (${set})`)
  claim(cell(set, 'move', 'pin').recall < 0.3, `describeMove misses most pins (${set})`)
  claim(cell(set, 'move', 'back-rank-mate').precision < 0.3, `describeMove's back-rank mate is mostly wrong (${set})`)
}
const H = (l, c) => cell('heldout', l, c)
const A = (l, c) => cell('app', l, c)
g.def('DefSaidApp', String(said(A('best', 'defensive-move')))).def('DefSaidHeld', said(H('best', 'defensive-move')).toLocaleString('en-US'))
g.def('DefPrecApp', fixed(A('best', 'defensive-move').precision, 2)).def('DefPrecHeld', fixed(H('best', 'defensive-move').precision, 2))
g.def('DefShareHeld', fixed((100 * score.heldout.bestWords.defensiveMove) / score.heldout.puzzles, 0))
const phaseWords = (set) => ['opening', 'middlegame', 'endgame'].reduce((s, w) => s + (score[set].bestWords[w] ?? 0), 0)
g.def('PhaseShareApp', fixed((100 * phaseWords('app')) / score.app.puzzles, 0)).def('PhaseShareHeld', fixed((100 * phaseWords('heldout')) / score.heldout.puzzles, 0))
g.def('HangSaidApp', String(said(A('blunder', 'hanging-piece')))).def('HangRealApp', String(real(A('blunder', 'hanging-piece'))))
g.def('HangSaidHeld', said(H('blunder', 'hanging-piece')).toLocaleString('en-US')).def('HangRealHeld', String(real(H('blunder', 'hanging-piece'))))
g.def('HangPrecApp', fixed(A('blunder', 'hanging-piece').precision, 2)).def('HangPrecHeld', fixed(H('blunder', 'hanging-piece').precision, 2))
g.def('BestHangPrecApp', fixed(A('best', 'hanging-piece').precision, 2)).def('BestHangPrecHeld', fixed(H('best', 'hanging-piece').precision, 2))
g.def('BrmSaidHeld', String(said(H('best', 'back-rank-mate')))).def('BrmTpHeld', String(H('best', 'back-rank-mate').tp)).def('BrmSaidApp', String(said(A('best', 'back-rank-mate'))))
g.def('MovePinRecHeld', fixed(H('move', 'pin').recall, 2)).def('MoveBrmPrecHeld', fixed(H('move', 'back-rank-mate').precision, 2))
// Lichess themes the vocabulary does not resolve: the named mates.
const NAMED = Object.keys(score.heldout.unmappedThemes).filter((t) => /Mate$/.test(t))
const namedCount = NAMED.reduce((s, t) => s + score.heldout.unmappedThemes[t], 0)
g.def('NamedMates', NAMED.map((t) => `\\texttt{${t}}`).join(', ')).def('NamedMateTags', namedCount.toLocaleString('en-US'))
claim(NAMED.length >= 5, 'the vocabulary leaves at least five named mates unresolved')

// ---- three held-out puzzles: the first by id that fits each description ----
const labels = json(join(LAB_DIR, 'data/processed/detector-themes-labels-heldout.json'))
const puzzles = new Map(json(join(LAB_DIR, 'data/processed/detector-themes-heldout.json')).map((p) => [p.id, p]))
const short = (r) => puzzles.get(r.id).moves.split(' ').length === 4 && r.rating >= 900 && r.rating <= 1500
const pick = (test, what) => {
  const r = labels.filter(short).sort((a, b) => (a.id < b.id ? -1 : 1)).find(test)
  if (!r) throw new Error(`no held-out puzzle is ${what}`)
  return r
}
const examples = [
  ['Pin', pick((r) => r.best === 'defensiveMove' && r.themes.includes('pin') && r.move.includes('pin'), 'a pin filed as a defensive move')],
  ['Skewer', pick((r) => r.best === 'defensiveMove' && r.themes.includes('skewer') && r.move.includes('skewer'), 'a skewer filed as a defensive move')],
  ['Fork', pick((r) => r.blunder.includes('hangingPiece') && !r.themes.includes('hangingPiece') && r.themes.includes('fork') && !r.themes.includes('mate') && r.best === 'fork', 'a fork the scan calls a hanging piece')],
]
for (const [name, r] of examples) {
  const p = puzzles.get(r.id)
  const ucis = p.moves.split(' ')
  const c = new Chess(p.fen)
  c.move({ from: ucis[0].slice(0, 2), to: ucis[0].slice(2, 4), promotion: ucis[0][4] })
  const fen = c.fen()
  const first = line(p.fen, ucis.slice(0, 1))
  const sol = line(fen, ucis.slice(1))
  g.block(`${name}Board`, board(fen, { played: ucis[0], better: ucis[1], size: '13pt' }))
  g.def(`${name}Id`, esc(r.id)).def(`${name}Rating`, String(r.rating)).def(`${name}Fen`, `\\fen{${fen}}`)
  g.def(`${name}First`, movesTex(p.fen, first.sans)).def(`${name}Line`, movesTex(fen, sol.sans)).def(`${name}Uci`, `\\uci{${ucis.slice(1).join(' ')}}`)
  g.def(`${name}Themes`, r.themes.map((t) => `\\texttt{${t}}`).join(', '))
  g.def(`${name}Best`, `\\texttt{${r.best}}`).def(`${name}Blunder`, r.blunder.length ? r.blunder.map((t) => `\\texttt{${t}}`).join(', ') : 'nothing').def(`${name}Move`, r.move.length ? r.move.map((t) => `\\texttt{${esc(t)}}`).join(', ') : 'nothing')
}

// ---- the first candidate: the describer's tactics before the defensive fallback ----
const cmp = json(join(resultsDir('detector-themes'), 'compare-describe-first.json'))
claim(cmp.verdict === 'keep', 'the describe-first candidate is kept by the rule')
const pts = (x) => fixed(100 * x, 1)
for (const [set, name] of [['app', 'App'], ['heldout', 'Held']]) {
  const c = cmp.sets[set]
  g.def(`Cand${name}AgreeBase`, pts(c.base.agree)).def(`Cand${name}Agree`, pts(c.candidate.agree))
  g.def(`Cand${name}AgreeDiff`, pts(c.agreeDiff)).def(`Cand${name}AgreeCi`, `[${pts(c.agreeCi[0])}, ${pts(c.agreeCi[1])}]`)
  g.def(`Cand${name}DisDiff`, pts(c.disagreeDiff)).def(`Cand${name}DisCi`, `[${pts(c.disagreeCi[0])}, ${pts(c.disagreeCi[1])}]`)
}
g.def('CandDraws', cmp.draws.toLocaleString('en-US'))
// The same labeller on the misses deck (the drill-decks census, re-filed by the candidate).
const deckBase = json(join(resultsDir('drill-decks'), 'census-retheme-base.json')).misses.byTheme
const deckCand = json(join(resultsDir('drill-decks'), 'census-describe-first.json')).misses.byTheme
const NEW = ['skewer', 'discoveredAttack', 'pin']
const moved = NEW.reduce((s, w) => s + (deckCand[w]?.items ?? 0), 0)
const movedFit = NEW.reduce((s, w) => s + (deckCand[w]?.fits?.k ?? 0), 0)
claim(moved > 0 && moved < 100, 'the candidate re-files a few dozen of the deck positions')
claim(deckBase.defensiveMove.items === 405, 'the pinned labeller re-files the deck exactly as published')
g.def('DeckMoved', String(moved)).def('DeckMovedFit', String(movedFit)).def('DeckPins', String(deckCand.pin.items)).def('DeckPinsFit', String(deckCand.pin.fits.k))

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/detector-themes/paper/generated.tex')
