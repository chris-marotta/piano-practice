import { Note } from '@tonaljs/tonal'
import { describe, expect, it } from 'vitest'
import {
  CHORD_TYPES,
  chordFingering,
  chordNotes,
  detectChord,
  diatonicChords,
  maxInversion,
  progression,
} from '../../src/theory/chords'

describe('CHORD_TYPES', () => {
  it('lists the 14 types in order with display labels', () => {
    expect(CHORD_TYPES.map((t) => t.id)).toEqual([
      'M', 'm', 'dim', 'aug', 'sus2', 'sus4', 'maj7', '7', 'm7', 'm7b5', 'dim7', '6', 'add9', '9',
    ])
    expect(CHORD_TYPES.map((t) => t.label)).toEqual([
      'Major', 'Minor', 'Diminished', 'Augmented', 'sus2', 'sus4', 'maj7', '7', 'm7', 'm7♭5', 'dim7', '6', 'add9', '9',
    ])
  })
})

describe('chordNotes', () => {
  it('spells root position and inversions with ascending octaves', () => {
    expect(chordNotes('C', 'M', 0)).toEqual(['C4', 'E4', 'G4'])
    expect(chordNotes('C', 'M', 1)).toEqual(['E4', 'G4', 'C5'])
    expect(chordNotes('C', 'M', 2)).toEqual(['G4', 'C5', 'E5'])
    expect(chordNotes('F#', 'm7b5', 0)).toEqual(['F#4', 'A4', 'C5', 'E5'])
    expect(chordNotes('Bb', 'add9', 0)).toEqual(['Bb4', 'D5', 'F5', 'C6'])
  })
  it('places moved notes above the current top for add9 and 9', () => {
    expect(chordNotes('C', '9', 1)).toEqual(['E4', 'G4', 'Bb4', 'D5', 'C6'])
    expect(chordNotes('C', 'add9', 1)).toEqual(['E4', 'G4', 'D5', 'C6'])
  })
  it('is strictly ascending at every allowed inversion of every type', () => {
    for (const { id } of CHORD_TYPES) {
      for (let inv = 0; inv <= maxInversion(id); inv++) {
        const midis = chordNotes('C', id, inv).map((n) => Note.midi(n) as number)
        midis.slice(1).forEach((m, i) => expect(m, `${id} inv ${inv}`).toBeGreaterThan(midis[i] as number))
      }
    }
  })
})

describe('maxInversion', () => {
  it('allows 3rd inversion only where there is a 7th', () => {
    expect(maxInversion('M')).toBe(2)
    expect(maxInversion('7')).toBe(3)
    expect(maxInversion('9')).toBe(3)
    expect(maxInversion('dim7')).toBe(3)
    expect(maxInversion('6')).toBe(2)
    expect(maxInversion('add9')).toBe(2)
  })
})

describe('chordFingering', () => {
  it('gives triad fingerings by inversion and hand', () => {
    expect(chordFingering('M', 0, 'rh')).toEqual([1, 3, 5])
    expect(chordFingering('M', 0, 'lh')).toEqual([5, 3, 1])
    expect(chordFingering('m', 1, 'rh')).toEqual([1, 2, 5])
    expect(chordFingering('m', 1, 'lh')).toEqual([5, 3, 1])
    expect(chordFingering('M', 2, 'rh')).toEqual([1, 3, 5])
    expect(chordFingering('M', 2, 'lh')).toEqual([5, 2, 1])
    expect(chordFingering('dim', 1, 'rh')).toEqual([1, 2, 5])
  })
  it('gives seventh-chord fingerings in root position only', () => {
    expect(chordFingering('maj7', 0, 'rh')).toEqual([1, 2, 3, 5])
    expect(chordFingering('maj7', 0, 'lh')).toEqual([5, 3, 2, 1])
    expect(chordFingering('maj7', 1, 'rh')).toBeNull()
  })
  it('returns null where there is no standard fingering', () => {
    expect(chordFingering('9', 0, 'rh')).toBeNull()
    expect(chordFingering('add9', 0, 'lh')).toBeNull()
  })
})

describe('diatonicChords', () => {
  it('builds the seven triads of a major key', () => {
    expect(diatonicChords({ root: 'D', form: 'major' }).map((c) => c.numeral + ':' + c.root + c.type)).toEqual([
      'I:DM', 'ii:Em', 'iii:F#m', 'IV:GM', 'V:AM', 'vi:Bm', 'vii°:C#dim',
    ])
  })
  it('names numerals by quality for harmonic and natural minor', () => {
    expect(diatonicChords({ root: 'A', form: 'harmonic' }).map((c) => c.numeral)).toEqual([
      'i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°',
    ])
    expect(diatonicChords({ root: 'A', form: 'natural' }).map((c) => c.numeral)).toEqual([
      'i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII',
    ])
  })
  it('classifies the augmented triad', () => {
    expect(diatonicChords({ root: 'A', form: 'harmonic' })[2]).toEqual({ numeral: 'III+', root: 'C', type: 'aug' })
  })
})

describe('progression', () => {
  it('picks degrees I IV V vi / i iv V|v VI', () => {
    expect(progression({ root: 'G', form: 'major' }).map((c) => c.numeral)).toEqual(['I', 'IV', 'V', 'vi'])
    expect(progression({ root: 'E', form: 'natural' }).map((c) => c.numeral)).toEqual(['i', 'iv', 'v', 'VI'])
    expect(progression({ root: 'E', form: 'harmonic' }).map((c) => c.numeral)).toEqual(['i', 'iv', 'V', 'VI'])
  })
  it('uses the harmonic-minor set for melodic minor', () => {
    expect(progression({ root: 'E', form: 'melodic' }).map((c) => c.numeral)).toEqual(['i', 'iv', 'V', 'VI'])
  })
})

describe('detectChord', () => {
  it('names a first-inversion triad with a slash bass', () => {
    expect(detectChord(['E4', 'G4', 'C5'])).toContain('CM/E')
  })
  it('does not depend on input order', () => {
    expect(detectChord(['C5', 'E4', 'G4'])).toContain('CM/E')
  })
})
