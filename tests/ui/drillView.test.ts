import { describe, expect, it } from 'vitest'
import { drillLevel } from '../../src/drill/engine'
import type { DrillDef, Question } from '../../src/drill/engine'
import { KEYS_DEF } from '../../src/drill/keys'
import { PC_ASCII } from '../../src/theory/keyNames'
import { DEFAULT_SETTINGS, keyId } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'
import type { KeyMark } from '../../src/ui/components/keyboardLayout'
import { KEYS_UI } from '../../src/ui/components/keysUi'
import {
  TIMED_OUT,
  advancesOnKey,
  answer,
  answerMarks,
  belongsToQuestion,
  levelRose,
  raisedLevel,
  listeningText,
  nextLabel,
  timeLimit,
  type AnswerState,
} from '../../src/ui/components/drillView'
import { DRILL_ADVANCE_GUARD_MS } from '../../src/play/thresholds'

const q = (pc: number, midi: number, format: Question['format'] = 'tap'): Question => ({
  itemId: `key:${pc}`,
  pc,
  midi,
  format,
  answer: PC_ASCII[pc] as string,
  repeat: false,
  ...(format === 'name'
    ? { choices: [pc, (pc + 2) % 12, (pc + 4) % 12, (pc + 5) % 12].map((c) => ({ value: PC_ASCII[c] as string, label: PC_ASCII[c] as string })) }
    : {}),
})

const boxed = (pc: number, box: ItemState['box']): ItemState => ({
  id: keyId(pc),
  introduced: true,
  box,
  support: 0,
  levelStreak: 0,
  due: '2026-11-05',
  history: [],
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
    expect(KEYS_UI.promptText(q(4, E3, 'name'))).toBe('Which key is this?')
  })
  it('B: Tap {name}', () => {
    expect(KEYS_UI.promptText(q(9, 57, 'tap'))).toBe('Tap A')
    expect(KEYS_UI.promptText(q(8, Gs3, 'tap'))).toBe('Tap G♯')
  })
  it('C: Play {name} on your piano, with the listening chip', () => {
    expect(KEYS_UI.promptText(q(8, Gs3, 'play'))).toBe('Play G♯ on your piano')
    expect(listeningText('ROLI Piano')).toBe('● Listening: ROLI Piano')
  })
})

describe('answer: first answer only', () => {
  const blank: AnswerState = { answered: false }
  const key = (midi: number) => ({ kind: 'key', midi }) as const

  it('records the first answer with its verdict', () => {
    expect(answer(blank, q(4, E3), key(E3), 1200, KEYS_DEF, false)).toEqual({
      answered: true,
      verdict: 'right',
      correct: true,
      given: key(E3),
      ms: 1200,
      exactOctave: false,
    })
    expect(answer(blank, q(4, E3), key(F3), 900, KEYS_DEF, false)).toMatchObject({ answered: true, verdict: 'wrong', correct: false, given: key(F3) })
  })

  it('a second call returns the same state (double tap, a late MIDI note)', () => {
    const first = answer(blank, q(4, E3), key(F3), 900, KEYS_DEF, false)
    expect(answer(first, q(4, E3), key(F3), 950, KEYS_DEF, false)).toBe(first) // double tap
    expect(answer(first, q(4, E3), key(E3), 1400, KEYS_DEF, false)).toBe(first) // a right note after a wrong tap
  })

  it("'tap' with the right pitch class in another octave is correct", () => {
    expect(answer(blank, q(4, E3, 'tap'), key(E3 + 12), 800, KEYS_DEF, false)).toMatchObject({ correct: true })
  })

  it("'name' picks go through the def's judge", () => {
    const pick = { kind: 'choice', value: 'E' } as const
    expect(answer(blank, q(4, E3, 'name'), pick, 800, KEYS_DEF, false)).toMatchObject({ correct: true, given: pick })
    expect(answer(blank, q(4, E3, 'name'), { kind: 'choice', value: 'F' }, 800, KEYS_DEF, false)).toMatchObject({ correct: false, verdict: 'wrong' })
  })

  it('a timeout is wrong, with no key', () => {
    expect(answer(blank, q(4, E3), TIMED_OUT, 3000, KEYS_DEF, false)).toEqual({
      answered: true,
      verdict: 'wrong',
      correct: false,
      given: { kind: 'timeout' },
      ms: 3000,
      exactOctave: false,
    })
  })

  it("otherOctave counts as right only when the exact octave is off (a stub def's judge)", () => {
    const stub: DrillDef = { ...KEYS_DEF, judge: () => 'otherOctave' }
    expect(answer(blank, q(4, E3), key(E3 + 12), 800, stub, false)).toMatchObject({ verdict: 'otherOctave', correct: true })
    expect(answer(blank, q(4, E3), key(E3 + 12), 800, stub, true)).toMatchObject({ verdict: 'otherOctave', correct: false, exactOctave: true })
  })
})

describe('timeLimit: the speed level reads the def', () => {
  it('Keys: 3 seconds at level 4 only', () => {
    expect(timeLimit(KEYS_DEF, 4)).toBe(3000)
    expect(timeLimit(KEYS_DEF, 3)).toBeNull()
  })
  it("a def with 6 levels and fastMs 4000 limits level 6, not level 4", () => {
    const six: DrillDef = { ...KEYS_DEF, levelCount: 6, fastMs: 4000 }
    expect(timeLimit(six, 6)).toBe(4000)
    expect(timeLimit(six, 4)).toBeNull()
  })
})

describe('whyText', () => {
  // What the player gave: null is a timeout, else the key played (any octave of that pitch class).
  const answered = (pc: number | null, correct: boolean): AnswerState => ({
    answered: true,
    verdict: correct ? 'right' : 'wrong',
    correct,
    given: pc === null ? { kind: 'timeout' } : { kind: 'key', midi: 60 + pc },
    ms: 1,
    exactOctave: false,
  })

  it('is the route sentence', () => {
    expect(KEYS_UI.whyText(q(4, E3, 'tap'), answered(5, false))).toBe('From C (left of the two black keys): C, D, E.')
    expect(KEYS_UI.whyText(q(8, Gs3, 'name'), answered(8, true))).toBe('G♯ is the black key just right of G. Also called A♭.')
  })

  it("a wrong 'play' names what was played", () => {
    expect(KEYS_UI.whyText(q(8, Gs3, 'play'), answered(7, false))).toBe('You played G. G♯ is the black key just right of G. Also called A♭.')
    expect(KEYS_UI.whyText(q(8, Gs3, 'play'), answered(8, true))).toBe('G♯ is the black key just right of G. Also called A♭.')
  })

  it('a timed-out play names nothing', () => {
    expect(KEYS_UI.whyText(q(8, Gs3, 'play'), answered(null, false))).toBe('G♯ is the black key just right of G. Also called A♭.')
  })
})

describe('level ladder and banner', () => {
  it('hints for each level', () => {
    expect(KEYS_DEF.levelHints).toEqual({ 1: 'C and F', 2: 'D E G A B', 3: '♯ and ♭ names', 4: '3 seconds a key' })
  })

  it('the banner shows only when the level rose since the last round', () => {
    expect(levelRose(2, 1)).toBe(true)
    expect(levelRose(4, 2)).toBe(true)
    expect(levelRose(2, 2)).toBe(false)
    expect(levelRose(1, 3)).toBe(false) // fell back: no banner
  })

  it('the stored level only ever rises', () => {
    expect(raisedLevel(3, 1)).toBe(3)
    expect(raisedLevel(4, 4)).toBe(4)
    expect(raisedLevel(1, 4)).toBe(4)
  })

  it('with the sticky drillLevel, the banner shows once: a second round at the same level shows none', () => {
    const settings = { ...DEFAULT_SETTINGS, lastDrillLevel: 1 as const }
    const items = { [keyId(0)]: boxed(0, 3), [keyId(5)]: boxed(5, 3) }
    const first = drillLevel(KEYS_DEF, items, '2026-10-30', settings)
    expect(levelRose(first, settings.lastDrillLevel)).toBe(true)
    const stored = raisedLevel(first, settings.lastDrillLevel)
    const second = drillLevel(KEYS_DEF, items, '2026-10-31', { ...settings, [KEYS_DEF.levelSetting]: stored })
    expect(second).toBe(2)
    expect(levelRose(second, stored)).toBe(false)
    // C lost later: the level holds at 2 and no banner shows when it is regained.
    const lost = { ...items, [keyId(0)]: boxed(0, 1) }
    expect(drillLevel(KEYS_DEF, lost, '2026-11-01', { ...settings, [KEYS_DEF.levelSetting]: stored })).toBe(2)
    expect(levelRose(drillLevel(KEYS_DEF, items, '2026-11-02', { ...settings, [KEYS_DEF.levelSetting]: stored }), stored)).toBe(false)
  })
})

describe('nextLabel', () => {
  it('Next until the last question, then the finish label', () => {
    expect(nextLabel(0, 8, 'Next round')).toBe('Next')
    expect(nextLabel(7, 8, 'Next round')).toBe('Next round')
  })
})

describe('belongsToQuestion', () => {
  it('an event at or after the question started answers it', () => {
    expect(belongsToQuestion(1000, 1000)).toBe(true)
    expect(belongsToQuestion(1450, 1000)).toBe(true)
  })
  it('an event stamped before it started belongs to the previous question', () => {
    expect(belongsToQuestion(999, 1000)).toBe(false)
  })
  it('so a late note never reads the old start: a start moved forward on Next rejects the stale press', () => {
    const oldStart = 1000
    const newStart = 7000 // Next pressed at 7 s
    const staleNote = 6990 // pressed just before Next
    expect(belongsToQuestion(staleNote, oldStart)).toBe(true) // would have been graded against the old start
    expect(belongsToQuestion(staleNote, newStart)).toBe(false)
  })
})

describe('advancesOnKey (play it again for Next)', () => {
  const after = DRILL_ADVANCE_GUARD_MS
  const right = (qq: Question, midi: number): AnswerState => answer({ answered: false }, qq, { kind: 'key', midi }, 900, KEYS_DEF, false)

  it('playing the same key again moves on, in any octave', () => {
    const qq = q(2, 50, 'play')
    const s = right(qq, 62)
    expect(advancesOnKey(qq, s, 62, after)).toBe(true)
    expect(advancesOnKey(qq, s, 50, after)).toBe(true)
  })

  it('after a miss, the key you played or the right key moves on; any other key does not', () => {
    const qq = q(2, 50, 'play')
    const s = right(qq, 64)
    expect(s.answered && s.correct).toBe(false)
    expect(advancesOnKey(qq, s, 64, after)).toBe(true)
    expect(advancesOnKey(qq, s, 62, after)).toBe(true)
    expect(advancesOnKey(qq, s, 65, after)).toBe(false)
  })

  it('after a timeout, the right key moves on', () => {
    const qq = q(2, 50, 'play')
    const s = answer({ answered: false }, qq, TIMED_OUT, 3000, KEYS_DEF, false)
    expect(advancesOnKey(qq, s, 62, after)).toBe(true)
    expect(advancesOnKey(qq, s, 64, after)).toBe(false)
  })

  it('not before the question is answered, and not inside the guard right after the answer', () => {
    const qq = q(2, 50, 'play')
    expect(advancesOnKey(qq, { answered: false }, 62, after)).toBe(false)
    expect(advancesOnKey(qq, right(qq, 62), 62, after - 1)).toBe(false)
  })

  it('name questions never move on from a key', () => {
    const qq = q(2, 50, 'name')
    const s = answer({ answered: false }, qq, { kind: 'choice', value: 'D' }, 900, KEYS_DEF, false)
    expect(advancesOnKey(qq, s, 62, after)).toBe(false)
  })
})

describe('timeLimit for an untimed last level', () => {
  it('is null at every level when fastMs is null', () => {
    const stub = { ...KEYS_DEF, levelCount: 6, fastMs: null } as DrillDef
    expect(timeLimit(stub, 6)).toBeNull()
    expect(timeLimit(stub, 3)).toBeNull()
  })
})
