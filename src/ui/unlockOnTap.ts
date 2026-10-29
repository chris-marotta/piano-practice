// The app-wide "tap anywhere to turn on sound" listener (spec §3.1). One for the whole app, on every screen: armed
// while a keyboard is connected, audio is still locked and Keyboard sound is on (needsUnlockTap); the next tap or key
// unlocks audio and starts loading the piano. MidiChip only shows the prompt.
import { computed, effect } from '@preact/signals'
import { loadPiano } from '../audio/piano'
import { audioReady, unlockAudio } from '../audio/unlock'
import { midiStatus } from '../midi/access'
import { needsUnlockTap } from './components/midiChipView'
import { app } from './state'

/**
 * pointerdown is a user activation for a mouse but not for touch, where pointerup is; keydown for a computer keyboard.
 * A failed try (no activation yet) leaves the listener armed for the next event.
 */
const TAP_EVENTS = ['pointerdown', 'pointerup', 'keydown'] as const

/** Call once at startup. Returns the disposer (tests, HMR). */
export function armUnlockOnTap(): () => void {
  const armed = computed(() => needsUnlockTap(midiStatus.value, audioReady.value, app.value.settings.keyboardSound))
  return effect(() => {
    if (!armed.value) return
    const onTap = () => {
      void unlockAudio().then(() => {
        if (audioReady.peek()) void loadPiano()
      })
    }
    // Capture phase, so a control that stops propagation still counts as the tap. Unlocking flips audioReady, which
    // disarms this effect and removes the listeners: one time only.
    for (const type of TAP_EVENTS) document.addEventListener(type, onTap, true)
    return () => {
      for (const type of TAP_EVENTS) document.removeEventListener(type, onTap, true)
    }
  })
}
