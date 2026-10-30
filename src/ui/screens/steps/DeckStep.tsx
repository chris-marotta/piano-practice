import { useRef, useState } from 'preact/hooks'
import type { Step } from '../../../session/builder'
import type { Rating } from '../../../srs/scheduler'
import { RatingBar } from '../../components/RatingBar'
import { WhyPicture } from '../../components/WhyPicture'
import { kickerFor } from './deckView'

type DeckStepData = Extract<Step, { kind: 'deck' }>

interface Props {
  step: DeckStepData
  /** Save one card's rating (the session stays on this step). */
  onRate: (itemId: string, r: Rating) => void
  /** After the last card is rated: move on. */
  onDone: () => void
}

/** One dot per card: filled once rated, outlined for the card in hand. */
function Dots({ total, at }: { total: number; at: number }) {
  return (
    <ol class="deck__dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <li key={i} class={`deck__dot${i < at ? ' deck__dot--done' : i === at ? ' deck__dot--current' : ''}`} />
      ))}
    </ol>
  )
}

/**
 * The warm-up as one flip deck: front (prompt) → Tap to flip → back (answer, why picture, Why: line) →
 * Got it / Missed, which saves that card and deals the next. Missing a card doesn't stop the deck.
 */
export function DeckStep({ step, onRate, onDone }: Props) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  // Highest card index already rated: a double tap on Got it / Missed rates once and deals once.
  const rated = useRef(-1)
  const total = step.cards.length
  const entry = step.cards[index]
  if (!entry) return null
  const { card } = entry
  const counter = `${index + 1} / ${total}`

  const rate = (r: Rating) => {
    if (!flipped || rated.current >= index) return
    rated.current = index
    onRate(entry.itemId, r)
    if (index + 1 >= total) onDone()
    else {
      setIndex(index + 1)
      setFlipped(false)
    }
  }

  return (
    <div class="step step--deck">
      <div class="deck">
        {/* Keyed by card, so a new card arrives face up without replaying the flip (the old back never shows). */}
        <div key={index} class={`deck__card${index < total - 1 ? ' deck__card--stacked' : ''}${flipped ? ' is-flipped' : ''}`}>
          <div class="deck__flipper">
            <section class="deck__face deck__face--front" aria-hidden={flipped} inert={flipped}>
              <header class="deck__head">
                <span class="deck__kicker">{kickerFor(card.type)}</span>
                <span class="deck__count">{counter}</span>
              </header>
              <Dots total={total} at={index} />
              <h1 class="deck__prompt">{card.prompt}</h1>
              <p class="deck__hint">Say it, then flip.</p>
              <button type="button" class="deck__flip" onClick={() => setFlipped(true)}>
                Tap to flip
              </button>
            </section>
            <section class="deck__face deck__face--back" aria-hidden={!flipped} inert={!flipped}>
              <header class="deck__head">
                <span class="deck__kicker">ANSWER</span>
                <span class="deck__count">{counter}</span>
              </header>
              <Dots total={total} at={index} />
              <p class="deck__answer">{card.answer}</p>
              <WhyPicture why={card.why} />
              <p class="deck__why">
                <b>Why:</b> {card.whyText}
              </p>
              <div class="deck__rate">
                <RatingBar options={['nailed', 'lost']} onRate={rate} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
