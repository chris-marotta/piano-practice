import { describe, expect, it } from 'vitest'
import {
  BADGE_R,
  KEY,
  MIN_SCALE,
  badgeSlots,
  isBlack,
  keyAriaLabel,
  keyboardAspect,
  keyboardBox,
  keyboardFitVars,
  keyboardMaxWidth,
  minRenderWidth,
  verticalLayout,
  keyRects,
  keyLooks,
  keyboardRange,
  whiteKeys,
  type KeyMark,
} from '../../src/ui/components/keyboardLayout'
import { fingeringSequence } from '../../src/data/fingerings'
import { MAJOR_ROOTS, MINOR_ROOTS, noteMidi, scaleSequence } from '../../src/theory/scales'
import type { ScaleRef } from '../../src/theory/scales'

describe('keyboardRange', () => {
  it('spans the nearest C at or below to the nearest B at or above', () => {
    expect(keyboardRange([64, 76])).toEqual({ low: 60, high: 83 })
    expect(keyboardRange([60])).toEqual({ low: 60, high: 71 })
  })
  it('ignores input order and handles a B at the top and a C at the bottom', () => {
    expect(keyboardRange([71, 48])).toEqual({ low: 48, high: 71 })
  })
  it('falls back to one octave from middle C when there are no notes', () => {
    expect(keyboardRange([])).toEqual({ low: 60, high: 71 })
  })
})

describe('whiteKeys / isBlack', () => {
  it('lists the white keys in a range', () => {
    expect(whiteKeys(60, 71)).toHaveLength(7)
    expect(whiteKeys(60, 71)).toEqual([60, 62, 64, 65, 67, 69, 71])
    expect(whiteKeys(48, 95)).toHaveLength(28)
  })
  it('classifies black keys by pitch class', () => {
    expect(isBlack(61)).toBe(true)
    expect(isBlack(64)).toBe(false)
    expect([66, 68, 70].every(isBlack)).toBe(true)
    expect([65, 67, 69, 71, 72].some(isBlack)).toBe(false)
  })
})

describe('keyRects', () => {
  it('lays white keys edge to edge and black keys across a white boundary', () => {
    const rects = keyRects(60, 71)
    const whites = rects.filter((r) => !r.black)
    const blacks = rects.filter((r) => r.black)
    expect(whites).toHaveLength(7)
    expect(blacks).toHaveLength(5)
    whites.forEach((r, i) => expect(r.x).toBe(i * KEY.whiteW))
    // White keys come first so black keys paint (and take taps) on top.
    expect(rects.findIndex((r) => r.black)).toBe(7)
    const cSharp = blacks.find((r) => r.midi === 61)!
    expect(cSharp.x).toBeLessThan(KEY.whiteW)
    expect(cSharp.x + cSharp.w).toBeGreaterThan(KEY.whiteW)
  })
})

/** Marks for a scale played hands together: RH from rhOct, LH from lhOct, ascending. */
function handsTogether(ref: ScaleRef, octaves: 1 | 2, rhOct: number, lhOct: number): KeyMark[] {
  const rhNotes = scaleSequence(ref, octaves, rhOct).ascending
  const lhNotes = scaleSequence(ref, octaves, lhOct).ascending
  const rhF = fingeringSequence(ref, octaves, 'rh', 'up')
  const lhF = fingeringSequence(ref, octaves, 'lh', 'up')
  return [
    ...rhNotes.map((n, i) => ({ midi: noteMidi(n), hand: 'rh' as const, finger: rhF[i] })),
    ...lhNotes.map((n, i) => ({ midi: noteMidi(n), hand: 'lh' as const, finger: lhF[i] })),
  ]
}

describe('badgeSlots', () => {
  const eMajor = handsTogether({ root: 'E', form: 'major' }, 2, 4, 3)

  it('E major hands together: one badge per marked key per hand', () => {
    const { low, high } = keyboardRange(eMajor.map((m) => m.midi))
    expect({ low, high }).toEqual({ low: 48, high: 95 })
    const slots = badgeSlots(eMajor, low)
    expect(slots.rh).toHaveLength(15)
    expect(slots.lh).toHaveLength(15)
    expect(slots.rh[0]).toMatchObject({ midi: 64, finger: 1, subRow: 0 })
    expect(slots.lh[0]).toMatchObject({ midi: 52, finger: 5, subRow: 0 })
  })

  it('puts black-key badges in the outer sub-row and white-key badges in the inner one', () => {
    const { low } = keyboardRange(eMajor.map((m) => m.midi))
    const slots = badgeSlots(eMajor, low)
    for (const s of [...slots.rh, ...slots.lh]) expect(s.subRow).toBe(isBlack(s.midi) ? 1 : 0)
    expect(slots.rhRows).toBe(2)
    expect(slots.lhRows).toBe(2)
  })

  it('uses a single sub-row when a hand has no black keys, and none for an absent hand', () => {
    const cMajorRh = handsTogether({ root: 'C', form: 'major' }, 1, 4, 3).filter((m) => m.hand === 'rh')
    const slots = badgeSlots(cMajorRh, 60)
    expect(slots.rhRows).toBe(1)
    expect(slots.lhRows).toBe(0)
  })

  it('centres each badge on its key', () => {
    const slots = badgeSlots([{ midi: 64, hand: 'rh', finger: 3 }, { midi: 61, hand: 'rh', finger: 2 }], 60)
    const rects = keyRects(60, 71)
    for (const s of slots.rh) {
      const r = rects.find((k) => k.midi === s.midi)!
      expect(s.cx).toBeCloseTo(r.x + r.w / 2)
    }
  })

  it('skips marks without a finger, hand "none", and duplicate keys within a hand', () => {
    const slots = badgeSlots(
      [
        { midi: 60, hand: 'rh', finger: 1 },
        { midi: 60, hand: 'rh', finger: 5 },
        { midi: 62, hand: 'rh' },
        { midi: 64, hand: 'none', finger: 2 },
      ],
      60,
    )
    expect(slots.rh.map((s) => [s.midi, s.finger])).toEqual([[60, 1]])
    expect(slots.lh).toEqual([])
  })

  const allRefs: ScaleRef[] = [
    ...MAJOR_ROOTS.map((root) => ({ root, form: 'major' as const })),
    ...MINOR_ROOTS.flatMap((root) =>
      (['natural', 'harmonic', 'melodic'] as const).map((form) => ({ root, form })),
    ),
  ]

  it('no two badges of the same hand overlap, for every scale hands together over 2 octaves', () => {
    for (const ref of allRefs) {
      const marks = handsTogether(ref, 2, 4, 3)
      const { low } = keyboardRange(marks.map((m) => m.midi))
      const slots = badgeSlots(marks, low)
      for (const hand of [slots.rh, slots.lh]) {
        for (let i = 0; i < hand.length; i++)
          for (let j = i + 1; j < hand.length; j++) {
            const a = hand[i]!
            const b = hand[j]!
            if (a.subRow !== b.subRow) continue
            expect(Math.abs(a.cx - b.cx), `${ref.root} ${ref.form} ${a.midi}/${b.midi}`).toBeGreaterThanOrEqual(
              2 * BADGE_R + 4,
            )
          }
      }
    }
  })
})

describe('verticalLayout', () => {
  const none = { rhRows: 0, lhRows: 0 } as const
  const both = { rhRows: 2, lhRows: 2 } as const
  const whitesOnly = { rhRows: 1, lhRows: 0 } as const

  it('sizes each badge row to the sub-rows a hand needs', () => {
    expect(verticalLayout(none)).toEqual({ keyTop: 0, keyBottom: KEY.whiteH, height: KEY.whiteH })
    const one = verticalLayout(whitesOnly)
    const two = verticalLayout(both)
    expect(one.keyTop).toBeGreaterThan(2 * BADGE_R)
    expect(two.keyTop).toBeGreaterThan(one.keyTop)
    expect(two.height).toBe(two.keyTop * 2 + KEY.whiteH)
  })

  it('reserveRows keeps the same height and key position whatever the badges', () => {
    const reserved = [none, whitesOnly, both].map((b) => verticalLayout(b, true))
    for (const r of reserved) expect(r).toEqual(verticalLayout(both))
  })

  it("reserveRows 'rh' reserves only the RH rows (RH-only displays such as chords)", () => {
    const rhOnly = [none, whitesOnly, { rhRows: 2, lhRows: 0 } as const].map((b) => verticalLayout(b, 'rh'))
    for (const r of rhOnly) {
      expect(r.keyTop).toBe(verticalLayout(both).keyTop)
      expect(r.height).toBe(r.keyTop + KEY.whiteH)
    }
  })
})

describe('minRenderWidth', () => {
  it('keeps the render scale at or above MIN_SCALE so 20-unit finger numbers stay >= 18px', () => {
    expect(MIN_SCALE).toBeGreaterThanOrEqual(0.9)
    expect(20 * MIN_SCALE).toBeGreaterThanOrEqual(18)
    const viewBoxWidth = 28 * KEY.whiteW + 4
    expect(minRenderWidth(viewBoxWidth)).toBeGreaterThanOrEqual(viewBoxWidth * MIN_SCALE)
    expect(minRenderWidth(viewBoxWidth)).toBeLessThan(viewBoxWidth * MIN_SCALE + 1)
    expect(Number.isInteger(minRenderWidth(viewBoxWidth))).toBe(true)
  })
  it('fits an iPad landscape content column (1132px) for the widest range, C3..B6', () => {
    expect(minRenderWidth(28 * KEY.whiteW + 4)).toBeLessThan(1132)
  })
})

describe('keyboardMaxWidth', () => {
  it('caps the width per white key, and by --kb-max-h times the aspect ratio where a page sets it', () => {
    expect(keyboardMaxWidth(15, 80, 604, 336)).toBe('min(1200px, calc(var(--kb-max-h, 100000px) * 1.7976))')
  })
  it('without --kb-max-h the fallback is never the smaller term (other screens keep the per-key cap)', () => {
    const css = keyboardMaxWidth(29, 56, 1164, 172)
    expect(css.startsWith('min(1624px, ')).toBe(true)
    expect(100000 * (1164 / 172)).toBeGreaterThan(1624)
  })
})

describe('keyboardBox / keyboardFitVars (Play sizes the keyboard to its room)', () => {
  it('the box is the viewBox Keyboard draws: 15 white keys, both badge rows reserved', () => {
    const { height } = verticalLayout({ rhRows: 0, lhRows: 0 }, true)
    expect(keyboardBox(55, 79, [], true)).toEqual({ whiteCount: 15, width: 604, height })
  })
  it('the aspect rounds down, so the SVG never overshoots the height it is given', () => {
    expect(keyboardAspect(604, 336)).toBe(1.7976)
    expect(604 / keyboardAspect(604, 336)).toBeGreaterThanOrEqual(336)
  })
  it('vars: aspect, width cap per white key, and the MIN_SCALE height', () => {
    const box = { whiteCount: 15, width: 604, height: 336 }
    const minH = Math.ceil(minRenderWidth(604) / 1.7976)
    expect(keyboardFitVars(box, 80)).toBe(`--kb-aspect: 1.7976; --kb-max-w: 1200px; --kb-min-h: ${minH}px`)
    expect(minH).toBeGreaterThanOrEqual(336 * MIN_SCALE)
  })
})

describe('keyAriaLabel', () => {
  it('names the key with its octave', () => {
    expect(keyAriaLabel(64)).toBe('E4')
    expect(keyAriaLabel(61)).toBe('C♯4')
    expect(keyAriaLabel(48)).toBe('C3')
  })
  it('adds the label when it differs from the plain name', () => {
    expect(keyAriaLabel(64, 'E')).toBe('E4')
    expect(keyAriaLabel(63, 'E♭')).toBe('D♯4, E♭')
  })
})

describe('keyLooks (per-key fill, target outline, glyph)', () => {
  it('a mark with a state keeps its midi and is not dropped by range filtering', () => {
    const looks = keyLooks([{ midi: 64, hand: 'none', state: 'good' }], 60, 71)
    expect([...looks.keys()]).toEqual([64])
    expect(looks.get(64)).toEqual({ fill: 'good', target: false, glyph: 'good', label: undefined })
  })
  it('drops marks outside [low, high] and keeps both ends', () => {
    const looks = keyLooks(
      [
        { midi: 59, hand: 'none', state: 'bad' },
        { midi: 60, hand: 'none', state: 'bad' },
        { midi: 71, hand: 'none', state: 'pressed' },
        { midi: 72, hand: 'rh' },
      ],
      60,
      71,
    )
    expect([...looks.keys()].sort((a, b) => a - b)).toEqual([60, 71])
  })
  it('good / bad / pressed fills override hand fills; the finger mark is otherwise untouched', () => {
    const marks: KeyMark[] = [
      { midi: 64, hand: 'rh', finger: 3, label: 'E' },
      { midi: 64, hand: 'none', state: 'bad' },
      { midi: 65, hand: 'lh', state: 'pressed' },
    ]
    const looks = keyLooks(marks, 60, 71)
    expect(looks.get(64)).toEqual({ fill: 'bad', target: false, glyph: 'bad', label: 'E' })
    expect(looks.get(65)).toEqual({ fill: 'pressed', target: false, glyph: null, label: undefined })
    // Badges still come from hand + finger.
    expect(badgeSlots(marks, 60).rh.map((s) => s.midi)).toEqual([64])
  })
  it('target is an outline with no fill', () => {
    expect(keyLooks([{ midi: 62, hand: 'none', state: 'target' }], 60, 71).get(62)).toEqual({
      fill: null,
      target: true,
      glyph: null,
      label: undefined,
    })
  })
  it('one look per key, by the spec priority: good > bad > pressed > hand colour > target', () => {
    const at = (marks: KeyMark[]) => keyLooks(marks, 60, 71).get(60)
    const s = (state: KeyMark['state']): KeyMark => ({ midi: 60, hand: 'none', state })
    expect(at([s('target'), s('pressed'), s('bad'), s('good')])).toMatchObject({ fill: 'good', glyph: 'good' })
    expect(at([s('target'), s('bad'), s('pressed')])).toMatchObject({ fill: 'bad', glyph: 'bad' })
    expect(at([s('target'), s('pressed')])).toMatchObject({ fill: 'pressed', target: false })
    expect(at([s('target'), { midi: 60, hand: 'rh', finger: 1 }])).toMatchObject({ fill: 'rh', target: false })
  })
  it('without states, fills match the hand rules (rh, lh, split, none)', () => {
    const looks = keyLooks(
      [
        { midi: 60, hand: 'rh' },
        { midi: 62, hand: 'lh' },
        { midi: 64, hand: 'rh' },
        { midi: 64, hand: 'lh' },
        { midi: 65, hand: 'none' },
      ],
      60,
      71,
    )
    expect([60, 62, 64, 65].map((m) => looks.get(m)!.fill)).toEqual(['rh', 'lh', 'split', 'none'])
    expect([...looks.values()].every((l) => !l.target && l.glyph === null)).toBe(true)
  })
  it('keeps the first label for a key', () => {
    const looks = keyLooks([{ midi: 63, hand: 'rh', label: 'E♭' }, { midi: 63, hand: 'none', label: 'D♯', state: 'good' }], 60, 71)
    expect(looks.get(63)!.label).toBe('E♭')
  })
})
