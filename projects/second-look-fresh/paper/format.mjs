// Text-only subset of projects/paper.mjs. Keep the lab's TeX conventions
// without requiring chess.js or a private app checkout for an aggregate paper.
// No chess instrument, board or move conversion is defined here.
import { writeFileSync } from 'node:fs'

const ESCAPES = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '^': '\\^{}', _: '\\_', '%': '\\%', '~': '\\~{}' }
export const esc = s => String(s).replace(/[\\{}$&#^_%~]/g, c => ESCAPES[c]).replace(/−/g, '$-$').replace(/→/g, '$\\to$').replace(/–/g, '--').replace(/·/g, '\\textperiodcentered{}').replace(/…/g, '\\ldots{}')
export const fixed = (x, d = 1) => x == null || !Number.isFinite(x) ? '--' : x.toFixed(d).replace(/^-/, '$-$')
export const percent = (x, d = 1) => fixed(x == null ? null : 100 * x, d)
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const word = n => Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n)

export class Generated {
  constructor(source) { this.parts = [`% Written by ${source}; do not edit by hand.`, ''] }
  def(name, value) {
    if (!/^[A-Za-z]+$/.test(name)) throw new Error(`not a LaTeX command name: ${name}`)
    this.parts.push(`\\newcommand{\\${name}}{${value}}`)
    return this
  }
  block(name, latex) {
    if (!/^[A-Za-z]+$/.test(name)) throw new Error(`not a LaTeX command name: ${name}`)
    this.parts.push(`\\newcommand{\\${name}}{%`, latex.replace(/(?<!\\)#/g, '##'), '}')
    return this
  }
  write(path) { writeFileSync(path, `${this.parts.join('\n')}\n`) }
}
