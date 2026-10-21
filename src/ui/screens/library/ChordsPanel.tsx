import { playChord } from '../../../audio/piano'
import { CHORD_TYPES, chordNotes, type ChordTypeId } from '../../../theory/chords'
import { Segmented } from '../../components/Segmented'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import { chordPanel, clampInversion, inversionOptions } from './libraryView'
import { chordSel } from './libraryState'
import { RootPicker } from './RootPicker'
import { usePiano } from './usePiano'

const TRIAD_IDS: ChordTypeId[] = ['M', 'm', 'dim', 'aug', 'sus2', 'sus4']
const typeOptions = (ids: ChordTypeId[]) =>
  CHORD_TYPES.filter((t) => ids.includes(t.id)).map((t) => ({ value: t.id, label: t.label }))
const TRIADS = typeOptions(TRIAD_IDS)
const EXTENDED = typeOptions(CHORD_TYPES.map((t) => t.id).filter((id) => !TRIAD_IDS.includes(id)))

export function ChordsPanel() {
  const sel = chordSel.value
  const p = chordPanel(sel.root, sel.type, sel.inversion)
  const withPiano = usePiano()

  const setType = (type: ChordTypeId) => (chordSel.value = { ...sel, type, inversion: clampInversion(type, sel.inversion) })
  const play = (mode: 'block' | 'broken') =>
    withPiano(() => playChord(chordNotes(sel.root, sel.type, sel.inversion), mode))
  const isTriad = TRIAD_IDS.includes(sel.type)

  return (
    <div class="lib-panel">
      <RootPicker root={sel.root} context="chord" onChange={(root) => (chordSel.value = { ...sel, root })} />
      <div class="lib-types">
        <Segmented options={TRIADS} value={isTriad ? sel.type : null} onChange={setType} label="Triads" />
        <Segmented options={EXTENDED} value={isTriad ? null : sel.type} onChange={setType} label="Sevenths and extended chords" />
      </div>
      <div class="lib-row">
        <Segmented
          options={inversionOptions(sel.type)}
          value={sel.inversion}
          onChange={(inversion) => (chordSel.value = { ...sel, inversion })}
          label="Inversion"
        />
        <div class="lib-row__end">
          <button type="button" class="btn btn--tool" onClick={() => play('block')}>
            <span aria-hidden="true">▶</span> Block
          </button>
          <button type="button" class="btn btn--tool" onClick={() => play('broken')}>
            <span aria-hidden="true">▶</span> Broken
          </button>
        </div>
      </div>

      <div class="lib-chord">
        <div class="lib-chord__info">
          <p class="lib-chord__symbol">{p.symbol}</p>
          <p class="lib-chord__name">{p.name}</p>
          <p class="lib-chord__notes">{p.notes.join(' ')}</p>
          <p class="lib-chord__hand">{p.fingeringNote ?? 'Right hand'}</p>
        </div>
        <div class="lib-keyboard lib-keyboard--chord">
          <ScrollKeyboard
            low={p.keyboard.low}
            high={p.keyboard.high}
            marks={p.keyboard.marks}
            firstMidi={p.keyboard.firstMidi}
            reserveRows="rh"
          />
        </div>
      </div>
    </div>
  )
}
