import { describe, expect, it } from 'vitest'
import { buildRound, drillLevel, gradeAnswer } from '../../src/drill/engine'
import type { Question } from '../../src/drill/engine'
import { STAFF_DEF, STAFF_LEVEL_HINTS, STAFF_LEVEL_NAMES } from '../../src/drill/staff'
import { STAFF_FAST_MS, STAFF_SLOW_MS } from '../../src/play/thresholds'
import { DEFAULT_SETTINGS, STAFF_IDS, staffId } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'

const TODAY = '2026-11-05'
const seq = () => {
  let i = 0
  return () => ((i++ * 0.37) % 1)
}
const at = (ids: string[], box: ItemState['box']): Record<string, ItemState> =>
  Object.fromEntries(ids.map((id) => [id, { id, introduced: true, box, support: 0, levelStreak: 0, due: TODAY, history: [] } as ItemState]))
const q = (clef: 'treble' | 'bass', note: string, format: Question['format'] = 'tap') =>
  STAFF_DEF.buildQuestion(staffId(clef, note), format, seq())

describe('STAFF_DEF definition', () => {
  it('has the thresholds, names and hints', () => {
    expect(STAFF_SLOW_MS).toBe(6000)
    expect(STAFF_FAST_MS).toBe(4000)
    expect(STAFF_DEF).toMatchObject({ kind: 'staff', levelCount: 6, levelSetting: 'lastStaffLevel', slowMs: 6000, fastMs: 4000 })
    expect(STAFF_LEVEL_NAMES).toEqual({ 1: 'Landmarks', 2: 'Treble staff', 3: 'Bass staff', 4: 'Ledger lines', 5: 'Sharps & flats', 6: 'Speed' })
    expect(STAFF_LEVEL_HINTS[6]).toBe('4 seconds a note')
    expect(STAFF_LEVEL_HINTS[5]).toBe('♯ and ♭ on the staff')
  })
  it('levelItems cover the 54 ids in order, none for the speed level', () => {
    expect([1, 2, 3, 4, 5].flatMap((n) => STAFF_DEF.levelItems(n))).toEqual(STAFF_IDS)
    expect(STAFF_DEF.levelItems(1)).toEqual(['staff:treble:C4', 'staff:bass:C4', 'staff:treble:G4', 'staff:bass:F3'])
    expect(STAFF_DEF.levelItems(6)).toEqual([])
    expect(STAFF_DEF.tieOrder).toBeUndefined()
  })
})

describe('STAFF_DEF.buildQuestion', () => {
  it('fills midi, pc, answer and staff; choices only on name questions', () => {
    const name = q('treble', 'F#4', 'name')
    expect(name).toMatchObject({ itemId: 'staff:treble:F#4', midi: 66, pc: 6, answer: 'F#', staff: { clef: 'treble', note: 'F#4' }, repeat: false })
    expect(name.choices).toHaveLength(4)
    expect(name.choices?.map((c) => c.value)).toContain('F#')
    expect(name.choices?.find((c) => c.value === 'F#')?.label).toBe('F♯')
    expect(q('bass', 'C4', 'tap').choices).toBeUndefined()
    expect(q('bass', 'C4', 'play').choices).toBeUndefined()
  })
  it('ignores prevMidi', () => {
    expect(STAFF_DEF.buildQuestion('staff:bass:F3', 'tap', seq(), 99).midi).toBe(53)
  })
})

describe('STAFF_DEF.judge (Review Focus 3)', () => {
  it('G♭4 on the F♯ key is right; the name pick F# is wrong', () => {
    expect(STAFF_DEF.judge(q('treble', 'Gb4'), { kind: 'key', midi: 66 })).toBe('right')
    expect(STAFF_DEF.judge(q('treble', 'Gb4'), { kind: 'choice', value: 'F#' })).toBe('wrong')
    expect(STAFF_DEF.judge(q('treble', 'Gb4', 'name'), { kind: 'choice', value: 'Gb' })).toBe('right')
  })
  it('right letter, other octave', () => {
    expect(STAFF_DEF.judge(q('treble', 'C4'), { kind: 'key', midi: 72 })).toBe('otherOctave')
    expect(STAFF_DEF.judge(q('treble', 'C4'), { kind: 'key', midi: 36 })).toBe('otherOctave')
  })
  it('wrong pitch class and timeout are wrong', () => {
    expect(STAFF_DEF.judge(q('treble', 'C4'), { kind: 'key', midi: 62 })).toBe('wrong')
    expect(STAFF_DEF.judge(q('treble', 'C4'), { kind: 'timeout' })).toBe('wrong')
  })
})

describe('STAFF_DEF levels', () => {
  it('starts at 1 with no items', () => {
    expect(drillLevel(STAFF_DEF, {}, TODAY, DEFAULT_SETTINGS)).toBe(1)
  })
  it('level 1 at box 3 unlocks level 2', () => {
    expect(drillLevel(STAFF_DEF, at(STAFF_DEF.levelItems(1), 3), TODAY, DEFAULT_SETTINGS)).toBe(2)
  })
  it('is sticky: lastStaffLevel 4 with all boxes at 1 stays 4', () => {
    const settings = { ...DEFAULT_SETTINGS, lastStaffLevel: 4 as const }
    expect(drillLevel(STAFF_DEF, at(STAFF_IDS, 1), TODAY, settings)).toBe(4)
  })
  it('a fresh round uses only level-1 items with alternating formats', () => {
    const round = buildRound(STAFF_DEF, {}, TODAY, DEFAULT_SETTINGS, { count: 6, midi: false, rng: seq() })
    const level1 = new Set(STAFF_DEF.levelItems(1))
    expect(round.every((x) => level1.has(x.itemId))).toBe(true)
    expect(round.map((x) => x.format)).toEqual(['name', 'tap', 'name', 'tap', 'tap', 'name'])
  })
})

describe('STAFF_DEF grading', () => {
  it('uses the staff thresholds', () => {
    expect(gradeAnswer(STAFF_DEF, true, 4100, 6)).toBe('lost')
    expect(gradeAnswer(STAFF_DEF, true, 4100, 5)).toBe('nailed')
    expect(gradeAnswer(STAFF_DEF, true, 6100, 5)).toBe('shaky')
  })
})
