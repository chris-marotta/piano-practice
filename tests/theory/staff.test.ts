import { describe, expect, it } from 'vitest'
import { keySignature } from '../../src/theory/scales'
import {
  STAFF_LEVEL_NOTES,
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
