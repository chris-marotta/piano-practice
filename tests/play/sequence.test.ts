import { describe, expect, it } from 'vitest'
import { expectedRun } from '../../src/play/sequence'

describe('expectedRun', () => {
  it('G major, 1 octave: up and back down without repeating the top note', () => {
    const exp = expectedRun({ root: 'G', form: 'major' }, 1, 4)
    expect(exp.map((e) => e.midi)).toEqual([67, 69, 71, 72, 74, 76, 78, 79, 78, 76, 74, 72, 71, 69, 67])
  })

  it('melodic minor descends as natural minor', () => {
    const exp = expectedRun({ root: 'A', form: 'melodic' }, 1, 4)
    expect(exp.map((e) => e.name).slice(5, 10)).toEqual(['F#5', 'G#5', 'A5', 'G5', 'F5'])
  })

  it('2 octaves gives 29 notes with one top note', () => {
    const exp = expectedRun({ root: 'C', form: 'major' }, 2, 3)
    expect(exp).toHaveLength(29)
    expect(exp[14]).toEqual({ midi: 60 + 12, name: 'C5' })
    expect(exp[0]).toEqual({ midi: 48, name: 'C3' })
    expect(exp[28]).toEqual({ midi: 48, name: 'C3' })
  })
})
