import * as Tone from 'tone'
import { signal } from '@preact/signals'

/** True once the AudioContext is running. Every audio function is a no-op until then. */
export const audioReady = signal(false)

let watching = false

/** Call from a user gesture (tap). Never throws; leaves audioReady false on failure. */
export async function unlockAudio(): Promise<void> {
  try {
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
