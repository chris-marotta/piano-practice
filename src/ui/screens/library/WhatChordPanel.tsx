import { playChord } from '../../../audio/piano'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import { detection, toggleMidi, WHAT_RANGE, whatMarks } from './libraryView'
import { whatSel } from './libraryState'
import { usePiano } from './usePiano'

/** Two octaves fill the width: white keys ~80px, black keys ~48px wide at 1180. */
const WHAT_MAX_KEY_PX = 96

/** Note names with octave for playback, from MIDI (sharps are fine: playback ignores spelling). */
const PLAY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const playName = (midi: number): string => `${PLAY_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`

export function WhatChordPanel() {
  const midis = whatSel.value
  const d = detection(midis)
  const withPiano = usePiano()
  const play = () => withPiano(() => playChord(midis.map(playName), 'block'))

  return (
    <div class="lib-panel">
      <div class="lib-info">
        <h2 class="lib-info__title">What's this chord?</h2>
        <p class="muted">Tap keys to build a chord. Tap again to let go of a key.</p>
      </div>
      <div class="lib-keyboard lib-keyboard--what">
        <ScrollKeyboard
          low={WHAT_RANGE.low}
          high={WHAT_RANGE.high}
          marks={whatMarks(midis)}
          firstMidi={WHAT_RANGE.low}
          reserveRows={false}
          onKeyTap={(m) => (whatSel.value = toggleMidi(midis, m))}
          maxKeyPx={WHAT_MAX_KEY_PX}
        />
      </div>
      <div class="what" aria-live="polite">
        <div class="what__result">
          {d.status === 'empty' && <p class="what__name what__name--quiet">No keys yet</p>}
          {d.status === 'none' && <p class="what__name what__name--quiet">No match</p>}
          {d.status === 'match' && (
            <>
              <p class="what__name">{d.names[0]}</p>
              {d.names.length > 1 && <p class="what__also">Also: {d.names.slice(1).join(', ')}</p>}
            </>
          )}
          {d.notes.length > 0 && <p class="what__notes">{d.notes.join(' ')}</p>}
        </div>
        <div class="lib-row__end">
          <button type="button" class="btn btn--tool" onClick={play} disabled={midis.length === 0}>
            <span aria-hidden="true">▶</span> Play
          </button>
          <button type="button" class="btn btn--tool" onClick={() => (whatSel.value = [])} disabled={midis.length === 0}>
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
