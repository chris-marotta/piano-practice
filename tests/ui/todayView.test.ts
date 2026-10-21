import { describe, expect, it } from 'vitest'
import { streakLabel, todaySummary } from '../../src/ui/screens/todayView'
import { buildSession, estimateSeconds } from '../../src/session/builder'
import { DEFAULT_SETTINGS, enabledScales, idsForScale, placeItems, scaleId } from '../../src/srs/items'
import type { Placement, Settings } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'
import type { SessionLog } from '../../src/store/storage'

const TODAY = '2026-10-20'

const placeAll = (choice: Placement, settings: Settings = DEFAULT_SETTINGS): Record<string, ItemState> =>
  placeItems(Object.fromEntries(enabledScales(settings).map((r) => [scaleId(r), choice])), settings, TODAY)

const withMinutes = (sessionMinutes: Settings['sessionMinutes']): Settings => ({ ...DEFAULT_SETTINGS, sessionMinutes })

/** Every item of every enabled scale rated shaky today. */
const allRatedToday = (items: Record<string, ItemState>, settings: Settings): Record<string, ItemState> => {
  const out = { ...items }
  for (const ref of enabledScales(settings))
    for (const id of idsForScale(ref)) {
      const s = out[id] as ItemState
      out[id] = { ...s, due: '2026-10-21', history: [...s.history, { date: TODAY, rating: 'shaky' }] }
    }
  return out
}

describe('streakLabel', () => {
  it('invites a start at 0, counts days otherwise', () => {
    expect(streakLabel(0)).toBe('Start a streak today')
    expect(streakLabel(1)).toBe('1-day streak')
    expect(streakLabel(3)).toBe('3-day streak')
  })
})

describe('todaySummary', () => {
  it('matches buildSession: steps, minutes = ceil(estimate / 60)', () => {
    const items = placeAll('shaky')
    const settings = DEFAULT_SETTINGS
    const s = todaySummary(items, settings, TODAY, [])
    const steps = buildSession(items, settings, TODAY)
    expect(s.steps).toEqual(steps)
    expect(s.minutes).toBe(Math.ceil(estimateSeconds(steps) / 60))
    expect(s.done).toBe(false)
  })

  it('default 10-minute session after an all-Shaky placement: 2 scales, 6 cards, 1 chord set, 9 minutes', () => {
    const s = todaySummary(placeAll('shaky'), DEFAULT_SETTINGS, TODAY, [])
    expect(s.scales.map((x) => x.label)).toEqual(['C major', 'G major'])
    expect(s.recallCards).toBe(6)
    expect(s.chordSets).toBe(1)
    expect(s.freeplayMinutes).toBe(0)
    // 6 × 15 + 2 × 180 + 1 × 90 = 540 s
    expect(s.minutes).toBe(9)
  })

  it('marks which scales have their chord set and which are new', () => {
    const settings = withMinutes(15)
    const items = placeAll('shaky', settings)
    // Only G and D major are due; C major is never-introduced, so it enters as the one new scale.
    for (const [id, st] of Object.entries(items))
      if (!/:(G|D):major$/.test(id)) items[id] = { ...st, due: '2026-10-21' }
    const unknown = placeItems({ 'scale:C:major': 'unknown' }, settings, TODAY)
    for (const id of idsForScale({ root: 'C', form: 'major' })) items[id] = unknown[id] as ItemState
    const s = todaySummary(items, settings, TODAY, [])
    expect(s.scales).toEqual([
      { label: 'G major', isNew: false, withChords: true },
      { label: 'D major', isNew: false, withChords: true },
      { label: 'C major', isNew: true, withChords: false },
    ])
    expect(s.chordSets).toBe(2)
  })

  it('20 minutes includes 2 minutes of free play', () => {
    const settings = withMinutes(20)
    const s = todaySummary(placeAll('shaky', settings), settings, TODAY, [])
    expect(s.freeplayMinutes).toBe(2)
    expect(s.scales).toHaveLength(4)
    // 10 × 15 + 4 × 180 + 2 × 90 + 120 = 1170 s
    expect(s.minutes).toBe(20)
  })

  it('re-derives when the session length changes', () => {
    const items = placeAll('shaky')
    expect(todaySummary(items, withMinutes(5), TODAY, []).scales).toHaveLength(1)
    expect(todaySummary(items, withMinutes(15), TODAY, []).scales).toHaveLength(3)
  })

  it('reports the streak from the log', () => {
    const log: SessionLog[] = [
      { date: '2026-10-18', minutes: 10, completed: true },
      { date: '2026-10-19', minutes: 10, completed: true },
    ]
    const s = todaySummary(placeAll('shaky'), DEFAULT_SETTINGS, TODAY, log)
    expect(s.streak).toBe(2)
    expect(s.streakLabel).toBe('2-day streak')
    expect(todaySummary(placeAll('shaky'), DEFAULT_SETTINGS, TODAY, []).streakLabel).toBe('Start a streak today')
  })

  it('is done for today when every enabled scale was rated today', () => {
    const items = allRatedToday(placeAll('shaky'), DEFAULT_SETTINGS)
    const s = todaySummary(items, DEFAULT_SETTINGS, TODAY, [{ date: TODAY, minutes: 10, completed: true }])
    expect(s.done).toBe(true)
    expect(s.steps).toEqual([])
    expect(s.minutes).toBe(0)
    expect(s.scales).toEqual([])
    expect(s.streak).toBe(1)
  })

  it('handles an empty item store (e.g. a newly enabled form) without crashing', () => {
    const s = todaySummary({}, DEFAULT_SETTINGS, TODAY, [])
    expect(s.done).toBe(false)
    expect(s.scales).toHaveLength(1) // only the one new scale per session
    expect(s.scales[0]?.isNew).toBe(true)
  })
})
