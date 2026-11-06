import { describe, expect, it } from 'vitest'
import { EAR_DEF } from '../../src/drill/ear'
import type { Given, Question } from '../../src/drill/engine'
import { EAR_LEVEL_DEGREES } from '../../src/theory/ear'
import { earId } from '../../src/srs/items'
import { answer, type AnswerState } from '../../src/ui/components/drillView'
import {
  contextLine,
  earAnswerMarks,
  earBoard,
  earGiven,
  earPromptText,
  earWhyText,
} from '../../src/ui/components/earDrillView'

const POOL = Object.values(EAR_LEVEL_DEGREES).flat().map(earId)

const ask = (degree: string, format: Question['format'] = 'play', level = 1, tonic = 'C'): Question =>
  EAR_DEF.buildQuestion(earId(degree as never), format, () => 0.5, undefined, { level, tonic, pool: POOL })

const key = (midi: number): Given => ({ kind: 'key', midi })
const pick = (value: string): Given => ({ kind: 'choice', value })
const given = (q: Question, g: Given, exact = false): AnswerState => answer({ answered: false }, q, g, 500, EAR_DEF, exact)
const NONE: AnswerState = { answered: false }

describe('earBoard', () => {
  it('runs from the tonic to the tonic above (13 keys)', () => {
    expect(earBoard(ask('5'))).toEqual({ low: 60, high: 72 })
    expect(earBoard(ask('5', 'tap', 4, 'G'))).toEqual({ low: 55, high: 67 })
  })
})

describe('earWhyText', () => {
  it('a right ear:5 in C', () => {
    const q = ask('5')
    expect(earWhyText(q, given(q, key(67)))).toBe('G is the 5th of C: 7 half-steps up. Stable: it walks up 5–6–7–8 home.')
  })
  it('a wrong play of 66 names it first', () => {
    const q = ask('5')
    const s = earWhyText(q, given(q, key(66)))
    expect(s.startsWith('You played F♯ (the ♯4). ')).toBe(true)
    expect(s).toBe('You played F♯ (the ♯4). G is the 5th of C: 7 half-steps up. Stable: it walks up 5–6–7–8 home.')
  })
  it('ear:1 right: home, an octave up', () => {
    const q = ask('1')
    expect(earWhyText(q, given(q, key(72)))).toBe('C is home, an octave up. Home: everything settles here.')
  })
  it('ear:b2 says 1 half-step (singular)', () => {
    const q = ask('b2', 'play', 5)
    const s = earWhyText(q, given(q, key(61)))
    expect(s).toContain('1 half-step up')
    expect(s).not.toContain('half-steps')
  })
  it('another octave, Exact off: right note, three octaves below', () => {
    const q = ask('5')
    expect(q.midi).toBe(67)
    expect(earWhyText(q, given(q, key(31))).startsWith('Right note, three octaves below the one asked. ')).toBe(true)
  })
  it('another octave, Exact on: wrong octave', () => {
    const q = ask('5')
    expect(earWhyText(q, given(q, key(31), true)).startsWith('Wrong octave: three octaves below')).toBe(true)
  })
  it('one octave above is singular', () => {
    const q = ask('5')
    expect(earWhyText(q, given(q, key(79))).startsWith('Right note, one octave above the one asked. ')).toBe(true)
  })
  it('more than three octaves falls back to the number', () => {
    const q = ask('5')
    expect(earWhyText(q, given(q, key(19))).startsWith('Right note, 4 octaves below the one asked. ')).toBe(true)
  })
  it('a wrong name pick', () => {
    const q = ask('5', 'name')
    expect(earWhyText(q, given(q, pick('4'))).startsWith('You picked 4. ')).toBe(true)
  })
  it('a wrong name pick uses the label (♭3)', () => {
    const q = ask('3', 'name', 4)
    expect(earWhyText(q, given(q, pick('b3'))).startsWith('You picked ♭3. ')).toBe(true)
  })
  it('spells in the key at level 4 (E♭ in B♭: the 4th)', () => {
    const q = ask('4', 'play', 4, 'Bb')
    expect(earWhyText(q, given(q, key(q.midi)))).toBe('E♭ is the 4th of B♭: 5 half-steps up. It wants to fall: 4–3–2–1.')
  })
})

describe('earAnswerMarks', () => {
  const onBoard = (q: Question, marks: { midi: number }[]) => {
    const { low, high } = earBoard(q)
    return marks.every((m) => m.midi >= low && m.midi <= high)
  }

  it('before an answer: only the two root dots', () => {
    const q = ask('5', 'tap')
    expect(earAnswerMarks(q, NONE)).toEqual([
      { midi: 60, hand: 'none', root: true },
      { midi: 72, hand: 'none', root: true },
    ])
  })

  it('given 110 on a C board: every mark is in 60–72, and the red key is the folded one', () => {
    const q = ask('5')
    const marks = earAnswerMarks(q, given(q, key(110)))
    expect(onBoard(q, marks)).toBe(true)
    expect(marks.filter((m) => m.state === 'bad').map((m) => m.midi)).toEqual([62]) // 110 = D7 → D4
  })

  it('a far-low key (C1 octave shift) folds in too', () => {
    const q = ask('5')
    const marks = earAnswerMarks(q, given(q, key(26)))
    expect(onBoard(q, marks)).toBe(true)
    expect(marks.find((m) => m.state === 'bad')?.midi).toBe(62)
  })

  it('right: route neutral, both tonics root, target green, no red', () => {
    const q = ask('5')
    const marks = earAnswerMarks(q, given(q, key(67)))
    expect(marks.filter((m) => m.state === 'good').map((m) => m.midi)).toEqual([67])
    expect(marks.some((m) => m.state === 'bad')).toBe(false)
    expect(marks.filter((m) => m.root).map((m) => m.midi).sort()).toEqual([60, 72])
    const route = marks.filter((m) => m.state === undefined && !m.root).map((m) => m.midi)
    expect(route).toEqual([60, 62, 64, 65])
  })

  it('a chromatic note: route of major steps below it, the note itself green', () => {
    const q = ask('b6', 'tap', 4)
    const marks = earAnswerMarks(q, given(q, key(68)))
    expect(marks.filter((m) => m.state === undefined && !m.root).map((m) => m.midi)).toEqual([60, 62, 64, 65, 67])
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(68)
  })

  it('a wrong key on the tonic pitch class lands on the nearer tonic', () => {
    const q = ask('5')
    expect(earAnswerMarks(q, given(q, key(48))).find((m) => m.state === 'bad')?.midi).toBe(60)
    expect(earAnswerMarks(q, given(q, key(84))).find((m) => m.state === 'bad')?.midi).toBe(72)
  })

  it('ear:1 with the lower tonic and Exact on: the lower tonic red, the upper green', () => {
    const q = ask('1', 'tap')
    const marks = earAnswerMarks(q, given(q, key(60), true))
    expect(marks.find((m) => m.state === 'bad')?.midi).toBe(60)
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(72)
  })

  it('another octave with Exact on (not ear:1): it folds onto the target, so no red', () => {
    const q = ask('5')
    const marks = earAnswerMarks(q, given(q, key(31), true))
    expect(marks.some((m) => m.state === 'bad')).toBe(false)
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(67)
  })

  it('a wrong name pick marks no red key', () => {
    const q = ask('5', 'name')
    const marks = earAnswerMarks(q, given(q, pick('4')))
    expect(marks.some((m) => m.state === 'bad')).toBe(false)
    expect(marks.find((m) => m.state === 'good')?.midi).toBe(67)
  })

  it('a black tonic (F♯ at level 4): marks stay on its 13 keys', () => {
    const q = ask('5', 'play', 4, 'F#')
    expect(earBoard(q)).toEqual({ low: 66, high: 78 })
    expect(onBoard(q, earAnswerMarks(q, given(q, key(20))))).toBe(true)
  })
})

describe('contextLine', () => {
  it('level 6, first question', () => {
    expect(contextLine(ask('5', 'play', 6), true)).toBe('This is home: C · then the note')
  })
  it('level 6, later questions', () => {
    expect(contextLine(ask('5', 'play', 6), false)).toBe('Key of C · the note')
  })
  it('levels 1–5', () => {
    expect(contextLine(ask('3', 'play', 2), true)).toBe('Key of C · tonic, then the note')
    expect(contextLine(ask('3', 'play', 2), false)).toBe('Key of C · tonic, then the note')
  })
  it('formats the root', () => {
    expect(contextLine(ask('5', 'play', 4, 'Bb'), false)).toBe('Key of B♭ · tonic, then the note')
  })
})

describe('earPromptText', () => {
  it('per format', () => {
    expect(earPromptText(ask('5', 'name'))).toBe('Which degree?')
    expect(earPromptText(ask('5', 'tap'))).toBe('Find it on the keys')
    expect(earPromptText(ask('5', 'play'))).toBe('Play it on your piano')
  })
})

describe('earGiven', () => {
  it('the key given, or the picked degree on the tonic, or null', () => {
    const q = ask('5', 'play')
    expect(earGiven(q, given(q, key(66)))).toBe(66)
    const n = ask('5', 'name')
    expect(earGiven(n, given(n, pick('4')))).toBe(65)
    expect(earGiven(n, given(n, pick('1')))).toBe(72)
    expect(earGiven(q, NONE)).toBe(null)
  })
})
