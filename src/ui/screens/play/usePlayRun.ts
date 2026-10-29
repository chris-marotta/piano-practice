// Wires one Guided / Check run (playRun.ts) to the shared keyboard stream for the Play screen.
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { onClear, onKeyboard } from '../../../midi/input'
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
  const run = useMemo(() => createPlayRun(mode, target, hand), [mode, target, hand])
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
  }, [run])

  const again = () => {
    run?.clear()
    setResult(null)
    setFlash(null)
  }

  // Guided shows its card while the guide is done (a cleared guide is running again); Check keeps the last card
  // until the next run finishes or Go again.
  const guide = run?.guide() ?? null
  const showing = result !== null && result.run === run && (guide === null || guide.done)
  return { run, outcome: showing ? result.outcome : null, flash, again }
}
