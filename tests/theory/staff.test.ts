import { describe, expect, it } from 'vitest'
import { enharmonic, keySignature } from '../../src/theory/scales'
import {
  STAFF_LEVEL_NOTES,
  octaveHint,
  otherClefReading,
  positionPhrase,
  routeText,
  staffChoices,
  staffRoute,
  keySignaturePositions,
  ledgerLines,
  staffOctaves,
  staffPosition,
  writtenAccidental,
} from '../../src/theory/staff'

describe('staffPosition', () => {
  it('places treble notes', () => {
    expect(staffPosition('E4', 'treble')).toBe(-4)
    expect(staffPosition('F5', 'treble')).toBe(4)
    expect(staffPosition('B4', 'treble')).toBe(0)
    expect(staffPosition('C4', 'treble')).toBe(-6)
    expect(staffPosition('A3', 'treble')).toBe(-8)
    expect(staffPosition('A5', 'treble')).toBe(6)
    expect(staffPosition('C6', 'treble')).toBe(8)
  })
  it('places bass notes', () => {
    expect(staffPosition('G2', 'bass')).toBe(-4)
    expect(staffPosition('A3', 'bass')).toBe(4)
    expect(staffPosition('D3', 'bass')).toBe(0)
    expect(staffPosition('C4', 'bass')).toBe(6)
    expect(staffPosition('E4', 'bass')).toBe(8)
    expect(staffPosition('E2', 'bass')).toBe(-6)
    expect(staffPosition('C2', 'bass')).toBe(-8)
  })
  it('ignores the accidental but not the letter', () => {
    expect(staffPosition('F#4', 'treble')).toBe(staffPosition('F4', 'treble'))
    expect(staffPosition('F#4', 'treble')).not.toBe(staffPosition('Gb4', 'treble'))
  })
})

describe('ledgerLines', () => {
  it('lists ledger positions from the staff out to the note', () => {
    expect(ledgerLines(-8)).toEqual([-6, -8])
    expect(ledgerLines(-7)).toEqual([-6])
    expect(ledgerLines(5)).toEqual([])
    expect(ledgerLines(8)).toEqual([6, 8])
    expect(ledgerLines(0)).toEqual([])
  })
})

describe('STAFF_LEVEL_NOTES', () => {
  const sizes = [1, 2, 3, 4, 5].map((n) => STAFF_LEVEL_NOTES[n as 1 | 2 | 3 | 4 | 5].length)
  it('has the level sizes', () => {
    expect(sizes).toEqual([4, 10, 10, 10, 20])
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(54)
  })
  it('has no duplicates', () => {
    const ids = Object.values(STAFF_LEVEL_NOTES).flat().map((n) => `${n.clef}:${n.note}`)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('needs no ledger lines in levels 2 and 3, and always does in level 4', () => {
    for (const lv of [2, 3] as const)
      for (const n of STAFF_LEVEL_NOTES[lv]) expect(ledgerLines(staffPosition(n.note, n.clef))).toEqual([])
    for (const n of STAFF_LEVEL_NOTES[4]) expect(ledgerLines(staffPosition(n.note, n.clef)).length).toBeGreaterThan(0)
  })
  it('introduces the second landmark first', () => {
    expect(STAFF_LEVEL_NOTES[2][0]).toEqual({ clef: 'treble', note: 'C5' })
    expect(STAFF_LEVEL_NOTES[3][0]).toEqual({ clef: 'bass', note: 'C3' })
  })
})

describe('keySignaturePositions', () => {
  const pos = (notes: string[], clef: 'treble' | 'bass') => notes.map((n) => staffPosition(n, clef))
  it('places sharps and flats', () => {
    expect(keySignaturePositions('#', 3, 'treble')).toEqual(pos(['F5', 'C5', 'G5'], 'treble'))
    expect(keySignaturePositions('b', 7, 'bass')).toEqual(pos(['B2', 'E3', 'A2', 'D3', 'G2', 'C3', 'F2'], 'bass'))
    expect(keySignaturePositions('#', 7, 'bass')).toEqual(pos(['F3', 'C3', 'G3', 'D3', 'A2', 'E3', 'B2'], 'bass'))
    expect(keySignaturePositions('b', 7, 'treble')).toEqual(pos(['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4'], 'treble'))
  })
})

describe('writtenAccidental', () => {
  it('prints what the key signature does not already say', () => {
    expect(writtenAccidental('F#4', keySignature({ root: 'A', form: 'major' }))).toBe('')
    expect(writtenAccidental('C#4', keySignature({ root: 'D', form: 'natural' }))).toBe('#')
    expect(writtenAccidental('D4', keySignature({ root: 'Eb', form: 'natural' }))).toBe('n')
    expect(writtenAccidental('F##4', keySignature({ root: 'G#', form: 'natural' }))).toBe('##')
  })
  it('leaves plain unaltered notes bare', () => {
    expect(writtenAccidental('C4', keySignature({ root: 'C', form: 'major' }))).toBe('')
    expect(writtenAccidental('Bb4', keySignature({ root: 'F', form: 'major' }))).toBe('')
  })
})

describe('staffOctaves', () => {
  it('drops the left hand an octave when it would run above E4', () => {
    expect(staffOctaves({ root: 'E', form: 'major' })).toEqual({ rh: 4, lh: 3 })
    expect(staffOctaves({ root: 'F', form: 'major' }).lh).toBe(2)
    expect(staffOctaves({ root: 'Eb', form: 'natural' }).lh).toBe(3)
  })
})

describe('staffRoute', () => {
  const r = (n: string, c: 'treble' | 'bass') => staffRoute(n, c)
  it('picks the nearest landmark, ties to the lower', () => {
    expect(r('A4', 'treble')).toEqual({ landmark: 'G4', steps: ['G4', 'A4'] })
    expect(r('B4', 'treble')).toEqual({ landmark: 'C5', steps: ['C5', 'B4'] })
    expect(r('E4', 'treble')).toEqual({ landmark: 'C4', steps: ['C4', 'D4', 'E4'] })
    expect(r('A3', 'treble')).toEqual({ landmark: 'C4', steps: ['C4', 'B3', 'A3'] })
    expect(r('E5', 'treble')).toEqual({ landmark: 'C5', steps: ['C5', 'D5', 'E5'] })
    expect(r('A3', 'bass')).toEqual({ landmark: 'F3', steps: ['F3', 'G3', 'A3'] })
    expect(r('D3', 'bass')).toEqual({ landmark: 'C3', steps: ['C3', 'D3'] })
    expect(r('F#4', 'treble')).toEqual({ landmark: 'G4', steps: ['G4', 'F4'] })
  })
})

describe('routeText', () => {
  it('matches the pinned examples', () => {
    expect(routeText('A4', 'treble')).toBe('From treble G (2nd line): G, A. A is the 2nd space.')
    expect(routeText('A3', 'treble')).toBe('From middle C down: C, B, A. A sits on the 2nd ledger line below.')
    expect(routeText('G4', 'treble')).toBe('This is treble G (2nd line).')
    expect(routeText('F#4', 'treble')).toBe(
      'From treble G (2nd line) down: G, F. F is the 1st space. F♯ is F raised a half-step: the black key just right of F.',
    )
    expect(routeText('Gb4', 'treble')).toBe(
      'This is treble G (2nd line). G♭ is G lowered a half-step: the black key just left of G.',
    )
  })
})

describe('positionPhrase', () => {
  it('names lines, spaces and ledger positions', () => {
    expect(positionPhrase(-4)).toBe('is the 1st line')
    expect(positionPhrase(4)).toBe('is the 5th line')
    expect(positionPhrase(-3)).toBe('is the 1st space')
    expect(positionPhrase(3)).toBe('is the 4th space')
    expect(positionPhrase(-5)).toBe('sits just below the staff')
    expect(positionPhrase(5)).toBe('sits just above the staff')
    expect(positionPhrase(-6)).toBe('sits on the 1st ledger line below')
    expect(positionPhrase(8)).toBe('sits on the 2nd ledger line above')
    expect(positionPhrase(-7)).toBe('sits under the 1st ledger line below')
    expect(positionPhrase(9)).toBe('sits over the 2nd ledger line above')
  })
})

describe('otherClefReading', () => {
  it('reads the same position in the other clef', () => {
    expect(otherClefReading('E4', 'treble')).toBe('G')
    expect(otherClefReading('G2', 'bass')).toBe('E')
    expect(otherClefReading('C4', 'treble')).toBe('E')
    expect(otherClefReading('F#4', 'treble')).toBe('A#')
  })
})

describe('staffChoices', () => {
  const all = ([1, 2, 3, 4, 5] as const).flatMap((lv) => STAFF_LEVEL_NOTES[lv])
  const seeded = (seed: number) => {
    let s = seed
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  }
  it('gives 4 distinct names with the target and the usual mistakes', () => {
    expect(all.length).toBe(54)
    for (let seed = 1; seed <= 20; seed++) {
      for (const { clef, note } of all) {
        const c = staffChoices(note, clef, seeded(seed))
        expect(new Set(c).size).toBe(4)
        const letters = 'CDEFGAB'
        const m = /^([A-G])(#|b)?/.exec(note) as RegExpExecArray
        const pc = m[0]
        expect(c).toContain(pc)
        expect(c).toContain(otherClefReading(note, clef))
        if (m[2]) {
          expect(c).toContain(enharmonic(pc))
          expect(c).toContain(m[1])
        } else {
          const i = letters.indexOf(pc)
          expect(c).toContain(letters[(i + 1) % 7])
          expect(c).toContain(letters[(i + 6) % 7])
        }
      }
    }
  })
})

describe('octaveHint', () => {
  it('says which octave was played', () => {
    expect(octaveHint('C4', 72, false)).toBe('Right. The staff shows middle C; you played the C one octave up.')
    expect(octaveHint('E5', 52, true)).toBe('Wrong octave. The staff shows E5; you played the E two octaves down.')
  })
})
