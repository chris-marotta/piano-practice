import { describe, expect, it } from 'vitest'
import { BOX_INTERVAL_DAYS, applyRating, nextTempo, type ItemState } from '../../src/srs/scheduler'

const base: ItemState = {
  id: 'scale:E:major', introduced: true, box: 2, support: 1, levelStreak: 0,
  due: '2026-10-20', tempo: 60, history: [],
}
const T = '2026-10-20'

describe('BOX_INTERVAL_DAYS', () => {
  it('matches spec', () => {
    expect(BOX_INTERVAL_DAYS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 })
  })
})

describe('applyRating', () => {
  it('nailed advances box, schedules, bumps tempo and streak', () => {
    expect(applyRating(base, 'nailed', T)).toMatchObject({ box: 3, due: '2026-10-24', levelStreak: 1, support: 1, tempo: 68 })
  })
  it('nailed twice at a level raises support and resets streak', () => {
    expect(applyRating({ ...base, levelStreak: 1 }, 'nailed', T)).toMatchObject({ support: 2, levelStreak: 0 })
  })
  it('caps box and support at max', () => {
    expect(applyRating({ ...base, box: 5, support: 3, levelStreak: 1 }, 'nailed', T)).toMatchObject({ box: 5, support: 3, due: '2026-11-05' })
  })
  it('shaky keeps box, due tomorrow, resets streak, keeps tempo', () => {
    expect(applyRating({ ...base, levelStreak: 1 }, 'shaky', T)).toMatchObject({ box: 2, due: '2026-10-21', levelStreak: 0, tempo: 60, support: 1 })
  })
  it('lost resets to box 1, lowers support and tempo', () => {
    expect(applyRating(base, 'lost', T)).toMatchObject({ box: 1, due: '2026-10-21', support: 0, tempo: 52, levelStreak: 0 })
  })
  it('support floors at 0', () => {
    expect(applyRating({ ...base, support: 0 }, 'lost', T).support).toBe(0)
  })
  it('peeked caps nailed at shaky everywhere, incl. history', () => {
    const r = applyRating({ ...base, levelStreak: 1 }, 'nailed', T, { peeked: true })
    expect(r).toMatchObject({ box: 2, due: '2026-10-21', levelStreak: 0, support: 1, tempo: 60 })
    expect(r.history).toEqual([{ date: T, rating: 'shaky' }])
  })
  it('peeked does not soften lost', () => {
    expect(applyRating(base, 'lost', T, { peeked: true })).toMatchObject({ box: 1, tempo: 52 })
  })
  it('sets introduced', () => {
    expect(applyRating({ ...base, introduced: false }, 'shaky', T).introduced).toBe(true)
  })
  it('appends history', () => {
    const s = { ...base, history: [{ date: '2026-10-19', rating: 'lost' as const }] }
    expect(applyRating(s, 'nailed', T).history).toEqual([
      { date: '2026-10-19', rating: 'lost' }, { date: T, rating: 'nailed' },
    ])
  })
  it('non-scale items leave support/levelStreak/tempo untouched', () => {
    const card: ItemState = { ...base, id: 'recall:keysig:E:major', tempo: undefined }
    const n = applyRating(card, 'nailed', T)
    expect(n).toMatchObject({ box: 3, support: 1, levelStreak: 0 })
    expect(n.tempo).toBeUndefined()
    expect(applyRating({ ...card, levelStreak: 1 }, 'nailed', T).levelStreak).toBe(1)
    expect(applyRating(card, 'lost', T)).toMatchObject({ box: 1, support: 1 })
  })
  it('is pure: does not mutate input or its history', () => {
    const s: ItemState = { ...base, history: [{ date: '2026-10-19', rating: 'shaky' }] }
    const snapshot = JSON.parse(JSON.stringify(s))
    const out = applyRating(s, 'nailed', T)
    expect(s).toEqual(snapshot)
    expect(s.history).toHaveLength(1)
    expect(out).not.toBe(s)
    expect(out.history).not.toBe(s.history)
  })
})

describe('nextTempo', () => {
  it('caps and floors', () => {
    expect(nextTempo(116, 'nailed')).toBe(120)
    expect(nextTempo(44, 'lost')).toBe(40)
    expect(nextTempo(60, 'shaky')).toBe(60)
    expect(nextTempo(60, 'nailed')).toBe(68)
    expect(nextTempo(60, 'lost')).toBe(52)
  })
})
