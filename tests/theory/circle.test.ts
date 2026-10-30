import { describe, expect, it } from 'vitest'
import { CIRCLE, circleIndex } from '../../src/theory/circle'
import { MAJOR_ROOTS, MINOR_ROOTS, keySignature } from '../../src/theory/scales'
import type { ScaleForm } from '../../src/theory/scales'

describe('CIRCLE', () => {
  it('has 12 entries clockwise from C / A minor, spelled with the app roots', () => {
    expect(CIRCLE).toHaveLength(12)
    expect(CIRCLE[0]).toEqual({ major: 'C', minor: 'A', count: 0, accidental: '' })
    expect(CIRCLE.map((e) => e.major)).toEqual(MAJOR_ROOTS)
    expect(CIRCLE.map((e) => e.minor)).toEqual(MINOR_ROOTS)
  })

  it('each count and accidental matches keySignature of the major', () => {
    for (const e of CIRCLE) {
      const major = keySignature({ root: e.major, form: 'major' })
      expect([e.count, e.accidental]).toEqual([major.count, major.accidental])
    }
  })

  it('the minor has the same count; only the 6 o\'clock pair differs in accidental (F# major, Eb minor)', () => {
    CIRCLE.forEach((e, i) => {
      const minor = keySignature({ root: e.minor, form: 'natural' })
      expect(minor.count).toBe(e.count)
      if (i === 6) expect([e.accidental, minor.accidental]).toEqual(['#', 'b'])
      else expect(minor.accidental).toBe(e.accidental)
    })
  })

  it('pins the enharmonic edge: F# (6 sharps) then Db (5 flats), Eb minor (6 flats)', () => {
    expect(CIRCLE[6]).toEqual({ major: 'F#', minor: 'Eb', count: 6, accidental: '#' })
    expect(CIRCLE[7]).toEqual({ major: 'Db', minor: 'Bb', count: 5, accidental: 'b' })
    expect(CIRCLE[11]).toEqual({ major: 'F', minor: 'D', count: 1, accidental: 'b' })
  })
})

describe('circleIndex', () => {
  it('finds every major and every minor form at its circle position', () => {
    MAJOR_ROOTS.forEach((root, i) => expect(circleIndex({ root, form: 'major' })).toBe(i))
    const forms: ScaleForm[] = ['natural', 'harmonic', 'melodic']
    MINOR_ROOTS.forEach((root, i) => {
      for (const form of forms) expect(circleIndex({ root, form })).toBe(i)
    })
  })

  it('places enharmonic spellings from relativeKey on the app spelling', () => {
    expect(circleIndex({ root: 'Gb', form: 'major' })).toBe(6)
    expect(circleIndex({ root: 'D#', form: 'natural' })).toBe(6)
    expect(circleIndex({ root: 'C#', form: 'major' })).toBe(7)
  })
})
