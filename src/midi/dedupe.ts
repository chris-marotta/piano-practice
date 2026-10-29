// Ruling P17: cross-port duplicate note-ons. Pure (no navigator, no window): unit tested in node.
// Some setups expose one keyboard on two MIDI ports (e.g. the Roli over USB and Bluetooth, or a DAW's virtual
// port echoing it), so every press would arrive twice. Same-port repeats are real playing and always pass.
import type { MidiEvent } from './parse'

/** An 'on' this close (ms) to an 'on' of the same note from a different port is a duplicate. ASSUMED. */
export const CROSS_PORT_WINDOW_MS = 5

export interface Deduper {
  /** True when the event should be emitted. `port` is compared by identity (a MIDIInput, or any key in tests). */
  accept(port: unknown, e: MidiEvent): boolean
  /** Forget everything (ports came or went, keyboard cleared). */
  reset(): void
}

export function createDeduper(windowMs: number = CROSS_PORT_WINDOW_MS): Deduper {
  // The last accepted 'on' per note.
  let lastOn = new Map<number, { port: unknown; t: number }>()
  // Per port, the notes whose 'on' was dropped: their next 'off' from that port is dropped too.
  let droppedOffs = new Map<unknown, Set<number>>()

  return {
    accept(port, e) {
      if (e.type === 'pedal') return true
      if (e.type === 'off') {
        const dropped = droppedOffs.get(port)
        if (dropped?.delete(e.midi)) return false
        return true
      }
      const prev = lastOn.get(e.midi)
      if (prev && prev.port !== port && Math.abs(e.t - prev.t) <= windowMs) {
        let dropped = droppedOffs.get(port)
        if (!dropped) droppedOffs.set(port, (dropped = new Set()))
        dropped.add(e.midi)
        return false
      }
      lastOn.set(e.midi, { port, t: e.t })
      return true
    },
    reset() {
      lastOn = new Map()
      droppedOffs = new Map()
    },
  }
}
