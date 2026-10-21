// A run's video length as the app renders it: the app's own plan of the run's
// script and review, voiced by the app's Kokoro voice (no frames, no encoding),
// timed by the app's own timeline. The period video grammar's minutes are this
// length, not the length heard once at a narrator's pace that the rule uses.
// Run from a run's checkout with its tsx, with Kokoro importable by python3 and
// COACH_CACHE_DIR outside the checkout:
//   (cd <run>/repo && node_modules/.bin/tsx <bin>/rendered.mts <ID> <work dir>)
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const [id, work] = process.argv.slice(2)
if (!id || !work) throw new Error('usage: rendered.mts <ID> <work dir>')
const video = await import(pathToFileURL(join(root, 'src/adapters/node/publishing/video/index.ts')).href)
const publishing = await import(pathToFileURL(join(root, 'src/services/publishing/index.ts')).href)
const cache = process.env.COACH_CACHE_DIR
if (!cache) throw new Error('set COACH_CACHE_DIR outside the checkout')

const plan = video.planVideoFiles(root, id)
const estimated = plan.durationSec
const opts = { root, cache, work, log: (line: string) => process.stderr.write(`${line}\n`) }
const engine = video.prepareVoice(opts)
if (engine !== 'kokoro') throw new Error(`the voice is ${engine}, not Kokoro`)
const audio = await video.kokoroVoice(opts).synth(plan.narration)
const timed = publishing.timeVideo(plan, audio)
console.log(JSON.stringify({ id, voice: video.DEFAULT_VOICE, speed: video.DEFAULT_SPEED, scenes: timed.scenes.length, timing: timed.timing, seconds: Math.round(timed.durationSec * 10) / 10, estimatedSeconds: Math.round(estimated * 10) / 10 }))
