import { audioReady } from '../../audio/unlock'
import { midiStatus } from '../../midi/access'
import { app } from '../state'
import { UNLOCK_PROMPT, needsUnlockTap } from './midiChipView'

/**
 * "Tap anywhere to turn on sound" for screens without a MidiChip (Today, Library, Progress, Placement), where an
 * auto-connected keyboard would otherwise play silently with no hint why. Same rule as the chip (needsUnlockTap);
 * the tap itself is caught by src/ui/unlockOnTap.ts.
 */
export function UnlockPrompt() {
  if (!needsUnlockTap(midiStatus.value, audioReady.value, app.value.settings.keyboardSound)) return null
  return (
    <div class="banner banner--sound" role="status">
      <span class="banner__mark" aria-hidden="true" />
      <p class="banner__text">{UNLOCK_PROMPT}</p>
    </div>
  )
}
