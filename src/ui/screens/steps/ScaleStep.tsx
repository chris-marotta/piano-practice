import { useState } from 'preact/hooks'
import { playScale } from '../../../audio/piano'
import { unlockAudio } from '../../../audio/unlock'
import { midiStatus } from '../../../midi/access'
import { suggestRating } from '../../../play/suggest'
import type { Step } from '../../../session/builder'
import type { Settings } from '../../../srs/items'
import type { Rating } from '../../../srs/scheduler'
import { formatScale } from '../../../theory/format'
import { FingerRow } from '../../components/FingerRow'
import { RatingBar } from '../../components/RatingBar'
import { Segmented } from '../../components/Segmented'
import { update } from '../../state'
import { REP_KINDS, emptyTiles, placeRun, tileResult, toggleTile, untick } from './autoCheck'
import { RunResultDialog } from './RunResultDialog'
import {
  familyLine,
  fingerRows,
  hasDistinctDescent,
  keySignatureText,
  scaleHeader,
  scaleKeyboard,
  SUPPORT_NAMES,
  type Direction,
} from './scaleView'
import { ScrollKeyboard } from './ScrollKeyboard'
import { Toggle } from './Toggle'
import { useDrone, useMetronome, useMounted, useSilenceOnLeave } from './useAudio'
import { useScaleRuns } from './useAutoCheck'

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

/** "Right hand · rep 2": which tile a result card belongs to. */
const repTitle = (i: number): string =>
  `${REPS[i]?.label ?? ''} · rep ${REP_KINDS.slice(0, i + 1).filter((k) => k === REP_KINDS[i]).length}`

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
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

interface SupportProps {
  step: ScaleStepData
  octaves: 1 | 2
  showKeyboard: boolean
  direction: Direction
}

/**
 * Support display for the item's level: L0 keyboard, L1 finger rows, L2 key signature, L3 name only.
 * Melodic minor descends as natural minor, so its keyboard follows `direction` and its L1 shows
 * a "Going up" and a "Coming down" pair (R16).
 */
function Support({ step, octaves, showKeyboard, direction }: SupportProps) {
  if (step.support === 0 || showKeyboard) {
    const kb = scaleKeyboard(step.ref, octaves, direction)
    return (
      <div class="support support--keyboard">
        <ScrollKeyboard low={kb.low} high={kb.high} marks={kb.marks} firstMidi={kb.firstMidi} />
      </div>
    )
  }
  if (step.support === 1) {
    if (hasDistinctDescent(step.ref)) {
      const up = fingerRows(step.ref, octaves, 'up')
      const down = fingerRows(step.ref, octaves, 'down')
      return (
        <div class="support support--rows support--rows-split">
          <h2 class="support__dir">Going up</h2>
          <FingerRow notes={up.rh.notes} fingers={up.rh.fingers} hand="rh" compact />
          <FingerRow notes={up.lh.notes} fingers={up.lh.fingers} hand="lh" compact />
          <h2 class="support__dir">Coming down</h2>
          <FingerRow notes={down.rh.notes} fingers={down.rh.fingers} hand="rh" compact />
          <FingerRow notes={down.lh.notes} fingers={down.lh.fingers} hand="lh" compact />
        </div>
      )
    }
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
  // v1 hand ticks, plus (keyboard connected) the detected runs that ticked a tile by themselves (spec §6).
  const [tiles, setTiles] = useState(emptyTiles)
  const [openTile, setOpenTile] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction>('up')
  const mounted = useMounted()

  useSilenceOnLeave()
  useDrone(step.ref.root, settings.droneOn, settings.droneVolumeDb)
  useMetronome(step.tempo, settings.metronomeOn)

  // Auto-check only while a keyboard is connected; disconnected, the tiles are v1's hand toggles. Results already
  // detected stay on their tiles (and in the suggestion) after an unplug.
  const connected = midiStatus.value.kind === 'connected'
  useScaleRuns(step.ref, settings.octaves, connected, (run) => setTiles((ts) => placeRun(ts, run.hand, run.outcome)))
  const results = tiles.flatMap((t) => (t.result ? [t.result] : []))
  const suggested = suggestRating(results, { peeked })
  const open = openTile === null ? null : tiles[openTile]?.result ?? null

  const play = async () => {
    await unlockAudio()
    if (!mounted.current) return // the step was left while audio was unlocking
    playScale(step.ref, settings.octaves, step.tempo)
  }
  const peek = () => {
    setPeeked(true)
    setShowKeyboard((v) => !v)
  }

  // Up/Down only where the descent differs (melodic minor) and a keyboard is showing.
  const keyboardShown = step.support === 0 || showKeyboard
  const showDirection = hasDistinctDescent(step.ref) && keyboardShown
  // The family line belongs to the keyboard view; it sits in the tools row to save a line at 820px.
  const family = keyboardShown ? familyLine(step.ref) : null

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
            {(showDirection || family || step.support > 0) && (
              <div class="support__tools">
                {showDirection && (
                  <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} label="Fingering direction" />
                )}
                {family && <p class="support__family">{family}</p>}
                {step.support > 0 && (
                  <button type="button" class="btn btn--quiet-line peek" aria-pressed={showKeyboard} onClick={peek}>
                    {showKeyboard ? 'Hide keyboard' : 'Peek at keyboard'}
                  </button>
                )}
              </div>
            )}
            <Support step={step} octaves={settings.octaves} showKeyboard={showKeyboard} direction={direction} />
          </div>
          <div class="step__foot">
            <div class="reps" role="group" aria-label="Reps">
              {REPS.map((r, i) => {
                const tile = tiles[i]
                const res = tile?.result ? tileResult(tile.result) : null
                if (!res) {
                  return (
                    <button
                      key={i}
                      type="button"
                      class={`btn rep rep--${r.hand}`}
                      aria-pressed={tile?.ticked ?? false}
                      onClick={() => setTiles((ts) => toggleTile(ts, i))}
                    >
                      {tile?.ticked && <Check />}
                      {r.label}
                    </button>
                  )
                }
                // A detected rep: its result on the tile; a tap opens the result card (with Untick).
                return (
                  <button
                    key={i}
                    type="button"
                    class={`btn rep rep--${r.hand} rep--detected`}
                    aria-pressed="true"
                    aria-haspopup="dialog"
                    aria-label={`${r.label}: ${res.clean ? 'clean' : res.slips}${res.evenness ? `, evenness ${res.evenness}` : ''}`}
                    onClick={() => setOpenTile(i)}
                  >
                    <span class="rep__label">{r.label}</span>
                    <span class="rep__result">
                      {res.clean ? <Check /> : <span class="rep__slips">{res.slips}</span>}
                      {res.evenness && <span class="rep__even">{res.evenness}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <RatingBar
              options={['nailed', 'shaky', 'lost']}
              onRate={(r) => onRate(r, { peeked })}
              disabledNailed={peeked}
              suggested={suggested}
            />
            {peeked && <p class="step__hint">Peeked: max Shaky</p>}
          </div>
        </>
      )}
      {openTile !== null && open && (
        <RunResultDialog
          title={repTitle(openTile)}
          outcome={open}
          onClose={() => setOpenTile(null)}
          onUntick={() => {
            setTiles((ts) => untick(ts, openTile))
            setOpenTile(null)
          }}
        />
      )}
    </div>
  )
}
