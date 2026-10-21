import { describe, expect, it } from 'vitest'
import { contrastRatio, mixSrgb, parseHex } from '../../src/ui/contrast'
// The real stylesheets, so the test checks what ships rather than a copy of the numbers.
import progressCss from '../../src/ui/progress.css?raw'
import tokensCss from '../../src/ui/tokens.css?raw'

describe('contrast helpers', () => {
  it('parses hex colours', () => {
    expect(parseHex('#12161c')).toEqual([18, 22, 28])
    expect(parseHex('#FFF')).toEqual([255, 255, 255])
  })
  it('WCAG ratio: black on white is 21, a colour on itself is 1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrastRatio([18, 22, 28], [18, 22, 28])).toBeCloseTo(1, 5)
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5) // order-free
  })
  it('mixes like color-mix(in srgb, a p%, b)', () => {
    expect(mixSrgb([200, 100, 0], [0, 0, 0], 0.5)).toEqual([100, 50, 0])
    expect(mixSrgb([200, 100, 0], [0, 0, 0], 1)).toEqual([200, 100, 0])
  })
})

// ---- read the shipped CSS ----

type RGB = [number, number, number]

function tokens(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tokensCss.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1] as string] = (m[2] as string).trim()
  return out
}

const TOKENS = tokens()

/** Resolve '#hex' or 'var(--x)' (following aliases) to RGB. */
function resolve(value: string): RGB {
  const v = value.trim()
  const ref = /^var\(--([\w-]+)\)$/.exec(v)
  if (ref) {
    const next = TOKENS[ref[1] as string]
    if (!next) throw new Error(`unknown token ${v}`)
    return resolve(next)
  }
  return parseHex(v)
}

/** Resolve a CSS colour: a token, a hex, or color-mix(in srgb, A p%, B). */
function colour(value: string): RGB {
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(value.trim())
  if (mix) return mixSrgb(resolve(mix[1] as string), resolve(mix[3] as string), Number(mix[2]) / 100)
  return resolve(value)
}

/** Declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(progressCss)
  if (!m) throw new Error(`no rule ${selector}`)
  const decls: Record<string, string> = {}
  for (const d of (m[1] as string).split(';')) {
    const i = d.indexOf(':')
    if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim()
  }
  return decls
}

const BASE_TEXT = rule('.mcell').color as string

/** Text colour and fill of mastery step n (0 = outline only, on the page background). */
function step(n: number): { fill: RGB; text: RGB } {
  const r = rule(`.mcell--${n}`)
  const fill = r.background === 'transparent' || r.background === undefined ? resolve('var(--bg)') : colour(r.background)
  return { fill, text: colour(r.color ?? BASE_TEXT) }
}

describe('mastery grid contrast (shipped CSS)', () => {
  it.each([1, 2, 3, 4, 5])('box %i: root and L-mark text are at least 4.5:1 on the fill', (n) => {
    const { fill, text } = step(n)
    expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5)
  })

  it('the L-mark is drawn at full strength (no opacity dimming it below the measured ratio)', () => {
    expect(rule('.mcell__support').opacity).toBeUndefined()
  })

  it('not-started cells: text at least 4.5:1 and the outline at least 3:1 on the page background', () => {
    const r = rule('.mcell--0')
    const bg = resolve('var(--bg)')
    expect(contrastRatio(colour(r.color as string), bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colour(r['border-color'] as string), bg)).toBeGreaterThanOrEqual(3)
  })

  it('the five fills get lighter box by box', () => {
    const lum = [1, 2, 3, 4, 5].map((n) => contrastRatio(step(n).fill, [0, 0, 0]))
    expect([...lum].sort((a, b) => a - b)).toEqual(lum)
  })
})
