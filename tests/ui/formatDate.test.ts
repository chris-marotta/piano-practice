import { describe, expect, it } from 'vitest'
import { formatDay, weekdayShort } from '../../src/ui/formatDate'

describe('formatDay', () => {
  it('spells a local date out in full', () => {
    expect(formatDay('2026-10-20')).toBe('Tuesday 20 October 2026')
    expect(formatDay('2026-01-01')).toBe('Thursday 1 January 2026')
  })
  it('passes anything that is not a date through unchanged', () => {
    expect(formatDay('soon')).toBe('soon')
  })
})

describe('weekdayShort', () => {
  it('three-letter weekday of a local date', () => {
    expect(weekdayShort('2026-10-20')).toBe('Tue')
    expect(weekdayShort('2026-10-25')).toBe('Sun')
  })
})
