import { addDays } from './dates'

export type Rating = 'nailed' | 'shaky' | 'lost'

export interface ItemState {
  id: string
  introduced: boolean
  box: 1 | 2 | 3 | 4 | 5
  support: 0 | 1 | 2 | 3
  levelStreak: number
  due: string
  tempo?: number
  history: { date: string; rating: Rating }[]
}

export const BOX_INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 } as const

export const TEMPO_START = 60
const TEMPO_STEP = 8
const TEMPO_MAX = 120
const TEMPO_MIN = 40

export function nextTempo(tempo: number, rating: Rating): number {
  if (rating === 'nailed') return Math.min(TEMPO_MAX, tempo + TEMPO_STEP)
  if (rating === 'lost') return Math.max(TEMPO_MIN, tempo - TEMPO_STEP)
  return tempo
}

const clampSupport = (n: number): 0 | 1 | 2 | 3 => Math.max(0, Math.min(3, n)) as 0 | 1 | 2 | 3

export function applyRating(
  s: ItemState,
  rating: Rating,
  today: string,
  opts?: { peeked?: boolean },
): ItemState {
  const eff: Rating = opts?.peeked && rating === 'nailed' ? 'shaky' : rating

  let box = s.box
  let due: string
  if (eff === 'nailed') {
    box = Math.min(5, s.box + 1) as ItemState['box']
    due = addDays(today, BOX_INTERVAL_DAYS[box])
  } else if (eff === 'shaky') {
    due = addDays(today, 1)
  } else {
    box = 1
    due = addDays(today, 1)
  }

  const next: ItemState = {
    ...s,
    introduced: true,
    box,
    due,
    history: [...s.history, { date: today, rating: eff }],
  }

  if (s.id.startsWith('scale:')) {
    if (eff === 'nailed') {
      const streak = s.levelStreak + 1
      if (streak >= 2) {
        next.support = clampSupport(s.support + 1)
        next.levelStreak = 0
      } else {
        next.levelStreak = streak
      }
    } else if (eff === 'shaky') {
      next.levelStreak = 0
    } else {
      next.support = clampSupport(s.support - 1)
      next.levelStreak = 0
    }
    next.tempo = nextTempo(s.tempo ?? TEMPO_START, eff)
  }

  return next
}
