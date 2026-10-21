import { describe, expect, it } from 'vitest'
import { logCompletedSession, rateItem, sessionMinutes } from '../../src/session/record'
import { chordsId, idsForScale, placeItems, recallId, scaleId } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'
import { emptyState, type AppState } from '../../src/store/storage'
import { streak } from '../../src/store/streak'

const TODAY = '2026-10-20'
const E = { root: 'E', form: 'major' as const }
const D = { root: 'D', form: 'major' as const }

function placed(choices: Record<string, 'solid' | 'shaky' | 'unknown'>): AppState {
  const s = emptyState()
  return { ...s, placedAt: TODAY, items: placeItems(choices, s.settings, TODAY) }
}

const item = (s: AppState, id: string): ItemState => s.items[id] as ItemState

describe('rateItem', () => {
  it('applies the rating to the stored state and records it', () => {
    const s = placed({ [scaleId(E)]: 'solid' })
    const next = rateItem(s, scaleId(E), 'nailed', TODAY)
    expect(item(next, scaleId(E))).toMatchObject({ box: 4, due: '2026-10-28', levelStreak: 1, tempo: 68 })
    expect(item(next, scaleId(E)).history).toEqual([{ date: TODAY, rating: 'nailed' }])
  })

  it('does not mutate the input state', () => {
    const s = placed({ [scaleId(E)]: 'solid' })
    const copy = structuredClone(s)
    rateItem(s, scaleId(E), 'lost', TODAY)
    expect(s).toEqual(copy)
  })

  it('caps a peeked nailed at shaky', () => {
    const s = placed({ [scaleId(E)]: 'solid' })
    const next = rateItem(s, scaleId(E), 'nailed', TODAY, { peeked: true })
    expect(item(next, scaleId(E))).toMatchObject({ box: 3, due: '2026-10-21' })
    expect(item(next, scaleId(E)).history.at(-1)?.rating).toBe('shaky')
  })

  it('creates state for an item with none stored (newly enabled form)', () => {
    const s = placed({})
    const ref = { root: 'A', form: 'harmonic' as const }
    const next = rateItem(s, scaleId(ref), 'shaky', TODAY)
    expect(item(next, scaleId(ref))).toMatchObject({ introduced: true, box: 1, due: '2026-10-21' })
  })

  it('introduces the recall and chord items of a newly introduced scale without touching box or due', () => {
    const s = placed({ [scaleId(E)]: 'unknown' })
    const next = rateItem(s, scaleId(E), 'shaky', TODAY)
    for (const id of idsForScale(E).slice(1)) {
      expect(item(next, id)).toEqual({ ...item(s, id), introduced: true })
    }
  })

  it('introduces sibling items even when they have no stored state yet', () => {
    const s = placed({})
    const ref = { root: 'A', form: 'harmonic' as const }
    const next = rateItem(s, scaleId(ref), 'lost', TODAY)
    expect(item(next, chordsId(ref))).toMatchObject({ introduced: true, box: 1, due: TODAY, history: [] })
    expect(item(next, recallId('keysig', ref))).toMatchObject({ introduced: true, box: 1, due: TODAY })
  })

  it('keeps a sibling rated earlier in the session as it is (apart from the flag)', () => {
    let s = placed({ [scaleId(E)]: 'unknown' })
    s = rateItem(s, recallId('keysig', E), 'nailed', TODAY)
    const rated = item(s, recallId('keysig', E))
    const next = rateItem(s, scaleId(E), 'nailed', TODAY)
    expect(item(next, recallId('keysig', E))).toEqual(rated)
  })

  it('leaves siblings alone when the scale was already introduced', () => {
    const s = placed({ [scaleId(E)]: 'shaky' })
    const next = rateItem(s, scaleId(E), 'nailed', TODAY)
    for (const id of idsForScale(E).slice(1)) expect(item(next, id)).toBe(item(s, id))
  })

  it('does not touch other scales', () => {
    const s = placed({ [scaleId(E)]: 'unknown', [scaleId(D)]: 'unknown' })
    const next = rateItem(s, scaleId(E), 'nailed', TODAY)
    for (const id of idsForScale(D)) expect(item(next, id)).toBe(item(s, id))
  })

  it('rating a recall or chords item introduces only that item', () => {
    const s = placed({ [scaleId(E)]: 'unknown' })
    const next = rateItem(s, chordsId(E), 'shaky', TODAY)
    expect(item(next, chordsId(E)).introduced).toBe(true)
    expect(item(next, scaleId(E)).introduced).toBe(false)
    expect(item(next, recallId('spell', E)).introduced).toBe(false)
  })
})

describe('sessionMinutes', () => {
  it('rounds to whole minutes, at least 1', () => {
    expect(sessionMinutes(0, 10_000)).toBe(1)
    expect(sessionMinutes(0, 89_000)).toBe(1)
    expect(sessionMinutes(0, 90_000)).toBe(2)
    expect(sessionMinutes(1_000, 1_000 + 12 * 60_000 + 20_000)).toBe(12)
  })
})

describe('logCompletedSession', () => {
  it('appends a completed entry for today, so the streak counts the day', () => {
    const s = placed({})
    const next = logCompletedSession(s, 7, TODAY)
    expect(next.log).toEqual([{ date: TODAY, minutes: 7, completed: true }])
    expect(streak(next.log, TODAY)).toBe(1)
    expect(s.log).toEqual([])
  })
})
