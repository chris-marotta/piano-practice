import { useEffect, useRef, useState } from 'preact/hooks'
import { playScale } from '../../../audio/piano'
import { unlockAudio } from '../../../audio/unlock'
import { midiStatus } from '../../../midi/access'
import { suggestRating } from '../../../play/suggest'
import { WRONG_SHAPE_NOTE_MS } from '../../../play/thresholds'
import type { Step } from '../../../session/builder'
import type { Settings } from '../../../srs/items'
import type { Rating } from '../../../srs/scheduler'
import { formatScale } from '../../../theory/format'
import { FingerRow } from '../../components/FingerRow'
import { RatingBar } from '../../components/RatingBar'
import { Segmented } from '../../components/Segmented'
import { update } from '../../state'
import {
  REP_KINDS,
  currentTile,
  emptyTiles,
  fillTile,
  tileResult,
  toggleTile,
  untick,
  wrongShapeText,
  type RepKind,
  type StepRun,
} from './autoCheck'
import { RunResultDialog } from './RunResultDialog'
import {
  familyLine,
  fingerRows,
  handPanels,
  hasDistinctDescent,
  keySignatureText,
  scaleHeader,
  SESSION_OCTAVES,
  SUPPORT_NAMES,
  type Direction,
  type Panel,
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
  showKeyboard: boolean
  direction: Direction
  /** The current rep tile's hand (connected only); the other hand's panel dims. Together lights both. */
  activeHand: RepKind | null
}

/** One hand's keyboard under a hand-coloured title. */
function HandPanel({ hand, panel, dim }: { hand: 'lh' | 'rh'; panel: Panel; dim: boolean }) {
  return (
    <section class={`hand-panel hand-panel--${hand}${dim ? ' hand-panel--dim' : ''}`}>
      <h2 class="hand-panel__title">{hand === 'lh' ? 'LEFT HAND' : 'RIGHT HAND'}</h2>
      <ScrollKeyboard
        low={panel.low}
        high={panel.high}
        marks={panel.marks}
        reserveRows="rh"
        badgesAbove
        firstMidi={Math.min(...panel.marks.map((m) => m.midi))}
      />
    </section>
  )
}

/**
 * Support display for the item's level: L0 a keyboard per hand (LH left, RH right), L1 finger rows in the same
 * columns, L2 key signature, L3 name only. Melodic minor descends as natural minor, so its keyboards follow
 * `direction` and its L1 shows a "Going up" and a "Coming down" pair (R16).
 */
function Support({ step, showKeyboard, direction, activeHand }: SupportProps) {
  if (step.support === 0 || showKeyboard) {
    const { lh, rh } = handPanels(step.ref, direction)
    return (
      <div class="support support--keyboard support--hands">
        <HandPanel hand="lh" panel={lh} dim={activeHand === 'rh'} />
        <HandPanel hand="rh" panel={rh} dim={activeHand === 'lh'} />
      </div>
    )
  }
  if (step.support === 1) {
    if (hasDistinctDescent(step.ref)) {
      const up = fingerRows(step.ref, SESSION_OCTAVES, 'up')
      const down = fingerRows(step.ref, SESSION_OCTAVES, 'down')
      return (
        <div class="support support--rows support--rows-split">
          <h2 class="support__dir">Going up</h2>
          <FingerRow notes={up.lh.notes} fingers={up.lh.fingers} hand="lh" />
          <FingerRow notes={up.rh.notes} fingers={up.rh.fingers} hand="rh" />
          <h2 class="support__dir">Coming down</h2>
          <FingerRow notes={down.lh.notes} fingers={down.lh.fingers} hand="lh" />
          <FingerRow notes={down.rh.notes} fingers={down.rh.fingers} hand="rh" />
        </div>
      )
    }
    const rows = fingerRows(step.ref, SESSION_OCTAVES)
    return (
      <div class="support support--rows">
        <FingerRow notes={rows.lh.notes} fingers={rows.lh.fingers} hand="lh" />
        <FingerRow notes={rows.rh.notes} fingers={rows.rh.fingers} hand="rh" />
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
  // The tile Chris tapped to play next (connected only). The current tile is this one if still empty, else the first empty.
  const [picked, setPicked] = useState<number | null>(null)
  const [wrongNote, setWrongNote] = useState<string | null>(null)
  const [openTile, setOpenTile] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction>('up')
  const mounted = useMounted()

  useSilenceOnLeave()
  useDrone(step.ref.root, settings.droneOn, settings.droneVolumeDb)
  useMetronome(step.tempo, settings.metronomeOn)

  // Auto-check only while a keyboard is connected; disconnected, the tiles are v1's hand toggles. Results already
  // detected stay on their tiles (and in the suggestion) after an unplug.
  const connected = midiStatus.value.kind === 'connected'
  // Refs, so a run that finishes reads the tile as it is now (not as of the render that built the checker).
  const live = useRef({ tiles, picked })
  live.current = { tiles, picked }
  const current = connected ? currentTile(tiles, picked) : null
  const currentKind = (): RepKind | null => {
    const i = currentTile(live.current.tiles, live.current.picked)
    return i === null ? null : REP_KINDS[i] ?? null
  }
  const onRun = (run: StepRun) => {
    const { tiles: ts, picked: p } = live.current
    const i = currentTile(ts, p)
    if (i === null) return
    if (run.kind === 'wrongShape') {
      // Never ticks anything: the same tile stays current.
      setWrongNote(wrongShapeText(run.heard, REP_KINDS[i] ?? 'rh'))
      return
    }
    const next = fillTile(ts, i, run.outcome)
    live.current = { tiles: next, picked: null }
    setTiles(next)
    setPicked(null)
    setWrongNote(null)
  }
  useScaleRuns(step.ref, currentKind, connected, onRun)
  useEffect(() => {
    if (wrongNote === null) return
    const id = setTimeout(() => setWrongNote(null), WRONG_SHAPE_NOTE_MS)
    return () => clearTimeout(id)
  }, [wrongNote])
  const results = tiles.flatMap((t) => (t.result ? [t.result] : []))
  const suggested = suggestRating(results, { peeked })
  const open = openTile === null ? null : tiles[openTile]?.result ?? null

  const play = async () => {
    await unlockAudio()
    if (!mounted.current) return // the step was left while audio was unlocking
    playScale(step.ref, SESSION_OCTAVES, step.tempo)
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
          <h1 class="step__title">{scaleHeader(step.ref, SESSION_OCTAVES, step.tempo)}</h1>
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
            <Support step={step} showKeyboard={showKeyboard} direction={direction} activeHand={current === null ? null : REP_KINDS[current] ?? null} />
          </div>
          <div class="step__foot">
            <div class="reps" role="group" aria-label="Reps">
              {REPS.map((r, i) => {
                const tile = tiles[i]
                const res = tile?.result ? tileResult(tile.result) : null
                const isCurrent = i === current
                if (!res) {
                  return (
                    <button
                      key={i}
                      type="button"
                      class={`btn rep rep--${r.hand}${isCurrent ? ' rep--current' : ''}`}
                      aria-pressed={tile?.ticked ?? false}
                      aria-current={isCurrent ? 'step' : undefined}
                      onClick={() => {
                        if (!connected) return setTiles((ts) => toggleTile(ts, i))
                        // Connected: pick an empty tile to play next; tapping the current one ticks it by hand.
                        if (tile?.ticked || isCurrent) return setTiles((ts) => toggleTile(ts, i))
                        setPicked(i)
                      }}
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
            {wrongNote && (
              <p class="step__hint step__hint--wrong" role="status">
                {wrongNote}
              </p>
            )}
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
