import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
export const dir = privateDir('maia-player-offsets')
export const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
export const jsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
export const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
export const pin = read(join(LAB_DIR, 'bridge/chess.json'))
if (execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('not the pinned app')
export function manifest(source) {
  return { app: pin.commit, source: hash(source), design: hash(join(LAB_DIR, 'projects/maia-player-offsets/design.mjs')) }
}
export function checkManifest(file, expected) {
  if (fs.existsSync(file)) { if (JSON.stringify(read(file)) !== JSON.stringify(expected)) throw new Error('cache provenance differs; use a fresh private cache after review') }
  else fs.writeFileSync(file, JSON.stringify(expected))
}
export async function completedKeys(file, onRow = () => {}) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '')
  const fd = fs.openSync(file, 'r+'), size = fs.fstatSync(fd).size
  // The policy writer commits a position by appending its terminating newline.
  // Search backwards in bounded chunks if a large final position was interrupted.
  let end = size
  if (size) {
    let at = size, found = false
    while (at > 0 && !found) {
      const n = Math.min(65536, at), buf = Buffer.alloc(n)
      fs.readSync(fd, buf, 0, n, at - n)
      const j = buf.lastIndexOf(10)
      if (j >= 0) { end = at - n + j + 1; found = true } else at -= n
    }
    if (!found) end = 0
    if (end !== size) fs.ftruncateSync(fd, end)
  }
  fs.closeSync(fd)
  const keys = new Set()
  const lines = createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    const row = JSON.parse(line)
    if (!Number.isInteger(row.k) || keys.has(row.k)) throw new Error('invalid or duplicated cached position')
    keys.add(row.k)
    onRow(row, Buffer.byteLength(line) + 1)
  }
  return keys
}
