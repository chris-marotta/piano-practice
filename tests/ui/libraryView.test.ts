import { describe, expect, it } from 'vitest'
import { familyOf, fingeringSequence } from '../../src/data/fingerings'
import { noteMidi, type ScaleRef } from '../../src/theory/scales'
import {
  chordPanel,
  clampInversion,
  detection,
  inversionOptions,
  keyChords,
  libraryTempo,
  pickerKeys,
  respellForForm,
  scaleKeyboardFor,
  scalePanel,
  sessionScaleFor,
  spellingOptions,
  toggleMidi,
  WHAT_RANGE,
  whatMarks,
} from '../../src/ui/screens/library/libraryView'

const ref = (root: string, form: ScaleRef['form']): ScaleRef => ({ root, form })

describe('pickerKeys (12 roots, C..B)', () => {
  it('labels black keys with the session spelling for majors', () => {
    const keys = pickerKeys('C', 'major')
    expect(keys.map((k) => k.label)).toEqual(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'])
    expect(keys.filter((k) => k.selected).map((k) => k.root)).toEqual(['C'])
  })
  it('labels black keys with the minor session spelling for minor forms', () => {
    const keys = pickerKeys('A', 'harmonic')
    expect(keys.map((k) => k.root)).toEqual(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'])
  })
  it('chords use the major spelling convention', () => {
    expect(pickerKeys('C', 'chord')[1]?.root).toBe('Db')
  })
  it('the selected key shows the current spelling, even an unusual one', () => {
    const gb = pickerKeys('Gb', 'major')
    expect(gb[6]).toMatchObject({ root: 'Gb', label: 'G♭', selected: true })
    const cb = pickerKeys('Cb', 'major')
    expect(cb[11]).toMatchObject({ root: 'Cb', label: 'C♭', selected: true })
    expect(cb.filter((k) => k.selected)).toHaveLength(1)
  })
})

describe('spellingOptions (enharmonic toggle)', () => {
  it('offers sharp and flat for black keys, sharp first', () => {
    expect(spellingOptions('Db')).toEqual([
      { value: 'C#', label: 'C♯' },
      { value: 'Db', label: 'D♭' },
    ])
    expect(spellingOptions('F#').map((o) => o.value)).toEqual(['F#', 'Gb'])
  })
  it('offers nothing for white keys (no B/C♭)', () => {
    for (const n of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) expect(spellingOptions(n)).toEqual([])
  })
  it('offers the plain spelling back from a theoretical one', () => {
    expect(spellingOptions('Cb')).toEqual([
      { value: 'B', label: 'B' },
      { value: 'Cb', label: 'C♭' },
    ])
  })
})

describe('respellForForm', () => {
  it('moves to the session spelling when crossing major <-> minor', () => {
    expect(respellForForm('Db', 'major', 'natural')).toBe('C#')
    expect(respellForForm('G#', 'natural', 'major')).toBe('Ab')
    expect(respellForForm('Gb', 'major', 'natural')).toBe('F#')
  })
  it('keeps a spelling that is a session spelling of the new form', () => {
    expect(respellForForm('F#', 'natural', 'major')).toBe('F#')
    expect(respellForForm('Eb', 'major', 'harmonic')).toBe('Eb')
  })
  it('keeps the chosen spelling between minor forms', () => {
    expect(respellForForm('A#', 'natural', 'melodic')).toBe('A#')
  })
})

describe('sessionScaleFor', () => {
  it('is the scale itself for session spellings', () => {
    expect(sessionScaleFor(ref('F#', 'major'))).toEqual(ref('F#', 'major'))
    expect(sessionScaleFor(ref('G#', 'harmonic'))).toEqual(ref('G#', 'harmonic'))
  })
  it('finds the enharmonic session scale for other spellings', () => {
    expect(sessionScaleFor(ref('Gb', 'major'))).toEqual(ref('F#', 'major'))
    expect(sessionScaleFor(ref('C#', 'major'))).toEqual(ref('Db', 'major'))
    expect(sessionScaleFor(ref('Cb', 'major'))).toEqual(ref('B', 'major'))
    expect(sessionScaleFor(ref('D#', 'natural'))).toEqual(ref('Eb', 'natural'))
    expect(sessionScaleFor(ref('Gb', 'melodic'))).toEqual(ref('F#', 'melodic'))
  })
})

describe('scalePanel', () => {
  it('spells G♯ harmonic minor with F𝄪 (Review Focus 1)', () => {
    const p = scalePanel(ref('G#', 'harmonic'), 2, 'up')
    expect(p.title).toBe('G♯ harmonic minor')
    expect(p.up).toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F𝄪', 'G♯'])
    const labels = p.keyboard.marks.map((m) => m.label)
    expect(labels).toContain('F𝄪')
    expect(labels.join()).not.toMatch(/##|#/)
  })

  it('session spelling: own fingering, family line, no "same as" note', () => {
    const p = scalePanel(ref('E', 'major'), 2, 'up')
    expect(p.fingering).toEqual({ note: null, family: familyOf(ref('E', 'major')) })
    expect(p.keySignature).toBe('4 sharps: F♯ C♯ G♯ D♯')
  })

  it('G♭ major borrows F♯ major fingering with a note', () => {
    const p = scalePanel(ref('Gb', 'major'), 2, 'up')
    expect(p.fingering?.note).toBe('Same fingering as F♯ major')
    const rh = p.keyboard.marks.filter((m) => m.hand === 'rh')
    const lh = p.keyboard.marks.filter((m) => m.hand === 'lh')
    expect(rh[0]).toMatchObject({ midi: noteMidi('Gb4'), label: 'G♭' })
    expect(rh.map((m) => m.finger)).toEqual(fingeringSequence(ref('F#', 'major'), 2, 'rh', 'up'))
    expect(lh.map((m) => m.finger)).toEqual(fingeringSequence(ref('F#', 'major'), 2, 'lh', 'up'))
    expect(p.keySignature).toBe('6 flats: B♭ E♭ A♭ D♭ G♭ C♭')
  })

  it('relative key is theory-true: F♯ major -> D♯ minor, E♭ minor -> G♭ major', () => {
    expect(scalePanel(ref('F#', 'major'), 2, 'up').relative).toEqual({
      label: 'Relative minor',
      name: 'D♯ natural minor',
      ref: ref('D#', 'natural'),
    })
    expect(scalePanel(ref('Eb', 'natural'), 2, 'up').relative.ref).toEqual(ref('Gb', 'major'))
    expect(scalePanel(ref('A', 'melodic'), 2, 'up').relative).toMatchObject({ label: 'Relative major', ref: ref('C', 'major') })
  })

  it('D♯ minor gets its fingering via E♭ minor', () => {
    const p = scalePanel(ref('D#', 'natural'), 2, 'up')
    expect(p.fingering?.note).toBe('Same fingering as E♭ natural minor')
    const rh = p.keyboard.marks.filter((m) => m.hand === 'rh')
    expect(rh.map((m) => m.finger)).toEqual(fingeringSequence(ref('Eb', 'natural'), 2, 'rh', 'up'))
    expect(p.keySignature).toBe('6 sharps: F♯ C♯ G♯ D♯ A♯ E♯')
  })

  it('melodic minor has a distinct descent and the keyboard follows the direction (R16)', () => {
    const up = scalePanel(ref('A', 'melodic'), 2, 'up')
    const down = scalePanel(ref('A', 'melodic'), 2, 'down')
    expect(up.hasDirection).toBe(true)
    expect(up.up).toEqual(['A', 'B', 'C', 'D', 'E', 'F♯', 'G♯', 'A'])
    expect(up.down).toEqual(['A', 'G', 'F', 'E', 'D', 'C', 'B', 'A'])
    const upLabels = new Set(up.keyboard.marks.map((m) => m.label))
    const downLabels = new Set(down.keyboard.marks.map((m) => m.label))
    expect(upLabels.has('F♯') && upLabels.has('G♯')).toBe(true)
    expect(downLabels.has('F') && downLabels.has('G')).toBe(true)
    expect(downLabels.has('F♯')).toBe(false)
    expect(scalePanel(ref('A', 'natural'), 2, 'up')).toMatchObject({ hasDirection: false, down: null })
  })

  it('names theoretical keys instead of listing more than seven accidentals', () => {
    expect(scalePanel(ref('G#', 'major'), 2, 'up').keySignature).toBe(
      '8 sharps: a theoretical key, usually written as A♭ major',
    )
    expect(scalePanel(ref('Gb', 'natural'), 2, 'up').keySignature).toBe(
      '9 flats: a theoretical key, usually written as F♯ natural minor',
    )
  })
})

describe('scaleKeyboardFor without a fingering source', () => {
  it('marks the notes with no finger numbers', () => {
    const kb = scaleKeyboardFor(ref('C', 'major'), 1, 'up', null)
    expect(kb.marks).toHaveLength(16)
    expect(kb.marks.every((m) => m.finger === undefined)).toBe(true)
  })
})

describe('libraryTempo', () => {
  it("uses the session item's tempo for the enharmonic scale, else the start tempo", () => {
    const items = { 'scale:F#:major': { tempo: 76 } } as never
    expect(libraryTempo(items, ref('Gb', 'major'), 60)).toBe(76)
    expect(libraryTempo(items, ref('C', 'major'), 60)).toBe(60)
  })
})

describe('chordPanel', () => {
  it('C major 2nd inversion: G C E with RH 1-3-5', () => {
    const p = chordPanel('C', 'M', 2)
    expect(p.symbol).toBe('C/G')
    expect(p.name).toBe('C major · 2nd inversion')
    expect(p.notes).toEqual(['G', 'C', 'E'])
    expect(p.keyboard.marks.map((m) => m.finger)).toEqual([1, 3, 5])
    expect(p.keyboard.marks.every((m) => m.hand === 'rh')).toBe(true)
    expect(p.fingeringNote).toBeNull()
  })
  it('no badges and a note where there is no standard fingering', () => {
    const p = chordPanel('C', '9', 1)
    expect(p.keyboard.marks.every((m) => m.finger === undefined)).toBe(true)
    expect(p.fingeringNote).toBe('No standard fingering shown for this voicing')
  })
  it('formats symbols with music glyphs', () => {
    expect(chordPanel('F#', 'm7b5', 0).symbol).toBe('F♯m7♭5')
    expect(chordPanel('Db', 'M', 0).symbol).toBe('D♭')
    expect(chordPanel('Bb', '7', 1).symbol).toBe('B♭7/D')
  })
  it('keeps at least C4..B5 on screen so the keyboard does not jump', () => {
    const p = chordPanel('C', 'M', 0)
    expect(p.keyboard.low).toBe(noteMidi('C4'))
    expect(p.keyboard.high).toBe(noteMidi('B5'))
    expect(p.keyboard.firstMidi).toBe(noteMidi('C4'))
  })
})

describe('inversions', () => {
  it('triads stop at 2nd inversion, sevenths reach 3rd', () => {
    expect(inversionOptions('M').map((o) => o.value)).toEqual([0, 1, 2])
    expect(inversionOptions('7').map((o) => o.value)).toEqual([0, 1, 2, 3])
    expect(clampInversion('M', 3)).toBe(2)
    expect(clampInversion('7', 3)).toBe(3)
  })
})

describe('keyChords (chords in a key)', () => {
  it("D major's diatonic chords", () => {
    expect(keyChords(ref('D', 'major')).map((c) => `${c.numeral} ${c.symbol}`)).toEqual([
      'I D',
      'ii Em',
      'iii F♯m',
      'IV G',
      'V A',
      'vi Bm',
      'vii° C♯dim',
    ])
  })
  it('harmonic minor shows V and vii°', () => {
    const chords = keyChords(ref('A', 'harmonic'))
    expect(chords[4]).toMatchObject({ numeral: 'V', symbol: 'E', root: 'E', type: 'M' })
    expect(chords[6]).toMatchObject({ numeral: 'vii°', symbol: 'G♯dim' })
  })
})

describe("detection (what's this chord?)", () => {
  const E3 = 52
  const G3 = 55
  const C4 = 60
  it('E-G-C reads C/E first, with the alternatives after', () => {
    const d = detection([C4, E3, G3])
    expect(d.status).toBe('match')
    expect(d.names[0]).toBe('C/E')
    expect(d.names).toContain('Em♯5')
    expect(d.notes).toEqual(['E', 'G', 'C'])
  })
  it('empty and no-match states', () => {
    expect(detection([])).toEqual({ status: 'empty', names: [], notes: [] })
    expect(detection([60, 64])).toMatchObject({ status: 'none', names: [] })
  })
  it('spells black keys the session way (D♭, E♭, F♯, A♭, B♭)', () => {
    expect(detection([61, 65, 68]).names[0]).toBe('D♭')
    expect(detection([66, 70, 73]).names[0]).toBe('F♯')
  })
  it('toggles keys on and off', () => {
    expect(toggleMidi([60], 64)).toEqual([60, 64])
    expect(toggleMidi([60, 64], 60)).toEqual([64])
  })
  it('marks toggled keys with a neutral highlight and their names', () => {
    expect(whatMarks([61])).toEqual([{ midi: 61, hand: 'none', label: 'D♭' }])
    expect(WHAT_RANGE).toEqual({ low: noteMidi('C3'), high: noteMidi('B4') })
  })
})

describe('every reachable spelling renders', () => {
  const SPELLINGS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
  const FORMS = ['major', 'natural', 'harmonic', 'melodic'] as const
  it('scale panels for picker spellings and their relatives (incl. theoretical ones) never throw', () => {
    for (const root of SPELLINGS)
      for (const form of FORMS) {
        const p = scalePanel(ref(root, form), 2, 'down')
        const rel = scalePanel(p.relative.ref, 2, 'up')
        for (const panel of [p, rel]) {
          expect(panel.fingering).not.toBeNull()
          expect(panel.keyboard.marks.length).toBe(30)
          expect(panel.keyboard.marks.every((m) => m.finger !== undefined)).toBe(true)
        }
      }
  })
  it('every diatonic chord opens as a chord panel in every type and inversion', () => {
    for (const root of SPELLINGS)
      for (const form of ['major', 'natural', 'harmonic'] as const)
        for (const c of keyChords(ref(root, form))) {
          for (const t of ['M', 'm', 'dim', 'aug', 'sus2', 'sus4', 'maj7', '7', 'm7', 'm7b5', 'dim7', '6', 'add9', '9'] as const)
            for (const o of inversionOptions(t)) expect(chordPanel(c.root, t, o.value).notes.length).toBeGreaterThan(2)
        }
  })
})
