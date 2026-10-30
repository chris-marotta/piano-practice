import { circleIndex } from '../../theory/circle'
import { formatNote } from '../../theory/format'
import type { RecallWhy } from '../../theory/recall'
import { whyChips, whyKeyboard } from '../screens/steps/deckView'
import { Keyboard } from './Keyboard'
import { Wheel } from './Wheel'

/** Note chips ("Same key signature: F♯ C♯ G♯"); "none" when the list is empty. */
function Chips({ why }: { why: RecallWhy }) {
  const chips = whyChips(why)
  if (!chips) return null
  return (
    <p class="why-chips">
      <span class="why-chips__label">{chips.label}:</span>
      {chips.notes.length === 0 ? (
        <span class="why-chips__none">no sharps or flats</span>
      ) : (
        chips.notes.map((n) => (
          <span key={n} class="why-chip">
            {formatNote(n)}
          </span>
        ))
      )}
    </p>
  )
}

/** Why keyboards are short strips, so their keys can be a little larger than the default cap. */
const WHY_KEY_PX = 64

function WhyKeys({ why, title }: { why: RecallWhy; title?: string }) {
  const kb = whyKeyboard(why)
  if (!kb) return null
  const thumbs = why.kind === 'thumbs'
  return (
    <div class="why-keys">
      {title && <p class="why-keys__title">{title}</p>}
      <Keyboard
        low={kb.low}
        high={kb.high}
        marks={kb.marks}
        badgesAbove={thumbs}
        maxKeyPx={WHY_KEY_PX}
      />
    </div>
  )
}

/** The picture on the back of a deck card: keys for steps / scale / thumbs, the circle of fifths for key signatures. */
export function WhyPicture({ why }: { why: RecallWhy }) {
  let picture
  if (why.kind === 'wheel') {
    // Accidental and steps come from the card (ruling R-T6c): at index 6 CIRCLE describes F♯ major, not E♭ minor.
    const highlight = circleIndex({ root: why.key, form: why.minor ? 'natural' : 'major' })
    picture = (
      <div class="why-wheel">
        <Wheel highlight={highlight} minor={why.minor} steps={why.steps} accidental={why.accidental} />
      </div>
    )
  } else if (why.kind === 'scale' && why.descending) {
    // Melodic minor: the up line and the down line (read low to high, so it lands on the same keys).
    picture = (
      <div class="why-keys-pair">
        <WhyKeys why={why} title="Going up" />
        <WhyKeys why={{ kind: 'scale', notes: [...why.descending].reverse(), accidentals: [] }} title="Coming down" />
      </div>
    )
  } else {
    picture = <WhyKeys why={why} />
  }
  return (
    <div class={`why-picture why-picture--${why.kind}`}>
      {picture}
      <Chips why={why} />
    </div>
  )
}
