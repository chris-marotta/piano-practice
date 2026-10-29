import * as Tone from 'tone'
import { signal } from '@preact/signals'

/** True once the AudioContext is running. Every audio function is a no-op until then. */
export const audioReady = signal(false)

let watching = false
let configured = false

/**
 * Swap Tone's default context for one tuned for live playing ('interactive' = smallest safe output
 * buffer). Must run before anything constructs a Tone node, since nodes bind to the context that is
 * current at construction. Idempotent; never throws (falls back to Tone's default context).
 */
export function configureAudioContext(): void {
  if (configured) return
  configured = true
  try {
    Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }))
  } catch {
    // keep Tone's default context
  }
}

/** Call from a user gesture (tap). Never throws; leaves audioReady false on failure. */
export async function unlockAudio(): Promise<void> {
  try {
    // iPad Silent Mode mutes Web Audio by default ("ambient" session). A practice app's piano,
    // drone and metronome must play like media, so ask for "playback" (Safari 17+). Before
    // Tone.start(), so the context starts in that session. Older browsers lack audioSession.
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } }
      if (nav.audioSession) nav.audioSession.type = 'playback'
    } catch {
      // Not supported or refused: carry on with the default session.
    }
    await Tone.start()
    const raw = Tone.getContext().rawContext as BaseAudioContext
    audioReady.value = raw.state === 'running'
    if (!watching) {
      watching = true
      // iOS suspends/interrupts the context (call, lock screen); the next tap re-runs unlockAudio.
      raw.addEventListener('statechange', () => {
        audioReady.value = raw.state === 'running'
      })
    }
  } catch {
    audioReady.value = false
  }
}
