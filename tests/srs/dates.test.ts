import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, localDate } from '../../src/srs/dates'

describe('dates', () => {
  it('localDate uses local calendar date, not UTC', () => {
    expect(localDate(new Date(2026, 9, 20, 23, 30))).toBe('2026-10-20')
    expect(localDate(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-20', 0)).toBe('2026-10-20')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('daysBetween is b - a', () => {
    expect(daysBetween('2026-10-20', '2026-10-25')).toBe(5)
    expect(daysBetween('2026-10-25', '2026-10-20')).toBe(-5)
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0)
  })
  it('daysBetween is correct across DST changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1)
  })
})
