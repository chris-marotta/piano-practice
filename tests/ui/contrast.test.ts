import { describe, expect, it } from 'vitest'
import { ROOT_DOT, keyLooks, rootDotLookFor, type KeyLook, type KeyMark, type KeyState } from '../../src/ui/components/keyboardLayout'
import { contrastRatio, mixSrgb, parseHex } from '../../src/ui/contrast'
// The real stylesheets, so the test checks what ships rather than a copy of the numbers.
import appCss from '../../src/ui/app.css?raw'
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

/** Declarations of the first rule whose selector list is exactly `selector` (in progress.css unless `css` is given). */
function rule(selector: string, css: string = progressCss): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)
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

describe('key state marks contrast (shipped CSS)', () => {
  const white = resolve('var(--key-white)')
  const black = resolve('var(--key-black)')
  const fill = (state: string): RGB => colour(rule(`.key.key--${state}`, appCss).fill as string)

  it('--good and --bad are their own colours, not RH amber or LH teal', () => {
    for (const t of ['good', 'bad']) {
      const v = (TOKENS[t] as string).toLowerCase()
      expect(v).toMatch(/^#[0-9a-f]{6}$/)
      expect(v).not.toBe('#f2a541')
      expect(v).not.toBe('#3fb8af')
      expect(v).not.toBe((TOKENS.rh as string).toLowerCase())
      expect(v).not.toBe((TOKENS.lh as string).toLowerCase())
    }
    expect(TOKENS.good).not.toBe(TOKENS.bad)
  })

  it('good and bad fills use the tokens', () => {
    expect(rule('.key.key--good', appCss).fill).toBe('var(--good)')
    expect(rule('.key.key--bad', appCss).fill).toBe('var(--bad)')
  })

  it.each(['good', 'bad', 'pressed'])('%s fill is at least 3:1 against white keys and black keys', (state) => {
    expect(contrastRatio(fill(state), white)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(fill(state), black)).toBeGreaterThanOrEqual(3)
  })

  it.each(['good', 'bad'])('the ✓/× glyph is at least 4.5:1 on the %s fill', (state) => {
    const glyph = colour(rule('.key-glyph', appCss).stroke as string)
    expect(contrastRatio(glyph, fill(state))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['good', 'bad', 'pressed'])('a note label is at least 4.5:1 on the %s fill', (state) => {
    const label = colour(rule('.key-label--marked', appCss).fill as string)
    expect(contrastRatio(label, fill(state))).toBeGreaterThanOrEqual(4.5)
  })

  const glow = (tone: 'white' | 'black', state: 'sustained' | 'target' | 'played'): RGB =>
    colour(rule(`.key--${tone}.key--${state}`, appCss).fill as string)

  it('target and played glows are tints of --good, from tokens (no outline rule left)', () => {
    expect(rule('.key--white.key--target', appCss).fill).toBe('var(--target-glow)')
    expect(rule('.key--white.key--played', appCss).fill).toBe('var(--target-dim)')
    expect(rule('.key--black.key--target', appCss).fill).toBe('var(--target-glow-deep)')
    expect(rule('.key--black.key--played', appCss).fill).toBe('var(--target-dim-deep)')
    expect(appCss).not.toMatch(/\.key-target\b/)
  })

  it('sustained (ringing under the pedal) is a pale --pressed tint, lighter than the press and not green', () => {
    expect(rule('.key--white.key--sustained', appCss).fill).toBe('var(--sustain)')
    expect(rule('.key--black.key--sustained', appCss).fill).toBe('var(--sustain-deep)')
    const pressed = colour(rule('.key.key--pressed', appCss).fill as string)
    expect(contrastRatio(glow('white', 'sustained'), pressed)).toBeGreaterThanOrEqual(1.5)
    expect(contrastRatio(glow('black', 'sustained'), colour('var(--key-black)'))).toBeGreaterThanOrEqual(1.5)
  })

  it('labels on glowing keys: --ink on white keys, --text on black keys', () => {
    expect(rule('.key-label--white.key-label--glow', appCss).fill).toBe('var(--ink)')
    expect(rule('.key-label--black.key-label--glow', appCss).fill).toBe('var(--text)')
  })

  it.each(['sustained', 'target', 'played'] as const)('a note label is at least 4.5:1 on the %s glow (white and black keys)', (state) => {
    const onWhite = colour(rule('.key-label--white.key-label--glow', appCss).fill as string)
    const onBlack = colour(rule('.key-label--black.key-label--glow', appCss).fill as string)
    expect(contrastRatio(onWhite, glow('white', state))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(onBlack, glow('black', state))).toBeGreaterThanOrEqual(4.5)
  })

  it('three white-key levels: --good is 18-22% of played, 55-60% of target (the next note is the solid hand colour)', () => {
    const share = (c: RGB) => (c[1] - white[1]) / (resolve('var(--good)')[1] - white[1])
    expect(share(glow('white', 'played'))).toBeGreaterThanOrEqual(0.17)
    expect(share(glow('white', 'played'))).toBeLessThanOrEqual(0.23)
    expect(share(glow('white', 'target'))).toBeGreaterThanOrEqual(0.54)
    expect(share(glow('white', 'target'))).toBeLessThanOrEqual(0.61)
  })

  it('the target glow reads strongly against the bare key', () => {
    expect(contrastRatio(glow('white', 'target'), white)).toBeGreaterThanOrEqual(1.8)
    expect(contrastRatio(glow('black', 'target'), black)).toBeGreaterThanOrEqual(2.5)
  })

  it('played is visibly tinted, and clearly below target', () => {
    expect(contrastRatio(glow('white', 'played'), white)).toBeGreaterThanOrEqual(1.2)
    expect(contrastRatio(glow('black', 'played'), black)).toBeGreaterThanOrEqual(1.4)
    for (const [tone, bare] of [['white', white], ['black', black]] as const) {
      expect(contrastRatio(glow(tone, 'played'), bare)).toBeLessThan(contrastRatio(glow(tone, 'target'), bare))
      expect(contrastRatio(glow(tone, 'played'), glow(tone, 'target'))).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('a solid good press stays apart from the target glow: darker fill and the ✓ glyph', () => {
    for (const tone of ['white', 'black'] as const) {
      expect(contrastRatio(glow(tone, 'target'), fill('good'))).toBeGreaterThanOrEqual(1.6)
    }
    // The press is the only one of the two that is at least 3:1 on a white key, and it carries the ✓ (--ink).
    expect(contrastRatio(fill('good'), white)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(glow('white', 'target'), white)).toBeLessThan(3)
  })

  it('a black target key has a light rim (the glow) at least 3:1 on its tint', () => {
    const r = rule('.key-rim', appCss)
    expect(r.stroke).toBe('var(--target-rim)')
    expect(r.fill).toBe('none')
    expect(contrastRatio(colour(r.stroke as string), glow('black', 'target'))).toBeGreaterThanOrEqual(3)
  })
})

describe('pressable keys (shipped CSS)', () => {
  it('a pressable keyboard takes touches itself (no pan, no double-tap zoom), on its block-level root', () => {
    // touch-action only applies to block-level boxes: the root <svg> (display: block), not its <g> keys.
    expect(rule('.keyboard--pressable', appCss)['touch-action']).toBe('none')
    expect(rule('.keyboard', appCss).display).toBe('block')
    expect(appCss).not.toMatch(/\.keyboard--pressable \.key-hit/)
  })
  it('the focus ring on a key is keyboard-only (:focus-visible), so mouse / touch presses show no ring', () => {
    expect(rule('.key-hit:focus-visible .key', appCss).stroke).toBe('var(--accent)')
    expect(appCss).not.toMatch(/\.key-hit:focus(?!-visible)/)
  })
})

describe('root dot contrast (shipped CSS)', () => {
  const white = resolve('var(--key-white)')
  const black = resolve('var(--key-black)')
  const ink = resolve('var(--ink)')
  const tone = (isBlack: boolean) => (isBlack ? 'black' : 'white')

  it('the dot colours in code are the tokens', () => {
    expect(ROOT_DOT.white.fill).toBe(TOKENS.root)
    expect(ROOT_DOT.black.fill).toBe(TOKENS['root-on-black'])
    expect(ROOT_DOT.white.text).toBe('#ffffff')
    expect(ROOT_DOT.black.text).toBe(TOKENS.ink)
  })

  it('the stylesheet paints the dot and its label from those tokens, and the ring is 2px --ink', () => {
    expect(rule('.root-dot', appCss).fill).toBe('var(--root)')
    expect(rule('.root-dot--black', appCss).fill).toBe('var(--root-on-black)')
    expect(rule('.root-dot--ring', appCss).stroke).toBe('var(--ink)')
    expect(rule('.root-dot--ring', appCss)['stroke-width']).toBe('2')
    expect(rule('.root-dot__label', appCss).fill).toBe('#fff')
    expect(rule('.root-dot--black + .root-dot__label', appCss).fill).toBe('var(--ink)')
  })

  /** The CSS fill(s) a key look is drawn with (a split key: both halves; the dot is on the bottom, LH one). */
  function keyFills(look: KeyLook, isBlack: boolean): RGB[] {
    const t = tone(isBlack)
    if (look.fill === 'good' || look.fill === 'bad' || look.fill === 'pressed') return [colour(rule(`.key.key--${look.fill}`, appCss).fill as string)]
    if (look.fill === 'split') return [colour(rule(`.key--${t}.key--lh`, appCss).fill as string)]
    const cls = look.fill ?? look.glow
    if (cls === null) return [isBlack ? black : white]
    return [colour(rule(`.key--${t}.key--${cls}`, appCss).fill as string)]
  }

  // Every look a root key can have: its state (or none) x the hand its mark carries, plus both hands on one key.
  const scenarios: { name: string; marks: KeyMark[] }[] = []
  for (const state of [undefined, 'good', 'bad', 'pressed', 'target', 'played'] as (KeyState | undefined)[])
    for (const hand of ['rh', 'lh', 'none'] as const)
      scenarios.push({ name: `${state ?? 'no state'}, ${hand}`, marks: [{ midi: 60, hand, state, root: true }] })
  scenarios.push({
    name: 'both hands (split)',
    marks: [{ midi: 60, hand: 'rh', root: true }, { midi: 60, hand: 'lh', root: true }],
  })

  for (const isBlack of [false, true]) {
    const midi = isBlack ? 61 : 60
    describe(`on a ${tone(isBlack)} key`, () => {
      const bare = isBlack ? black : white
      const dotOf = (marks: KeyMark[]) => {
        const look = keyLooks(marks.map((m) => ({ ...m, midi })), 48, 72).get(midi) as KeyLook
        return { look, dot: rootDotLookFor(look, isBlack) }
      }
      it('the bare key: the dot is at least 3:1 with no ring', () => {
        const dot = rootDotLookFor({ fill: null, glow: null, glyph: null, label: undefined }, isBlack)
        expect(contrastRatio(parseHex(dot.fill), bare)).toBeGreaterThanOrEqual(3)
      })
      it.each(scenarios)('$name: dot >= 3:1 on the key fill, or a ring that is', ({ marks }) => {
        const { look, dot } = dotOf(marks)
        for (const keyFill of keyFills(look, isBlack)) {
          const dotOk = contrastRatio(parseHex(dot.fill), keyFill) >= 3
          const ringOk = dot.ring && contrastRatio(ink, keyFill) >= 3
          expect(dotOk || ringOk).toBe(true)
        }
      })
      it.each(scenarios)('$name: a ring is only used where the dot alone falls short', ({ marks }) => {
        const { look, dot } = dotOf(marks)
        if (dot.ring) return
        for (const keyFill of keyFills(look, isBlack)) expect(contrastRatio(parseHex(dot.fill), keyFill)).toBeGreaterThanOrEqual(3)
      })
      it('label text on the dot is at least 4.5:1', () => {
        const dot = rootDotLookFor({ fill: 'rh', glow: null, glyph: null, label: 'C' }, isBlack)
        expect(contrastRatio(parseHex(dot.text), parseHex(dot.fill))).toBeGreaterThanOrEqual(4.5)
      })
    })
  }
})

describe('staff colours (shipped CSS)', () => {
  const bg = resolve('var(--bg)')
  it('staff lines are at least 3:1 on the page background', () => {
    expect(rule('.staff__line', appCss).stroke).toBe('var(--staff-line)')
    expect(contrastRatio(resolve('var(--staff-line)'), bg)).toBeGreaterThanOrEqual(3)
  })
  it('noteheads use the text colour, at least 4.5:1', () => {
    expect(rule('.staff', appCss).color).toBe('var(--text)')
    expect(contrastRatio(resolve('var(--text)'), bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('a landmark head (--root) is at least 3:1', () => {
    expect(rule('.staff-head--landmark', appCss).fill).toBe('var(--root)')
    expect(contrastRatio(resolve('var(--root)'), bg)).toBeGreaterThanOrEqual(3)
  })
  it('target outline, right and wrong heads are at least 3:1', () => {
    expect(rule('.staff-head--target', appCss).stroke).toBe('var(--accent)')
    expect(rule('.staff-head--right', appCss).fill).toBe('var(--good)')
    expect(rule('.staff-head--wrong', appCss).fill).toBe('var(--bad)')
    for (const t of ['accent', 'good', 'bad']) expect(contrastRatio(resolve(`var(--${t})`), bg)).toBeGreaterThanOrEqual(3)
  })
})
