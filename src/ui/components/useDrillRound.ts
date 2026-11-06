import { useEffect, useRef, useState } from 'preact/hooks'
import { buildRound, drillLevel, gradeFirstAnswer, practiceOnly, reachedLevel, type DrillDef, type Question } from '../../drill/engine'
import { midiStatus } from '../../midi/access'
import { stateFor } from '../../srs/items'
import type { Rating } from '../../srs/scheduler'
import { app, today, update } from '../state'
import { levelRose, raisedLevel } from './drillView'

export interface DrillSetup {
  questions: Question[]
  /** The level this round drills: the picked one, else the unlocked one. */
  level: number
  /** The highest level unlocked (what the ratings give). */
  reached: number
  /** A picked level above `reached`: nothing is graded. */
  practice: boolean
  /** The level rose since the last round: show "Level {n} unlocked". */
  unlocked: boolean
}

/**
 * One drill round for a screen, shared by the session's drill step and Play's drill mode. The round is built on
 * mount, so it uses the MIDI state of the moment (all 'play' questions with a keyboard connected, else name / tap
 * alternating); mount it afresh (a `key`) for each round. The level reached is remembered in `settings[def.levelSetting]`
 * (it only ever rises). `onAnswer` is DrillRound's: it grades each key's first answer only (gradeFirstAnswer) and hands the
 * rating to `onRate`. `pick` (Play's level picker) drills that level instead, locked or not; above the unlocked level
 * it is practice only (practiceOnly): nothing is graded and the level reached isn't raised. `tonic` (Ear) is the round's key,
 handed to buildRound (used from EAR_KEY_LEVEL on).
 */
export function useDrillRound(
  def: DrillDef,
  count: number,
  where: 'session' | 'play',
  onRate: (itemId: string, rating: Rating) => void,
  pick: number | null = null,
  tonic?: string,
): { setup: DrillSetup; onAnswer: (q: Question, correct: boolean, ms: number) => void } {
  const [setup] = useState<DrillSetup>(() => {
    const { items, settings } = app.peek()
    const day = today()
    const reached = drillLevel(def, items, day, settings)
    const questions = buildRound(def, items, day, settings, {
      count,
      midi: midiStatus.peek().kind === 'connected',
      rng: Math.random,
      ...(pick === null ? {} : { level: pick }),
      ...(tonic === undefined ? {} : { tonic }),
    })
    return {
      questions,
      level: pick ?? reached,
      reached,
      practice: practiceOnly(pick, reached),
      unlocked: levelRose(reached, reachedLevel(def, settings)),
    }
  })
  useEffect(() => {
    const last = reachedLevel(def, app.peek().settings)
    const level = raisedLevel(setup.reached, last)
    if (level > last) {
      update((s) => ({ ...s, settings: { ...s.settings, [def.levelSetting]: raisedLevel(level, reachedLevel(def, s.settings)) } }))
    }
  }, [])
  // Keys already answered this round: a key that comes round again (small pools cycle) is not graded twice.
  const answered = useRef(new Set<string>())
  const onRateRef = useRef(onRate)
  onRateRef.current = onRate

  const onAnswer = (q: Question, correct: boolean, ms: number) => {
    if (setup.practice) return
    const { items, settings } = app.peek()
    const day = today()
    const rating = gradeFirstAnswer(def, q, answered.current, stateFor(q.itemId, items, day, settings), day, where, correct, ms, setup.level)
    if (rating) onRateRef.current(q.itemId, rating)
  }
  return { setup, onAnswer }
}
