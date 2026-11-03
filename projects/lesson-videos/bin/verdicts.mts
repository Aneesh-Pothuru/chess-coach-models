// The lines of a video script that say who is better, by the app's own
// verdictTalk (the daily check's rule), on each beat's spoken line and caption.
// Run from a checkout of the app that has it:
//   (cd <repo> && node_modules/.bin/tsx <bin>/verdicts.mts <video.json>)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { verdictTalk } = await import(pathToFileURL(join(process.cwd(), 'src/services/publishing/lint/verdictTalk.ts')).href)
const script = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const hits: Array<{ scene: number; beat: number; said: string }> = []
for (const [i, s] of (script.scenes ?? []).entries()) {
  for (const [k, b] of (s.beats ?? []).entries()) {
    const said = verdictTalk(b.say) ?? verdictTalk(b.caption)
    if (said) hits.push({ scene: i + 1, beat: k + 1, said })
  }
}
process.stdout.write(JSON.stringify({ lines: hits.length, hits }) + '\n')
