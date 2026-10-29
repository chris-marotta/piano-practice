import { useState } from 'preact/hooks'
import { loadPiano } from '../../audio/piano'
import { audioReady, unlockAudio } from '../../audio/unlock'
import { connectMidi, midiStatus } from '../../midi/access'
import { clearKeyboard } from '../../midi/input'
import { withSettings } from '../screens/settingsView'
import { app, update } from '../state'
import { RESET_LABEL, UNLOCK_PROMPT, chipView } from './midiChipView'

/** Connect click: unlock audio, start loading samples, then ask for MIDI, all inside the click. */
function connect(): Promise<void> {
  // Neither unlock nor sample loading is awaited: the MIDI permission prompt should open at once,
  // still inside the click, rather than after (up to 10 s of) sample loading.
  void unlockAudio()
  void loadPiano()
  return connectMidi({ onConnected: () => update((s) => withSettings(s, { midiEnabled: true })) })
}

/**
 * MIDI keyboard status (spec §3.1). The Connect button when off, the device name and "Reset keys"
 * when connected, otherwise a one-line explanation. After an automatic connect at startup (no click
 * yet), audio is still locked: it shows "Tap anywhere to turn on sound" (Keyboard sound on only).
 * The tap itself is caught app-wide by src/ui/unlockOnTap.ts, on every screen, chip or not.
 */
export function MidiChip() {
  const status = midiStatus.value
  const view = chipView(status, audioReady.value, app.value.settings.keyboardSound)
  const [connecting, setConnecting] = useState(false)

  const onConnect = async () => {
    setConnecting(true)
    try {
      await connect()
    } finally {
      setConnecting(false)
    }
  }

  if (view.action === 'connect') {
    return (
      <div class="midi-chip midi-chip--off">
        <button type="button" class="btn midi-chip__connect" disabled={connecting} onClick={onConnect}>
          {view.text}
        </button>
      </div>
    )
  }

  if (status.kind === 'connected') {
    return (
      <div class="midi-chip midi-chip--connected">
        <p class="midi-chip__status" role="status">
          <span class="midi-chip__dot" aria-hidden="true">
            ●
          </span>
          <span class="midi-chip__name">{status.name}</span>
        </p>
        {view.action === 'reset' && (
          <button type="button" class="btn btn--quiet-line midi-chip__reset" onClick={() => clearKeyboard()}>
            {RESET_LABEL}
          </button>
        )}
        {view.needsTap && <p class="midi-chip__prompt">{UNLOCK_PROMPT}</p>}
      </div>
    )
  }

  return (
    <div class={`midi-chip midi-chip--${status.kind}`}>
      <p class="midi-chip__status" role="status">
        {view.text}
      </p>
    </div>
  )
}
