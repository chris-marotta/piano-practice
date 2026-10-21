import { describe, expect, it } from 'vitest'
import { minutesTotals, practicedDays, streak } from '../../src/store/streak'

const log = [
  { date: '2026-10-18', minutes: 10, completed: true },
  { date: '2026-10-19', minutes: 5, completed: true },
  { date: '2026-10-20', minutes: 3, completed: false },
]

describe('streak', () => {
  it('counts consecutive completed days ending yesterday when today has none completed', () => {
    expect(streak(log, '2026-10-20')).toBe(2)
  })
  it('is 0 when neither today nor yesterday has a completed session', () => {
    expect(streak(log, '2026-10-21')).toBe(0)
    expect(streak([], '2026-10-20')).toBe(0)
  })
  it('includes today when completed', () => {
    expect(streak([...log, { date: '2026-10-20', minutes: 8, completed: true }], '2026-10-20')).toBe(3)
  })
  it('multiple sessions on one day count once', () => {
    const l = [
      { date: '2026-10-19', minutes: 5, completed: true },
      { date: '2026-10-19', minutes: 5, completed: true },
      { date: '2026-10-20', minutes: 5, completed: true },
    ]
    expect(streak(l, '2026-10-20')).toBe(2)
  })
  it('a gap ends the streak', () => {
    const l = [
      { date: '2026-10-15', minutes: 5, completed: true },
      { date: '2026-10-16', minutes: 5, completed: true },
      { date: '2026-10-19', minutes: 5, completed: true },
      { date: '2026-10-20', minutes: 5, completed: true },
    ]
    expect(streak(l, '2026-10-20')).toBe(2)
  })
  it('is order independent and ignores incomplete days', () => {
    const l = [
      { date: '2026-10-20', minutes: 5, completed: true },
      { date: '2026-10-19', minutes: 5, completed: false },
      { date: '2026-10-18', minutes: 5, completed: true },
    ]
    expect(streak(l, '2026-10-20')).toBe(1)
  })
  it('works across month and year boundaries', () => {
    const l = [
      { date: '2026-12-31', minutes: 5, completed: true },
      { date: '2027-01-01', minutes: 5, completed: true },
    ]
    expect(streak(l, '2027-01-01')).toBe(2)
  })
})

describe('minutesTotals', () => {
  it('counts completed sessions only', () => {
    expect(minutesTotals(log, '2026-10-20')).toEqual({ allTime: 15, thisWeek: 15 })
  })
  it('week is the last 7 days including today', () => {
    const l = [
      { date: '2026-10-13', minutes: 100, completed: true }, // 7 days ago: outside
      { date: '2026-10-14', minutes: 7, completed: true }, // 6 days ago: inside
      { date: '2026-10-20', minutes: 3, completed: true },
    ]
    expect(minutesTotals(l, '2026-10-20')).toEqual({ allTime: 110, thisWeek: 10 })
  })
  it('ignores future-dated entries for thisWeek', () => {
    const l = [{ date: '2026-10-25', minutes: 9, completed: true }]
    expect(minutesTotals(l, '2026-10-20').thisWeek).toBe(0)
  })
  it('empty log', () => {
    expect(minutesTotals([], '2026-10-20')).toEqual({ allTime: 0, thisWeek: 0 })
  })
})

describe('practicedDays', () => {
  it('returns 56 days oldest to newest ending today by default', () => {
    const d = practicedDays(log, '2026-10-20')
    expect(d).toHaveLength(56)
    expect(d[55]).toEqual({ date: '2026-10-20', practiced: false })
    expect(d[54]).toEqual({ date: '2026-10-19', practiced: true })
    expect(d[53]).toEqual({ date: '2026-10-18', practiced: true })
    expect(d[0]!.date).toBe('2026-08-26')
  })
  it('honours a custom length', () => {
    expect(practicedDays(log, '2026-10-20', 3).map((x) => x.date)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20'])
  })
  it('only completed sessions mark a day practiced', () => {
    expect(practicedDays(log, '2026-10-20', 1)).toEqual([{ date: '2026-10-20', practiced: false }])
  })
})
