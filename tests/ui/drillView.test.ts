import { describe, expect, it } from 'vitest'
import type { Question } from '../../src/drill/round'
import type { KeyMark } from '../../src/ui/components/keyboardLayout'
import {
  LEVEL_HINTS,
  TIMED_OUT,
  answer,
  answerMarks,
  levelRose,
  listeningText,
  nextLabel,
  promptText,
  whyText,
  type AnswerState,
} from '../../src/ui/components/drillView'

const q = (pc: number, midi: number, format: Question['format'] = 'tap'): Question => ({
  itemId: `key:${pc}`,
  pc,
  midi,
  format,
  repeat: false,
  ...(format === 'name' ? { choices: [pc, (pc + 2) % 12, (pc + 4) % 12, (pc + 5) % 12] } : {}),
})

const E3 = 52
const F3 = 53
const C3 = 48
const D3 = 50
const G3 = 55
const Gs3 = 56

/** The look-defining marks on a key (root-only dot carriers left out). */
const fillOf = (marks: KeyMark[], midi: number): KeyMark | undefined =>
  marks.find((m) => m.midi === midi && !(m.root && m.hand === 'none' && m.state === undefined && m.label === undefined))
const rootKeys = (marks: KeyMark[]): number[] => marks.filter((m) => m.root).map((m) => m.midi)

describe('answerMarks', () => {
  it('E asked, F tapped: F bad, E good, C and D are route marks, C has the root dot', () => {
    const marks = answerMarks(q(4, E3), F3, false)
    expect(fillOf(marks, F3)?.state).toBe('bad')
    expect(fillOf(marks, E3)?.state).toBe('good')
    for (const m of [C3, D3]) {
      const mark = fillOf(marks, m)
      expect(mark?.hand).toBe('none')
      expect(mark?.state).toBeUndefined()
    }
    expect(rootKeys(marks)).toEqual([C3])
  })

  it('G♯ right: G is a route mark and G♯ good; G is no landmark, so no root dot', () => {
    const marks = answerMarks(q(8, Gs3), Gs3, true)
    expect(fillOf(marks, Gs3)?.state).toBe('good')
    expect(fillOf(marks, G3)).toMatchObject({ hand: 'none' })
    expect(fillOf(marks, G3)?.state).toBeUndefined()
    expect(rootKeys(marks)).toEqual([])
    expect(marks.some((m) => m.state === 'bad')).toBe(false)
  })

  it('a right tap in the other octave lights the tapped key and its route, not the asked octave', () => {
    const marks = answerMarks(q(4, E3), E3 + 12, true)
    expect(fillOf(marks, E3 + 12)?.state).toBe('good')
    expect(fillOf(marks, E3)).toBeUndefined()
    expect(rootKeys(marks)).toEqual([C3 + 12])
  })

  it('a wrong pick shows the right key in the octave nearest the pick', () => {
    // A asked in octave 4 (69), G3 tapped: the green A is A3 (57), next to the pick.
    const marks = answerMarks(q(9, 69), G3, false)
    expect(fillOf(marks, 57)?.state).toBe('good')
    expect(fillOf(marks, 69)).toBeUndefined()
    expect(rootKeys(marks)).toEqual([53]) // F3: A counts up from F
  })

  it('a played note outside C3–B4 folds into the keyboard by octave', () => {
    const marks = answerMarks(q(8, Gs3, 'play'), G3 - 24, false) // G1 played
    expect(fillOf(marks, G3)?.state).toBe('bad')
    expect(fillOf(marks, Gs3)?.state).toBe('good')
  })

  it("'name' answers (no key) mark the asked key and its route; a landmark target carries its own dot", () => {
    const wrong = answerMarks(q(0, 60, 'name'), null, false)
    expect(fillOf(wrong, 60)?.state).toBe('good')
    expect(rootKeys(wrong)).toEqual([60])
    expect(wrong.some((m) => m.state === 'bad')).toBe(false)
  })

  it('every lit key after an answer is labelled with its name', () => {
    const marks = answerMarks(q(4, E3), F3, false)
    expect([C3, D3, E3, F3].map((m) => fillOf(marks, m)?.label)).toEqual(['C', 'D', 'E', 'F'])
  })
})

describe('promptText', () => {
  it('A: Which key is this?', () => {
    expect(promptText(q(4, E3, 'name'))).toBe('Which key is this?')
  })
  it('B: Tap {name}', () => {
    expect(promptText(q(9, 57, 'tap'))).toBe('Tap A')
    expect(promptText(q(8, Gs3, 'tap'))).toBe('Tap G♯')
  })
  it('C: Play {name} on your piano, with the listening chip', () => {
    expect(promptText(q(8, Gs3, 'play'))).toBe('Play G♯ on your piano')
    expect(listeningText('ROLI Piano')).toBe('● Listening: ROLI Piano')
  })
})

describe('answer: first answer only', () => {
  const blank: AnswerState = { answered: false }

  it('records the first answer', () => {
    expect(answer(blank, q(4, E3), { pc: 4, midi: E3 }, 1200)).toEqual({ answered: true, correct: true, pc: 4, midi: E3, ms: 1200 })
    expect(answer(blank, q(4, E3), { pc: 5, midi: F3 }, 900)).toMatchObject({ answered: true, correct: false, midi: F3 })
  })

  it('a second call returns the same state (double tap, a late MIDI note)', () => {
    const first = answer(blank, q(4, E3), { pc: 5, midi: F3 }, 900)
    expect(answer(first, q(4, E3), { pc: 5, midi: F3 }, 950)).toBe(first) // double tap
    expect(answer(first, q(4, E3), { pc: 4, midi: E3 }, 1400)).toBe(first) // a right note after a wrong tap
  })

  it("'tap' with the right pitch class in another octave is correct", () => {
    expect(answer(blank, q(4, E3, 'tap'), { pc: 4, midi: E3 + 12 }, 800)).toMatchObject({ correct: true })
  })

  it("'name' answers have no key", () => {
    expect(answer(blank, q(4, E3, 'name'), { pc: 4, midi: null }, 800)).toMatchObject({ correct: true, midi: null })
  })

  it('a timeout is wrong, with no key', () => {
    expect(answer(blank, q(4, E3), TIMED_OUT, 3000)).toEqual({ answered: true, correct: false, pc: null, midi: null, ms: 3000 })
  })
})

describe('whyText', () => {
  const answered = (pc: number | null, correct: boolean): AnswerState => ({ answered: true, correct, pc, midi: null, ms: 1 })

  it('is the route sentence', () => {
    expect(whyText(q(4, E3, 'tap'), answered(5, false))).toBe('From C (left of the two black keys): C, D, E.')
    expect(whyText(q(8, Gs3, 'name'), answered(8, true))).toBe('G♯ is the black key just right of G. Also called A♭.')
  })

  it("a wrong 'play' names what was played", () => {
    expect(whyText(q(8, Gs3, 'play'), answered(7, false))).toBe('You played G. G♯ is the black key just right of G. Also called A♭.')
    expect(whyText(q(8, Gs3, 'play'), answered(8, true))).toBe('G♯ is the black key just right of G. Also called A♭.')
  })

  it('a timed-out play names nothing', () => {
    expect(whyText(q(8, Gs3, 'play'), answered(null, false))).toBe('G♯ is the black key just right of G. Also called A♭.')
  })
})

describe('level ladder and banner', () => {
  it('hints for each level', () => {
    expect(LEVEL_HINTS).toEqual({ 1: 'C and F', 2: 'D E G A B', 3: '♯ and ♭ names', 4: '3 seconds a key' })
  })

  it('the banner shows only when the level rose since the last round', () => {
    expect(levelRose(2, 1)).toBe(true)
    expect(levelRose(4, 2)).toBe(true)
    expect(levelRose(2, 2)).toBe(false)
    expect(levelRose(1, 3)).toBe(false) // fell back: no banner
  })
})

describe('nextLabel', () => {
  it('Next until the last question, then the finish label', () => {
    expect(nextLabel(0, 8, 'Next round')).toBe('Next')
    expect(nextLabel(7, 8, 'Next round')).toBe('Next round')
  })
})
