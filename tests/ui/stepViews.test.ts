import { describe, expect, it } from 'vitest'
import { fingeringSequence } from '../../src/data/fingerings'
import { progression } from '../../src/theory/chords'
import { noteMidi } from '../../src/theory/scales'
import {
  fingerRows,
  keySignatureText,
  scaleHeader,
  scaleKeyboard,
} from '../../src/ui/screens/steps/scaleView'
import {
  chordCard,
  chordMarks,
  chordStepRange,
  inversionsOfTonic,
} from '../../src/ui/screens/steps/chordView'
import { formatClock, progressLabel } from '../../src/ui/screens/steps/stepView'

const E = { root: 'E', form: 'major' as const }
const Fs = { root: 'F#', form: 'major' as const }
const GsMel = { root: 'G#', form: 'melodic' as const }

describe('scaleHeader', () => {
  it('reads name · octaves · tempo', () => {
    expect(scaleHeader(E, 2, 60)).toBe('E major · 2 octaves · ♩ = 60')
    expect(scaleHeader(Fs, 1, 68)).toBe('F♯ major · 1 octave · ♩ = 68')
  })
})

describe('keySignatureText', () => {
  it('counts and names the accidentals with display glyphs', () => {
    expect(keySignatureText(E)).toBe('4 sharps: F♯ C♯ G♯ D♯')
    expect(keySignatureText({ root: 'C', form: 'major' })).toBe('No sharps or flats')
    expect(keySignatureText({ root: 'F', form: 'major' })).toBe('1 flat: B♭')
  })
})

describe('scaleKeyboard (L0, hands together)', () => {
  it('puts RH from octave 4 and LH from octave 3 with ascending fingering', () => {
    const kb = scaleKeyboard(E, 2)
    const rh = kb.marks.filter((m) => m.hand === 'rh')
    const lh = kb.marks.filter((m) => m.hand === 'lh')
    expect(rh).toHaveLength(15)
    expect(lh).toHaveLength(15)
    expect(rh[0]).toEqual({ midi: noteMidi('E4'), hand: 'rh', finger: 1, label: 'E' })
    expect(lh[0]).toEqual({ midi: noteMidi('E3'), hand: 'lh', finger: 5, label: 'E' })
    expect(rh.map((m) => m.finger)).toEqual(fingeringSequence(E, 2, 'rh', 'up'))
    expect(lh.map((m) => m.finger)).toEqual(fingeringSequence(E, 2, 'lh', 'up'))
  })

  it('spans C..B around both hands; first marked key is the LH tonic', () => {
    const kb = scaleKeyboard(Fs, 2)
    expect(kb.low).toBe(noteMidi('C3'))
    expect(kb.high).toBe(noteMidi('B6'))
    expect(kb.firstMidi).toBe(noteMidi('F#3'))
  })

  it('shows one octave per hand when settings say 1', () => {
    const kb = scaleKeyboard(E, 1)
    expect(kb.marks.filter((m) => m.hand === 'rh')).toHaveLength(8)
    expect(kb.high).toBe(noteMidi('B5'))
  })

  it('labels double sharps with the 𝄪 glyph (G♯ melodic minor)', () => {
    const labels = scaleKeyboard(GsMel, 1).marks.map((m) => m.label)
    expect(labels).toContain('F𝄪')
    expect(labels).toContain('E♯')
    expect(labels.join()).not.toContain('#')
  })
})

describe('fingerRows (L1)', () => {
  it('gives each hand its ascending notes and fingers', () => {
    const rows = fingerRows(E, 2)
    expect(rows.rh.notes).toHaveLength(15)
    expect(rows.rh.notes[0]).toBe('E4')
    expect(rows.lh.notes[0]).toBe('E3')
    expect(rows.rh.fingers).toEqual(fingeringSequence(E, 2, 'rh', 'up'))
    expect(rows.lh.fingers).toEqual(fingeringSequence(E, 2, 'lh', 'up'))
  })
})

describe('chordCard', () => {
  it('shows numeral, display root and a quality word', () => {
    const [I, IV, V, vi] = progression(E)
    expect(chordCard(I!)).toEqual({ numeral: 'I', name: 'E', quality: 'major' })
    expect(chordCard(vi!)).toEqual({ numeral: 'vi', name: 'C♯', quality: 'minor' })
    expect(chordCard(IV!).name).toBe('A')
    expect(chordCard(V!).name).toBe('B')
  })
  it('names diminished and augmented chords', () => {
    expect(chordCard({ numeral: 'vii°', root: 'D#', type: 'dim' }).quality).toBe('diminished')
    expect(chordCard({ numeral: 'III+', root: 'C', type: 'aug' }).quality).toBe('augmented')
  })
})

describe('chordMarks', () => {
  it('marks RH keys with the inversion fingering and note labels', () => {
    expect(chordMarks(['E4', 'G#4', 'B4'], 'M', 0)).toEqual([
      { midi: noteMidi('E4'), hand: 'rh', finger: 1, label: 'E' },
      { midi: noteMidi('G#4'), hand: 'rh', finger: 3, label: 'G♯' },
      { midi: noteMidi('B4'), hand: 'rh', finger: 5, label: 'B' },
    ])
    expect(chordMarks(['G#4', 'B4', 'E5'], 'M', 1).map((m) => m.finger)).toEqual([1, 2, 5])
  })
})

describe('inversionsOfTonic', () => {
  it('lists root, 1st and 2nd inversion of I', () => {
    const inv = inversionsOfTonic(progression(E)[0]!)
    expect(inv.map((v) => v.label)).toEqual(['Root position', '1st inversion', '2nd inversion'])
    expect(inv.map((v) => v.notes)).toEqual([
      ['E4', 'G#4', 'B4'],
      ['G#4', 'B4', 'E5'],
      ['B4', 'E5', 'G#5'],
    ])
    expect(inv.map((v) => v.inversion)).toEqual([0, 1, 2])
  })
})

describe('chordStepRange', () => {
  it('covers every voicing in the step so the keyboard never shifts', () => {
    const chords = progression(Fs)
    const r = chordStepRange(chords, true)
    expect(r.low % 12).toBe(0)
    expect(r.high % 12).toBe(11)
    expect(r.low).toBeLessThanOrEqual(noteMidi('C#4')) // V voiced below the tonic in the cadence
    expect(r.high).toBeGreaterThanOrEqual(noteMidi('A#5'))
  })
  it('is narrower without inversions', () => {
    const chords = progression(E)
    expect(chordStepRange(chords, false)).toEqual({ low: noteMidi('C4'), high: noteMidi('B5') })
  })
})

describe('formatClock', () => {
  it('shows m:ss, never negative', () => {
    expect(formatClock(120)).toBe('2:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(59.2)).toBe('1:00')
  })
})

describe('progressLabel', () => {
  it('reads "Step n of N"', () => {
    expect(progressLabel(0, 9)).toBe('Step 1 of 9')
    expect(progressLabel(8, 9)).toBe('Step 9 of 9')
  })
})
