import { useState } from 'preact/hooks'
import type { DrillDef } from '../../../drill/engine'
import { rateItem } from '../../../session/record'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import type { DrillUi } from '../../components/drillUi'
import { useDrillRound } from '../../components/useDrillRound'
import { today, update } from '../../state'
import { octavesSel, playTarget } from './playState'
import { pickerSummary } from './playView'

export const NEXT_ROUND_LABEL = 'Next round'

/** Play saves a key's rating at once, like the session: a round left part-way keeps what was answered. */
function rateKey(itemId: string, rating: Rating): void {
  update((st) => rateItem(st, itemId, rating, today()))
}

interface Props {
  def: DrillDef
  ui: DrillUi
  /** Questions per round. */
  count: number
  /** Staff's exact-octave setting; Keys has none. */
  exactOctave?: boolean
}

/** One round, built on mount (useDrillRound), with the summary line above it. */
function DrillRoundOnce({ def, ui, count, exactOctave = false, onNext }: Props & { onNext: () => void }) {
  const { setup, onAnswer } = useDrillRound(def, count, 'play', rateKey)
  return (
    <div class="play-keys">
      <p class="play-keys__summary">{pickerSummary(playTarget.value, octavesSel.value, 'keys', 'rh', setup.level)}</p>
      <DrillRound
        def={def}
        ui={ui}
        exactOctave={exactOctave}
        questions={setup.questions}
        level={setup.level}
        unlocked={setup.unlocked}
        onAnswer={onAnswer}
        onFinish={onNext}
        finishLabel={NEXT_ROUND_LABEL}
      />
    </div>
  )
}

/**
 * Play's drill mode (Keys: name-that-key rounds of 8), one round after another (spec §6.6). Only keys that are due, or answered
 * wrong, move a box here (shouldGrade 'play'). "Next round" mounts a fresh round at the level the ratings now give.
 */
export function PlayDrill(props: Props) {
  const [round, setRound] = useState(0)
  return <DrillRoundOnce key={round} {...props} onNext={() => setRound(round + 1)} />
}
