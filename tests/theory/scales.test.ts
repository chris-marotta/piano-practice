import { Note } from '@tonaljs/tonal'
import { describe, expect, it } from 'vitest'
import {
  MAJOR_ROOTS,
  MINOR_ROOTS,
  isBlackKey,
  keySignature,
  relativeKey,
  scaleNotes,
  scaleSequence,
  noteMidi,
  transpose,
  enharmonic,
  chroma,
} from '../../src/theory/scales'

describe('scaleNotes', () => {
  it('spells major and minor forms correctly', () => {
    expect(scaleNotes({ root: 'F#', form: 'major' })).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'])
    expect(scaleNotes({ root: 'Eb', form: 'natural' })).toEqual(['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db'])
    expect(scaleNotes({ root: 'G#', form: 'harmonic' })).toEqual(['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##'])
    expect(scaleNotes({ root: 'G#', form: 'melodic' })).toEqual(['G#', 'A#', 'B', 'C#', 'D#', 'E#', 'F##'])
  })
})

describe('scaleSequence', () => {
  it('melodic minor ascends melodic and descends natural', () => {
    const s = scaleSequence({ root: 'A', form: 'melodic' }, 1, 4)
    expect(s.ascending).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G#5', 'A5'])
    expect(s.descending).toEqual(['A5', 'G5', 'F5', 'E5', 'D5', 'C5', 'B4', 'A4'])
  })
  it('descending mirrors ascending for non-melodic forms', () => {
    const s = scaleSequence({ root: 'C', form: 'major' }, 1, 4)
    expect(s.descending).toEqual([...s.ascending].reverse())
  })
  it('two octaves is 15 notes, tonic to tonic', () => {
    const s = scaleSequence({ root: 'C', form: 'major' }, 2, 4)
    expect(s.ascending).toHaveLength(15)
    expect(s.ascending[0]).toBe('C4')
    expect(s.ascending[14]).toBe('C6')
  })
  it('keeps double sharps with octave numbers', () => {
    const s = scaleSequence({ root: 'G#', form: 'harmonic' }, 1, 3)
    expect(s.ascending[6]).toBe('F##4')
    expect(s.ascending[7]).toBe('G#4')
  })
})

describe('keySignature', () => {
  it('returns accidentals in order', () => {
    expect(keySignature({ root: 'E', form: 'major' })).toEqual({ count: 4, accidental: '#', notes: ['F#', 'C#', 'G#', 'D#'] })
    expect(keySignature({ root: 'F', form: 'harmonic' })).toEqual({ count: 4, accidental: 'b', notes: ['Bb', 'Eb', 'Ab', 'Db'] })
    expect(keySignature({ root: 'C', form: 'major' })).toEqual({ count: 0, accidental: '', notes: [] })
  })
  it('matches the circle of fifths for all 12 major session roots', () => {
    MAJOR_ROOTS.forEach((r, i) =>
      expect(keySignature({ root: r, form: 'major' }).count).toBe([0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1][i]),
    )
  })
})

describe('relativeKey', () => {
  it('maps major to natural minor and minor to major', () => {
    expect(relativeKey({ root: 'Ab', form: 'major' })).toEqual({ root: 'F', form: 'natural' })
    expect(relativeKey({ root: 'C#', form: 'harmonic' })).toEqual({ root: 'E', form: 'major' })
  })
  it('minor roots pair index-for-index with major roots (enharmonically)', () => {
    MINOR_ROOTS.forEach((r, i) =>
      expect(Note.chroma(relativeKey({ root: r, form: 'natural' }).root)).toBe(Note.chroma(MAJOR_ROOTS[i] as string)),
    )
  })
  it('returns true relative spellings at the enharmonic pair', () => {
    expect(relativeKey({ root: 'Eb', form: 'natural' })).toEqual({ root: 'Gb', form: 'major' })
    expect(relativeKey({ root: 'F#', form: 'major' })).toEqual({ root: 'D#', form: 'natural' })
  })
})

describe('isBlackKey', () => {
  it('classifies by pitch class, so enharmonic white keys count as white', () => {
    for (const n of ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Cb', 'E#', 'B#', 'Fb']) expect(isBlackKey(n)).toBe(false)
    for (const n of ['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb']) expect(isBlackKey(n)).toBe(true)
  })
  it('ignores octave numbers', () => {
    expect(isBlackKey('F#4')).toBe(true)
    expect(isBlackKey('E4')).toBe(false)
  })
})

describe('transpose', () => {
  it('stacks a perfect fifth on the drone tonic', () => {
    expect(transpose('C2', '5P')).toBe('G2')
    expect(transpose('F#2', '5P')).toBe('C#3')
    expect(transpose('Db2', '5P')).toBe('Ab2')
    expect(transpose('B2', '5P')).toBe('F#3')
  })
})

describe('noteMidi', () => {
  it('converts scientific pitch to MIDI, spelling-agnostic', () => {
    expect(noteMidi('C4')).toBe(60)
    expect(noteMidi('F#4')).toBe(66)
    expect(noteMidi('Gb4')).toBe(66)
    expect(noteMidi('F##4')).toBe(67)
    expect(noteMidi('Cb5')).toBe(71)
  })
  it('throws on a note without an octave', () => {
    expect(() => noteMidi('C')).toThrow()
  })
})

describe('enharmonic (library spelling toggle)', () => {
  it('swaps the five black-key spellings both ways', () => {
    const pairs = [['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'], ['G#', 'Ab'], ['A#', 'Bb']]
    for (const [sharp, flat] of pairs) {
      expect(enharmonic(sharp as string)).toBe(flat)
      expect(enharmonic(flat as string)).toBe(sharp)
    }
  })
  it('leaves white keys alone (no B<->Cb, E<->Fb)', () => {
    for (const n of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) expect(enharmonic(n)).toBe(n)
  })
  it('respells theoretical spellings to the plain one', () => {
    expect(enharmonic('Cb')).toBe('B')
    expect(enharmonic('E#')).toBe('F')
    expect(enharmonic('F##')).toBe('G')
    expect(enharmonic('Bbb')).toBe('A')
  })
})

describe('chroma', () => {
  it('gives the pitch class number, spelling-agnostic', () => {
    expect(chroma('C')).toBe(0)
    expect(chroma('B#')).toBe(0)
    expect(chroma('Cb')).toBe(11)
    expect(chroma('F#')).toBe(6)
    expect(chroma('Gb')).toBe(6)
    expect(chroma('F##')).toBe(7)
  })
})
