// Pure view model for the Progress screen (no Preact, no window): unit tested in node.
import { LEVEL_NAMES } from '../../drill/keys'
import { keyId, stateFor } from '../../srs/items'
import type { Settings } from '../../srs/items'
import type { ItemState } from '../../srs/scheduler'
import type { SessionLog } from '../../store/storage'
import { minutesTotals, practicedDays, streak } from '../../store/streak'
import { formatNote } from '../../theory/format'
import { keyLabel } from '../../theory/keyNames'
import { formatDay, weekdayShort } from '../formatDate'
import { placementColumns, placementRows } from './placementGrid'
import type { GridColumn } from './placementGrid'
import { streakLabel } from './todayView'

export interface MasteryCell {
  id: string
  /** Full scale name, e.g. 'E♭ natural minor'. */
  label: string
  /** Root only ('E♭'): the column already names the form. */
  root: string
  introduced: boolean
  box: number
  support: number
  /** 0 = never introduced (outline only); 1–5 = the scale's Leitner box. */
  shade: 0 | 1 | 2 | 3 | 4 | 5
  /** 'L0'–'L3', or null for a scale not started yet. */
  supportLabel: string | null
  /** The cell in words, for screen readers and the tooltip. */
  description: string
}

/** Same columns as placement: major, then each enabled minor form. */
export function masteryColumns(settings: Settings): GridColumn[] {
  return placementColumns(settings)
}

/**
 * Same 12 rows as placement (row i = MAJOR_ROOTS[i] major beside MINOR_ROOTS[i] minor). A scale
 * with no stored state (a form enabled after placement) reads as fresh: not introduced.
 */
export function masteryRows(items: Record<string, ItemState>, settings: Settings, today: string): MasteryCell[][] {
  return placementRows(settings).map((row) =>
    row.map((cell) => {
      const s = stateFor(cell.id, items, today, settings)
      const shade = (s.introduced ? s.box : 0) as MasteryCell['shade']
      return {
        id: cell.id,
        label: cell.label,
        root: formatNote(cell.ref.root),
        introduced: s.introduced,
        box: s.box,
        support: s.support,
        shade,
        supportLabel: s.introduced ? `L${s.support}` : null,
        description: s.introduced
          ? `${cell.label}: box ${s.box} of 5, support L${s.support}`
          : `${cell.label}: not started`,
      }
    }),
  )
}

export interface KeyCell {
  pc: number
  /** 'E', or 'G♯ / A♭' for a black key. */
  label: string
  /** The key's Leitner box (1-5), or null for a key not introduced yet (the empty look). */
  box: 1 | 2 | 3 | 4 | 5 | null
  /** The cell in words, for screen readers and the tooltip. */
  description: string
}

/** The Keys row: the 12 name-that-key items, C to B, shaded by box like the scale grid. */
export function keyCells(items: Record<string, ItemState>, today: string, settings: Settings): KeyCell[] {
  return Array.from({ length: 12 }, (_, pc) => {
    const s = stateFor(keyId(pc), items, today, settings)
    const label = keyLabel(pc)
    return {
      pc,
      label,
      box: s.introduced ? s.box : null,
      description: s.introduced ? `Key ${label}: box ${s.box} of 5` : `Key ${label}: not started`,
    }
  })
}

/** The line under the Keys row: where the name-that-key ladder stands. */
export function keysLevelText(level: 1 | 2 | 3 | 4): string {
  return `Level ${level} of 4 · ${LEVEL_NAMES[level]}`
}

export const MASTERY_LEGEND: { shade: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { shade: 1, label: 'Box 1' },
  { shade: 2, label: 'Box 2' },
  { shade: 3, label: 'Box 3' },
  { shade: 4, label: 'Box 4' },
  { shade: 5, label: 'Box 5' },
]

export interface CalendarDay {
  date: string
  practiced: boolean
  isToday: boolean
  dayOfMonth: number
  label: string
}

const WEEKS = 8

/**
 * The last 8 weeks (56 days) as 8 rows of 7, oldest top-left, today bottom-right. Columns follow
 * the window rather than the calendar week, so each column is one weekday, named in `weekdays`.
 */
export function calendarWeeks(log: SessionLog[], today: string): { weekdays: string[]; weeks: CalendarDay[][] } {
  const days = practicedDays(log, today, WEEKS * 7).map(({ date, practiced }) => {
    const isToday = date === today
    const parts = [formatDay(date), practiced ? 'practiced' : 'not practiced']
    if (isToday) parts.push('today')
    return { date, practiced, isToday, dayOfMonth: Number(date.slice(8, 10)), label: parts.join(', ') }
  })
  const weeks = Array.from({ length: WEEKS }, (_, w) => days.slice(w * 7, w * 7 + 7))
  const weekdays = (weeks[0] ?? []).map((d) => weekdayShort(d.date))
  return { weekdays, weeks }
}

/** 45 -> '45 min', 60 -> '1 h', 125 -> '2 h 5 min'. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export interface ProgressStats {
  streak: number
  streakLabel: string
  allTime: string
  thisWeek: string
  /** Distinct days with a completed session, all time. */
  daysPracticed: number
}

export function progressStats(log: SessionLog[], today: string): ProgressStats {
  const days = streak(log, today)
  const totals = minutesTotals(log, today)
  return {
    streak: days,
    streakLabel: streakLabel(days),
    allTime: formatMinutes(totals.allTime),
    thisWeek: formatMinutes(totals.thisWeek),
    daysPracticed: new Set(log.filter((e) => e.completed).map((e) => e.date)).size,
  }
}
