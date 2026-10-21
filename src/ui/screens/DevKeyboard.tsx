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

export function DevKeyboard() {
  const [tapped, setTapped] = useState<string>('none yet')
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
    </section>
  )
}
