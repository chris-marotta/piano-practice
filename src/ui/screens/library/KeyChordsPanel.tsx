import type { ScaleForm } from '../../../theory/scales'
import { formatScale } from '../../../theory/format'
import { Segmented } from '../../components/Segmented'
import { keyChords, respellForForm } from './libraryView'
import { keySel, openChord } from './libraryState'
import { RootPicker } from './RootPicker'

const QUALITY = { M: 'major', m: 'minor', dim: 'diminished', aug: 'augmented' } as const

const FORMS: { value: ScaleForm; label: string }[] = [
  { value: 'major', label: 'Major' },
  { value: 'natural', label: 'Natural minor' },
  { value: 'harmonic', label: 'Harmonic minor' },
]

export function KeyChordsPanel() {
  const ref = keySel.value
  const chords = keyChords(ref)
  const setForm = (form: ScaleForm) => (keySel.value = { root: respellForForm(ref.root, ref.form, form), form })

  return (
    <div class="lib-panel">
      <RootPicker root={ref.root} context={ref.form} onChange={(root) => (keySel.value = { ...ref, root })} />
      <div class="lib-row">
        <Segmented options={FORMS} value={ref.form} onChange={setForm} label="Key" />
      </div>
      <div class="lib-info">
        <h2 class="lib-info__title">Chords in {formatScale(ref)}</h2>
        <p class="muted">Tap a chord to open it in Chords.</p>
      </div>
      <div class="key-chords">
        {chords.map((c) => (
          <button key={c.numeral} type="button" class="btn key-chord" onClick={() => openChord(c.root, c.type)}>
            <span class="key-chord__numeral">{c.numeral}</span>
            <span class="key-chord__symbol">{c.symbol}</span>
            <span class="key-chord__quality">{QUALITY[c.type]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
