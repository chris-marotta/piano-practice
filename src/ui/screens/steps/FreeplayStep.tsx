import { useEffect, useState } from 'preact/hooks'
import type { Step } from '../../../session/builder'
import type { Settings } from '../../../srs/items'
import { formatScale } from '../../../theory/format'
import { formatClock } from './stepView'
import { Toggle } from './Toggle'
import { useDrone, useSilenceOnLeave } from './useAudio'

type FreeplayStepData = Extract<Step, { kind: 'freeplay' }>

interface Props {
  step: FreeplayStepData
  settings: Settings
  onDone: () => void
}

/**
 * Free play over the drone, counting down from step.seconds. No rating. The drone is the point
 * of this step, so it starts on even when the scale-step drone setting is off (ASSUMED); its
 * toggle here doesn't change that setting. No auto-advance at 0: hands may be mid-phrase.
 */
export function FreeplayStep({ step, settings, onDone }: Props) {
  const [drone, setDrone] = useState(true)
  const [endsAt] = useState(() => Date.now() + step.seconds * 1000)
  const [left, setLeft] = useState(step.seconds)

  useSilenceOnLeave()
  useDrone(step.ref.root, drone, settings.droneVolumeDb)

  useEffect(() => {
    const t = setInterval(() => {
      const s = (endsAt - Date.now()) / 1000
      setLeft(s)
      if (s <= 0) clearInterval(t)
    }, 250)
    return () => clearInterval(t)
  }, [endsAt])

  const up = left <= 0
  return (
    <div class="step step--freeplay">
      <header class="step__head">
        <div class="step__heading">
          <h1 class="step__title">Free play · {formatScale(step.ref)}</h1>
          <p class="step__kicker">Improvise over the drone. Stay in the key.</p>
        </div>
        <div class="step__tools">
          <Toggle label="Drone" on={drone} onChange={setDrone} />
        </div>
      </header>
      <div class="step__body step__body--center">
        <p class="clock" role="timer" aria-live="off">
          {formatClock(left)}
        </p>
        {up && <p class="step__answer">Time's up</p>}
      </div>
      <div class="step__foot">
        <button type="button" class={`btn btn--lg${up ? ' btn--primary' : ''} btn--wide`} onClick={onDone}>
          {up ? 'Finish' : 'Done early'}
        </button>
      </div>
    </div>
  )
}
