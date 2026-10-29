import { collapsePairs } from './analyse'
import type { PlayedNote } from './analyse'
import {
  LH_MEDIAN_BELOW,
  MIN_RUN_NOTES,
  PAIR_WINDOW_MS,
  RUN_END_SILENCE_MS,
  RUN_START_SILENCE_MS,
  TOGETHER_PAIR_RATIO,
} from './thresholds'

export type RunHand = 'rh' | 'lh' | 'together'

export interface FinishedRun {
  notes: PlayedNote[]
  hand: RunHand
}

/**
 * Together when at least TOGETHER_PAIR_RATIO of the onsets belong to octave pairs (exactly 12 apart, within
 * PAIR_WINDOW_MS). Otherwise left hand when the median pitch is below LH_MEDIAN_BELOW, else right hand.
 */
export function classifyHand(notes: PlayedNote[]): RunHand {
  if (notes.length === 0) return 'rh'
  const pairedOnsets = 2 * (notes.length - collapsePairs(notes).length)
  if (pairedOnsets / notes.length >= TOGETHER_PAIR_RATIO) return 'together'
  const midis = notes.map((n) => n.midi).sort((a, b) => a - b)
  const mid = midis.length >> 1
  const median = midis.length % 2 ? (midis[mid] as number) : ((midis[mid - 1] as number) + (midis[mid] as number)) / 2
  return median < LH_MEDIAN_BELOW ? 'lh' : 'rh'
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
 * - A run finishes when its collapsed length (Together pairs count once) reaches expectedLength on a tonic note,
 *   or after RUN_END_SILENCE_MS of silence (tick), or when a tonic arrives RUN_START_SILENCE_MS or more after the
 *   last note (that tonic starts the next run).
 * - Runs under MIN_RUN_NOTES collapsed notes are discarded (null).
 * - After any finish or discard the detector is fresh. A new start is allowed at once after a finish-by-tonic, not
 *   only after RUN_START_SILENCE_MS of quiet, because Chris often goes straight into the next rep.
 * - Together: the final tonic is an octave pair, and its first note alone already reaches the length. A run that
 *   reads as Together so far therefore waits for the partner (or PAIR_WINDOW_MS of quiet) before finishing.
 */
export function createRunDetector(opts: { tonicPc: number; expectedLength: number }): RunDetector {
  let notes: PlayedNote[] = []
  let pending = false // Together run at full length, waiting to see whether the final pair's partner arrives.

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
    let closed: FinishedRun | null = null

    if (notes.length > 0) {
      const gap = n.t - last().t
      if (pending && !pairsWith(last(), n)) {
        closed = finish()
      } else if (gap >= RUN_END_SILENCE_MS || (gap >= RUN_START_SILENCE_MS && isTonic(n))) {
        closed = finish()
      }
    }

    if (notes.length === 0) {
      if (isTonic(n)) notes = [n]
      return closed
    }

    notes.push(n)
    if (pending) return finish() // n is the partner of the final pair.
    if (isTonic(n) && collapsePairs(notes).length >= opts.expectedLength) {
      if (classifyHand(notes) === 'together') {
        pending = true
        return null
      }
      return finish()
    }
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
