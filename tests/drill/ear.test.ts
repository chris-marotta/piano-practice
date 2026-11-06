import { describe, expect, it } from 'vitest'
import { buildRound, drillLevel, gradeAnswer, isCorrect } from '../../src/drill/engine'
import { EAR_DEF, EAR_LEVEL_HINTS, EAR_LEVEL_NAMES } from '../../src/drill/ear'
import { EAR_SLOW_MS } from '../../src/play/thresholds'
import { DEFAULT_SETTINGS, EAR_IDS, earId, parseEarId, parseKeyId, parseStaffId } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'

const TODAY = '2026-11-05'
const seq = () => {
  let i = 0
  return () => ((i++ * 0.37) % 1)
}
const at = (ids: string[], box: ItemState['box']): Record<string, ItemState> =>
  Object.fromEntries(ids.map((id) => [id, { id, introduced: true, box, support: 0, levelStreak: 0, due: TODAY, history: [] } as ItemState]))
const level4 = [1, 2, 3, 4].flatMap((n) => EAR_DEF.levelItems(n))

describe('ear ids', () => {
  it('parses degrees and nothing else', () => {
    expect(parseEarId('ear:#4')).toBe('#4')
    expect(parseEarId('ear:8')).toBeNull()
    expect(parseEarId('key:C')).toBeNull()
    expect(parseEarId('ear:')).toBeNull()
    expect(earId('b3')).toBe('ear:b3')
    expect(EAR_IDS).toHaveLength(12)
    expect(EAR_IDS.slice(0, 2)).toEqual(['ear:1', 'ear:5'])
    expect(parseKeyId('ear:5')).toBeNull()
    expect(parseStaffId('ear:5')).toBeNull()
  })
})

describe('EAR_DEF definition', () => {
  it('has thresholds, names and hints', () => {
    expect(EAR_SLOW_MS).toBe(6000)
    expect(EAR_DEF).toMatchObject({ kind: 'ear', levelCount: 6, levelSetting: 'lastEarLevel', slowMs: 6000, fastMs: null })
    expect(EAR_LEVEL_NAMES).toEqual({ 1: 'Home and five', 2: 'Third and fourth', 3: 'Every major step', 4: 'Minor colours', 5: 'Outside notes', 6: 'Key once' })
    expect(EAR_LEVEL_HINTS).toEqual({ 1: '1 and 5', 2: '3 and 4', 3: '2, 6 and 7', 4: '♭3 ♭6 ♭7, your key', 5: '♭2 and ♯4', 6: 'Home once a round' })
  })
  it('levelItems cover the 12 ids in order, none for level 6', () => {
    expect([1, 2, 3, 4, 5].flatMap((n) => EAR_DEF.levelItems(n))).toEqual(EAR_IDS)
    expect(EAR_DEF.levelItems(6)).toEqual([])
  })
  it('tieOrder is the half-steps', () => {
    expect(EAR_DEF.tieOrder?.('ear:5')).toBe(7)
    expect(EAR_DEF.tieOrder?.('ear:1')).toBe(0)
  })
  it('does not grade lost at level 6 by speed', () => {
    expect(gradeAnswer(EAR_DEF, true, 7000, 6)).toBe('shaky')
    expect(gradeAnswer(EAR_DEF, true, 5000, 6)).toBe('nailed')
  })
})

describe('EAR_DEF.buildQuestion', () => {
  it('without ctx is level 1 in C', () => {
    const q = EAR_DEF.buildQuestion('ear:5', 'tap', seq())
    expect(q).toMatchObject({ itemId: 'ear:5', pc: 7, midi: 67, answer: '5', format: 'tap' })
    expect(q.ear).toEqual({ root: 'C', tonic: 60, target: 67, degree: '5', withTonic: true })
    expect(q.choices).toBeUndefined()
  })
  it('degree 1 sounds an octave above', () => {
    const q = EAR_DEF.buildQuestion('ear:1', 'tap', seq())
    expect(q.midi).toBe(72)
    expect(q.pc).toBe(0)
  })
  it('name questions carry four choices with the half-step spelling as sub', () => {
    const q = EAR_DEF.buildQuestion('ear:5', 'name', seq())
    expect(q.choices).toHaveLength(4)
    expect(q.choices?.find((c) => c.value === '5')).toEqual({ value: '5', label: '5', sub: 'G' })
    expect(q.choices?.find((c) => c.value === 'b3')).toBeUndefined()
  })
  it('level 6 has no tonic with the question', () => {
    const q = EAR_DEF.buildQuestion('ear:5', 'tap', seq(), undefined, { level: 6, tonic: 'D', pool: level4 })
    expect(q.ear?.withTonic).toBe(false)
    expect(q.ear?.root).toBe('D')
  })
  it('in D♭ at level 4 the b6 choice has sub A', () => {
    const q = EAR_DEF.buildQuestion('ear:b6', 'name', seq(), undefined, { level: 4, tonic: 'Db', pool: level4 })
    expect(q.choices?.find((c) => c.value === 'b6')?.sub).toBe('A')
  })
})

describe('EAR_DEF rounds (Review Focus 5)', () => {
  const round = (level: number) =>
    buildRound(EAR_DEF, {}, TODAY, DEFAULT_SETTINGS, { count: 2, midi: false, rng: seq(), level, tonic: 'G#' })
  it('levels 1-3 stay in C', () => {
    for (const l of [1, 2, 3]) for (const q of round(l)) expect(q.ear).toMatchObject({ root: 'C', tonic: 60 })
  })
  it('level 4 uses the round tonic', () => {
    for (const q of round(4)) expect(q.ear).toMatchObject({ root: 'G#', tonic: 56 })
  })
  it('G# #4 spells D', () => {
    const q = EAR_DEF.buildQuestion('ear:#4', 'name', seq(), undefined, { level: 5, tonic: 'G#', pool: EAR_IDS })
    expect(q.choices?.find((c) => c.value === '#4')?.sub).toBe('D')
  })
})

describe('EAR_DEF.judge', () => {
  const q = EAR_DEF.buildQuestion('ear:5', 'play', seq())
  it('judges keys by pitch class and octave', () => {
    expect(EAR_DEF.judge(q, { kind: 'key', midi: 67 })).toBe('right')
    expect(EAR_DEF.judge(q, { kind: 'key', midi: 55 })).toBe('otherOctave')
    expect(EAR_DEF.judge(q, { kind: 'key', midi: 31 })).toBe('otherOctave')
    expect(EAR_DEF.judge(q, { kind: 'key', midi: 66 })).toBe('wrong')
  })
  it('judges choices and timeouts', () => {
    expect(EAR_DEF.judge(q, { kind: 'choice', value: '5' })).toBe('right')
    expect(EAR_DEF.judge(q, { kind: 'choice', value: '4' })).toBe('wrong')
    expect(EAR_DEF.judge(q, { kind: 'timeout' })).toBe('wrong')
  })
  it('otherOctave is not correct when exact', () => {
    expect(isCorrect('otherOctave', true)).toBe(false)
    expect(isCorrect('otherOctave', false)).toBe(true)
  })
})

describe('drillLevel for ear', () => {
  it('unlocks level 2 when ear:1 and ear:5 are at box 3, and is sticky', () => {
    expect(drillLevel(EAR_DEF, at(['ear:1', 'ear:5'], 3), TODAY, DEFAULT_SETTINGS)).toBe(2)
    expect(drillLevel(EAR_DEF, at(['ear:1', 'ear:5'], 1), TODAY, DEFAULT_SETTINGS)).toBe(1)
    expect(drillLevel(EAR_DEF, at(['ear:1', 'ear:5'], 1), TODAY, { ...DEFAULT_SETTINGS, lastEarLevel: 2 })).toBe(2)
  })
})
