import { describe, expect, it } from 'vitest'
import { scaleEvents, scalePlaybackNotes } from '../../src/audio/piano'

describe('scaleEvents', () => {
  it('spaces notes at eighth-note intervals (30 / bpm seconds)', () => {
    expect(scaleEvents(['C4', 'D4', 'E4'], 60)).toEqual([
      { note: 'C4', time: 0 },
      { note: 'D4', time: 0.5 },
      { note: 'E4', time: 1 },
    ])
  })

  it('doubles the spacing rate at 120 bpm', () => {
    expect(scaleEvents(['C4', 'D4'], 120)).toEqual([
      { note: 'C4', time: 0 },
      { note: 'D4', time: 0.25 },
    ])
  })
})

describe('scalePlaybackNotes', () => {
  it('C major, 1 octave: C4 up to C5 and back, top note not repeated (15 notes)', () => {
    const notes = scalePlaybackNotes({ root: 'C', form: 'major' }, 1)
    expect(notes).toEqual([
      'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5',
      'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4',
    ])
    expect(notes).toHaveLength(15)
  })

  it('2 octaves gives 29 notes', () => {
    expect(scalePlaybackNotes({ root: 'C', form: 'major' }, 2)).toHaveLength(29)
  })

  it('melodic minor descends as natural minor', () => {
    const notes = scalePlaybackNotes({ root: 'A', form: 'melodic' }, 1)
    expect(notes.slice(0, 8)).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G#5', 'A5'])
    expect(notes.slice(8)).toEqual(['G5', 'F5', 'E5', 'D5', 'C5', 'B4', 'A4'])
  })
})
