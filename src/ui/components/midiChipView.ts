// Pure view-model for the MIDI status chip (no Preact, no window): unit tested in node.
import type { MidiStatus } from '../../midi/access'

export interface ChipView {
  /** The chip's words; for 'connect' it is the button label. */
  text: string
  /** 'connect': the chip is the Connect button. 'reset': show a "Reset keys" button beside it. */
  action: 'connect' | 'reset' | null
  /** Connected but audio still locked (auto-connected without a click): show UNLOCK_PROMPT. */
  needsTap: boolean
}

export const RESET_LABEL = 'Reset keys'
export const UNLOCK_PROMPT = 'Tap anywhere to turn on sound'

/** Chip copy is verbatim from the phase 2 spec (§3.1, §3.4). */
export function chipView(status: MidiStatus, audioReady: boolean): ChipView {
  switch (status.kind) {
    case 'unsupported':
      return { text: 'Keyboard input needs Chrome on a computer', action: null, needsTap: false }
    case 'off':
      return { text: 'Connect keyboard', action: 'connect', needsTap: false }
    case 'denied':
      return { text: "Keyboard access was blocked — allow MIDI in the browser's site settings", action: null, needsTap: false }
    case 'no-device':
      return { text: 'No keyboard found — plug in the Roli', action: null, needsTap: false }
    case 'connected':
      return { text: `● ${status.name}`, action: 'reset', needsTap: !audioReady }
  }
}
