// Writing session results into app state. Pure: callers pass the state in and save what comes back.
import { localDate } from '../srs/dates'
import { idsForScale, parseId, parseKeyId, parseStaffId, stateFor } from '../srs/items'
import { applyRating, type Rating } from '../srs/scheduler'
import type { AppState } from '../store/storage'

/**
 * Apply one rating to the stored state (creating it if missing). When the rated item is a
 * scale that had never been introduced, its recall cards and chord set become introduced too,
 * keeping their box, due date and history: they enter sessions from now on as scheduled.
 */
export function rateItem(
  state: AppState,
  id: string,
  rating: Rating,
  today: string,
  opts?: { peeked?: boolean },
): AppState {
  const prior = stateFor(id, state.items, today, state.settings)
  const items = {
    ...state.items,
    [id]: applyRating(prior, rating, today, { ...opts, startTempo: state.settings.startTempo }),
  }
  if (parseKeyId(id) !== null || parseStaffId(id) !== null) return { ...state, items } // key and staff items have no siblings to introduce
  const parsed = parseId(id)
  if (parsed.kind === 'scale' && !prior.introduced) {
    for (const sibling of idsForScale(parsed.ref)) {
      if (sibling === id) continue
      const s = stateFor(sibling, items, today, state.settings)
      if (!s.introduced) items[sibling] = { ...s, introduced: true }
    }
  }
  return { ...state, items }
}

/** Whole minutes between start and finish, at least 1. */
export function sessionMinutes(startedAt: number, now: number): number {
  return Math.max(1, Math.round((now - startedAt) / 60000))
}

/** The local date a session started: a session finished after midnight logs the day it began. */
export function sessionDate(startedAt: number): string {
  return localDate(new Date(startedAt))
}

/** Append a completed session to the log (this is what counts the day for the streak). */
export function logCompletedSession(state: AppState, minutes: number, today: string): AppState {
  return { ...state, log: [...state.log, { date: today, minutes, completed: true }] }
}
