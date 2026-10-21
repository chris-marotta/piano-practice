// Step audio lifecycles. Every audio call is a no-throw no-op until audio is unlocked.
import { useEffect, useRef } from 'preact/hooks'
import { startDrone, stopDrone } from '../../../audio/drone'
import { startMetronome, stopMetronome } from '../../../audio/metronome'
import { stopAll } from '../../../audio/piano'
import { audioReady } from '../../../audio/unlock'

/** Drone on `root` while `on` (and audio is ready); stops when turned off or the step unmounts. */
export function useDrone(root: string, on: boolean, volumeDb: number): void {
  const ready = audioReady.value
  useEffect(() => {
    if (!on || !ready) return
    startDrone(root, volumeDb)
    return () => stopDrone()
  }, [root, on, ready, volumeDb])
}

/** Metronome at `bpm` while `on`; stops when turned off or the step unmounts. */
export function useMetronome(bpm: number, on: boolean): void {
  const ready = audioReady.value
  useEffect(() => {
    if (!on || !ready) return
    startMetronome(bpm)
    return () => stopMetronome()
  }, [bpm, on, ready])
}

/** Leaving a step silences everything it started: piano playback, drone, metronome. */
export function useSilenceOnLeave(): void {
  useEffect(() => () => stopAll(), [])
}

/** False once the step has unmounted: check it after any await before starting audio. */
export function useMounted(): { readonly current: boolean } {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}
