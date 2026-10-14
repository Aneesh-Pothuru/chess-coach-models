#!/usr/bin/env node
// Writes paper/generated.tex for the decks paper: the census
// (results/census.json), and two positions from the decks, read from the
// census's private rows and the pinned app's published decks. It prints no id,
// opponent or link. It refuses to write when a claim the paper makes no longer
// holds.
//
//   bridge/run.sh projects/drill-decks/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, privateDir, resultsDir } from '../../../bridge/lib/chess.mjs'
import { Chess } from 'chess.js'
import { Generated, board, fixed, movesTex, percent, sansOf, ucisOf, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const census = json(join(resultsDir('drill-decks'), 'census.json'))
const rows = json(join(privateDir('drill-decks'), 'census-rows.json'))
const deck = json(join(CHESS_DIR, 'public/coach/mistake-deck.json'))
const quizzes = json(join(CHESS_DIR, 'public/coach/plan-quizzes.json'))
const g = new Generated('projects/drill-decks/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
g.def('AppCommit', census.app.slice(0, 10))

// ---- the misses deck ----
const M = census.misses
const T = M.byTheme
const n = (o, k) => o[k] ?? 0
g.def('Items', M.items.toLocaleString('en-US')).def('Scored', M.scored.toLocaleString('en-US')).def('Deviations', String(n(M.kinds, 'deviation')))
g.def('Defensive', String(n(M.shape, 'defensive'))).def('Attacking', String(n(M.shape, 'attacking'))).def('Mixed', String(n(M.shape, 'mixed')))
const both = Object.entries(M.cross).filter(([k]) => !k.startsWith('holds/') && !k.endsWith('/other')).reduce((s, [, v]) => s + v, 0)
const neither = n(M.cross, 'holds/other')
claim(both + neither === n(M.shape, 'mixed'), 'mixed is the both and the neither cells')
g.def('Both', String(both)).def('Neither', String(neither)).def('NeitherShare', percent(neither / M.scored, 0))
g.def('DefensiveShare', percent(n(M.shape, 'defensive') / M.scored, 0)).def('AttackingShare', percent(n(M.shape, 'attacking') / M.scored, 0))

const PHASES = ['opening', 'middlegame', 'endgame']
const MOTIFS = ['hangingPiece', 'fork', 'mateIn1', 'backRankMate', 'attackingF2F7']
const phaseItems = PHASES.reduce((s, t) => s + (T[t]?.items ?? 0), 0)
const motifItems = MOTIFS.reduce((s, t) => s + (T[t]?.items ?? 0), 0)
g.def('PhaseItems', String(phaseItems)).def('PhaseShare', percent(phaseItems / M.items, 0)).def('MotifItems', String(motifItems)).def('MotifShare', percent(motifItems / M.items, 0))
g.def('DefItems', String(T.defensiveMove.items)).def('DefShare', percent(T.defensiveMove.items / M.items, 0))
g.def('FeedsSkill', String(M.feedsSkill)).def('FeedsSkillShare', percent(M.feedsSkill / M.scored, 0))

// The table: one row per theme word.
const ORDER = ['defensiveMove', 'hangingPiece', 'fork', 'mateIn1', 'backRankMate', 'middlegame', 'endgame', 'opening'].filter((t) => T[t])
g.block('ThemeTable', [
  '\\begin{tabular}{llrrrrl}',
  '\\toprule',
  'word & skill it feeds & items & defensive & attacking & mixed & fits \\\\',
  '\\midrule',
  ...ORDER.map((t) => {
    const x = T[t]
    const fit = x.fits ? `${x.fits.k} of ${x.fits.n} (${percent(x.fits.k / x.fits.n, 0)}\\%)` : 'not scored'
    return `\\texttt{${t}} & ${x.competency ? `\\texttt{${x.competency}}` : '--'} & ${x.items} & ${n(x.shape, 'defensive')} & ${n(x.shape, 'attacking')} & ${n(x.shape, 'mixed')} & ${fit} \\\\`
  }),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))

const D = T.defensiveMove
const defFit = D.fits.k / D.fits.n
claim(defFit < 0.6, 'the defensive-move word fits under three times in five')
g.def('DefFit', percent(defFit, 0)).def('DefFitK', String(D.fits.k)).def('DefAttacking', String(n(D.shape, 'attacking')))
const defensiveElsewhere = n(M.shape, 'defensive') - n(D.shape, 'defensive')
g.def('DefensiveElsewhere', String(defensiveElsewhere)).def('DefRecall', percent(n(D.shape, 'defensive') / n(M.shape, 'defensive'), 0))
claim(defensiveElsewhere > n(D.shape, 'defensive'), 'more defensive misses carry another word than carry defensiveMove')

const phaseAttacking = PHASES.reduce((s, t) => s + n(T[t]?.shape ?? {}, 'attacking'), 0)
const phaseDefensive = PHASES.reduce((s, t) => s + n(T[t]?.shape ?? {}, 'defensive'), 0)
claim(phaseAttacking >= 100, 'at least a hundred missed wins are filed under a phase')
g.def('PhaseAttacking', String(phaseAttacking)).def('PhaseDefensive', String(phaseDefensive)).def('AttackingNamed', percent((n(M.shape, 'attacking') - phaseAttacking - n(D.shape, 'attacking')) / n(M.shape, 'attacking'), 0))
// What the move describer names on the missed wins filed under a phase.
const phaseAttackingRows = rows.misses.filter((r) => PHASES.includes(r.theme) && r.shape === 'attacking')
const describedNothing = phaseAttackingRows.filter((r) => r.named.length === 0).length
g.def('PhaseAttackingNothing', percent(describedNothing / phaseAttackingRows.length, 0))

const E = T.endgame
g.def('EndgameItems', String(E.items)).def('EndgameDefensive', String(n(E.shape, 'defensive'))).def('EndgameCompetency', `\\texttt{${E.competency}}`)

const HP = T.hangingPiece
const hpFit = HP.fits.k / HP.fits.n
const hpPawn = n(HP.smallGain, '1')
claim(hpFit < 0.7 && (HP.fits.k + hpPawn) / HP.fits.n >= 0.8, 'hanging piece fits under seven in ten by the rule, and at least eight in ten counting a pawn')
g.def('HangFit', percent(hpFit, 0)).def('HangPawn', String(hpPawn)).def('HangFitPawn', percent((HP.fits.k + hpPawn) / HP.fits.n, 0)).def('HangItems', String(HP.items))
g.def('MateFit', `${T.mateIn1.fits.k} of ${T.mateIn1.fits.n}`).def('ForkFit', `${T.fork.fits.k} of ${T.fork.fits.n}`)

// ---- the quiz ----
const Q = census.quiz
const r1 = n(Q.right, '1')
const r2 = n(Q.right, '2')
claim(Q.plan / Q.items < 0.25, 'under a quarter of the quizzes ask a plan question with one right answer')
claim(r2 / Q.items >= 0.25, 'a quarter or more of the quizzes have two right answers')
claim(Q.forcingOrMaterial / Q.items > 0.5, 'most quizzes have a forcing or a material best option')
g.def('Quizzes', String(Q.items)).def('Margin', String(Q.margin)).def('TwoRight', word(r2)).def('TwoRightShare', percent(r2 / Q.items, 0)).def('OneRight', String(r1))
g.def('Forcing', String(Q.forcing)).def('Material', word(Q.material)).def('ForcingOrMaterial', String(Q.forcingOrMaterial)).def('ForcingShare', percent(Q.forcingOrMaterial / Q.items, 0))
g.def('PlayedBest', String(Q.playedBest)).def('PlanQuestions', word(Q.plan)).def('PlanShare', percent(Q.plan / Q.items, 0))

// ---- positions: the first in the deck's own order that fits each description ----
const byId = new Map(deck.map((it) => [it.id, it]))
const showMiss = (name, test, what) => {
  const r = rows.misses.find(test)
  if (!r) throw new Error(`no deck item is ${what}`)
  const it = byId.get(r.id)
  const bestOpt = it.options.find((o) => o.move === it.best)
  const bestSans = sansOf(bestOpt.line)
  const playedUci = ucisOf(it.fen, [it.played])[0]
  g.block(`${name}Board`, board(it.fen, { played: playedUci, better: it.bestUci, size: '14pt' }))
  g.def(`${name}Fen`, `\\fen{${it.fen}}`).def(`${name}Played`, movesTex(it.fen, [it.played])).def(`${name}Line`, movesTex(it.fen, bestSans)).def(`${name}Uci`, `\\uci{${ucisOf(it.fen, bestSans).join(' ')}}`)
  g.def(`${name}Theme`, `\\texttt{${it.theme}}`).def(`${name}Skill`, r.competency ? `\\texttt{${r.competency}}` : 'no skill').def(`${name}Drop`, String(it.wpDrop))
  const after = new Chess(it.fen)
  after.move(it.played)
  if (it.punish) g.def(`${name}Punish`, movesTex(after.fen(), sansOf(it.punish)))
  return r
}
showMiss('Def', (r) => PHASES.includes(r.theme) && r.shape === 'defensive' && r.played === 'allowedMate', 'a missed defence against mate filed under a phase')
showMiss('Win', (r) => PHASES.includes(r.theme) && r.shape === 'attacking' && r.best === 'wins' && r.bestDelta >= 3 && r.playedDelta >= 0, 'a missed win filed under a phase')
// The rule's own limit: defensive-move items it reads as a win he missed, by how much the best line wins.
const defWins = rows.misses.filter((r) => r.theme === 'defensiveMove' && r.shape === 'attacking' && r.best === 'wins')
g.def('DefWinsSmall', String(defWins.filter((r) => r.bestDelta <= 2).length)).def('DefWins', String(defWins.length))

const qrow = rows.quiz.find((r) => r.forcing && r.material && r.right === 1)
const q = quizzes.find((x) => x.id === qrow.id)
const top = [...q.options].sort((a, b) => b.eval - a.eval)
const qSans = sansOf(top[0].line)
g.block('QuizBoard', board(q.fen, { better: ucisOf(q.fen, [top[0].move])[0], size: '14pt' }))
g.def('QuizFen', `\\fen{${q.fen}}`).def('QuizLine', movesTex(q.fen, qSans)).def('QuizUci', `\\uci{${ucisOf(q.fen, qSans).join(' ')}}`)
g.def('QuizOptions', top.map((o) => `${movesTex(q.fen, [o.move])} (${fixed(o.eval / 100, 1)})`).join(', '))
g.def('QuizLead', fixed(qrow.lead / 100, 1))

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/drill-decks/paper/generated.tex')
