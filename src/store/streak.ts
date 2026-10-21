import { addDays, daysBetween } from '../srs/dates'
import type { SessionLog } from './storage'

const completedDates = (log: SessionLog[]): Set<string> =>
  new Set(log.filter((e) => e.completed).map((e) => e.date))

/** Consecutive days with a completed session, ending today (or yesterday if none today). */
export function streak(log: SessionLog[], today: string): number {
  const days = completedDates(log)
  let day = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

/** Completed sessions only. Week = the last 7 days including today. */
export function minutesTotals(log: SessionLog[], today: string): { allTime: number; thisWeek: number } {
  let allTime = 0
  let thisWeek = 0
  for (const e of log) {
    if (!e.completed) continue
    allTime += e.minutes
    const ago = daysBetween(e.date, today)
    if (ago >= 0 && ago <= 6) thisWeek += e.minutes
  }
  return { allTime, thisWeek }
}

/** `days` entries, oldest to newest, ending today. */
export function practicedDays(
  log: SessionLog[],
  today: string,
  days = 56,
): { date: string; practiced: boolean }[] {
  const done = completedDates(log)
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1))
    return { date, practiced: done.has(date) }
  })
}
