// One Guided or Check run on the Play tab, as a small controller over the pure play modules. No Preact, no window:
// time comes in on the events and through tick(now), so it is unit tested in node.
import { EMPTY_HELD, reduceHeld, type HeldState } from '../../../midi/held'
import type { MidiEvent } from '../../../midi/parse'
import { analyseRun, describeIssue, type RunAnalysis } from '../../../play/analyse'
import { createGuide, guideNext, guideResult, guideStep, type GuideNext, type GuideState, type GuideTarget } from '../../../play/guide'
import { createRunDetector, type FinishedRun } from '../../../play/runDetect'
import { expectedRun, type Expected } from '../../../play/sequence'
import { chroma } from '../../../theory/scales'
import { preferFor, type PlayHand, type PlayMode, type PlayTarget } from './playView'

export interface RunOutcome {
  kind: 'guided' | 'check'
  slips: number
  /** Check only: each issue in plain words ("Played F instead of F♯ going up"). Guided only counts slips. */
  issues: string[]
  evenness: number | null
  tempo: number | null
  /** Gaps (ms) between the onsets the timing was judged on, for the interval strip. */
  intervals: number[]
}

export interface PlayRun {
  /** Feed one keyboard event. `flash`: Guided's wrong note. `outcome`: set once, when this event finishes the run. */
  handle(e: MidiEvent): { flash: number | null; outcome: RunOutcome | null }
  /** Check: call every 250 ms; finishes a run after its silence windows. */
  tick(now: number): RunOutcome | null
  /** Guided: the next note(s) to play; null in Check or once done. */
  next(): GuideNext
  /** Guided state (null in Check). */
  guide(): GuideState | null
  /**
   * True when a note-on of this pitch can start the next run: the scale's tonic or the chord's root, by pitch class.
   * Check: the detector's start condition, so the card hides only when the next attempt starts. Guided: P16.
   */
  restartsOn(midi: number): boolean
  /**
   * Abandon the run in progress (device unplugged, Reset keys, Go again). Nothing is reported for it. `held`: the keys
   * still down to restart from (default none, as after clearKeyboard).
   */
  clear(held?: HeldState): void
}

const gaps = (onsets: number[]): number[] => onsets.slice(1).map((t, i) => t - (onsets[i] as number))

const pc = (midi: number): number => ((midi % 12) + 12) % 12

/** Guided target: chords are stepped through every inversion, so the chosen inversion doesn't matter. */
function guideTargetFor(target: Exclude<PlayTarget, { kind: 'none' }>, hand: PlayHand): GuideTarget {
  if (target.kind === 'chord') return { kind: 'chord', root: target.root, type: target.type }
  return { kind: 'scale', ref: target.ref, octaves: target.octaves, hand }
}

function guidedRun(target: Exclude<PlayTarget, { kind: 'none' }>, hand: PlayHand, initialHeld: HeldState): PlayRun {
  // One target object for the life of this run: guide.ts caches per target object.
  const gt = guideTargetFor(target, hand)
  let state = createGuide(gt)
  // Own held reduction (not the heldNotes signal), so guideStep always sees the state after this event. Seeded with the
  // keys (and pedal) already down when the run starts.
  let held: HeldState = initialHeld
  const startPc = chroma(target.kind === 'chord' ? target.root : target.ref.root)
  const restartsOn = (midi: number): boolean => pc(midi) === startPc
  return {
    handle(e) {
      held = reduceHeld(held, e).state
      // P16: once done, a tonic (chord: root) starts the same target again, and this note is its first.
      if (state.done && e.type === 'on' && restartsOn(e.midi)) state = createGuide(gt)
      const wasDone = state.done
      const step = guideStep(state, e, held)
      state = step.state
      if (!state.done || wasDone) return { flash: step.flash, outcome: null }
      const r = guideResult(state)
      // Chords: the gaps between inversions are not a tempo, so the card shows no timing.
      const timing =
        gt.kind === 'chord'
          ? { evenness: null, tempo: null, intervals: [] }
          : { evenness: r.evenness, tempo: r.tempo, intervals: gaps(state.onsets) }
      return { flash: step.flash, outcome: { kind: 'guided', slips: r.slips, issues: [], ...timing } }
    },
    tick: () => null,
    next: () => guideNext(state),
    guide: () => state,
    restartsOn,
    clear(next = EMPTY_HELD) {
      state = createGuide(gt)
      held = next
    },
  }
}

/** A detected run analysed against `expected`, as a Check result: issues in plain words, timing for the strip. */
export function judgeRun(expected: Expected[], run: FinishedRun, prefer: '#' | 'b'): RunOutcome {
  return outcomeOf(analyseRun(expected, run.notes, { together: run.hand === 'together', prefer }), prefer)
}

/** An analysis as a Check result (for callers that also need the analysis itself, e.g. its octave offset). */
export function outcomeOf(a: RunAnalysis, prefer: '#' | 'b'): RunOutcome {
  const issues = [...a.wrong, ...a.missed, ...a.extra]
    .sort((x, y) => x.index - y.index)
    .map((i) => describeIssue(i, prefer))
  return { kind: 'check', slips: a.slips, issues, evenness: a.evenness, tempo: a.tempo, intervals: gaps(a.onsets) }
}

function checkRun(target: Extract<PlayTarget, { kind: 'scale' }>): PlayRun {
  // P3: every run is judged against the RH run from octave 4; the octave-offset search absorbs LH and Together.
  const expected = expectedRun(target.ref, target.octaves, 4)
  const prefer = preferFor(target.ref)
  const tonicPc = chroma(target.ref.root)
  const detector = createRunDetector({ tonicPc, expectedLength: expected.length })
  const judge = (run: FinishedRun | null): RunOutcome | null => (run ? judgeRun(expected, run, prefer) : null)
  return {
    handle(e) {
      if (e.type !== 'on') return { flash: null, outcome: null }
      return { flash: null, outcome: judge(detector.push({ midi: e.midi, t: e.t })) }
    },
    tick: (now) => judge(detector.tick(now)),
    next: () => null,
    guide: () => null,
    restartsOn: (midi) => pc(midi) === tonicPc,
    clear: () => detector.reset(),
  }
}

/** What a restart touches besides the run itself (React state in usePlayRun). */
export interface RestartHooks {
  clearResult(): void
  clearFlash(): void
  /** Always: clearing the run changes nothing React can see, so the next mark and status would stay stale. */
  rerender(): void
}

/** Restart / Go again: the run starts over from the keys still down, and the card, the flash and the view refresh. */
export function restartRun(run: PlayRun | null, held: HeldState, hooks: RestartHooks): void {
  run?.clear(held)
  hooks.clearResult()
  hooks.clearFlash()
  hooks.rerender()
}

/**
 * Null when the mode has no run (Free) or the target can't be run in that mode. `held`: the keys already down (the
 * caller passes heldNotes.peek(); this module stays free of the signal).
 */
export function createPlayRun(mode: PlayMode, target: PlayTarget, hand: PlayHand, held: HeldState = EMPTY_HELD): PlayRun | null {
  if (mode === 'guided' && target.kind !== 'none') return guidedRun(target, hand, held)
  if (mode === 'check' && target.kind === 'scale') return checkRun(target)
  return null
}

// ---- result card ----

/** Issue lines shown on the card; the rest are counted. */
const MAX_LINES = 4

export interface ResultView {
  clean: boolean
  headline: string
  lines: string[]
  more: string | null
  /** Show the timing block (evenness, strip, tempo): false when neither evenness nor tempo is known (chords). */
  timing: boolean
  evenness: string
  tempo: string
  /** Interval bar heights, 0..1 of the longest gap. */
  bars: number[]
}

export function resultView(o: RunOutcome): ResultView {
  const clean = o.slips === 0
  const lines = o.kind === 'check' ? o.issues.slice(0, MAX_LINES) : []
  const rest = o.kind === 'check' ? o.issues.length - lines.length : 0
  const longest = Math.max(0, ...o.intervals)
  return {
    clean,
    headline: clean ? 'Clean run ✓' : `${o.slips} slip${o.slips === 1 ? '' : 's'}`,
    lines,
    more: rest > 0 ? `and ${rest} more` : null,
    timing: o.evenness !== null || o.tempo !== null,
    evenness: o.evenness === null ? '—' : `${Math.round(o.evenness * 100)}%`,
    tempo: `♩ ≈ ${o.tempo ?? '—'}`,
    bars: longest > 0 ? o.intervals.map((g) => g / longest) : [],
  }
}
