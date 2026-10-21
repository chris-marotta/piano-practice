import { playChord } from '../../../audio/piano'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import { detection, playNotes, toggleMidi, WHAT_RANGE, whatMarks } from './libraryView'
import { whatSel } from './libraryState'
import { usePiano } from './usePiano'

/** Two octaves fill the width: white keys ~80px, black keys ~48px wide at 1180. */
const WHAT_MAX_KEY_PX = 96

export function WhatChordPanel() {
  const midis = whatSel.value
  const d = detection(midis)
  const withPiano = usePiano()
  const play = () => withPiano(() => playChord(playNotes(d.midis), 'block'))

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
          marks={whatMarks(d)}
          firstMidi={WHAT_RANGE.low}
          reserveRows={false}
          onKeyTap={(m) => (whatSel.value = toggleMidi(midis, m))}
          maxKeyPx={WHAT_MAX_KEY_PX}
          toggle
        />
      </div>
      <div class="what">
        <div class="what__result" aria-live="polite">
          {d.status === 'empty' && <p class="what__name what__name--quiet">No keys yet</p>}
          {d.status === 'one' && <p class="what__name what__name--quiet">Tap at least two more keys</p>}
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
