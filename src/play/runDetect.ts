import { collapsePairs } from './analyse'
import type { PlayedNote } from './analyse'
import {
  MIN_RUN_NOTES,
  PAIR_WINDOW_MS,
  RUN_END_SILENCE_MS,
  RUN_START_SILENCE_MS,
  TOGETHER_PAIR_RATIO,
} from './thresholds'

/**
 * 'single' is a one-hand run. Which hand it was is not decided here: callers take the hand from the current rep tile
 * (see autoCheck.ts). A pitch median got LH runs from G3, A3 or B3 wrong, and an octave guess is not needed now.
 */
export type RunHand = 'together' | 'single'

export interface FinishedRun {
  notes: PlayedNote[]
  hand: RunHand
}

/**
 * Together when at least TOGETHER_PAIR_RATIO of the onsets belong to octave pairs (exactly 12 apart, within
 * PAIR_WINDOW_MS), else single. For a single-hand run the hand comes from the current tile, not from here.
 */
export function classifyHand(notes: PlayedNote[]): RunHand {
  if (notes.length === 0) return 'single'
  const pairedOnsets = 2 * (notes.length - collapsePairs(notes).length)
  return pairedOnsets / notes.length >= TOGETHER_PAIR_RATIO ? 'together' : 'single'
}

export interface RunDetector {
  /** Feed one onset. Returns the finished run when this note completes (or closes) one. */
  push(n: PlayedNote): FinishedRun | null
  /** Call on a timer with the current time; finishes a run after RUN_END_SILENCE_MS of silence. */
  tick(now: number): FinishedRun | null
  reset(): void
}

/**
 * Streaming run detector for Check mode and session auto-check.
 *
 * - A run starts on a tonic note while the detector is fresh. Other notes before a start are ignored.
 * - A full-length run (collapsed length, Together pairs counting once, reaches expectedLength on a tonic note) does not
 *   finish at once: that final tonic may be the first note of an octave pair, and the partner must stay in the run.
 *   It finishes when the partner arrives (included), when any other note arrives (that note is handled fresh), or on
 *   tick after PAIR_WINDOW_MS of quiet. The hand is classified only at finish, with the partner counted.
 * - A run also finishes on tick after RUN_END_SILENCE_MS of silence, and when a note arrives that long after the last
 *   one, or a tonic arrives RUN_START_SILENCE_MS or more after it (that tonic starts the next run).
 * - Runs under MIN_RUN_NOTES collapsed notes are discarded (null); a note that closes one can still start the next.
 * - After any finish or discard the detector is fresh. A new start is allowed at once after a finish-by-tonic, not
 *   only after RUN_START_SILENCE_MS of quiet, because Chris often goes straight into the next rep.
 */
export function createRunDetector(opts: { tonicPc: number; expectedLength: number }): RunDetector {
  let notes: PlayedNote[] = []
  let pending = false // Full-length run waiting to see whether the final tonic's octave partner arrives.

  const isTonic = (n: PlayedNote): boolean => ((n.midi % 12) + 12) % 12 === opts.tonicPc

  const reset = (): void => {
    notes = []
    pending = false
  }

  const finish = (): FinishedRun | null => {
    const done = notes
    reset()
    if (collapsePairs(done).length < MIN_RUN_NOTES) return null
    return { notes: done, hand: classifyHand(done) }
  }

  const last = (): PlayedNote => notes[notes.length - 1] as PlayedNote

  const push = (n: PlayedNote): FinishedRun | null => {
    if (notes.length > 0 && pending && pairsWith(last(), n)) {
      notes.push(n)
      return finish()
    }

    let closed: FinishedRun | null = null
    if (notes.length > 0) {
      const gap = n.t - last().t
      if (pending || gap >= RUN_END_SILENCE_MS || (gap >= RUN_START_SILENCE_MS && isTonic(n))) closed = finish()
    }

    if (notes.length === 0) {
      if (isTonic(n)) notes = [n]
      return closed
    }

    notes.push(n)
    if (isTonic(n) && collapsePairs(notes).length >= opts.expectedLength) pending = true
    return null
  }

  const tick = (now: number): FinishedRun | null => {
    if (notes.length === 0) return null
    const quiet = now - last().t
    if (quiet >= RUN_END_SILENCE_MS || (pending && quiet >= PAIR_WINDOW_MS)) return finish()
    return null
  }

  return { push, tick, reset }
}

function pairsWith(a: PlayedNote, b: PlayedNote): boolean {
  return b.t - a.t <= PAIR_WINDOW_MS && Math.abs(b.midi - a.midi) === 12
}
