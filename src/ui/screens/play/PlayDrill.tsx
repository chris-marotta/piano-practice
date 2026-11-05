import { useLayoutEffect, useState } from 'preact/hooks'
import type { DrillDef } from '../../../drill/engine'
import { rateItem } from '../../../session/record'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import type { DrillUi } from '../../components/drillUi'
import { useDrillRound } from '../../components/useDrillRound'
import { today, update } from '../../state'
import { headSummary, octavesSel, playTarget } from './playState'
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
  /** Which mode this is, for the summary line. */
  mode: 'keys' | 'staff'
  /** Staff's exact-octave setting; Keys has none. */
  exactOctave?: boolean
  /** Put the summary line in the Play header (`headSummary`) instead of above the round: Staff, to fit 820 px. */
  summaryInHead?: boolean
}

/** One round, built on mount (useDrillRound), with the summary line above it. */
function DrillRoundOnce({ def, ui, count, mode, exactOctave = false, summaryInHead = false, onNext }: Props & { onNext: () => void }) {
  const { setup, onAnswer } = useDrillRound(def, count, 'play', rateKey)
  const summary = pickerSummary(playTarget.value, octavesSel.value, mode, 'rh', setup.level)
  useLayoutEffect(() => {
    if (summaryInHead) headSummary.value = summary
  }, [summaryInHead, summary])
  return (
    <div class="play-keys">
      {!summaryInHead && <p class="play-keys__summary">{summary}</p>}
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
 * Play's drill mode (Keys: rounds of 8; Staff: rounds of 6), one round after another (spec §6.6). Only keys that are due, or answered
 * wrong, move a box here (shouldGrade 'play'). "Next round" mounts a fresh round at the level the ratings now give.
 */
export function PlayDrill(props: Props) {
  const [round, setRound] = useState(0)
  return <DrillRoundOnce key={round} {...props} onNext={() => setRound(round + 1)} />
}
