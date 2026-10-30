// Session auto-check wiring (spec §6): the shared keyboard stream into a scale step's run checker and a chord step's
// matches. Both are off (no subscription, no timer) unless `on` (the keyboard is connected).
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { heldNotes, onClear, onKeyboard } from '../../../midi/input'
import type { DiatonicChord } from '../../../theory/chords'
import type { ScaleRef } from '../../../theory/scales'
import { chordMatched, createStepChecker, type RepKind, type StepRun } from './autoCheck'

/** The run detector's silence windows are checked this often. */
const TICK_MS = 250

/**
 * One run checker for the step while `on`. `current` names the hand of the tile the next run fills (read when a run
 * finishes, so it may change freely without rebuilding the checker). Every finished run goes to `onRun`. onClear (unplug, Reset keys) abandons
 * the run in progress. A layout effect, so a note played right after mounting or connecting is not lost.
 */
export function useScaleRuns(ref: ScaleRef, current: () => RepKind | null, on: boolean, onRun: (r: StepRun) => void): void {
  const cb = useRef(onRun)
  cb.current = onRun
  const cur = useRef(current)
  cur.current = current
  useLayoutEffect(() => {
    if (!on) return
    const checker = createStepChecker(ref, () => cur.current())
    const report = (r: StepRun | null) => {
      if (r) cb.current(r)
    }
    const offKeys = onKeyboard((e) => {
      if (e.type === 'on') report(checker.push({ midi: e.midi, t: e.t }))
    })
    const offClear = onClear(() => checker.reset())
    const timer = setInterval(() => report(checker.tick(performance.now())), TICK_MS)
    return () => {
      offKeys()
      offClear()
      clearInterval(timer)
    }
  }, [ref, on])
}

/**
 * Indexes of the chords held correctly (pitch classes, any inversion) since the step was entered. Sticky: a match stays
 * for the life of the step, through disconnects.
 */
export function useChordMatches(chords: DiatonicChord[], on: boolean): ReadonlySet<number> {
  const [matched, setMatched] = useState<ReadonlySet<number>>(() => new Set())
  useLayoutEffect(() => {
    if (!on) return
    return onKeyboard((e) => {
      if (e.type === 'pedal') return
      // heldNotes is updated by input.ts's own listener, registered before any screen's, so this is post-event.
      const held = heldNotes.peek().held
      const hits = chords.flatMap((c, i) => (chordMatched(held, c.root, c.type) ? [i] : []))
      if (hits.length === 0) return
      setMatched((m) => (hits.every((i) => m.has(i)) ? m : new Set([...m, ...hits])))
    })
  }, [chords, on])
  return matched
}
