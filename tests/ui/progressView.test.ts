import { describe, expect, it } from 'vitest'
import {
  MASTERY_LEGEND,
  calendarWeeks,
  formatMinutes,
  masteryColumns,
  masteryRows,
  progressStats,
} from '../../src/ui/screens/progressView'
import { DEFAULT_SETTINGS, enabledScales, placeItems, scaleId } from '../../src/srs/items'
import type { Placement, Settings } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'
import type { SessionLog } from '../../src/store/storage'
import { MAJOR_ROOTS, MINOR_ROOTS } from '../../src/theory/scales'

const TODAY = '2026-10-20' // a Tuesday

const placeAll = (choice: Placement, settings: Settings = DEFAULT_SETTINGS): Record<string, ItemState> =>
  placeItems(Object.fromEntries(enabledScales(settings).map((r) => [scaleId(r), choice])), settings, TODAY)

const withForms = (natural: boolean, harmonic: boolean, melodic: boolean): Settings => ({
  ...DEFAULT_SETTINGS,
  minorForms: { natural, harmonic, melodic },
})

describe('masteryColumns', () => {
  it('matches the placement columns: major then each enabled minor form', () => {
    expect(masteryColumns(DEFAULT_SETTINGS).map((c) => c.label)).toEqual(['Major', 'Natural minor'])
    expect(masteryColumns(withForms(false, false, false)).map((c) => c.form)).toEqual(['major'])
  })
})

describe('masteryRows', () => {
  it('has 12 rows; row i pairs MAJOR_ROOTS[i] major with MINOR_ROOTS[i] minor', () => {
    const rows = masteryRows(placeAll('shaky'), DEFAULT_SETTINGS, TODAY)
    expect(rows).toHaveLength(12)
    rows.forEach((row, i) => {
      expect(row.map((c) => c.id)).toEqual([
        `scale:${MAJOR_ROOTS[i]}:major`,
        `scale:${MINOR_ROOTS[i]}:natural`,
      ])
    })
    expect(rows[6]?.map((c) => c.label)).toEqual(['F♯ major', 'E♭ natural minor'])
    // The column names the form, so a cell shows just its root.
    expect(rows[6]?.map((c) => c.root)).toEqual(['F♯', 'E♭'])
  })

  it('shades by box and marks support for introduced scales', () => {
    const items = placeAll('solid')
    const c = items['scale:C:major'] as ItemState
    items['scale:C:major'] = { ...c, box: 5, support: 3 }
    const rows = masteryRows(items, DEFAULT_SETTINGS, TODAY)
    const cMajor = rows[0]?.[0]
    expect(cMajor).toMatchObject({ introduced: true, box: 5, support: 3, shade: 5, supportLabel: 'L3' })
    const gMajor = rows[1]?.[0]
    expect(gMajor).toMatchObject({ introduced: true, box: 3, support: 2, shade: 3, supportLabel: 'L2' })
  })

  it('a shaky placement is box 1, L0 (shade 1)', () => {
    const cell = masteryRows(placeAll('shaky'), DEFAULT_SETTINGS, TODAY)[0]?.[0]
    expect(cell).toMatchObject({ introduced: true, shade: 1, supportLabel: 'L0' })
  })

  it("never-introduced scales get shade 0 and no support mark (outline only)", () => {
    const cell = masteryRows(placeAll('unknown'), DEFAULT_SETTINGS, TODAY)[0]?.[0]
    expect(cell).toMatchObject({ introduced: false, shade: 0, supportLabel: null })
  })

  it('RF4: a minor form enabled after placement shows as not-started cells (no stored state, no crash)', () => {
    const items = placeAll('solid') // placed with natural minor only
    const settings = withForms(true, true, false)
    const rows = masteryRows(items, settings, TODAY)
    expect(rows[0]?.map((c) => c.id)).toEqual(['scale:C:major', 'scale:A:natural', 'scale:A:harmonic'])
    const harmonic = rows.map((r) => r[2])
    expect(harmonic.every((c) => c?.introduced === false && c.shade === 0)).toBe(true)
    // Existing cells keep their state.
    expect(rows[0]?.[1]).toMatchObject({ introduced: true, shade: 3 })
  })

  it('describes each cell in words for screen readers', () => {
    const items = placeAll('solid')
    const rows = masteryRows(items, DEFAULT_SETTINGS, TODAY)
    expect(rows[0]?.[0]?.description).toBe('C major: box 3 of 5, support L2')
    const unknown = masteryRows(placeAll('unknown'), DEFAULT_SETTINGS, TODAY)
    expect(unknown[0]?.[0]?.description).toBe('C major: not started')
  })
})

describe('MASTERY_LEGEND', () => {
  it('lists boxes 1 to 5 in order', () => {
    expect(MASTERY_LEGEND.map((l) => l.shade)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('calendarWeeks', () => {
  const log: SessionLog[] = [
    { date: '2026-10-20', minutes: 10, completed: true },
    { date: '2026-10-18', minutes: 5, completed: true },
    { date: '2026-10-17', minutes: 4, completed: false }, // partial: not a practiced day
    { date: '2026-08-26', minutes: 10, completed: true }, // first day in the 56-day window
    { date: '2026-08-25', minutes: 10, completed: true }, // one day before the window
  ]

  it('is 8 rows of 7 days, oldest top-left, today bottom-right', () => {
    const { weeks } = calendarWeeks(log, TODAY)
    expect(weeks).toHaveLength(8)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0]?.[0]?.date).toBe('2026-08-26')
    expect(weeks[7]?.[6]?.date).toBe(TODAY)
    expect(weeks.flat().filter((d) => d.isToday).map((d) => d.date)).toEqual([TODAY])
  })

  it('marks completed days only, within the window', () => {
    const practiced = calendarWeeks(log, TODAY)
      .weeks.flat()
      .filter((d) => d.practiced)
      .map((d) => d.date)
    expect(practiced).toEqual(['2026-08-26', '2026-10-18', '2026-10-20'])
  })

  it('weekday headers start on the oldest day (columns keep one weekday each)', () => {
    // 2026-08-26 is a Wednesday, so today (Tuesday) closes each row.
    expect(calendarWeeks([], TODAY).weekdays).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'])
  })

  it('gives each day its day of month and a spoken label', () => {
    const last = calendarWeeks(log, TODAY).weeks[7]?.[6]
    expect(last?.dayOfMonth).toBe(20)
    expect(last?.label).toBe('Tuesday 20 October 2026, practiced, today')
    const missed = calendarWeeks(log, TODAY).weeks[7]?.[5]
    expect(missed?.label).toBe('Monday 19 October 2026, not practiced')
  })

  it('crosses a month boundary as calendar days', () => {
    const days = calendarWeeks([], '2026-03-02').weeks.flat().map((d) => d.date)
    expect(days.slice(-3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
  })
})

describe('formatMinutes', () => {
  it('shows minutes under an hour, hours and minutes above', () => {
    expect(formatMinutes(0)).toBe('0 min')
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(125)).toBe('2 h 5 min')
  })
  it('rounds fractional minutes', () => {
    expect(formatMinutes(9.6)).toBe('10 min')
  })
})

describe('progressStats', () => {
  it('streak, all-time and this-week minutes from completed sessions', () => {
    const log: SessionLog[] = [
      { date: '2026-10-20', minutes: 10, completed: true },
      { date: '2026-10-19', minutes: 12, completed: true },
      { date: '2026-10-19', minutes: 3, completed: false },
      { date: '2026-10-14', minutes: 20, completed: true }, // 6 days ago: this week
      { date: '2026-10-13', minutes: 15, completed: true }, // 7 days ago: not this week
    ]
    expect(progressStats(log, TODAY)).toEqual({
      streak: 2,
      streakLabel: '2-day streak',
      allTime: '57 min',
      thisWeek: '42 min',
      daysPracticed: 4,
    })
  })

  it('empty log', () => {
    expect(progressStats([], TODAY)).toEqual({
      streak: 0,
      streakLabel: 'Start a streak today',
      allTime: '0 min',
      thisWeek: '0 min',
      daysPracticed: 0,
    })
  })
})
