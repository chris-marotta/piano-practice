// Drill levels: which keys are in play, unlocked by how well earlier keys are known. Pure.
import { keyId, stateFor } from '../srs/items'
import type { Settings } from '../srs/items'
import type { ItemState } from '../srs/scheduler'

/** Pitch classes by level. Level 4 (Speed) uses all of them, so it has no keys of its own. */
export const LEVEL_KEYS: Record<1 | 2 | 3, number[]> = {
  1: [0, 5],
  2: [2, 4, 7, 9, 11],
  3: [1, 3, 6, 8, 10],
}

export const LEVEL_NAMES: Record<1 | 2 | 3 | 4, string> = {
  1: 'Landmarks',
  2: 'White keys',
  3: 'Black keys',
  4: 'Speed',
}

/** A key counts as known for unlocking the next level at this Leitner box or higher. */
export const DRILL_LEVEL_UNLOCK_BOX = 3

/**
 * The highest unlocked level. Level n+1 unlocks when every key of levels 1..n is at box 3 or more;
 * level 4 unlocks when all 12 are. A key with no stored state is at box 1.
 */
export function drillLevel(items: Record<string, ItemState>, today: string, settings: Settings): 1 | 2 | 3 | 4 {
  const known = (pc: number): boolean => stateFor(keyId(pc), items, today, settings).box >= DRILL_LEVEL_UNLOCK_BOX
  let level: 1 | 2 | 3 | 4 = 1
  for (const n of [1, 2, 3] as const) {
    if (!LEVEL_KEYS[n].every(known)) break
    level = (n + 1) as 2 | 3 | 4
  }
  return level
}
