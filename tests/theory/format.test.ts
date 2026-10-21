import { describe, expect, it } from 'vitest'
import { formatChordName, formatNote, formatScale } from '../../src/theory/format'

describe('formatNote', () => {
  it('maps ASCII accidentals to music symbols', () => {
    expect(formatNote('F#')).toBe('F♯')
    expect(formatNote('Bb')).toBe('B♭')
    expect(formatNote('F##')).toBe('F𝄪')
    expect(formatNote('Cbb')).toBe('C𝄫')
    expect(formatNote('Eb4')).toBe('E♭4')
  })
  it('leaves naturals alone', () => {
    expect(formatNote('C')).toBe('C')
    expect(formatNote('A4')).toBe('A4')
  })
})

describe('formatScale', () => {
  it('names major and minor forms', () => {
    expect(formatScale({ root: 'F#', form: 'natural' })).toBe('F♯ natural minor')
    expect(formatScale({ root: 'E', form: 'major' })).toBe('E major')
    expect(formatScale({ root: 'G#', form: 'harmonic' })).toBe('G♯ harmonic minor')
    expect(formatScale({ root: 'Eb', form: 'melodic' })).toBe('E♭ melodic minor')
  })
})

describe('formatChordName', () => {
  it('drops the M of a plain major triad and keeps the slash bass', () => {
    expect(formatChordName('CM/E')).toBe('C/E')
    expect(formatChordName('CM')).toBe('C')
    expect(formatChordName('F#M')).toBe('F♯')
    expect(formatChordName('CMadd9')).toBe('Cadd9')
  })
  it('formats accidentals in root, quality and bass', () => {
    expect(formatChordName('Cm7b5')).toBe('Cm7♭5')
    expect(formatChordName('Em#5')).toBe('Em♯5')
    expect(formatChordName('A#m#5/F#')).toBe('A♯m♯5/F♯')
    expect(formatChordName('Ebm6/C')).toBe('E♭m6/C')
    expect(formatChordName('Cmaj7')).toBe('Cmaj7')
    expect(formatChordName('Cdim')).toBe('Cdim')
  })
})

describe('formatChordName rewrites (lead-sheet spellings)', () => {
  it('M7 -> maj7, Mb5 -> (♭5), oM7 -> dim(maj7)', () => {
    expect(formatChordName('CM7')).toBe('Cmaj7')
    expect(formatChordName('CM7b5')).toBe('Cmaj7♭5')
    expect(formatChordName('CMb5')).toBe('C(♭5)')
    expect(formatChordName('CoM7')).toBe('Cdim(maj7)')
    expect(formatChordName('CoM7/E')).toBe('Cdim(maj7)/E')
  })
})
