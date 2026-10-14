// The filler a decoy is made of, shared by the length check (built by the
// records' build.mjs) and each later round's padding control
// (pad-variant.mjs): filler as long as a
// change, saying nothing the card does not already say ("restate") or nothing
// about the position ("generic").

/** The seeded generator the controls deal and pick with. */
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

/** A section that grew by less than this is left as the shorter text has it (round 8's takeaway swaps a phrase for one of about the same length). */
export const MIN_GROWTH = 25

/** A section of points: "point; point · line", or just the line. */
export const isPoints = (heading) => /^What .* does instead$/.test(heading) || /^What .* allowed/.test(heading)
export const splitPoints = (text) => {
  const at = text.indexOf(' · ')
  if (at >= 0) return { points: text.slice(0, at), line: text.slice(at + 3) }
  return /^\d+\.{1,3}\S/.test(text) ? { points: '', line: text } : { points: text, line: '' }
}
export const plies = (line) => line.trim().split(/\s+/).filter(Boolean)
export const bare = (move) => move.replace(/^\d+\.{1,3}/, '')

/** Generic advice: true of any move, about none in particular. */
export const GENERIC_POINTS = [
  'it is worth a careful look before you decide',
  'a move like this one comes up in games at every level',
  'checking their best reply first is a good habit here',
  'it rewards taking a moment before you move',
]
export const GENERIC_SENTENCES = [
  'Positions like this one are worth a careful look before you decide.',
  'A good habit is to check the opponent\'s best reply before every move.',
  'Moves like this one come up in games at every level.',
  'Taking a moment here to compare the candidate moves pays off.',
]

/** The filler candidates for one section, each a list of pieces; the one closest to the target length wins. */
export function candidates(kind, heading, ctx) {
  const points = isPoints(heading)
  const out = []
  if (kind === 'restate') {
    // Only what the card already shows: the section's own line (or the engine's line the card names) and the engine's choice.
    const line = plies(ctx.sectionLine || ctx.bestLine)
    const choice = points ? 'it is the engine\'s first choice here' : `${ctx.bestBare} is the engine's first choice here.`
    for (let k = 2; k <= line.length; k++) {
      const moves = line.slice(0, k).join(' ')
      const lead = points ? `the engine's line starts ${moves}` : `The engine's line runs ${moves}.`
      out.push([lead], [lead, choice], [choice, lead])
    }
    out.push([choice])
  } else {
    const pool = points ? GENERIC_POINTS : GENERIC_SENTENCES
    for (let i = 0; i < pool.length; i++) {
      out.push([pool[i]])
      for (let j = 0; j < pool.length; j++) {
        if (j === i) continue
        out.push([pool[i], pool[j]])
        for (let k = 0; k < pool.length; k++) if (k !== i && k !== j) out.push([pool[i], pool[j], pool[k]])
      }
    }
  }
  return out
}
export const joined = (pieces, points) => pieces.join(points ? '; ' : ' ')

/** Put filler of about `target` characters into one section of the shorter text. */
export function pad(section, target, kind, ctx) {
  const points = isPoints(section.heading)
  const { points: pts, line } = points ? splitPoints(section.text) : { points: section.text, line: '' }
  const sep = points ? '; ' : ' '
  const best = candidates(kind, section.heading, { ...ctx, sectionLine: points ? line : '' })
    .map((pieces) => {
      const filler = joined(pieces, points)
      const added = (pts ? sep.length : 0) + filler.length
      return { filler, added, off: Math.abs(added - target) }
    })
    .sort((a, b) => a.off - b.off)[0]
  const body = pts ? `${pts}${sep}${best.filler}` : best.filler
  const text = points ? (line ? `${body} · ${line}` : body) : body
  return { section: { heading: section.heading, text }, added: best.added, filler: best.filler }
}

/** The decoy version of one moment: the shorter text, with filler where the change grew a section. */
export function decoyOf(shortV, longV, kind, ctx) {
  const longBy = new Map(longV.map((s) => [s.heading, s.text]))
  const fills = []
  const version = shortV.map((s) => {
    const l = longBy.get(s.heading)
    const growth = l === undefined ? 0 : l.length - s.text.length
    if (growth < MIN_GROWTH) return s
    const p = pad(s, growth, kind, ctx)
    fills.push({ heading: s.heading, target: growth, added: p.added, filler: p.filler })
    return p.section
  })
  const unmatched = longV.filter((s) => !shortV.some((t) => t.heading === s.heading)).map((s) => s.heading)
  return { version, fills, unmatched }
}
