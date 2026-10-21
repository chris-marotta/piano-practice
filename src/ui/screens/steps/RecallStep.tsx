import { useState } from 'preact/hooks'
import type { Step } from '../../../session/builder'
import type { Rating } from '../../../srs/scheduler'
import type { RecallType } from '../../../theory/recall'
import { RatingBar } from '../../components/RatingBar'

type RecallStepData = Extract<Step, { kind: 'recall' }>

const TYPE_LABEL: Record<RecallType, string> = {
  keysig: 'Key signature',
  spell: 'Spelling',
  relative: 'Relative key',
  thumb: 'Thumb notes',
}

interface Props {
  step: RecallStepData
  onRate: (r: Rating) => void
}

/** Prompt → Reveal → answer → Got it / Missed. */
export function RecallStep({ step, onRate }: Props) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div class="step step--recall">
      <p class="step__kicker">Warm-up · {TYPE_LABEL[step.card.type]}</p>
      <h1 class="step__prompt">{step.card.prompt}</h1>
      <div class="step__body step__body--center">
        {revealed ? (
          <p class="step__answer">{step.card.answer}</p>
        ) : (
          <button type="button" class="btn btn--lg btn--reveal" onClick={() => setRevealed(true)}>
            Reveal
          </button>
        )}
      </div>
      <div class="step__foot">{revealed && <RatingBar options={['nailed', 'lost']} onRate={onRate} />}</div>
    </div>
  )
}
