import { describe, expect, it } from 'vitest'
import { randomChord, randomScale } from '../../src/ui/screens/play/playView'
import { pickerKeys } from '../../src/ui/screens/library/libraryView'
import { CHORD_TYPES } from '../../src/theory/chords'
import { chroma } from '../../src/theory/scales'

/** An rng that returns the given values in turn (then the last one). */
const seq = (...vals: number[]) => {
  let i = 0
  return () => vals[Math.min(i++, vals.length - 1)] as number
}
const ALL_MINOR = { natural: true, harmonic: true, melodic: true }
const NO_MINOR = { natural: false, harmonic: false, melodic: false }

describe('randomScale', () => {
  it('draws the form from major plus the enabled minor forms, then a root for that form', () => {
    // forms [major, natural, harmonic, melodic]: 0.6 -> harmonic; roots C..B: 0 -> C
    expect(randomScale({ root: 'G', form: 'major' }, ALL_MINOR, seq(0.6, 0))).toEqual({ root: 'C', form: 'harmonic' })
  })
  it('only major when no minor form is enabled in Settings', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) expect(randomScale({ root: 'C', form: 'major' }, NO_MINOR, seq(r, 0.5)).form).toBe('major')
  })
  it('skips disabled forms: natural only -> [major, natural]', () => {
    expect(randomScale({ root: 'C', form: 'major' }, { natural: true, harmonic: false, melodic: false }, seq(0.9, 0)).form).toBe(
      'natural',
    )
  })
  it('spells the root as the RootPicker offers it for the drawn form (C♯ minor, D♭ major)', () => {
    const black = 1 // pitch class 1
    const minor = randomScale({ root: 'C', form: 'major' }, ALL_MINOR, seq(0.3, (black + 0.5) / 12))
    expect(minor).toEqual({ root: 'C#', form: 'natural' })
    const major = randomScale({ root: 'C', form: 'natural' }, ALL_MINOR, seq(0, (black + 0.5) / 12))
    expect(major).toEqual({ root: 'Db', form: 'major' })
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      const s = randomScale({ root: 'E', form: 'harmonic' }, ALL_MINOR, seq(r, r))
      expect(pickerKeys('C', s.form).map((k) => k.root)).toContain(s.root)
    }
  })
  it('never returns the current selection (same root and form, any spelling)', () => {
    // Current C major; rng asks for major + C: the next root is taken instead.
    const s = randomScale({ root: 'C', form: 'major' }, NO_MINOR, seq(0, 0))
    expect(s).not.toEqual({ root: 'C', form: 'major' })
    expect(s.form).toBe('major')
    // C♯ major is D♭ major's pitch class: also skipped.
    const t = randomScale({ root: 'C#', form: 'major' }, NO_MINOR, seq(0, (1 + 0.5) / 12))
    expect(chroma(t.root)).not.toBe(1)
    for (let i = 0; i < 200; i++) {
      const cur = { root: 'A', form: 'natural' as const }
      const r = randomScale(cur, ALL_MINOR, Math.random)
      expect(r.form === cur.form && chroma(r.root) === chroma(cur.root)).toBe(false)
    }
  })
  it('an rng that returns 1 still picks inside the lists', () => {
    // Last form (melodic), last root (pitch class 11, B).
    expect(randomScale({ root: 'C', form: 'major' }, ALL_MINOR, () => 1)).toEqual({ root: 'B', form: 'melodic' })
    const lastType = CHORD_TYPES[CHORD_TYPES.length - 1]!.id
    expect(randomChord({ root: 'C', type: 'M', inversion: 0 }, () => 1)).toEqual({ root: 'B', type: lastType, inversion: 0 })
  })
})

describe('randomChord', () => {
  it('any chord type and a chord-picker root, root position', () => {
    // type index 0 (the first CHORD_TYPES id), root index 2 (D)
    expect(randomChord({ root: 'G', type: 'm', inversion: 2 }, seq(0, 2.5 / 12))).toEqual({
      root: 'D',
      type: CHORD_TYPES[0]!.id,
      inversion: 0,
    })
  })
  it('black-key roots spelled the chord way (D♭ E♭ F♯ A♭ B♭)', () => {
    const roots = [1, 3, 6, 8, 10].map((pc) => randomChord({ root: 'C', type: 'M', inversion: 0 }, seq(0.99, (pc + 0.5) / 12)).root)
    expect(roots).toEqual(['Db', 'Eb', 'F#', 'Ab', 'Bb'])
  })
  it('never returns the current root and type (any inversion, any spelling)', () => {
    const first = CHORD_TYPES[0]!.id
    const c = randomChord({ root: 'C', type: first, inversion: 1 }, seq(0, 0))
    expect(c.type === first && chroma(c.root) === 0).toBe(false)
    for (let i = 0; i < 200; i++) {
      const r = randomChord({ root: 'F#', type: 'm7', inversion: 0 }, Math.random)
      expect(r.type === 'm7' && chroma(r.root) === 6).toBe(false)
    }
  })
})
