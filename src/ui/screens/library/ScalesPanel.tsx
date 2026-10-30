import { playScale } from '../../../audio/piano'
import type { ScaleForm } from '../../../theory/scales'
import { Segmented } from '../../components/Segmented'
import { app } from '../../state'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import type { Direction } from '../steps/scaleView'
import { LIBRARY_OCTAVES, libraryTempo, respellForForm, scalePanel } from './libraryView'
import { scaleDir, scaleSel } from './libraryState'
import { RootPicker } from './RootPicker'
import { usePiano } from './usePiano'

const FORMS: { value: ScaleForm; label: string }[] = [
  { value: 'major', label: 'Major' },
  { value: 'natural', label: 'Natural minor' },
  { value: 'harmonic', label: 'Harmonic minor' },
  { value: 'melodic', label: 'Melodic minor' },
]

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
]

export function ScalesPanel() {
  const ref = scaleSel.value
  const { settings, items } = app.value
  const p = scalePanel(ref, LIBRARY_OCTAVES, scaleDir.value)
  const withPiano = usePiano()

  const setForm = (form: ScaleForm) => {
    scaleSel.value = { root: respellForForm(ref.root, ref.form, form), form }
    scaleDir.value = 'up'
  }
  const play = () => withPiano(() => playScale(ref, LIBRARY_OCTAVES, libraryTempo(items, ref, settings.startTempo)))
  const fingeringText = p.fingering ? (p.fingering.note ?? p.fingering.family ?? 'Its own fingering') : 'No fingering for this spelling'

  return (
    <div class="lib-panel">
      <RootPicker root={ref.root} context={ref.form} onChange={(root) => (scaleSel.value = { ...ref, root })} />
      <div class="lib-row">
        <Segmented options={FORMS} value={ref.form} onChange={setForm} label="Scale form" />
        {p.hasDirection && (
          <Segmented options={DIRECTIONS} value={scaleDir.value} onChange={(d) => (scaleDir.value = d)} label="Fingering direction" />
        )}
        <button type="button" class="btn btn--tool lib-play" onClick={play}>
          <span aria-hidden="true">▶</span> Play
        </button>
      </div>

      <div class="lib-info">
        <h2 class="lib-info__title">{p.title}</h2>
        <dl class="lib-facts">
          <div class="lib-fact lib-fact--notes">
            <dt>Notes</dt>
            {p.down ? (
              <dd>
                <span class="lib-line">
                  <span class="lib-dir">Up</span> {p.up.join(' ')}
                </span>
                <span class="lib-line">
                  <span class="lib-dir">Down</span> {p.down.join(' ')}
                </span>
              </dd>
            ) : (
              <dd>{p.up.join(' ')}</dd>
            )}
          </div>
          <div class="lib-fact">
            <dt>Key signature</dt>
            <dd>{p.keySignature}</dd>
          </div>
          <div class="lib-fact">
            <dt>{p.relative.label}</dt>
            <dd>
              <button type="button" class="btn lib-link" onClick={() => (scaleSel.value = p.relative.ref)}>
                {p.relative.name} <span aria-hidden="true">→</span>
              </button>
            </dd>
          </div>
          <div class="lib-fact">
            <dt>Fingering</dt>
            <dd>{fingeringText}</dd>
          </div>
        </dl>
      </div>

      <div class="lib-keyboard lib-keyboard--scale">
        <ScrollKeyboard low={p.keyboard.low} high={p.keyboard.high} marks={p.keyboard.marks} firstMidi={p.keyboard.firstMidi} />
      </div>
    </div>
  )
}
