// Wires one Guided / Check run (playRun.ts) to the shared keyboard stream for the Play screen.
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { heldNotes, onClear, onKeyboard } from '../../../midi/input'
import { createPlayRun, type PlayRun, type RunOutcome } from './playRun'
import type { PlayHand, PlayMode, PlayTarget } from './playView'

/** Wrong-note flash (Global Constraints). */
const FLASH_MS = 400
/** Check: the run detector's silence windows are checked this often. */
const TICK_MS = 250

export interface PlayRunView {
  run: PlayRun | null
  /** The finished run's result, while it should show (Guided: until the run restarts). */
  outcome: RunOutcome | null
  flash: number | null
  again: () => void
}

/**
 * A fresh run for each mode / target / hand. Every keyboard event goes to it; Check ticks every 250 ms.
 * onClear (device unplugged, Reset keys) abandons the run in progress: no result is reported for it.
 */
export function usePlayRun(mode: PlayMode, target: PlayTarget, hand: PlayHand): PlayRunView {
  // Seeded with the keys already down, so a chord held while switching to Guided still counts.
  const run = useMemo(() => createPlayRun(mode, target, hand, heldNotes.peek()), [mode, target, hand])
  const [result, setResult] = useState<{ run: PlayRun; outcome: RunOutcome } | null>(null)
  const [flash, setFlash] = useState<number | null>(null)
  const [, setVersion] = useState(0)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const bump = () => setVersion((v) => v + 1)

  // Layout effect: subscribed as soon as the new run is committed, not a frame later, so a note played right
  // after a mode or target change isn't lost.
  useLayoutEffect(() => {
    setFlash(null)
    if (!run) return
    const report = (outcome: RunOutcome | null) => {
      if (outcome) setResult({ run, outcome })
    }
    const offKeys = onKeyboard((e) => {
      // Check: the next attempt starting (a tonic, the detector's start condition) hides the last card, so brushing
      // another key while reading it doesn't. A result from this same event still shows below.
      if (mode === 'check' && e.type === 'on' && run.restartsOn(e.midi)) setResult(null)
      const r = run.handle(e)
      if (r.flash !== null) {
        setFlash(r.flash)
        clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS)
      }
      report(r.outcome)
      bump()
    })
    const offClear = onClear(() => {
      run.clear()
      setFlash(null)
      bump()
    })
    const timer = mode === 'check' ? setInterval(() => report(run.tick(performance.now())), TICK_MS) : undefined
    return () => {
      offKeys()
      offClear()
      clearInterval(timer)
      clearTimeout(flashTimer.current)
    }
  }, [run, mode])

  const again = () => {
    run?.clear(heldNotes.peek())
    setResult(null)
    setFlash(null)
  }

  // Guided shows its card while the guide is done (cleared, or restarted on a tonic per P16, it is running again);
  // Check shows it until the next attempt's first tonic or Go again.
  const guide = run?.guide() ?? null
  const showing = result !== null && result.run === run && (guide === null || guide.done)
  return { run, outcome: showing ? result.outcome : null, flash, again }
}
