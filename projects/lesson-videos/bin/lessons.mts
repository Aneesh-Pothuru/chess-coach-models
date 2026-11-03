// The study lessons a grader reads beside a day's reviews: every lesson's title
// and what it teaches, and for each lesson a review names (an annotation's
// `lesson`, or its title in a video's words) each written section's scenes,
// heading and takeaway, so a line that quotes a lesson can be checked.
// Run from a case checkout with its tsx:
//   (cd <case>/repo && node_modules/.bin/tsx <bin>/lessons.mts <name>=<video.json> ...)
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const { buildStudyFromDisk } = await import(pathToFileURL(join(root, 'src/adapters/node/study/index.ts')).href)
const lessons: any[] = buildStudyFromDisk(root).lessons

const files = process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.slice(a.indexOf('=') + 1))
const spoken: string[] = []
const named = new Set<string>()
for (const file of files) {
  if (!existsSync(file)) continue
  const script = JSON.parse(readFileSync(file, 'utf8'))
  for (const s of script.scenes ?? []) for (const b of s.beats ?? []) spoken.push(String(b.say ?? ''), String(b.caption ?? ''))
  const annotations = join(dirname(file), file.split('/').pop()!.replace(/\.video\.json$/, '.json'))
  if (annotations !== file && existsSync(annotations)) {
    const doc = JSON.parse(readFileSync(annotations, 'utf8'))
    const walk = (x: any) => {
      if (Array.isArray(x)) x.forEach(walk)
      else if (x && typeof x === 'object') {
        if (x.lesson && typeof x.lesson === 'object' && typeof x.lesson.id === 'string') named.add(x.lesson.id)
        Object.values(x).forEach(walk)
      }
    }
    walk(doc)
  }
}
const words = spoken.join(' \n ').toLowerCase()
for (const l of lessons) if (words.includes(String(l.title).toLowerCase())) named.add(l.id)

const out: string[] = ['The study lessons he follows (title: what it teaches):']
for (const l of [...lessons].sort((a, b) => a.order - b.order)) out.push(`- ${l.title}: ${(l.takeaways ?? [])[0] ?? ''}`)
const shown = lessons.filter((l) => named.has(l.id))
if (shown.length > 0) {
  out.push('', 'The lessons a review names, section by section (chapter n of a lesson is video scene n; each section covers the scenes listed):')
  for (const l of shown) {
    out.push(`- ${l.title}`)
    for (const s of l.sections ?? []) {
      const take = (s.blocks ?? []).find((b: any) => b.kind === 'takeaway')
      out.push(`  - scenes ${(s.scenes ?? []).join(', ')}: ${s.heading}${take ? `. Takeaway: ${take.text}` : ''}`)
    }
  }
}
process.stdout.write(out.join('\n') + '\n')
