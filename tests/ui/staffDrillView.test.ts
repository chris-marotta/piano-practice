import { describe, expect, it } from 'vitest'
import { STAFF_DEF } from '../../src/drill/staff'
import type { Given, Question } from '../../src/drill/engine'
import { staffId } from '../../src/srs/items'
import type { Clef } from '../../src/theory/staff'
import { answer, type AnswerState } from '../../src/ui/components/drillView'
import {
  STAFF_WINDOWS,
  staffAnswerMarks,
  staffNotes,
  staffWhyText,
} from '../../src/ui/components/staffDrillView'
import { STAFF_UI } from '../../src/ui/components/staffUi'

const ask = (clef: Clef, note: string, format: Question['format'] = 'tap'): Question =>
  STAFF_DEF.buildQuestion(staffId(clef, note), format, () => 0.5)

const key = (midi: number): Given => ({ kind: 'key', midi })
const given = (q: Question, g: Given, exact = false): AnswerState => answer({ answered: false }, q, g, 500, STAFF_DEF, exact)
const NONE: AnswerState = { answered: false }

describe('STAFF_WINDOWS', () => {
  it('are the spec windows', () => {
    expect(STAFF_WINDOWS).toEqual({ treble: { low: 53, high: 84 }, bass: { low: 36, high: 64 } })
  })
})

describe('staffAnswerMarks', () => {
  const inWindow = (clef: Clef, marks: { midi: number }[]) =>
    marks.every((m) => m.midi >= STAFF_WINDOWS[clef].low && m.midi <= STAFF_WINDOWS[clef].high)

  it('before answering: only the middle C root dot', () => {
    const q = ask('treble', 'E4')
    expect(staffAnswerMarks(q, NONE)).toEqual([{ midi: 60, hand: 'none', root: true }])
  })

  it('a note far below the window (C1) for treble C4 folds in and is right on pitch class (exact off)', () => {
    const q = ask('treble', 'C4')
    const marks = staffAnswerMarks(q, given(q, key(24)))
    expect(inWindow('treble', marks)).toBe(true)
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(60)
    expect(marks.some((m) => m.state === 'bad')).toBe(false)
  })

  it('a wrong note far above (MIDI 110) folds into the window and does not throw', () => {
    const q = ask('treble', 'C4')
    const marks = staffAnswerMarks(q, given(q, key(110)))
    expect(inWindow('treble', marks)).toBe(true)
    expect(marks.find((m) => m.state === 'bad')?.midi).toBe(74)
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(60)
  })

  it('bass: notes far outside fold into 36-64', () => {
    const q = ask('bass', 'F3')
    for (const m of [0, 20, 127]) expect(inWindow('bass', staffAnswerMarks(q, given(q, key(m))))).toBe(true)
  })

  it('exact on, right letter in the wrong octave that folds onto the target: no red mark on the green key', () => {
    const q = ask('treble', 'C4')
    const marks = staffAnswerMarks(q, given(q, key(24), true))
    const red = marks.find((m) => m.state === 'bad')
    expect(red === undefined || red.midi !== 60).toBe(true)
  })

  it('lights the route as labelled white keys with the landmark, and middle C always carries root', () => {
    const q = ask('treble', 'A4')
    const marks = staffAnswerMarks(q, given(q, key(69)))
    expect(marks.filter((m) => m.label !== undefined).map((m) => [m.midi, m.label])).toEqual([
      [67, 'G'],
      [69, 'A'],
    ])
    const c = staffAnswerMarks(ask('treble', 'C4'), given(ask('treble', 'C4'), key(60)))
    expect(c.find((m) => m.midi === 60)).toMatchObject({ root: true, state: 'good' })
    expect(c.filter((m) => m.midi === 60)).toHaveLength(1)
  })

  it('a name pick or timeout lights the target and the route', () => {
    const q = ask('treble', 'A4', 'name')
    const marks = staffAnswerMarks(q, given(q, { kind: 'choice', value: 'B' }))
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(69)
    expect(marks.some((m) => m.state === 'bad')).toBe(false)
  })

  it('an accidental target is green on its black key; the letter below is lit as a route key', () => {
    const q = ask('treble', 'F#4')
    const marks = staffAnswerMarks(q, given(q, key(66)))
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(66)
    expect(marks.some((m) => m.midi === 65)).toBe(true)
  })
})

describe('staffNotes', () => {
  it('before answering: the target only, plain, already at the route\'s last beat so it does not move', () => {
    const q = ask('treble', 'A4')
    expect(staffNotes(q, NONE)).toEqual([{ note: 'A4', clef: 'treble', mark: 'plain', beat: 1 }])
    const after = staffNotes(q, given(q, key(69)))
    expect(after.find((n) => n.mark === 'right')?.beat).toBe(1)
  })

  it('after a right answer on treble A4: G4 landmark, A4 right', () => {
    const q = ask('treble', 'A4')
    const notes = staffNotes(q, given(q, key(69)))
    expect(notes.find((n) => n.note === 'G4')?.mark).toBe('landmark')
    expect(notes.find((n) => n.note === 'A4')?.mark).toBe('right')
    expect(notes).toHaveLength(2)
  })

  it('a wrong answer marks the target wrong; the route between is ghost', () => {
    const q = ask('treble', 'A3')
    const notes = staffNotes(q, given(q, key(60)))
    expect(notes.map((n) => [n.note, n.mark])).toEqual([
      ['C4', 'landmark'],
      ['B3', 'ghost'],
      ['A3', 'wrong'],
    ])
    expect(notes.map((n) => n.beat)).toEqual([0, 1, 2])
  })

  it('a landmark target is just right/wrong, and an accidental target carries its accidental', () => {
    const q = ask('treble', 'G4')
    expect(staffNotes(q, given(q, key(67)))).toEqual([{ note: 'G4', clef: 'treble', mark: 'right' }])
    const f = ask('treble', 'F#4')
    expect(staffNotes(f, NONE)).toEqual([{ note: 'F#4', clef: 'treble', mark: 'plain', beat: 1, accidental: '#' }])
    expect(staffNotes(f, given(f, key(66))).find((n) => n.mark === 'right')?.accidental).toBe('#')
  })
})

describe('staffWhyText', () => {
  it('a wrong tap names what was played', () => {
    const q = ask('treble', 'E4')
    expect(staffWhyText(q, given(q, key(62)), false).startsWith('You played D4. ')).toBe(true)
  })

  it('uses the real played note, sharp spelling', () => {
    const q = ask('treble', 'E4')
    expect(staffWhyText(q, given(q, key(66)), false).startsWith('You played F♯4. ')).toBe(true)
  })

  it('otherOctave leads with the octave hint, then the route', () => {
    const q = ask('treble', 'C4')
    const text = staffWhyText(q, given(q, key(72)), false)
    expect(text.startsWith('Right. The staff shows middle C')).toBe(true)
    expect(text).toContain('This is middle C.')
    expect(staffWhyText(q, given(q, key(72), true), true).startsWith('Wrong octave. The staff shows middle C')).toBe(true)
  })

  it('right, a name pick and a timeout: the route alone', () => {
    const q = ask('treble', 'A4')
    const route = 'From treble G (2nd line): G, A. A is the 2nd space.'
    expect(staffWhyText(q, given(q, key(69)), false)).toBe(route)
    expect(staffWhyText(q, given(q, { kind: 'choice', value: 'B' }), false)).toBe(route)
    expect(staffWhyText(q, given(q, { kind: 'timeout' }), false)).toBe(route)
  })
})

describe('STAFF_UI', () => {
  it('has the plan copy', () => {
    expect(STAFF_UI.kicker).toBe('READ THE NOTE')
    expect(STAFF_UI.promptText(ask('treble', 'C4', 'name'))).toBe('Which note is this?')
    expect(STAFF_UI.promptText(ask('treble', 'C4', 'tap'))).toBe('Tap this note')
    expect(STAFF_UI.promptText(ask('treble', 'C4', 'play'))).toBe('Play this note on your piano')
  })
})

describe('name choices placement (I2)', () => {
  it('Staff puts a name question\'s choices in the ask row beside the staff; Keys keeps them under the keyboard', async () => {
    const { KEYS_UI } = await import('../../src/ui/components/keysUi')
    expect(STAFF_UI.choicesInAsk).toBe(true)
    expect(KEYS_UI.choicesInAsk).toBeUndefined()
  })
})
