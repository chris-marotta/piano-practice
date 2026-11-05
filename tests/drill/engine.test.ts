import { describe, expect, it } from 'vitest'
import { buildRound, gradeAnswer, gradeFirstAnswer, isCorrect, shouldGrade, withRepeat } from '../../src/drill/engine'
import type { Question } from '../../src/drill/engine'
import { KEYS_DEF } from '../../src/drill/keys'
import { DEFAULT_SETTINGS, keyId } from '../../src/srs/items'
import { PC_ASCII } from '../../src/theory/keyNames'
import type { ItemState } from '../../src/srs/scheduler'

const TODAY = '2026-10-30'
const TOMORROW = '2026-10-31'
const YESTERDAY = '2026-10-29'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function keyState(pc: number, box: ItemState['box'], due: string, introduced = true): ItemState {
  return { id: keyId(pc), introduced, box, support: 0, levelStreak: 0, due, history: [] }
}

function itemsOf(...states: ItemState[]): Record<string, ItemState> {
  return Object.fromEntries(states.map((s) => [s.id, s]))
}

const round = (items: Record<string, ItemState>, count: number, opts: { midi?: boolean; seed?: number } = {}) =>
  buildRound(KEYS_DEF, items, TODAY, DEFAULT_SETTINGS, { count, midi: opts.midi ?? false, rng: mulberry32(opts.seed ?? 1) })

const q = (over: Partial<Question> = {}): Question => ({
  itemId: keyId(0),
  pc: 0,
  midi: 60,
  format: 'name',
  answer: 'C',
  choices: [0, 2, 4, 5].map((c) => ({ value: PC_ASCII[c] as string, label: PC_ASCII[c] as string })),
  repeat: false,
  ...over,
})

describe('buildRound at level 1 (2 keys, 8 questions)', () => {
  const r = round({}, 8)

  it('builds 8 questions from C and F only, both present', () => {
    expect(r).toHaveLength(8)
    expect(new Set(r.map((x) => x.pc))).toEqual(new Set([0, 5]))
    expect(r.every((x) => x.itemId === keyId(x.pc))).toBe(true)
    expect(r.every((x) => !x.repeat)).toBe(true)
  })

  it('keeps every MIDI note within 48-71 and on its pitch class', () => {
    for (const x of r) {
      expect(x.midi).toBeGreaterThanOrEqual(48)
      expect(x.midi).toBeLessThanOrEqual(71)
      expect(x.midi % 12).toBe(x.pc)
    }
  })

  it('gives a repeat of a key a different octave from that key\'s previous question', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rr = round({}, 8, { seed })
      const last = new Map<number, number>()
      for (const x of rr) {
        const prev = last.get(x.pc)
        if (prev !== undefined) expect(Math.floor(x.midi / 12)).not.toBe(Math.floor(prev / 12))
        last.set(x.pc, x.midi)
      }
    }
  })

  it('does the same with MIDI play questions', () => {
    const rr = round({}, 8, { midi: true, seed: 9 })
    const octaves = rr.filter((x) => x.pc === 0).map((x) => Math.floor(x.midi / 12))
    for (let i = 1; i < octaves.length; i++) expect(octaves[i]).not.toBe(octaves[i - 1])
  })
})

describe('buildRound formats', () => {
  it('alternates formats per item, not per position (replaces the strict A/B alternation test)', () => {
    // Level 1: C, F, C, F, C, F. C is even in the pool (name first), F is odd (tap first), then each flips.
    const r = round({}, 6)
    expect(r.map((x) => x.format)).toEqual(['name', 'tap', 'tap', 'name', 'name', 'tap'])
    for (const pc of [0, 5]) expect(new Set(r.filter((x) => x.pc === pc).map((x) => x.format))).toEqual(new Set(['name', 'tap']))
  })

  it('at level 2 (C and F at box 3), 8 questions alternate name and tap as before', () => {
    const items = itemsOf(keyState(0, 3, TOMORROW), keyState(5, 3, TOMORROW))
    expect(round(items, 8).map((x) => x.format)).toEqual(['name', 'tap', 'name', 'tap', 'name', 'tap', 'name', 'tap'])
  })

  it('is all play when midi is on, with no choices', () => {
    const r = round({}, 6, { midi: true })
    expect(r.every((x) => x.format === 'play')).toBe(true)
    expect(r.every((x) => x.choices === undefined)).toBe(true)
  })

  it('gives each name question 4 distinct choices that include its pc, and no one else', () => {
    const r = round({}, 8)
    for (const x of r) {
      if (x.format === 'name') {
        const values = x.choices?.map((c) => c.value)
        expect(values).toHaveLength(4)
        expect(new Set(values).size).toBe(4)
        expect(values).toContain(x.answer)
        expect(x.answer).toBe(PC_ASCII[x.pc])
        expect(x.choices?.find((c) => c.value === x.answer)?.label).toBeDefined()
      } else {
        expect(x.choices).toBeUndefined()
      }
    }
  })
})

describe('buildRound determinism and size', () => {
  it('is identical for the same seed', () => {
    expect(round({}, 8, { seed: 42 })).toEqual(round({}, 8, { seed: 42 }))
  })

  it('does not mutate items', () => {
    const items = itemsOf(keyState(0, 1, TODAY))
    const copy = structuredClone(items)
    round(items, 4)
    expect(items).toEqual(copy)
  })

  it('takes count from a bigger pool without repeating a key', () => {
    const items = itemsOf(keyState(0, 3, TOMORROW), keyState(5, 3, TOMORROW))
    const r = round(items, 5)
    expect(r.map((x) => x.pc)).toHaveLength(5)
    expect(new Set(r.map((x) => x.pc)).size).toBe(5)
  })

  it('returns an empty round for count 0', () => {
    expect(round({}, 0)).toEqual([])
  })
})

describe('buildRound pool and order', () => {
  it('puts the weakest due key first (box asc, then due asc, then pc)', () => {
    const items = itemsOf(
      keyState(0, 3, TOMORROW),
      keyState(5, 3, TOMORROW),
      keyState(2, 2, TODAY),
      keyState(4, 1, TODAY),
      keyState(7, 1, YESTERDAY),
      keyState(9, 1, YESTERDAY),
    )
    // Level 2 is unlocked. Due introduced: 7, 9 (box 1, due yesterday, pc order), 4 (box 1, today), 2 (box 2).
    // Not introduced, level order: 11. Then the rest by soonest due: 0, 5.
    expect(round(items, 7).map((x) => x.pc)).toEqual([7, 9, 4, 2, 11, 0, 5])
  })

  it('orders not-introduced keys by level, then pc, ahead of introduced keys that are not due', () => {
    const items = itemsOf(keyState(0, 3, TOMORROW), keyState(5, 3, TOMORROW))
    expect(round(items, 7).map((x) => x.pc)).toEqual([2, 4, 7, 9, 11, 0, 5])
  })

  it('treats a stored but not-introduced key as not introduced', () => {
    const items = itemsOf(keyState(0, 3, TOMORROW), keyState(5, 3, TOMORROW), keyState(2, 1, TODAY, false), keyState(4, 1, TODAY))
    // E is introduced and due, so it leads; D is not introduced and sorts with the new keys.
    expect(round(items, 3).map((x) => x.pc)).toEqual([4, 2, 7])
  })

  it('includes the black keys once level 3 is unlocked', () => {
    const boxes = [0, 5, 2, 4, 7, 9, 11].map((pc) => keyState(pc, 3, TOMORROW))
    const pcs = round(itemsOf(...boxes), 12).map((x) => x.pc)
    expect(pcs).toHaveLength(12)
    expect(new Set(pcs)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))
  })

  it('level 4 uses the same 12-key pool as level 3', () => {
    const items = itemsOf(...Array.from({ length: 12 }, (_, pc) => keyState(pc, 3, TOMORROW)))
    expect(new Set(round(items, 12).map((x) => x.pc)).size).toBe(12)
  })
})

describe('isCorrect and KEYS_DEF.judge', () => {
  it('counts the other octave as right only when the exact octave is off', () => {
    expect(isCorrect('right', true)).toBe(true)
    expect(isCorrect('wrong', false)).toBe(false)
    expect(isCorrect('otherOctave', false)).toBe(true)
    expect(isCorrect('otherOctave', true)).toBe(false)
  })
  it('judges a key in another octave right, a wrong pitch class wrong, a timeout wrong', () => {
    const k = round({}, 1)[0] as Question
    expect(KEYS_DEF.judge(k, { kind: 'key', midi: k.midi + 12 })).toBe('right')
    expect(KEYS_DEF.judge(k, { kind: 'key', midi: k.midi + 1 })).toBe('wrong')
    expect(KEYS_DEF.judge(k, { kind: 'choice', value: k.answer })).toBe('right')
    expect(KEYS_DEF.judge(k, { kind: 'choice', value: 'D#' })).toBe('wrong')
    expect(KEYS_DEF.judge(k, { kind: 'timeout' })).toBe('wrong')
  })
})

describe('withRepeat', () => {
  const base = [q({ pc: 0 }), q({ pc: 5, itemId: keyId(5), midi: 65 }), q({ pc: 0, midi: 48 })]

  it('appends one practice-only copy of the missed question', () => {
    const next = withRepeat(base, 1)
    expect(next).toHaveLength(4)
    expect(next[3]).toEqual({ ...base[1], repeat: true })
    expect(base).toHaveLength(3)
  })

  it('adds at most one repeat per key', () => {
    const once = withRepeat(base, 0)
    const twice = withRepeat(once, 2)
    expect(twice).toHaveLength(4)
    expect(twice.filter((x) => x.repeat)).toHaveLength(1)
  })

  it('does not repeat a repeat, or an out-of-range index', () => {
    const once = withRepeat(base, 0)
    expect(withRepeat(once, 3)).toHaveLength(4)
    expect(withRepeat(base, 9)).toHaveLength(3)
    expect(withRepeat(base, -1)).toHaveLength(3)
  })
})

describe('gradeAnswer', () => {
  it('nails a quick right answer', () => {
    expect(gradeAnswer(KEYS_DEF, true, 2000, 2)).toBe('nailed')
  })
  it('grades a slow right answer shaky', () => {
    expect(gradeAnswer(KEYS_DEF, true, 6000, 2)).toBe('shaky')
  })
  it('sits exactly on the slow threshold as nailed', () => {
    expect(gradeAnswer(KEYS_DEF, true, 5000, 3)).toBe('nailed')
    expect(gradeAnswer(KEYS_DEF, true, 5001, 3)).toBe('shaky')
  })
  it('grades a wrong answer lost at any speed', () => {
    expect(gradeAnswer(KEYS_DEF, false, 1000, 1)).toBe('lost')
    expect(gradeAnswer(KEYS_DEF, false, 9000, 4)).toBe('lost')
  })
  it('grades a right answer past 3 s lost at level 4 only', () => {
    expect(gradeAnswer(KEYS_DEF, true, 3500, 4)).toBe('lost')
    expect(gradeAnswer(KEYS_DEF, true, 3000, 4)).toBe('nailed')
    expect(gradeAnswer(KEYS_DEF, true, 3500, 3)).toBe('nailed')
    expect(gradeAnswer(KEYS_DEF, true, 3100, 4)).toBe('lost')
    expect(gradeAnswer(KEYS_DEF, true, 3100, 3)).toBe('nailed')
  })
})

describe('shouldGrade', () => {
  const state = (over: Partial<ItemState> = {}): ItemState => ({ ...keyState(0, 2, TOMORROW), ...over })

  it('play: a right answer on a key that is not due is not graded', () => {
    expect(shouldGrade(q(), state(), TODAY, 'play', true)).toBe(false)
  })
  it('play: a wrong answer is graded', () => {
    expect(shouldGrade(q(), state(), TODAY, 'play', false)).toBe(true)
  })
  it('play: a right answer on a due key is graded', () => {
    expect(shouldGrade(q(), state({ due: TODAY }), TODAY, 'play', true)).toBe(true)
    expect(shouldGrade(q(), state({ due: YESTERDAY }), TODAY, 'play', true)).toBe(true)
  })
  it('session: a key not yet rated today is graded, right or wrong', () => {
    expect(shouldGrade(q(), state(), TODAY, 'session', true)).toBe(true)
    expect(shouldGrade(q(), state(), TODAY, 'session', false)).toBe(true)
  })
  it('session: a key already rated today is not graded', () => {
    const rated = state({ history: [{ date: TODAY, rating: 'nailed' }] })
    expect(shouldGrade(q(), rated, TODAY, 'session', true)).toBe(false)
    expect(shouldGrade(q(), rated, TODAY, 'session', false)).toBe(false)
  })
  it('session: a rating from an earlier day does not block grading', () => {
    const old = state({ history: [{ date: YESTERDAY, rating: 'nailed' }] })
    expect(shouldGrade(q(), old, TODAY, 'session', true)).toBe(true)
  })
  it('a repeat question is never graded', () => {
    const rep = q({ repeat: true })
    expect(shouldGrade(rep, state(), TODAY, 'session', false)).toBe(false)
    expect(shouldGrade(rep, state({ due: TODAY }), TODAY, 'play', false)).toBe(false)
  })
})

describe('gradeFirstAnswer', () => {
  const ask = (repeat = false): Question => ({ itemId: keyId(2), pc: 2, midi: 50, format: 'tap', answer: 'D', repeat })
  const due = keyState(2, 2, TODAY)

  it('grades a key\'s first answer and remembers it', () => {
    const seen = new Set<string>()
    expect(gradeFirstAnswer(KEYS_DEF, ask(), seen, due, TODAY, 'play', true, 1200, 1)).toBe('nailed')
    expect(seen.has(keyId(2))).toBe(true)
  })

  it('a second question on the same key is not graded', () => {
    const seen = new Set<string>()
    gradeFirstAnswer(KEYS_DEF, ask(), seen, due, TODAY, 'play', false, 1200, 1)
    expect(gradeFirstAnswer(KEYS_DEF, ask(), seen, due, TODAY, 'play', false, 1200, 1)).toBeNull()
  })

  it('a practice repeat is never graded and does not use up the key', () => {
    const seen = new Set<string>()
    expect(gradeFirstAnswer(KEYS_DEF, ask(true), seen, due, TODAY, 'play', false, 1200, 1)).toBeNull()
    expect(seen.size).toBe(0)
  })

  it('goes through shouldGrade: in Play a right answer on a key that is not due gives nothing', () => {
    const later = keyState(2, 3, TOMORROW)
    expect(gradeFirstAnswer(KEYS_DEF, ask(), new Set(), later, TODAY, 'play', true, 1200, 1)).toBeNull()
    expect(gradeFirstAnswer(KEYS_DEF, ask(), new Set(), later, TODAY, 'play', false, 1200, 1)).toBe('lost')
  })

  it('uses gradeAnswer for the level: slow is shaky, and past 3 s at level 4 is lost', () => {
    expect(gradeFirstAnswer(KEYS_DEF, ask(), new Set(), due, TODAY, 'play', true, 6000, 1)).toBe('shaky')
    expect(gradeFirstAnswer(KEYS_DEF, ask(), new Set(), due, TODAY, 'play', true, 3500, 4)).toBe('lost')
  })

  it('an already-graded day (session) gives nothing', () => {
    const done = { ...due, history: [{ date: TODAY, rating: 'nailed' as const }] }
    expect(gradeFirstAnswer(KEYS_DEF, ask(), new Set(), done, TODAY, 'session', true, 1200, 1)).toBeNull()
  })
})
