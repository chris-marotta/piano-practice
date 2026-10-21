import { useState } from 'preact/hooks'
import { playScale } from '../../../audio/piano'
import { unlockAudio } from '../../../audio/unlock'
import type { Step } from '../../../session/builder'
import type { Settings } from '../../../srs/items'
import type { Rating } from '../../../srs/scheduler'
import { formatScale } from '../../../theory/format'
import { FingerRow } from '../../components/FingerRow'
import { RatingBar } from '../../components/RatingBar'
import { update } from '../../state'
import { familyLine, fingerRows, keySignatureText, scaleHeader, scaleKeyboard, SUPPORT_NAMES } from './scaleView'
import { ScrollKeyboard } from './ScrollKeyboard'
import { Toggle } from './Toggle'
import { useDrone, useMetronome, useSilenceOnLeave } from './useAudio'

type ScaleStepData = Extract<Step, { kind: 'scale' }>

interface Props {
  step: ScaleStepData
  settings: Settings
  onRate: (r: Rating, opts: { peeked: boolean }) => void
}

const REPS: { hand: 'rh' | 'lh' | 'both'; label: string }[] = [
  { hand: 'rh', label: 'Right hand' },
  { hand: 'rh', label: 'Right hand' },
  { hand: 'lh', label: 'Left hand' },
  { hand: 'lh', label: 'Left hand' },
  { hand: 'both', label: 'Together' },
  { hand: 'both', label: 'Together' },
]

const setSetting = <K extends 'droneOn' | 'metronomeOn'>(key: K, value: boolean) =>
  update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }))

function Check() {
  return (
    <svg class="rep__check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

/** Support display for the item's level: L0 keyboard, L1 finger rows, L2 key signature, L3 name only. */
function Support({ step, octaves, showKeyboard }: { step: ScaleStepData; octaves: 1 | 2; showKeyboard: boolean }) {
  if (step.support === 0 || showKeyboard) {
    const kb = scaleKeyboard(step.ref, octaves)
    const family = familyLine(step.ref)
    return (
      <div class="support support--keyboard">
        <ScrollKeyboard low={kb.low} high={kb.high} marks={kb.marks} firstMidi={kb.firstMidi} />
        {family && <p class="support__family">{family}</p>}
      </div>
    )
  }
  if (step.support === 1) {
    const rows = fingerRows(step.ref, octaves)
    return (
      <div class="support support--rows">
        <FingerRow notes={rows.rh.notes} fingers={rows.rh.fingers} hand="rh" />
        <FingerRow notes={rows.lh.notes} fingers={rows.lh.fingers} hand="lh" />
      </div>
    )
  }
  if (step.support === 2) return <p class="support support--big">{keySignatureText(step.ref)}</p>
  return <p class="support support--big support--name">{formatScale(step.ref)}</p>
}

export function ScaleStep({ step, settings, onRate }: Props) {
  const [phase, setPhase] = useState<'gate' | 'answer' | 'practice'>('gate')
  const [peeked, setPeeked] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [reps, setReps] = useState<boolean[]>(() => REPS.map(() => false))

  useSilenceOnLeave()
  useDrone(step.ref.root, settings.droneOn, settings.droneVolumeDb)
  useMetronome(step.tempo, settings.metronomeOn)

  const play = async () => {
    await unlockAudio()
    playScale(step.ref, settings.octaves, step.tempo)
  }
  const peek = () => {
    setPeeked(true)
    setShowKeyboard((v) => !v)
  }

  return (
    <div class="step step--scale">
      <header class="step__head">
        <div class="step__heading">
          <h1 class="step__title">{scaleHeader(step.ref, settings.octaves, step.tempo)}</h1>
          <p class="step__kicker">
            Support L{step.support} · {SUPPORT_NAMES[step.support]}
          </p>
        </div>
        <div class="step__tools">
          <button type="button" class="btn btn--tool" onClick={play}>
            <span aria-hidden="true">▶</span> Play
          </button>
          <Toggle label="Drone" on={settings.droneOn} onChange={(v) => setSetting('droneOn', v)} />
          <Toggle label="Metronome" on={settings.metronomeOn} onChange={(v) => setSetting('metronomeOn', v)} />
        </div>
      </header>

      {phase !== 'practice' ? (
        <div class="step__body step__body--center gate">
          <p class="step__prompt">How many sharps or flats? Name them.</p>
          {phase === 'gate' ? (
            <button type="button" class="btn btn--lg btn--reveal" onClick={() => setPhase('answer')}>
              Reveal
            </button>
          ) : (
            <>
              <p class="step__answer">{keySignatureText(step.ref)}</p>
              <button type="button" class="btn btn--lg btn--primary" onClick={() => setPhase('practice')}>
                Play the scale
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div class="step__body">
            {step.support > 0 && (
              <button type="button" class="btn btn--quiet-line peek" aria-pressed={showKeyboard} onClick={peek}>
                {showKeyboard ? 'Hide keyboard' : 'Peek at keyboard'}
              </button>
            )}
            <Support step={step} octaves={settings.octaves} showKeyboard={showKeyboard} />
          </div>
          <div class="step__foot">
            <div class="reps" role="group" aria-label="Reps">
              {REPS.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  class={`btn rep rep--${r.hand}`}
                  aria-pressed={reps[i]}
                  onClick={() => setReps((rs) => rs.map((v, j) => (j === i ? !v : v)))}
                >
                  {reps[i] && <Check />}
                  {r.label}
                </button>
              ))}
            </div>
            <RatingBar options={['nailed', 'shaky', 'lost']} onRate={(r) => onRate(r, { peeked })} disabledNailed={peeked} />
            {peeked && <p class="step__hint">Peeked: max Shaky</p>}
          </div>
        </>
      )}
    </div>
  )
}
