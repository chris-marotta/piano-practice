import { useEffect, useRef, useState } from 'preact/hooks'
import { buildRound, drillLevel, gradeFirstAnswer, type Question } from '../../drill/engine'
import { KEYS_DEF } from '../../drill/keys'
import { midiStatus } from '../../midi/access'
import { stateFor } from '../../srs/items'
import type { Rating } from '../../srs/scheduler'
import { app, today, update } from '../state'
import { levelRose, raisedLevel } from './drillView'

export interface DrillSetup {
  questions: Question[]
  level: 1 | 2 | 3 | 4
  /** The level rose since the last round: show "Level {n} unlocked". */
  unlocked: boolean
}

/**
 * One name-that-key round for a screen, shared by the session's drill step and Play's Keys mode. The round is built on
 * mount, so it uses the MIDI state of the moment (all 'play' questions with a keyboard connected, else name / tap
 * alternating); mount it afresh (a `key`) for each round. The level reached is remembered as `lastDrillLevel` (it only
 * ever rises). `onAnswer` is DrillRound's: it grades each key's first answer only (gradeFirstAnswer) and hands the
 * rating to `onRate`.
 */
export function useDrillRound(
  count: number,
  where: 'session' | 'play',
  onRate: (itemId: string, rating: Rating) => void,
): { setup: DrillSetup; onAnswer: (q: Question, correct: boolean, ms: number) => void } {
  const [setup] = useState<DrillSetup>(() => {
    const { items, settings } = app.peek()
    const day = today()
    const level = drillLevel(KEYS_DEF, items, day, settings) as 1 | 2 | 3 | 4
    const questions = buildRound(KEYS_DEF, items, day, settings, {
      count,
      midi: midiStatus.peek().kind === 'connected',
      rng: Math.random,
    })
    return { questions, level, unlocked: levelRose(level, settings.lastDrillLevel) }
  })
  useEffect(() => {
    const last = app.peek().settings.lastDrillLevel
    const level = raisedLevel(setup.level, last)
    if (level > last) update((s) => ({ ...s, settings: { ...s.settings, lastDrillLevel: raisedLevel(level, s.settings.lastDrillLevel) } }))
  }, [])
  // Keys already answered this round: a key that comes round again (small pools cycle) is not graded twice.
  const answered = useRef(new Set<string>())
  const onRateRef = useRef(onRate)
  onRateRef.current = onRate

  const onAnswer = (q: Question, correct: boolean, ms: number) => {
    const { items, settings } = app.peek()
    const day = today()
    const rating = gradeFirstAnswer(KEYS_DEF, q, answered.current, stateFor(q.itemId, items, day, settings), day, where, correct, ms, setup.level)
    if (rating) onRateRef.current(q.itemId, rating)
  }
  return { setup, onAnswer }
}
