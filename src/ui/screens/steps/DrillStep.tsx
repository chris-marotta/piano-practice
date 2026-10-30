import type { Step } from '../../../session/builder'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import { NEXT_LABEL } from '../../components/drillView'
import { useDrillRound } from '../../components/useDrillRound'

type DrillStepData = Extract<Step, { kind: 'drill' }>

interface Props {
  step: DrillStepData
  /** Save one key's rating (the session stays on this step). */
  onRate: (itemId: string, r: Rating) => void
  /** After the last question's Next: move on. */
  onDone: () => void
}

/**
 * The session's name-that-key round, first in the session (spec §6.1). Each key is graded on its first answer in the
 * round only, once a day (useDrillRound), and never on a practice repeat.
 */
export function DrillStep({ step, onRate, onDone }: Props) {
  const { setup, onAnswer } = useDrillRound(step.count, 'session', onRate)
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
