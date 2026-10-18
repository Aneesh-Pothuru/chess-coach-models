#!/usr/bin/env node
// Archive the already-generated historical paper once, without rebuilding its
// held-out examples against a later puzzle sample. Never overwrites an archive.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')
const archive = join(here, 'generated-round1.tex')
const manifest = join(here, 'round1-manifest.json')
if (existsSync(archive) || existsSync(manifest)) throw new Error('the historical paper is already frozen; do not replace it')
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const paths = [
  'projects/detector-themes/results/score-app.json',
  'projects/detector-themes/results/score-heldout.json',
  'projects/detector-themes/results/score-app-describe-first.json',
  'projects/detector-themes/results/score-heldout-describe-first.json',
  'projects/detector-themes/results/compare-describe-first.json',
  'projects/drill-decks/results/census-retheme-base.json',
  'projects/drill-decks/results/census-describe-first.json',
]
const app = JSON.parse(readFileSync(join(root, paths[0]), 'utf8')).app
const inputs = Object.fromEntries(paths.map((path) => [path, digest(join(root, path))]))
copyFileSync(join(here, 'generated.tex'), archive)
writeFileSync(manifest, JSON.stringify({
  project: 'detector-themes', round: 1, app,
  generatedBy: 'projects/detector-themes/paper/freeze-round1.mjs',
  archive: 'generated-round1.tex', archiveSha256: digest(archive), inputs,
}, null, 2) + '\n')
console.error('froze the historical generated paper and its aggregate hashes')
