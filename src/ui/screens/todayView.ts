// Pure view model for the Today screen (no Preact, no window): unit tested in node.
import { buildSession, estimateSeconds } from '../../session/builder'
import type { Step } from '../../session/builder'
import { scaleId, stateFor } from '../../srs/items'
import type { Settings } from '../../srs/items'
import type { ItemState } from '../../srs/scheduler'
import type { SessionLog } from '../../store/storage'
import { streak } from '../../store/streak'
import { formatScale } from '../../theory/format'

export interface TodayScale {
  label: string
  /** Never practised (marked "don't know" at placement, or a newly enabled form). */
  isNew: boolean
  /** Its chord set follows it in this session. */
  withChords: boolean
}

export interface TodaySummary {
  steps: Step[]
  /** Every enabled scale has already been rated today: nothing to start. */
  done: boolean
  /** A session was completed today; more practice is still on offer while `done` is false. */
  doneToday: boolean
  streak: number
  streakLabel: string
  minutes: number
  scales: TodayScale[]
  recallCards: number
  chordSets: number
  freeplayMinutes: number
}

export function streakLabel(days: number): string {
  return days === 0 ? 'Start a streak today' : `${days}-day streak`
}

/** Everything the Today screen shows, derived fresh from app state (nothing cached). */
export function todaySummary(
  items: Record<string, ItemState>,
  settings: Settings,
  today: string,
  log: SessionLog[],
): TodaySummary {
  const steps = buildSession(items, settings, today)
  const chordKeys = new Set(steps.flatMap((s) => (s.kind === 'chords' ? [scaleId(s.ref)] : [])))
  const scales: TodayScale[] = steps.flatMap((s) =>
    s.kind === 'scale'
      ? [
          {
            label: formatScale(s.ref),
            isNew: !stateFor(s.itemId, items, today, settings).introduced,
            withChords: chordKeys.has(scaleId(s.ref)),
          },
        ]
      : [],
  )
  const days = streak(log, today)
  const freeplaySeconds = steps.reduce((t, s) => t + (s.kind === 'freeplay' ? s.seconds : 0), 0)
  return {
    steps,
    done: steps.length === 0,
    doneToday: log.some((e) => e.completed && e.date === today),
    streak: days,
    streakLabel: streakLabel(days),
    minutes: Math.ceil(estimateSeconds(steps) / 60),
    scales,
    recallCards: steps.reduce((n, s) => n + (s.kind === 'deck' ? s.cards.length : 0), 0),
    chordSets: chordKeys.size,
    freeplayMinutes: Math.ceil(freeplaySeconds / 60),
  }
}
