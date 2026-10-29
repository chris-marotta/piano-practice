import type { MidiEvent } from './parse'

export interface HeldState {
  /** Keys physically down. */
  held: ReadonlySet<number>
  /** Notes still audible: held keys plus released keys sustained by the pedal. */
  sounding: ReadonlySet<number>
  pedal: boolean
}

export const EMPTY_HELD: HeldState = {
  held: new Set<number>(),
  sounding: new Set<number>(),
  pedal: false,
}

/**
 * Pure reducer over held keys + sustain pedal. Always returns fresh Sets when
 * state changes. `release` lists the notes that stop sounding as a result of
 * this event (ascending).
 */
export function reduceHeld(s: HeldState, e: MidiEvent): { state: HeldState; release: number[] } {
  switch (e.type) {
    case 'on': {
      const held = new Set(s.held).add(e.midi)
      const sounding = new Set(s.sounding).add(e.midi)
      return { state: { held, sounding, pedal: s.pedal }, release: [] }
    }
    case 'off': {
      if (!s.held.has(e.midi)) return { state: s, release: [] }
      const held = new Set(s.held)
      held.delete(e.midi)
      if (s.pedal) return { state: { held, sounding: new Set(s.sounding), pedal: true }, release: [] }
      const sounding = new Set(s.sounding)
      sounding.delete(e.midi)
      return { state: { held, sounding, pedal: false }, release: [e.midi] }
    }
    case 'pedal': {
      if (e.down === s.pedal) return { state: s, release: [] }
      if (e.down) return { state: { held: s.held, sounding: s.sounding, pedal: true }, release: [] }
      const release = [...s.sounding].filter((n) => !s.held.has(n)).sort((a, b) => a - b)
      return { state: { held: s.held, sounding: new Set(s.held), pedal: false }, release }
    }
  }
}
