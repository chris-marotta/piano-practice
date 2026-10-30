import { Wheel } from '../../components/Wheel'
import { navigate } from '../../state'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import { scaleSel as playScaleSel, targetKind } from '../play/playState'
import { circlePanel } from './libraryView'
import { circleSel, scaleSel, segment } from './libraryState'

function Chips({ chips }: { chips: string[] }) {
  if (chips.length === 0) return <span class="circle-none">No sharps or flats</span>
  return (
    <span class="circle-chips">
      {chips.map((n) => (
        <span key={n} class="circle-chip">
          {n}
        </span>
      ))}
    </span>
  )
}

/** Circle of fifths lookup: tap a key to see its signature, its relative minor and its scale. No scheduling, no rating. */
export function CirclePanel() {
  const index = circleSel.value
  const p = circlePanel(index)
  // Only index 6 differs: F♯ major has sharps, its circle partner E♭ minor has flats.
  const sameSignature = p.chips.join(' ') === p.minorChips.join(' ')

  const openInLibrary = () => {
    scaleSel.value = p.major
    segment.value = 'scales'
  }
  const playIt = () => {
    targetKind.value = 'scale'
    playScaleSel.value = p.major
    navigate('play')
  }

  return (
    <div class="circle">
      <div class="circle__wheel">
        <Wheel highlight={index} minor={false} onSelect={(i) => (circleSel.value = i)} />
      </div>
      <div class="circle__info">
        <h2 class="lib-info__title">{p.title}</h2>
        <dl class="lib-facts circle__facts">
          <div class="lib-fact">
            <dt>{sameSignature ? 'Key signature' : 'Major key signature'}</dt>
            <dd>
              <Chips chips={p.chips} />
            </dd>
          </div>
          {!sameSignature && (
            <div class="lib-fact">
              <dt>Minor key signature</dt>
              <dd>
                <Chips chips={p.minorChips} />
              </dd>
            </div>
          )}
          <div class="lib-fact">
            <dt>Relative minor</dt>
            <dd>{p.minorName}</dd>
          </div>
        </dl>
        <div class="lib-keyboard circle__keyboard">
          <ScrollKeyboard
            low={p.keyboard.low}
            high={p.keyboard.high}
            marks={p.keyboard.marks}
            firstMidi={p.keyboard.firstMidi}
            reserveRows={false}
            maxKeyPx={48}
          />
        </div>
        <div class="lib-row">
          <button type="button" class="btn" onClick={openInLibrary}>
            Open in Library
          </button>
          <button type="button" class="btn btn--primary" onClick={playIt}>
            Play it
          </button>
        </div>
      </div>
    </div>
  )
}
