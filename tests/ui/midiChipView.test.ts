import { describe, expect, it } from 'vitest'
import type { MidiStatus } from '../../src/midi/access'
import { RESET_LABEL, UNLOCK_PROMPT, chipView } from '../../src/ui/components/midiChipView'

describe('chipView copy (verbatim from the spec)', () => {
  it('unsupported: a message, no action', () => {
    expect(chipView({ kind: 'unsupported' }, false)).toEqual({
      text: 'Keyboard input needs Chrome on a computer',
      action: null,
      needsTap: false,
    })
  })
  it('off: the "Connect keyboard" button', () => {
    expect(chipView({ kind: 'off' }, false)).toEqual({ text: 'Connect keyboard', action: 'connect', needsTap: false })
  })
  it('denied: points to the site settings, no action', () => {
    expect(chipView({ kind: 'denied' }, true)).toEqual({
      text: "Keyboard access was blocked — allow MIDI in the browser's site settings",
      action: null,
      needsTap: false,
    })
  })
  it('no-device: asks for the Roli, no action (hot-plug connects it)', () => {
    expect(chipView({ kind: 'no-device' }, true)).toEqual({
      text: 'No keyboard found — plug in the Roli',
      action: null,
      needsTap: false,
    })
  })
  it('connected: a dot and the device name, with the Reset keys action', () => {
    expect(chipView({ kind: 'connected', name: 'ROLI Piano M' }, true)).toEqual({
      text: '● ROLI Piano M',
      action: 'reset',
      needsTap: false,
    })
  })
  it('labels and the unlock prompt', () => {
    expect(RESET_LABEL).toBe('Reset keys')
    expect(UNLOCK_PROMPT).toBe('Tap anywhere to turn on sound')
  })
})

describe('chipView needsTap', () => {
  const all: MidiStatus[] = [
    { kind: 'unsupported' },
    { kind: 'off' },
    { kind: 'denied' },
    { kind: 'no-device' },
    { kind: 'connected', name: 'Roli Piano' },
  ]
  it('is true only when connected and audio is not yet unlocked', () => {
    for (const s of all) {
      expect(chipView(s, true).needsTap).toBe(false)
      expect(chipView(s, false).needsTap).toBe(s.kind === 'connected')
    }
  })
})
