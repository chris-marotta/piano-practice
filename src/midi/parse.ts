export type MidiEvent =
  | { type: 'on'; midi: number; velocity: number; t: number }
  | { type: 'off'; midi: number; t: number }
  | { type: 'pedal'; down: boolean; t: number }

const NOTE_OFF = 0x8
const NOTE_ON = 0x9
const CONTROL_CHANGE = 0xb
const SUSTAIN_CC = 64
const PEDAL_DOWN_AT = 64

/**
 * Raw MIDI bytes -> typed event. Channel is ignored. Note-on with velocity 0
 * is a note-off. Only note on/off and CC64 (sustain) are kept; everything else
 * (including truncated messages) returns null. `t` is passed through untouched.
 */
export function parseMidi(data: ArrayLike<number>, t: number): MidiEvent | null {
  const status = data[0]
  const d1 = data[1]
  const d2 = data[2]
  if (status === undefined || d1 === undefined || d2 === undefined) return null
  const kind = status >> 4
  if (kind === NOTE_ON) {
    return d2 === 0 ? { type: 'off', midi: d1, t } : { type: 'on', midi: d1, velocity: d2, t }
  }
  if (kind === NOTE_OFF) return { type: 'off', midi: d1, t }
  if (kind === CONTROL_CHANGE && d1 === SUSTAIN_CC) {
    return { type: 'pedal', down: d2 >= PEDAL_DOWN_AT, t }
  }
  return null
}
