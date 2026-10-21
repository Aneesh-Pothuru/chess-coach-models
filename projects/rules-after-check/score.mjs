// The measured app supplies Maia and the referee; this pass never runs the check.
import { chess, CHESS_DIR } from '../../bridge/lib/chess.mjs'
import { emptyTimes, engineSound, pick, tablebaseSound, validateScores } from '../rules-of-thumb/score.mjs'
import { bestUci } from '../rules-of-thumb/null-score.mjs'
import { sampleWithoutReplacement } from '../rules-of-thumb/null-common.mjs'
import { cli, guardWindow, require, rowKey, RULES } from './common.mjs'
const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const E = await chess('src/services/engine/index.ts')
const Node = await chess('src/adapters/node/engine/index.ts')

export function storedAliases(row, nullRow, uci) {
  const aliases = ['R', 'N', 'A'].filter(label => row[label] === uci)
  if (nullRow.R0 === uci) aliases.push('R0')
  const values = aliases.map(label => label === 'R0' ? nullRow.sound?.R0 : row.sound?.[label])
  require(values.every(value => typeof value === 'boolean' && value === values[0]), 'matching stored soundness differs')
  return aliases.length ? { label: aliases[0], sound: values[0] } : null
}

export function checkedSets(row, checked, legal) {
  require(checked?.key === rowKey(row) && checked.key === rowKey(checked) && checked.datasetKind === 'rules-after-check', 'checked identity differs')
  require(typeof checked.quiet === 'boolean' && typeof checked.originalRPasses === 'boolean', 'missing checked flags')
  const S = checked.safeMoves, SR = checked.safeRuleMoves
  require(Array.isArray(S) && Array.isArray(SR) && new Set(S).size === S.length && new Set(SR).size === SR.length, 'invalid safe sets')
  require(S.every(uci => legal.includes(uci)) && JSON.stringify(S) === JSON.stringify([...S].sort()), 'safe moves differ from legal moves or order')
  require(JSON.stringify(SR) === JSON.stringify(row.ruleMoves.filter(uci => S.includes(uci)).sort()), 'safe rule intersection differs')
  require(checked.originalRPasses === S.includes(row.R), 'original R pass differs')
  return { S, SR }
}

export async function readCheckedRow(row, nullRow, checked, eng) {
  const started = performance.now(), times = { ...emptyTimes(), reusedMoves: 0, storedProbeReads: 0, newSearches: 0 }
  try {
    require(row.datasetKind === 'amended' && RULES.includes(row.rule), 'only the thirteen inherited rules')
    const board = K.tryBoard(row.fen)
    require(board, 'invalid FEN')
    const legal = board.movesShared().map(move => move.uci)
    require(row.ruleMoves.length && new Set(row.ruleMoves).size === row.ruleMoves.length && row.ruleMoves.every(uci => legal.includes(uci)), 'invalid inherited rule moves')
    const { S, SR } = checkedSets(row, checked, legal)
    for (const label of ['R', 'N', 'A', 'R0']) {
      const uci = label === 'R0' ? nullRow.R0 : row[label]
      require(legal.includes(uci), 'illegal stored move'); storedAliases(row, nullRow, uci)
      require(checked[label] === uci && checked.sound?.[label] === (label === 'R0' ? nullRow.sound.R0 : row.sound[label]), 'checked inherited move differs')
    }
    const small = (row.fen.split(' ')[0].match(/[a-z]/gi) ?? []).length <= 7
    require(row.evidence?.source === (small ? 'tablebase' : 'stockfish'), 'stored referee source differs')
    const base = { key: rowKey(row), datasetKind: 'rules-after-check', month: row.month, game: row.game, rule: row.rule,
      band: row.band, opponentBand: row.opponentBand, quiet: checked.quiet, safeMoves: S, safeRuleMoves: SR,
      originalRPasses: checked.originalRPasses, R: row.R, N: row.N, A: row.A, R0: nullRow.R0,
      sound: { ...row.sound, R0: nullRow.sound.R0 }, splits: { ...checked.splits, forcing: null }, freshSearch: false }
    if (!SR.length) {
      times.rowSeconds = (performance.now() - started) / 1000
      return { ...base, Rs: null, Ns: null, R0s: null, sampledMoves: [], sound: { ...base.sound, Rs: null, Ns: null, R0s: null }, evidence: null, times }
    }
    guardWindow()
    const pos = C.position(row.fen)
    times.maiaCalls++; times.maiaBands = row.band === 1300 ? 1 : 2
    let t = performance.now(), human
    try { human = await eng.humanPolicy(pos, { bands: [...new Set([row.band, 1300])], opponentBand: row.opponentBand }) }
    finally { times.maiaSeconds += (performance.now() - t) / 1000 }
    require(human !== 'unavailable', 'Maia unavailable')
    const policy = human.bands.find(b => b.band === row.band)?.policy
    require(pick(policy, row.ruleMoves) === row.R && pick(policy, legal) === row.N, 'Maia no longer reproduces original R and N')
    const sampledMoves = sampleWithoutReplacement(S, SR.length, `${rowKey(row)}\0after-check`)
    const chosen = { Rs: pick(policy, SR), Ns: pick(policy, S), R0s: pick(policy, sampledMoves) }
    require(typeof checked.forcingByMove?.[chosen.Rs] === 'boolean', 'missing Rs forcing reading')
    base.splits.forcing = checked.forcingByMove[chosen.Rs]
    const moves = [...new Set(Object.values(chosen))], soundByMove = {}, readings = {}, reuse = {}
    let best = small ? null : row.evidence.best
    if (small) {
      t = performance.now(); times.storedProbeReads++
      try {
        for (const label of ['R', 'N', 'A', 'R0']) {
          const uci = base[label]
          require(tablebaseSound(row.evidence.probe, uci) === base.sound[label], 'stored probe and soundness differ')
        }
        for (const uci of moves) soundByMove[uci] = tablebaseSound(row.evidence.probe, uci)
      } finally { times.tablebaseSeconds += (performance.now() - t) / 1000 }
    } else {
      const fresh = []
      for (const uci of moves) {
        const saved = storedAliases(row, nullRow, uci)
        if (saved) { soundByMove[uci] = saved.sound; reuse[uci] = saved.label; times.reusedMoves++ }
        else fresh.push(uci)
      }
      if (fresh.length) {
        guardWindow(); t = performance.now()
        try {
          const clearing = performance.now()
          try { times.newGameCalls++; await eng.newGame() }
          finally { times.newGameSeconds += (performance.now() - clearing) / 1000 }
          guardWindow(); times.bestCalls++
          best = await eng.bestMoves(pos, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
          base.freshSearch = true; base.freshBestChanged = bestUci(best) !== bestUci(row.evidence.best)
          for (const uci of fresh) {
            guardWindow(); times.scoreCalls++
            const reading = await eng.scoreMove(pos, uci, { budget: 'grade', priority: 'batch', cache: 'bypass' })
            validateScores(reading, best)
            require(reading.best === uci || reading.pv?.[0] === uci, 'scoreMove did not score its requested root')
            soundByMove[uci] = engineSound(reading, best, board.turn); readings[uci] = reading; times.newSearches++
          }
        } finally { times.engineSeconds += (performance.now() - t) / 1000 }
      }
    }
    times.rowSeconds = (performance.now() - started) / 1000
    return { ...base, ...chosen, sampledMoves, sound: { ...base.sound, ...Object.fromEntries(Object.entries(chosen).map(([label, uci]) => [label, soundByMove[uci]])) },
      evidence: small ? { source: 'tablebase', storedProbe: true } : { source: 'stockfish', best, readings, reuse }, times }
  } catch (error) { times.rowSeconds = (performance.now() - started) / 1000; error.times = times; throw error }
}
export function createEngine() {
  require(E.BUDGETS.grade.node.nodes === 250000 && E.ACCEPT_WINDOW_WP === 3, 'fixed referee instruments changed')
  return Node.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: false, evalCache: false })
}
await cli('scored', import.meta.url, readCheckedRow, createEngine)
