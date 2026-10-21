import { describe, expect, it } from 'vitest'
import {
  familyOf,
  fingeringFor,
  fingeringSequence,
  oneOctave,
  thumbNotes,
} from '../../src/data/fingerings'
import { MAJOR_ROOTS, MINOR_ROOTS, isBlackKey, scaleNotes } from '../../src/theory/scales'
import type { ScaleRef } from '../../src/theory/scales'

const HANDS = ['rh', 'lh'] as const

const sessionScales: ScaleRef[] = [
  ...MAJOR_ROOTS.map((root) => ({ root, form: 'major' as const })),
  ...MINOR_ROOTS.map((root) => ({ root, form: 'natural' as const })),
]

/** All 48 refs: 12 major + 12 minor roots in each of natural / harmonic / melodic. */
const allRefs: ScaleRef[] = [
  ...MAJOR_ROOTS.map((root) => ({ root, form: 'major' as const })),
  ...MINOR_ROOTS.flatMap((root) =>
    (['natural', 'harmonic', 'melodic'] as const).map((form) => ({ root, form })),
  ),
]

/** Pitch-class names for the 15 positions of a two-octave ascent. */
const fifteen = (ref: ScaleRef): string[] => {
  const n = scaleNotes(ref)
  return [...n, ...n, n[0] as string]
}

/** (spelling, fingers) pairs to check for a ref: ascending, plus for melodic the natural descent. */
const passes = (ref: ScaleRef, h: 'rh' | 'lh') => {
  const out = [{ label: 'up', names: fifteen(ref), fingers: fingeringSequence(ref, 2, h, 'up') }]
  if (ref.form === 'melodic')
    out.push({
      label: 'down',
      names: fifteen({ root: ref.root, form: 'natural' }).reverse(),
      fingers: fingeringSequence(ref, 2, h, 'down'),
    })
  return out
}

describe('fingeringFor', () => {
  it('has 15 fingers per hand for every major root', () => {
    for (const r of MAJOR_ROOTS)
      for (const h of HANDS) expect(fingeringFor({ root: r, form: 'major' })[h]).toHaveLength(15)
  })
  it('has 15 fingers for every minor root in every minor form', () => {
    for (const r of MINOR_ROOTS)
      for (const f of ['natural', 'harmonic', 'melodic'] as const)
        for (const h of HANDS) expect(fingeringFor({ root: r, form: f })[h]).toHaveLength(15)
  })
  it('harmonic returns the natural-minor entry; melodic does too except the F# and C# overrides', () => {
    for (const r of MINOR_ROOTS) {
      const natural = fingeringFor({ root: r, form: 'natural' })
      expect(fingeringFor({ root: r, form: 'harmonic' })).toEqual(natural)
      if (r !== 'F#' && r !== 'C#') expect(fingeringFor({ root: r, form: 'melodic' })).toEqual(natural)
    }
  })
  it('uses only fingers 1..5 and never repeats a finger on consecutive notes, for all 48 refs', () => {
    expect(allRefs).toHaveLength(48)
    for (const ref of allRefs)
      for (const h of HANDS)
        for (const { label, fingers } of passes(ref, h)) {
          expect(fingers, `${ref.root} ${ref.form} ${h} ${label}`).toHaveLength(15)
          fingers.forEach((f, i) => {
            expect(f).toBeGreaterThanOrEqual(1)
            expect(f).toBeLessThanOrEqual(5)
            if (i > 0) expect(f, `${ref.root} ${ref.form} ${h} ${label} #${i}`).not.toBe(fingers[i - 1])
          })
        }
  })
  it('returns frozen arrays so callers cannot mutate the shared table', () => {
    for (const ref of allRefs) {
      const f = fingeringFor(ref)
      expect(Object.isFrozen(f)).toBe(true)
      expect(Object.isFrozen(f.rh)).toBe(true)
      expect(Object.isFrozen(f.lh)).toBe(true)
    }
  })
  it('melodic minor overrides the RH for F# and C# only (thumb off black keys)', () => {
    for (const root of ['F#', 'C#']) {
      expect(fingeringFor({ root, form: 'melodic' }).rh).toEqual([2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2])
      expect(fingeringFor({ root, form: 'melodic' }).lh).toEqual(fingeringFor({ root, form: 'natural' }).lh)
    }
    expect(fingeringFor({ root: 'A', form: 'melodic' })).toEqual(fingeringFor({ root: 'A', form: 'natural' }))
  })
  it('stores the table values verbatim for spot-checked rows', () => {
    expect(fingeringFor({ root: 'C', form: 'major' })).toEqual({
      rh: [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5],
      lh: [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1],
    })
    expect(fingeringFor({ root: 'Bb', form: 'natural' }).rh).toEqual([2, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4])
    expect(fingeringFor({ root: 'Eb', form: 'natural' }).lh).toEqual([2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2])
  })
})

describe('oneOctave', () => {
  it('keeps degrees 1-7 plus the final tonic', () => {
    expect(oneOctave([1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5])).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
  })
})

describe('fingeringSequence', () => {
  it('returns one octave up for the RH', () => {
    expect(fingeringSequence({ root: 'C', form: 'major' }, 1, 'rh', 'up')).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
  })
  it('descending is the reverse of ascending', () => {
    expect(fingeringSequence({ root: 'C', form: 'major' }, 1, 'lh', 'down')).toEqual([1, 2, 3, 1, 2, 3, 4, 5])
    expect(fingeringSequence({ root: 'C', form: 'major' }, 1, 'rh', 'down')).toEqual([5, 4, 3, 2, 1, 3, 2, 1])
  })
  it('returns all 15 fingers for two octaves', () => {
    expect(fingeringSequence({ root: 'D', form: 'major' }, 2, 'rh', 'up')).toHaveLength(15)
  })
})

describe('thumbNotes', () => {
  it('lists first-octave pitch classes played with the thumb, in scale order', () => {
    expect(thumbNotes({ root: 'E', form: 'major' })).toEqual(['E', 'A'])
    expect(thumbNotes({ root: 'Bb', form: 'major' })).toEqual(['C', 'F'])
    expect(thumbNotes({ root: 'F#', form: 'major' }, 'lh')).toEqual(['B', 'E#'])
  })
  it('thumb never lands on a black key in any of the 48 refs, either hand, both directions', () => {
    for (const ref of allRefs)
      for (const h of HANDS)
        for (const { label, names, fingers } of passes(ref, h))
          fingers.forEach((f, i) => {
            if (f === 1) expect(isBlackKey(names[i] as string), `${ref.root} ${ref.form} ${h} ${label}: ${names[i]}`).toBe(false)
          })
  })
  it('thumbNotes reports the thumbs for the melodic overrides', () => {
    expect(thumbNotes({ root: 'F#', form: 'melodic' })).toEqual(['A', 'E#'])
    expect(thumbNotes({ root: 'C#', form: 'melodic' })).toEqual(['E', 'B#'])
  })
  it('melodic descends with the natural-minor fingering', () => {
    expect(fingeringSequence({ root: 'A', form: 'melodic' }, 1, 'rh', 'down')).toEqual(
      oneOctave(fingeringFor({ root: 'A', form: 'natural' }).rh).reverse(),
    )
    expect(fingeringSequence({ root: 'F#', form: 'melodic' }, 2, 'rh', 'down')).toEqual(
      [...fingeringFor({ root: 'F#', form: 'natural' }).rh].reverse(),
    )
    expect(fingeringSequence({ root: 'F#', form: 'melodic' }, 2, 'rh', 'up')).toEqual(
      fingeringFor({ root: 'F#', form: 'melodic' }).rh,
    )
  })
  it('thumb notes come from the scale itself', () => {
    for (const ref of sessionScales)
      for (const n of thumbNotes(ref)) expect(scaleNotes(ref)).toContain(n)
  })
})

describe('familyOf', () => {
  it('names the first other session scale with identical fingering', () => {
    expect(familyOf({ root: 'G', form: 'major' })).toBe('Same fingering as C major')
  })
  it('is null for a unique fingering', () => {
    expect(familyOf({ root: 'F#', form: 'major' })).toBeNull()
  })
  it('points a family\'s first member at the next member in session order', () => {
    expect(familyOf({ root: 'C', form: 'major' })).toBe('Same fingering as G major')
  })
})
