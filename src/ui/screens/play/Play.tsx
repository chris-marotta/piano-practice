import { useEffect } from 'preact/hooks'
import { loadPiano, stopAll } from '../../../audio/piano'
import { audioReady, unlockAudio } from '../../../audio/unlock'
import { midiStatus } from '../../../midi/access'
import { clearKeyboard, emitKeyboard, heldNotes, onKeyboard } from '../../../midi/input'
import { formatNote, formatScale } from '../../../theory/format'
import { MidiChip } from '../../components/MidiChip'
import { Segmented } from '../../components/Segmented'
import { app } from '../../state'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import { Toggle } from '../steps/Toggle'
import { useDrone } from '../steps/useAudio'
import { PlayPicker } from './PlayPicker'
import { hand, keyWindow, mode, playTarget, toggles } from './playState'
import {
  checkAvailable,
  chordReadout,
  effectiveMode,
  effectiveToggles,
  guideAvailable,
  guidedStatus,
  playMarks,
  reserveRowsFor,
  shiftWindow,
  showConnectHint,
  targetTitle,
  type PlayHand,
  type PlayMode,
  type PlayTarget,
  type PlayToggles,
} from './playView'
import { RunResult } from './RunResult'
import { usePlayRun } from './usePlayRun'

const MODES: { value: PlayMode; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'guided', label: 'Guided' },
  { value: 'check', label: 'Check' },
]

const HANDS: { value: PlayHand; label: string }[] = [
  { value: 'rh', label: 'RH' },
  { value: 'lh', label: 'LH' },
  { value: 'together', label: 'Together' },
]

const EMPTY_STATE = 'Connect a keyboard for the full experience.'
const HINT_ID = 'play-mode-hint'
/** On-screen taps have no velocity: a medium touch. */
const TAP_VELOCITY = 80

function modeHint(target: PlayTarget): string | null {
  if (target.kind === 'none') return 'Pick a scale or chord for Guided and Check'
  if (!checkAvailable(target)) return 'Check works with scales'
  return null
}

const rootOf = (t: PlayTarget): string => (t.kind === 'scale' ? t.ref.root : t.kind === 'chord' ? t.root : 'C')

/**
 * A tap on the on-screen keys is the gesture that turns sound on (iPad: no MIDI, no chip prompt). Called on press and
 * on release: for touch, pointerdown is not a user activation (pointerup is), so on an iPad from a cold start the
 * first key's release is what unlocks audio. That first note stays silent; the ones after it sound.
 */
function ensureSound(): void {
  if (audioReady.peek()) {
    void loadPiano()
    return
  }
  void unlockAudio().then(() => {
    if (audioReady.peek()) void loadPiano()
  })
}

function onKeyPress(midi: number, down: boolean): void {
  const t = performance.now()
  ensureSound()
  if (down) emitKeyboard({ type: 'on', midi, velocity: TAP_VELOCITY, t })
  else emitKeyboard({ type: 'off', midi, t })
}

/** Play against a scale, a chord or nothing: Free (marks + chord name), Guided (next note) or Check (from memory). */
export function Play() {
  const target = playTarget.value
  const m = effectiveMode(mode.value, target)
  // Hand only shapes a guided scale; elsewhere a hand change must not restart the run.
  const h: PlayHand = m === 'guided' && target.kind === 'scale' ? hand.value : 'rh'
  const t = toggles.value
  // Check forces the mark toggles off; with nothing picked they have nothing to show, so they read Off too.
  const forced = effectiveToggles(m, t)
  const shown = target.kind === 'none' ? { ...forced, highlight: false, colours: false, fingers: false } : forced
  const win = keyWindow.value
  const held = heldNotes.value.held
  const { run, outcome, flash, again } = usePlayRun(m, target, h)
  const droneOn = t.drone && target.kind !== 'none'
  useDrone(rootOf(target), droneOn, app.value.settings.droneVolumeDb)

  useEffect(() => {
    // A note off screen moves the window by whole octaves (the Roli's octave buttons).
    const off = onKeyboard((e) => {
      if (e.type === 'on') keyWindow.value = shiftWindow(keyWindow.peek(), e.midi)
    })
    return () => {
      off()
      clearKeyboard()
      stopAll()
    }
  }, [])

  const setToggle = (key: keyof PlayToggles) => (on: boolean) => {
    if (key === 'drone' && on) void unlockAudio()
    toggles.value = { ...toggles.value, [key]: on }
  }
  const disabledModes: PlayMode[] = [
    ...(guideAvailable(target) ? [] : (['guided'] as const)),
    ...(checkAvailable(target) ? [] : (['check'] as const)),
  ]
  const hint = modeHint(target)
  const marksLocked = m === 'check' || target.kind === 'none'
  const marks = playMarks({ mode: m, target, toggles: t, held, next: run?.next() ?? null, window: win, flash })
  const guide = run?.guide() ?? null
  const status = m === 'guided' && guide ? guidedStatus(target, h, guide) : null

  return (
    <section class="screen play">
      <header class="play-head">
        <h1 class="screen__title">Play</h1>
        <Segmented
          options={MODES}
          value={m}
          onChange={(v) => (mode.value = v)}
          label="Mode"
          disabledValues={disabledModes}
          describedBy={hint ? HINT_ID : undefined}
        />
        {hint && (
          <p class="play-hint" id={HINT_ID}>
            {hint}
          </p>
        )}
        <div class="play-head__chip">
          <MidiChip />
        </div>
      </header>

      <PlayPicker />

      <div class="play-row play-controls">
        {m === 'guided' && target.kind === 'scale' && (
          <Segmented options={HANDS} value={hand.value} onChange={(v) => (hand.value = v)} label="Hand" />
        )}
        <div class="play-toggles">
          <Toggle label="Highlight" on={shown.highlight} onChange={setToggle('highlight')} disabled={marksLocked} />
          <Toggle label="Right / wrong" on={shown.colours} onChange={setToggle('colours')} disabled={marksLocked} />
          <Toggle label="Fingers" on={shown.fingers} onChange={setToggle('fingers')} disabled={marksLocked} />
          <Toggle label="Drone" on={droneOn} onChange={setToggle('drone')} disabled={target.kind === 'none'} />
        </div>
      </div>

      {/* Persistent live region: the readout, guided progress and result card are announced as they change. */}
      <div class="play-band" aria-live="polite">
        {outcome ? (
          <RunResult outcome={outcome} onAgain={again} />
        ) : (
          <div class="play-status">
            {m === 'free' && (
              <div class="play-status__main">
                <span class="play-status__label">Holding</span>
                <p class="play-readout">{chordReadout(held)}</p>
              </div>
            )}
            {status && (
              <div class="play-status__main">
                <p class="play-status__headline">{status.headline}</p>
                <p class="play-status__detail">{status.detail}</p>
              </div>
            )}
            {m === 'check' && target.kind === 'scale' && (
              <div class="play-status__main">
                <p class="play-status__headline">From memory: {formatScale(target.ref)}</p>
                <p class="play-status__detail">
                  Start on {formatNote(target.ref.root)}. The result shows when you finish.
                </p>
              </div>
            )}
            <div class="play-status__side">
              {m === 'free' && <p class="play-status__target">{targetTitle(target)}</p>}
              {showConnectHint(midiStatus.value) && <p class="play-empty">{EMPTY_STATE}</p>}
            </div>
          </div>
        )}
      </div>

      <div class="play-keyboard">
        <ScrollKeyboard
          low={win.low}
          high={win.high}
          marks={marks}
          firstMidi={win.low}
          reserveRows={reserveRowsFor(m, target, h)}
          onKeyPress={onKeyPress}
        />
      </div>
    </section>
  )
}
