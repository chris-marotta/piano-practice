import { Note } from '@tonaljs/tonal'
import { describe, expect, it } from 'vitest'
import { chordNotes, maxInversion, progression } from '../../src/theory/chords'
import { voiceDistance, voiceLead, voiceLedCadence } from '../../src/theory/voiceLeading'

const midis = (notes: string[]): number[] => notes.map((n) => Note.midi(n) as number)

describe('voiceDistance', () => {
  it('sums semitone moves voice by voice, low to high', () => {
    expect(voiceDistance(['C4', 'E4', 'G4'], ['C4', 'F4', 'A4'])).toBe(3)
    expect(voiceDistance(['C4', 'E4', 'G4'], ['B3', 'D4', 'G4'])).toBe(3)
    expect(voiceDistance(['C4', 'E4', 'G4'], ['C4', 'E4', 'G4'])).toBe(0)
  })
  it('pairs voices by pitch, whatever the input order', () => {
    expect(voiceDistance(['G4', 'C4', 'E4'], ['A4', 'F4', 'C4'])).toBe(3)
  })
})

describe('voiceLead', () => {
  it('voices C I–IV–I–V–I as the textbook closest inversions', () => {
    const seq = voiceLead([
      { root: 'C', type: 'M' },
      { root: 'F', type: 'M' },
      { root: 'C', type: 'M' },
      { root: 'G', type: 'M' },
      { root: 'C', type: 'M' },
    ])
    expect(seq.map((c) => c.notes)).toEqual([
      ['C4', 'E4', 'G4'],
      ['C4', 'F4', 'A4'],
      ['C4', 'E4', 'G4'],
      ['B3', 'D4', 'G4'],
      ['C4', 'E4', 'G4'],
    ])
    expect(seq.map((c) => c.inversion)).toEqual([0, 2, 0, 1, 0])
  })

  it('starts in root position at the given octave', () => {
    expect(voiceLead([{ root: 'E', type: 'M' }], 3)[0]).toEqual({ notes: ['E3', 'G#3', 'B3'], inversion: 0 })
  })

  it('never picks a voicing farther than any candidate inversion in a nearby octave (brute force)', () => {
    for (const ref of [
      { root: 'F#', form: 'major' as const },
      { root: 'Db', form: 'major' as const },
      { root: 'G#', form: 'harmonic' as const },
      { root: 'D', form: 'natural' as const },
    ]) {
      const [I, IV, V] = progression(ref)
      const chords = [I!, IV!, I!, V!, I!]
      const seq = voiceLead(chords)
      for (let i = 1; i < seq.length; i++) {
        const prev = seq[i - 1]!.notes
        const chosen = voiceDistance(prev, seq[i]!.notes)
        for (const oct of [3, 4, 5])
          for (let inv = 0; inv <= maxInversion(chords[i]!.type); inv++) {
            const d = voiceDistance(prev, chordNotes(chords[i]!.root, chords[i]!.type, inv, oct))
            expect(chosen, `${ref.root} ${ref.form} chord ${i} vs inv ${inv} oct ${oct}`).toBeLessThanOrEqual(d)
          }
      }
    }
  })

  it('breaks ties by lower octave, then lower inversion', () => {
    const C = { root: 'C', type: 'M' as const }
    // C→D: A3 D4 F♯4 (inv 2, octave 3) and D4 F♯4 A4 (inv 0, octave 4) both cost 6; the lower octave wins.
    expect(voiceDistance(['C4', 'E4', 'G4'], ['A3', 'D4', 'F#4'])).toBe(6)
    expect(voiceDistance(['C4', 'E4', 'G4'], ['D4', 'F#4', 'A4'])).toBe(6)
    expect(voiceLead([C, { root: 'D', type: 'M' }])[1]).toEqual({ notes: ['A3', 'D4', 'F#4'], inversion: 2 })
    // C→F♯: A♯3 C♯4 F♯4 (inv 1) and C♯4 F♯4 A♯4 (inv 2), both octave 3, both cost 6; the lower inversion wins.
    expect(voiceDistance(['C4', 'E4', 'G4'], ['C#4', 'F#4', 'A#4'])).toBe(6)
    expect(voiceLead([C, { root: 'F#', type: 'M' }])[1]).toEqual({ notes: ['A#3', 'C#4', 'F#4'], inversion: 1 })
  })

  it('returns [] for no chords', () => {
    expect(voiceLead([])).toEqual([])
  })
})

describe('voiceLedCadence', () => {
  it('builds I–IV–I–V–I from the progression (major)', () => {
    const cad = voiceLedCadence(progression({ root: 'C', form: 'major' }))
    expect(cad.map((c) => c.numeral)).toEqual(['I', 'IV', 'I', 'V', 'I'])
    expect(cad.map((c) => c.notes)).toEqual([
      ['C4', 'E4', 'G4'],
      ['C4', 'F4', 'A4'],
      ['C4', 'E4', 'G4'],
      ['B3', 'D4', 'G4'],
      ['C4', 'E4', 'G4'],
    ])
    expect(cad[1]).toMatchObject({ root: 'F', type: 'M', inversion: 2 })
  })

  it('uses i–iv–i–V–i for harmonic minor, keeping double sharps in tonal spelling', () => {
    const cad = voiceLedCadence(progression({ root: 'G#', form: 'harmonic' }))
    expect(cad.map((c) => c.numeral)).toEqual(['i', 'iv', 'i', 'V', 'i'])
    // V of G♯ harmonic minor is D♯ major: D♯ F𝄪 A♯ — the leading tone F𝄪 must survive.
    expect(cad[3]!.notes.some((n) => n.startsWith('F##'))).toBe(true)
    const ascending = (ns: string[]) => midis(ns).every((m, i, a) => i === 0 || m > (a[i - 1] as number))
    cad.forEach((c) => expect(ascending(c.notes)).toBe(true))
  })
})
