import { useState } from 'preact/hooks'
import type { DrillDef } from '../../../drill/engine'
import { rateItem } from '../../../session/record'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import type { DrillUi } from '../../components/drillUi'
import { useDrillRound } from '../../components/useDrillRound'
import { today, update } from '../../state'
import { drillPick, octavesSel, playTarget } from './playState'
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
  /**
   * Show the summary in the round's head row (beside the kicker) instead of as a line above it: Staff, so a name
   * question fits 820 px. (The Play header has no room for it once a keyboard is connected: it wraps.)
   */
  summaryInRound?: boolean
}

/** Pick a level on the ladder; your own unlocked level goes back to the schedule's round. */
function pickLevel(mode: 'keys' | 'staff', level: number, reached: number): void {
  drillPick.value = { ...drillPick.peek(), [mode]: level === reached ? null : level }
}

/** One round, built on mount (useDrillRound), with the summary line above it. */
function DrillRoundOnce({ def, ui, count, mode, exactOctave = false, summaryInRound = false, onNext }: Props & { onNext: () => void }) {
  const { setup, onAnswer } = useDrillRound(def, count, 'play', rateKey, drillPick.peek()[mode])
  const summary = pickerSummary(playTarget.value, octavesSel.value, mode, 'rh', setup.level, setup.practice)
  return (
    <div class="play-keys">
      {!summaryInRound && <p class="play-keys__summary">{summary}</p>}
      <DrillRound
        def={def}
        ui={ui}
        exactOctave={exactOctave}
        questions={setup.questions}
        level={setup.level}
        reached={setup.reached}
        onPickLevel={(n) => pickLevel(mode, n, setup.reached)}
        unlocked={setup.unlocked}
        onAnswer={onAnswer}
        onFinish={onNext}
        finishLabel={NEXT_ROUND_LABEL}
        {...(summaryInRound ? { headNote: summary } : {})}
      />
    </div>
  )
}

/**
 * Play's drill mode (Keys: rounds of 8; Staff: rounds of 6), one round after another (spec §6.6). Only keys that are due, or answered
 * wrong, move a box here (shouldGrade 'play'). "Next round" mounts a fresh round at the level the ratings now give, or at the
 * level picked on the ladder (any level; above the unlocked one it is practice only). Picking a level starts a new round.
 */
export function PlayDrill(props: Props) {
  const [round, setRound] = useState(0)
  const pick = drillPick.value[props.mode]
  return <DrillRoundOnce key={`${round}:${pick ?? 'due'}`} {...props} onNext={() => setRound(round + 1)} />
}
