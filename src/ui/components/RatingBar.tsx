import type { Rating } from '../../srs/scheduler'

interface Props {
  options: Rating[]
  onRate: (r: Rating) => void
  /** Peeking caps a rating at shaky, so Nailed is disabled. */
  disabledNailed?: boolean
  /** Session auto-check's suggestion: an outlined highlight and a small "Suggested" line. Chris still taps. */
  suggested?: Rating | null
}

const SCALE_LABELS: Record<Rating, string> = { nailed: 'Nailed', shaky: 'Shaky', lost: 'Lost' }
/** Recall cards are pass/fail: options without 'shaky' use these labels. */
const CARD_LABELS: Record<Rating, string> = { nailed: 'Got it', shaky: 'Shaky', lost: 'Missed' }

/** Large rating buttons (>= 72px tall), tapped mid-practice. */
export function RatingBar({ options, onRate, disabledNailed = false, suggested = null }: Props) {
  const labels = options.includes('shaky') ? SCALE_LABELS : CARD_LABELS
  return (
    <div class="rating-bar" role="group" aria-label="How did it go?">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          class={`btn rating rating--${r}${r === suggested ? ' rating--suggested' : ''}`}
          disabled={r === 'nailed' && disabledNailed}
          onClick={() => onRate(r)}
        >
          <span class="rating__label">{labels[r]}</span>
          {r === suggested && <span class="rating__suggested">Suggested</span>}
        </button>
      ))}
    </div>
  )
}
