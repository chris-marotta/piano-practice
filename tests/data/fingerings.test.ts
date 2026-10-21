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
  it('harmonic and melodic return the natural-minor entry', () => {
    for (const r of MINOR_ROOTS) {
      const natural = fingeringFor({ root: r, form: 'natural' })
      expect(fingeringFor({ root: r, form: 'harmonic' })).toEqual(natural)
      expect(fingeringFor({ root: r, form: 'melodic' })).toEqual(natural)
    }
  })
  it('uses only fingers 1..5 and never repeats a finger on consecutive notes', () => {
    for (const ref of sessionScales)
      for (const h of HANDS) {
        const seq = fingeringFor(ref)[h]
        seq.forEach((f, i) => {
          expect(f).toBeGreaterThanOrEqual(1)
          expect(f).toBeLessThanOrEqual(5)
          if (i > 0) expect(f).not.toBe(seq[i - 1])
        })
      }
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
  it('thumb never lands on a black key in any session scale, either hand', () => {
    for (const ref of sessionScales)
      for (const h of HANDS)
        for (const n of thumbNotes(ref, h)) expect(isBlackKey(n), `${ref.root} ${ref.form} ${h}: ${n}`).toBe(false)
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
  it('the first scale of a family has no earlier twin but points at a later one only if identical', () => {
    expect(familyOf({ root: 'C', form: 'major' })).toBe('Same fingering as G major')
  })
})
