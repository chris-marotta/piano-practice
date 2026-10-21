import { describe, expect, it } from 'vitest'
import { formatNote, formatScale } from '../../src/theory/format'

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
