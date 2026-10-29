// DEV ONLY (#/dev-keyboard, rendered only when import.meta.env.DEV). Remove once real screens use <Keyboard>.
import { useState } from 'preact/hooks'
import { Keyboard } from '../components/Keyboard'
import { FingerRow } from '../components/FingerRow'
import { RatingBar } from '../components/RatingBar'
import { keyboardRange, type KeyMark } from '../components/keyboardLayout'
import { fingeringSequence } from '../../data/fingerings'
import { formatNote } from '../../theory/format'
import { noteMidi, scaleSequence, type ScaleRef } from '../../theory/scales'

const pitchClass = (n: string): string => n.replace(/-?\d+$/, '')

function handsTogether(ref: ScaleRef, octaves: 1 | 2, rhOct: number, lhOct: number): KeyMark[] {
  const rh = scaleSequence(ref, octaves, rhOct).ascending
  const lh = scaleSequence(ref, octaves, lhOct).ascending
  const rhF = fingeringSequence(ref, octaves, 'rh', 'up')
  const lhF = fingeringSequence(ref, octaves, 'lh', 'up')
  return [
    ...rh.map((n, i) => ({ midi: noteMidi(n), hand: 'rh' as const, finger: rhF[i], label: formatNote(pitchClass(n)) })),
    ...lh.map((n, i) => ({ midi: noteMidi(n), hand: 'lh' as const, finger: lhF[i], label: formatNote(pitchClass(n)) })),
  ]
}

const E_MAJOR: ScaleRef = { root: 'E', form: 'major' }

/** Phase 2 key states on D major (C4..B5): target and played glows, right / wrong / neutral presses, a guided note. */
function stateMarks(pressed: Set<number>): KeyMark[] {
  const dMajor = scaleSequence({ root: 'D', form: 'major' }, 1, 4).ascending
  const inTarget = new Set(dMajor.map((n) => noteMidi(n) % 12))
  const sample: KeyMark[] = [
    // B4 and C♯5 played (dim glow: one white, one black); the rest of D major glows as target.
    ...dMajor.map((n) => {
      const midi = noteMidi(n)
      return { midi, hand: 'none' as const, state: midi === 71 || midi === 73 ? ('played' as const) : ('target' as const) }
    }),
    { midi: 62, hand: 'none', state: 'good', label: 'D' }, // white, right, with a label
    { midi: 66, hand: 'none', state: 'good' }, // black, right
    { midi: 65, hand: 'none', state: 'bad' }, // white, wrong
    { midi: 63, hand: 'none', state: 'bad', label: 'E♭' }, // black, wrong, with a label
    { midi: 67, hand: 'rh', finger: 3 }, // guided next note (hand colour + finger)
    { midi: 74, hand: 'none', state: 'pressed' }, // pressed with no target
    { midi: 76, hand: 'none', state: 'pressed', label: 'E' },
  ]
  // Live presses (mouse / touch on this keyboard) judged against D major by pitch class.
  const live: KeyMark[] = [...pressed].map((midi) => ({
    midi,
    hand: 'none',
    state: inTarget.has(midi % 12) ? 'good' : 'bad',
  }))
  return [...sample, ...live]
}

export function DevKeyboard() {
  const [tapped, setTapped] = useState<string>('none yet')
  const [pressed, setPressed] = useState<Set<number>>(new Set())
  const [pressLog, setPressLog] = useState<string>('none yet')
  // Dev check: turning presses off mid-hold must still release the held key (down=false).
  const [pressOn, setPressOn] = useState(true)
  const onKeyPress = (midi: number, down: boolean) => {
    setPressLog(`${midi} ${down ? 'down' : 'up'}`)
    setPressed((prev) => {
      const next = new Set(prev)
      if (down) next.add(midi)
      else next.delete(midi)
      return next
    })
  }
  const marks = handsTogether(E_MAJOR, 2, 4, 3)
  const { low, high } = keyboardRange(marks.map((m) => m.midi))
  const rhNotes = scaleSequence(E_MAJOR, 1, 4).ascending
  return (
    <section class="screen">
      <p class="dev-flag">Dev only: not shipped in production builds</p>
      <h1 class="screen__title">E major, hands together, 2 octaves</h1>
      <p class="muted">RH from E4, LH from E3. Tap a key: last tapped {tapped}.</p>
      <div class="stage">
        <Keyboard low={low} high={high} marks={marks} onKeyTap={(m) => setTapped(String(m))} />
      </div>
      <FingerRow notes={rhNotes} fingers={fingeringSequence(E_MAJOR, 1, 'rh', 'up')} hand="rh" />
      <RatingBar options={['nailed', 'shaky', 'lost']} onRate={(r) => setTapped(r)} disabledNailed />
      <h2 class="screen__title">Key states (phase 2)</h2>
      <p class="muted">
        D major target glow (B, C♯ played: dim). ✓ D, F♯ · × F, E♭ · G guided (RH 3) · D5, E5 pressed (no target). Press a key: last{' '}
        {pressLog}.
      </p>
      <div class="stage">
        <Keyboard
          low={60}
          high={83}
          marks={stateMarks(pressed)}
          reserveRows="rh"
          onKeyPress={pressOn ? onKeyPress : undefined}
        />
      </div>
      <button type="button" class="btn dev-press-toggle" onClick={() => setPressOn((on) => !on)}>
        Presses {pressOn ? 'on' : 'off'}
      </button>
    </section>
  )
}
