import { loadPiano } from '../../../audio/piano'
import { unlockAudio } from '../../../audio/unlock'
import { notice } from '../../state'
import { useMounted, useSilenceOnLeave } from '../steps/useAudio'

const PIANO_FAILED = "Piano sound didn't load. Everything else in the Library still works."

/**
 * Returns a ▶ handler: unlock audio first (the tap is the iOS gesture), load the piano (idempotent),
 * then play, unless the panel was left during the awaits. Leaving the panel stops playback.
 */
export function usePiano(): (play: () => void) => Promise<void> {
  const mounted = useMounted()
  useSilenceOnLeave()
  return async (play) => {
    await unlockAudio()
    const ok = await loadPiano()
    if (!mounted.current) return
    if (!ok) {
      notice.value = PIANO_FAILED
      return
    }
    play()
  }
}
