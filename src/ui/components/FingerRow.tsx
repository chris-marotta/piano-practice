import { formatNote } from '../../theory/format'

interface Props {
  /** Note names in tonal ASCII, with or without octave ('F#4' shows as F♯). */
  notes: string[]
  fingers: number[]
  hand: 'rh' | 'lh'
  /** Hand label inline and smaller cells, so two up/down pairs fit on one screen (melodic minor L1). */
  compact?: boolean
}

const HAND_LABEL = { rh: 'Right hand', lh: 'Left hand' } as const
const stripOctave = (n: string): string => n.replace(/-?\d+$/, '')

/** L1 display: the note sequence with each finger number in a hand-coloured badge underneath. */
export function FingerRow({ notes, fingers, hand, compact = false }: Props) {
  return (
    <div class={`finger-row finger-row--${hand}${compact ? ' finger-row--compact' : ''}`}>
      <span class="finger-row__hand">{HAND_LABEL[hand]}</span>
      <ol class="finger-row__cells">
        {notes.map((n, i) => (
          <li key={i} class="finger-row__cell">
            <span class="finger-row__note">{formatNote(stripOctave(n))}</span>
            {fingers[i] !== undefined && <span class={`finger-badge finger-badge--${hand}`}>{fingers[i]}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
