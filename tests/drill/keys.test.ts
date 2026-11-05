import { describe, expect, it } from 'vitest'
import { DRILL_LEVEL_UNLOCK_BOX, drillLevel } from '../../src/drill/engine'
import { KEYS_DEF, LEVEL_KEYS, LEVEL_NAMES } from '../../src/drill/keys'
import { DEFAULT_SETTINGS, keyId } from '../../src/srs/items'
import type { Settings } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'

const TODAY = '2026-10-30'

function keyState(pc: number, box: ItemState['box']): ItemState {
  return { id: keyId(pc), introduced: true, box, support: 0, levelStreak: 0, due: TODAY, history: [] }
}

function itemsAt(boxes: Record<number, ItemState['box']>): Record<string, ItemState> {
  const items: Record<string, ItemState> = {}
  for (const [pc, box] of Object.entries(boxes)) items[keyId(Number(pc))] = keyState(Number(pc), box)
  return items
}

const level = (items: Record<string, ItemState>) => drillLevel(KEYS_DEF, items, TODAY, DEFAULT_SETTINGS)

describe('LEVEL_KEYS / LEVEL_NAMES', () => {
  it('splits the 12 keys into landmarks, white keys, black keys', () => {
    expect(LEVEL_KEYS).toEqual({ 1: [0, 5], 2: [2, 4, 7, 9, 11], 3: [1, 3, 6, 8, 10] })
    expect([...LEVEL_KEYS[1], ...LEVEL_KEYS[2], ...LEVEL_KEYS[3]].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('has the verbatim level names', () => {
    expect(LEVEL_NAMES).toEqual({ 1: 'Landmarks', 2: 'White keys', 3: 'Black keys', 4: 'Speed' })
  })

  it('unlocks at box 3', () => {
    expect(DRILL_LEVEL_UNLOCK_BOX).toBe(3)
  })
})

describe('drillLevel', () => {
  it('is 1 for a fresh state', () => {
    expect(level({})).toBe(1)
  })

  it('is 2 when C and F are at box 3', () => {
    expect(level(itemsAt({ 0: 3, 5: 3 }))).toBe(2)
  })

  it('stays 1 when C is at 3 but F is at 2', () => {
    expect(level(itemsAt({ 0: 3, 5: 2 }))).toBe(1)
  })

  it('stays 1 when F has no stored state', () => {
    expect(level(itemsAt({ 0: 5 }))).toBe(1)
  })

  it('is 3 once the white keys are also at box 3', () => {
    expect(level(itemsAt({ 0: 3, 5: 3, 2: 3, 4: 4, 7: 5, 9: 3, 11: 3 }))).toBe(3)
  })

  it('stays 2 when one white key is at box 2', () => {
    expect(level(itemsAt({ 0: 3, 5: 3, 2: 3, 4: 3, 7: 3, 9: 3, 11: 2 }))).toBe(2)
  })

  it('does not skip a level: black keys at box 5 do not help while C is at 2', () => {
    expect(level(itemsAt({ 0: 2, 5: 3, 1: 5, 3: 5, 6: 5, 8: 5, 10: 5 }))).toBe(1)
  })

  it('is 4 when all 12 keys are at box 3 or more', () => {
    const boxes: Record<number, ItemState['box']> = {}
    for (let pc = 0; pc < 12; pc++) boxes[pc] = 3
    expect(level(itemsAt(boxes))).toBe(4)
  })

  it('is 3 when one black key is at box 2', () => {
    const boxes: Record<number, ItemState['box']> = {}
    for (let pc = 0; pc < 12; pc++) boxes[pc] = 3
    boxes[6] = 2
    expect(level(itemsAt(boxes))).toBe(3)
  })
})

describe('drillLevel is sticky (ruling R-T11d)', () => {
  const allAt3 = (): Record<string, ItemState> => {
    const boxes: Record<number, ItemState['box']> = {}
    for (let pc = 0; pc < 12; pc++) boxes[pc] = 3
    return itemsAt(boxes)
  }
  const reached = (lastDrillLevel: Settings['lastDrillLevel']): Settings => ({ ...DEFAULT_SETTINGS, lastDrillLevel })

  it('all 12 keys at box 3 or more → 4', () => {
    expect(drillLevel(KEYS_DEF, allAt3(), TODAY, reached(1))).toBe(4)
  })

  it('then C lost (box 1), with lastDrillLevel 4 → still 4', () => {
    const items = { ...allAt3(), [keyId(0)]: keyState(0, 1) }
    expect(drillLevel(KEYS_DEF, items, TODAY, reached(1))).toBe(1) // what the boxes alone say
    expect(drillLevel(KEYS_DEF, items, TODAY, reached(4))).toBe(4)
  })

  it('a fresh state with lastDrillLevel 1 → 1', () => {
    expect(drillLevel(KEYS_DEF, {}, TODAY, reached(1))).toBe(1)
  })

  it('a reached level holds on a fresh state; boxes above it still raise it', () => {
    expect(drillLevel(KEYS_DEF, {}, TODAY, reached(3))).toBe(3)
    expect(drillLevel(KEYS_DEF, allAt3(), TODAY, reached(2))).toBe(4)
  })
})
