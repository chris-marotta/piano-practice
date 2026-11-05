import { useEffect } from 'preact/hooks'
import { KEYS_DEF } from '../../../drill/keys'
import { STAFF_DEF } from '../../../drill/staff'
import { loadPiano, stopAll } from '../../../audio/piano'
import { audioReady, unlockAudio } from '../../../audio/unlock'
import { midiStatus } from '../../../midi/access'
import { clearKeyboard, emitKeyboard, heldNotes, onKeyboard } from '../../../midi/input'
import { formatNote, formatScale } from '../../../theory/format'
import { keyboardBox, keyboardFitVars } from '../../components/keyboardLayout'
import { KEYS_UI } from '../../components/keysUi'
import { STAFF_UI } from '../../components/staffUi'
import { MidiChip } from '../../components/MidiChip'
import { Segmented } from '../../components/Segmented'
import { app, update } from '../../state'
import { ScrollKeyboard } from '../steps/ScrollKeyboard'
import { withSettings } from '../settingsView'
import { Toggle } from '../steps/Toggle'
import { useDrone } from '../steps/useAudio'
import { PickerSummary, PlayPicker } from './PlayPicker'
import { PlayDrill } from './PlayDrill'
import {
  fitted,
  hand,
  headSummary,
  keyWindow,
  mode,
  octavesSel,
  pickerCollapsed,
  playHand,
  playMode,
  playTarget,
  resetWindow,
  toggles,
} from './playState'
import {
  checkAvailable,
  chordReadout,
  effectiveToggles,
  fitHand,
  followsNotes,
  guideAvailable,
  guidedStatus,
  KEYS_ROUND_QUESTIONS,
  pickerSummary,
  STAFF_ROUND_QUESTIONS,
  playMarks,
  reserveRowsFor,
  shiftWindow,
  showConnectHint,
  shownWindow,
  targetTitle,
  type PlayHand,
  type PlayLabels,
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
  { value: 'keys', label: 'Keys' },
  { value: 'staff', label: 'Staff' },
]

const HANDS: { value: PlayHand; label: string }[] = [
  { value: 'rh', label: 'RH' },
  { value: 'lh', label: 'LH' },
  { value: 'together', label: 'Together' },
]

const LABELS: { value: PlayLabels; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'names', label: 'Names' },
  { value: 'degrees', label: 'Degrees' },
]

const EMPTY_STATE = 'Connect a keyboard for the full experience.'
const HINT_ID = 'play-mode-hint'
/** On-screen taps have no velocity: a medium touch. */
const TAP_VELOCITY = 80
/**
 * ASSUMED: white-key width cap (px). A 15-white-key window then fills the 1132px column at 1180 and 1440 wide
 * (15 x 80 = 1200) unless the height runs out first (play.css), and a short window doesn't grow giant keys.
 */
const PLAY_KEY_PX = 80

function modeHint(mode: PlayMode, target: PlayTarget): string | null {
  if (mode === 'keys' || mode === 'staff') return null
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
  const m = playMode.value
  const h = playHand.value
  const t = toggles.value
  // Check forces the mark toggles off; with nothing picked they have nothing to show, so they read Off too.
  const forced = effectiveToggles(m, t)
  const shown = target.kind === 'none' ? { ...forced, highlight: false, colours: false, fingers: false } : forced
  const held = heldNotes.value.held
  const playLabels = app.value.settings.playLabels
  const { run, outcome, flash, again } = usePlayRun(m, target, h)
  const guide = run?.guide() ?? null
  const win = shownWindow({ mode: m, target, fitted: fitted.value, follow: keyWindow.value, guide })
  const drill = m === 'keys' || m === 'staff'
  const droneOn = t.drone && target.kind !== 'none' && !drill
  useDrone(rootOf(target), droneOn, app.value.settings.droneVolumeDb)

  useEffect(() => {
    pickerCollapsed.value = false
    // A note off screen moves the window by whole octaves (the Roli's octave buttons); a guided scale follows its lock.
    const off = onKeyboard((e) => {
      if (e.type === 'on') pickerCollapsed.value = true
      if (e.type === 'on' && followsNotes(playMode.peek(), playTarget.peek())) {
        keyWindow.value = shiftWindow(keyWindow.peek(), e.midi)
      }
    })
    return () => {
      off()
      pickerCollapsed.value = false
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
  const hint = modeHint(m, target)
  const marksLocked = m === 'check' || target.kind === 'none'
  const marks = playMarks({ mode: m, target, toggles: t, labels: playLabels, held, next: run?.next() ?? null, window: win, flash, guide })
  const reserve = reserveRowsFor(m, target, h)
  const fit = keyboardFitVars(keyboardBox(win.low, win.high, marks, reserve), PLAY_KEY_PX)
  const status = m === 'guided' && guide ? guidedStatus(target, h, guide) : null
  // Guided and Check: start the run over (slips, result card, and the keyboard back to its fitted window).
  const restart = () => {
    again()
    resetWindow()
  }
  const collapsed = pickerCollapsed.value

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
        {m === 'staff' && <p class="play-keys__summary play-head__summary">{headSummary.value}</p>}
        {m === 'staff' && (
          <Toggle
            label="Exact octave"
            on={app.value.settings.staffExactOctave}
            onChange={(on) => update((st) => withSettings(st, { staffExactOctave: on }))}
          />
        )}
        <div class="play-head__chip">
          <MidiChip />
        </div>
      </header>

      {m === 'keys' ? (
        <PlayDrill key="keys" def={KEYS_DEF} ui={KEYS_UI} count={KEYS_ROUND_QUESTIONS} mode="keys" />
      ) : m === 'staff' ? (
        <PlayDrill
          key="staff"
          def={STAFF_DEF}
          ui={STAFF_UI}
          count={STAFF_ROUND_QUESTIONS}
          mode="staff"
          summaryInHead
          exactOctave={app.value.settings.staffExactOctave}
        />
      ) : (
        <>
          {collapsed ? (
            <PickerSummary
              summary={pickerSummary(target, octavesSel.value, m, fitHand(m, target, hand.value))}
              canRandom={target.kind !== 'none'}
              onExpand={() => (pickerCollapsed.value = false)}
              onRestart={restart}
            />
          ) : (
            <PlayPicker />
          )}

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
            <div class="play-labels">
              <span class="play-labels__title">Labels</span>
              <Segmented
                options={LABELS}
                value={playLabels}
                onChange={(v) => update((st) => withSettings(st, { playLabels: v }))}
                label="Labels"
              />
            </div>
          </div>

          {/* The keyboard grows to the column width or the room left (play.css); the band takes the rest. */}
          <div class="play-stage">
            {/* Persistent live region: the readout, guided progress and result card are announced as they change. */}
            <div class="play-band" aria-live="polite">
              {outcome ? (
                <RunResult outcome={outcome} onAgain={restart} />
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
                    {m !== 'free' && !collapsed && (
                      <button type="button" class="btn play-restart" onClick={restart}>
                        Restart
                      </button>
                    )}
                    {showConnectHint(midiStatus.value) && <p class="play-empty">{EMPTY_STATE}</p>}
                  </div>
                </div>
              )}
            </div>

            <div class="play-keyboard" style={fit}>
              <ScrollKeyboard
                low={win.low}
                high={win.high}
                marks={marks}
                firstMidi={win.low}
                reserveRows={reserve}
                maxKeyPx={PLAY_KEY_PX}
                onKeyPress={onKeyPress}
              />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
