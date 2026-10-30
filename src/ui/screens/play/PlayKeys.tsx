import { useState } from 'preact/hooks'
import { rateItem } from '../../../session/record'
import type { Rating } from '../../../srs/scheduler'
import { DrillRound } from '../../components/DrillRound'
import { useDrillRound } from '../../components/useDrillRound'
import { today, update } from '../../state'
import { octavesSel, playTarget } from './playState'
import { KEYS_ROUND_QUESTIONS, pickerSummary } from './playView'

export const NEXT_ROUND_LABEL = 'Next round'

/** Play saves a key's rating at once, like the session: a round left part-way keeps what was answered. */
function rateKey(itemId: string, rating: Rating): void {
  update((st) => rateItem(st, itemId, rating, today()))
}

/** One round, built on mount (useDrillRound), with the summary line above it. */
function KeysRound({ onNext }: { onNext: () => void }) {
  const { setup, onAnswer } = useDrillRound(KEYS_ROUND_QUESTIONS, 'play', rateKey)
  return (
    <div class="play-keys">
      <p class="play-keys__summary">{pickerSummary(playTarget.value, octavesSel.value, 'keys', 'rh', setup.level)}</p>
      <DrillRound
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
 * Play's Keys mode: name-that-key rounds of 8, one after another (spec §6.6). Only keys that are due, or answered
 * wrong, move a box here (shouldGrade 'play'). "Next round" mounts a fresh round at the level the ratings now give.
 */
export function PlayKeys() {
  const [round, setRound] = useState(0)
  return <KeysRound key={round} onNext={() => setRound(round + 1)} />
}
