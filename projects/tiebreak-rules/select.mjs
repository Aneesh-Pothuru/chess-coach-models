// Draws are already per game. Merge shards in stream order before applying caps.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPriority } from 'node:os'
import { UNITS } from './readings.mjs'
import { emptyCoverage } from './scan.mjs'
import { configuration, verifyRun, loadCompleted, baseSignature, atomic, sha, readJson, require, guardWindow } from './common.mjs'

export const CAP = 3000
export function selectGames(games, cap = CAP) {
  require(Number.isInteger(cap) && cap > 0, 'invalid cap')
  const ordered = [...games].sort((a, b) => a.gameIndex - b.gameIndex)
  require(new Set(ordered.map(g => g.key)).size === ordered.length && new Set(ordered.map(g => g.gameIndex)).size === ordered.length, 'duplicate game in shard merge')
  const coverage = emptyCoverage(), groups = new Map()
  for (const unit of UNITS) Object.assign(coverage.units[unit], { kept: 0, followFirst: 0, breakFirst: 0 })
  for (const game of ordered) {
    for (const key of Object.keys(coverage).filter(k => k !== 'units')) coverage[key] += game.coverage[key]
    const seen = new Set()
    for (const unit of UNITS) for (const key of ['situation', 'splits', 'gamesWithSplit', 'splitFollowFirst', 'splitBreakFirst']) coverage.units[unit][key] += game.coverage.units[unit][key]
    for (const row of game.drawn) {
      require(row.game === game.game && row.month === game.month && row.gameIndex === game.gameIndex && row.units.length === 1, 'draw belongs to another game')
      const unit = row.units[0].unit
      require(UNITS.includes(unit) && !seen.has(unit), 'duplicate or unknown per-game unit draw'); seen.add(unit)
      const counter = coverage.units[unit]
      if (counter.kept >= cap) continue
      counter.kept++; counter[row.units[0].stratum === 'follow-first' ? 'followFirst' : 'breakFirst']++
      const prior = groups.get(row.key)
      if (prior) {
        const { units: ignoredPrior, ...a } = prior, { units: ignoredRow, ...b } = row
        require(JSON.stringify(a) === JSON.stringify(b), 'shared position readings differ')
        prior.units.push(row.units[0])
      } else groups.set(row.key, { ...row, units: [...row.units] })
    }
    for (const unit of UNITS) require(seen.has(unit) === Boolean(game.coverage.units[unit].gamesWithSplit), 'draw and game coverage differ')
  }
  const rows = [...groups.values()].sort((a, b) => a.gameIndex - b.gameIndex || a.ply - b.ply)
  rows.forEach(r => r.units.sort((a, b) => UNITS.indexOf(a.unit) - UNITS.indexOf(b.unit)))
  return { rows, coverage }
}
function main() {
  const config = configuration(process.argv.slice(2), 'positions')
  require(getPriority() === 10, 'selection runs at nice 10')
  verifyRun(config); guardWindow()
  const started = performance.now(), games = loadCompleted('scan', config.month, config)
  guardWindow(); const { rows, coverage } = selectGames(games)
  const bytes = rows.map(r => JSON.stringify(r) + '\n').join('')
  const prefix = join(config.dir, `positions-${config.month}`)
  const inputSha256 = sha([0, 1].map(s => readJson(join(config.dir, `scan-${config.month}-${s}-of-2.json`)).outputSha256).join('\n'))
  const sig = { ...baseSignature('positions', config.month, config), inputSha256, cap: CAP }
  if (existsSync(`${prefix}.json`)) {
    const old = readJson(`${prefix}.json`)
    require(Object.entries(sig).every(([k, v]) => old[k] === v) && old.complete && old.outputSha256 === sha(readFileSync(`${prefix}.jsonl`)) && old.outputSha256 === sha(bytes), 'completed selection differs')
    return
  }
  guardWindow()
  writeFileSync(`${prefix}.jsonl`, bytes)
  atomic(`${prefix}.json`, { ...sig, status: 'complete', complete: true, rows: rows.length, expectedRows: rows.length,
    unitRows: rows.reduce((n, r) => n + r.units.length, 0), outputSha256: sha(bytes), coverage,
    seconds: (performance.now() - started) / 1000 })
  console.log(JSON.stringify({ stage: 'positions', month: config.month, rows: rows.length, coverage }))
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1 }
}
