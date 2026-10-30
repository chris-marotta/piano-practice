import { useEffect, useRef, useState } from 'preact/hooks'
import { drillLevel } from '../../../drill/levels'
import { buildRound, gradeAnswer, shouldGrade, type Question } from '../../../drill/round'
import { midiStatus } from '../../../midi/access'
import type { Step } from '../../../session/builder'
import { stateFor } from '../../../srs/items'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import { NEXT_LABEL, levelRose, raisedLevel } from '../../components/drillView'
import { app, today, update } from '../../state'

type DrillStepData = Extract<Step, { kind: 'drill' }>

interface Props {
  step: DrillStepData
  /** Save one key's rating (the session stays on this step). */
  onRate: (itemId: string, r: Rating) => void
  /** After the last question's Next: move on. */
  onDone: () => void
}

interface Setup {
  questions: Question[]
  level: 1 | 2 | 3 | 4
  unlocked: boolean
}

/**
 * The session's name-that-key round, first in the session (spec §6.1). The round is built on mount, so it uses the
 * MIDI state of the moment: all 'play' questions with a keyboard connected, else name / tap alternating. Each key is
 * graded on its first answer in the round only, once a day (shouldGrade), and never on a practice repeat.
 */
export function DrillStep({ step, onRate, onDone }: Props) {
  const [setup] = useState<Setup>(() => {
    const { items, settings } = app.peek()
    const day = today()
    const level = drillLevel(items, day, settings)
    const questions = buildRound(items, day, settings, {
      count: step.count,
      midi: midiStatus.peek().kind === 'connected',
      rng: Math.random,
    })
    return { questions, level, unlocked: levelRose(level, settings.lastDrillLevel) }
  })
  // Remember the highest level reached, so the banner shows once and the level is sticky. It only ever rises.
  useEffect(() => {
    const last = app.peek().settings.lastDrillLevel
    const level = raisedLevel(setup.level, last)
    if (level > last) update((s) => ({ ...s, settings: { ...s.settings, lastDrillLevel: raisedLevel(level, s.settings.lastDrillLevel) } }))
  }, [])
  // Keys already answered this round: a key that comes round again (small pools cycle) is not graded twice.
  const answered = useRef(new Set<string>())

  const onAnswer = (q: Question, correct: boolean, ms: number) => {
    if (q.repeat || answered.current.has(q.itemId)) return
    answered.current.add(q.itemId)
    const { items, settings } = app.peek()
    const day = today()
    if (!shouldGrade(q, stateFor(q.itemId, items, day, settings), day, 'session', correct)) return
    onRate(q.itemId, gradeAnswer(correct, ms, setup.level))
  }

  return (
    <div class="step step--drill">
      <DrillRound
        questions={setup.questions}
        level={setup.level}
        unlocked={setup.unlocked}
        onAnswer={onAnswer}
        onFinish={onDone}
        finishLabel={NEXT_LABEL}
      />
    </div>
  )
}
