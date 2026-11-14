import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssVariables } from './contrast.ts'
import { ACCENT_INK, COLORS, TRACK_ACCENTS } from './tokens.ts'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const base = cssVariables(css, ':root')
const themes = { default: base, 'high contrast': { ...base, ...cssVariables(css, ':root.hc') } }

/** [foreground, background, minimum ratio, what it is] */
const PAIRS: [string, string, number, string][] = [
  ['text', 'bg', 4.5, 'body text'],
  ['text', 'panel', 4.5, 'text in panels'],
  ['muted', 'bg', 4.5, 'secondary text'],
  ['muted', 'panel', 4.5, 'secondary text in panels'],
  ['accent', 'bg', 4.5, 'links and labels in the accent colour'],
  ['accent', 'panel', 4.5, 'caption labels'],
  ['accent-ink', 'accent', 4.5, 'text on accent buttons'],
  ['error', 'bg', 4.5, 'error messages'],
  ['focus', 'bg', 3, 'focus ring'],
  ['focus', 'panel', 3, 'focus ring on panels'],
  ['line', 'bg', 3, 'button and control borders'],
  ['line', 'panel', 3, 'borders inside panels'],
]

describe('colour contrast of the real stylesheet (WCAG 2.1 AA)', () => {
  for (const [name, vars] of Object.entries(themes)) {
    it(`meets AA in the ${name} theme`, () => {
      const failures = PAIRS.filter(([fg, bg, min]) => contrastRatio(vars[fg], vars[bg]) < min).map(
        ([fg, bg, min, what]) => `${what}: --${fg} on --${bg} is ${contrastRatio(vars[fg], vars[bg]).toFixed(2)}, needs ${min}`,
      )
      expect(failures).toEqual([])
    })
  }

  it('makes the high contrast theme at least as strong for body text', () => {
    const hc = themes['high contrast']
    expect(contrastRatio(hc.text, hc.bg)).toBeGreaterThanOrEqual(contrastRatio(base.text, base.bg))
  })
  it('gives every track an accent that reads as text and carries ink on it', () => {
    for (const [track, accent] of Object.entries(TRACK_ACCENTS)) {
      expect(contrastRatio(accent, base.bg), `${track} on bg`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(accent, base.panel), `${track} on panel`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(ACCENT_INK, accent), `ink on ${track}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the tokens file and the stylesheet in step', () => {
    expect(base.bg).toBe(COLORS.bg)
    expect(base.panel).toBe(COLORS.panel)
    expect(base.text).toBe(COLORS.text)
    expect(base.muted).toBe(COLORS.secondary)
    expect(base.line).toBe(COLORS.line)
  })
})
