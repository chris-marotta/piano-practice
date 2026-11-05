import type { DrillDef } from '../../../drill/engine'
import type { Step } from '../../../session/builder'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import type { DrillUi } from '../../components/drillUi'
import { NEXT_LABEL } from '../../components/drillView'
import { useDrillRound } from '../../components/useDrillRound'

type DrillStepData = Extract<Step, { kind: 'drill' | 'staff' }>

interface Props {
  def: DrillDef
  ui: DrillUi
  step: DrillStepData
  /** Save one key's rating (the session stays on this step). */
  onRate: (itemId: string, r: Rating) => void
  /** After the last question's Next: move on. */
  onDone: () => void
  /** Staff's exact-octave setting; Keys has none. */
  exactOctave?: boolean
}

/**
 * The session's drill round (Keys: name-that-key, first in the session, spec §6.1). Each key is graded on its first answer in the
 * round only, once a day (useDrillRound), and never on a practice repeat.
 */
export function DrillStep({ def, ui, step, onRate, onDone, exactOctave = false }: Props) {
  const { setup, onAnswer } = useDrillRound(def, step.count, 'session', onRate)
  return (
    <div class="step step--drill">
      <DrillRound
        def={def}
        ui={ui}
        exactOctave={exactOctave}
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
