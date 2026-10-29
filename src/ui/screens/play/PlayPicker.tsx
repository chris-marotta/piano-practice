import { CHORD_TYPES, type ChordTypeId } from '../../../theory/chords'
import type { ScaleForm } from '../../../theory/scales'
import { Segmented } from '../../components/Segmented'
import { clampInversion, inversionOptions, respellForForm } from '../library/libraryView'
import { RootPicker } from '../library/RootPicker'
import { chordSel, octaves, octavesSel, scaleSel, targetKind, type TargetKind } from './playState'

const KINDS: { value: TargetKind; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'scale', label: 'Scale' },
  { value: 'chord', label: 'Chord' },
]

const FORMS: { value: ScaleForm; label: string }[] = [
  { value: 'major', label: 'Major' },
  { value: 'natural', label: 'Natural minor' },
  { value: 'harmonic', label: 'Harmonic minor' },
  { value: 'melodic', label: 'Melodic minor' },
]

const OCTAVES: { value: 1 | 2; label: string }[] = [
  { value: 1, label: '1 octave' },
  { value: 2, label: '2 octaves' },
]

const TRIAD_IDS: ChordTypeId[] = ['M', 'm', 'dim', 'aug', 'sus2', 'sus4']
const typeOptions = (ids: ChordTypeId[]) =>
  CHORD_TYPES.filter((t) => ids.includes(t.id)).map((t) => ({ value: t.id, label: t.label }))
const TRIADS = typeOptions(TRIAD_IDS)
const EXTENDED = typeOptions(CHORD_TYPES.map((t) => t.id).filter((id) => !TRIAD_IDS.includes(id)))

/** New chord type, keeping the inversion where the type allows it. */
function setChordType(type: ChordTypeId): void {
  const sel = chordSel.value
  chordSel.value = { ...sel, type, inversion: clampInversion(type, sel.inversion) }
}

/** What to play against: nothing, a scale (root, form, 1 or 2 octaves) or a chord (root, type, inversion). */
export function PlayPicker() {
  const kind = targetKind.value
  return (
    <div class="play-picker">
      <div class="play-row">
        <Segmented options={KINDS} value={kind} onChange={(k) => (targetKind.value = k)} label="Play against" />
        {kind === 'scale' && <ScaleControls />}
        {kind === 'chord' && <ChordTypes />}
        {kind === 'none' && <p class="play-picker__none">Play anything. What you hold is named as a chord.</p>}
      </div>
      {kind === 'scale' && (
        <RootPicker
          root={scaleSel.value.root}
          context={scaleSel.value.form}
          onChange={(root) => (scaleSel.value = { ...scaleSel.value, root })}
        />
      )}
      {kind === 'chord' && <ChordRootAndInversion />}
    </div>
  )
}

function ScaleControls() {
  const ref = scaleSel.value
  const setForm = (form: ScaleForm) => (scaleSel.value = { root: respellForForm(ref.root, ref.form, form), form })
  return (
    <>
      <Segmented options={FORMS} value={ref.form} onChange={setForm} label="Scale form" />
      <Segmented options={OCTAVES} value={octaves.value} onChange={(o) => (octavesSel.value = o)} label="Octaves" />
    </>
  )
}

function ChordTypes() {
  const sel = chordSel.value
  const isTriad = TRIAD_IDS.includes(sel.type)
  return <Segmented options={TRIADS} value={isTriad ? sel.type : null} onChange={setChordType} label="Triads" />
}

function ChordRootAndInversion() {
  const sel = chordSel.value
  const isTriad = TRIAD_IDS.includes(sel.type)
  return (
    <>
      <RootPicker root={sel.root} context="chord" onChange={(root) => (chordSel.value = { ...sel, root })} />
      <div class="play-row">
        <Segmented
          options={EXTENDED}
          value={isTriad ? null : sel.type}
          onChange={setChordType}
          label="Sevenths and extended chords"
        />
        <Segmented
          options={inversionOptions(sel.type)}
          value={sel.inversion}
          onChange={(inversion) => (chordSel.value = { ...sel, inversion })}
          label="Inversion"
        />
      </div>
    </>
  )
}
