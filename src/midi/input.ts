import { signal } from '@preact/signals'
import { EMPTY_HELD, reduceHeld, type HeldState } from './held'
import type { MidiEvent } from './parse'

/** One shared keyboard event stream. Every screen subscribes here; nothing else reads MIDI. */

type Listener = (e: MidiEvent) => void

const listeners = new Set<Listener>()
const clearListeners = new Set<() => void>()

/** Keys physically down + notes still sounding under the pedal. */
export const heldNotes = signal<HeldState>(EMPTY_HELD)

export function onKeyboard(fn: Listener): () => void {
  // Wrap so subscribing the same function twice gives two independent subscriptions.
  const entry: Listener = (e) => fn(e)
  listeners.add(entry)
  return () => void listeners.delete(entry)
}

export function emitKeyboard(e: MidiEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(e)
    } catch (err) {
      // One bad subscriber must not stall the stream or the held state.
      console.error('keyboard listener failed', err)
    }
  }
}

// The single internal subscriber that maintains heldNotes. Registered first, so it runs
// before any screen sees the event.
listeners.add((e) => {
  heldNotes.value = reduceHeld(heldNotes.value, e).state
})

export function onClear(fn: () => void): () => void {
  const entry = () => fn()
  clearListeners.add(entry)
  return () => void clearListeners.delete(entry)
}

/** Device gone or route changed: forget every held key and tell listeners to release sound. */
export function clearKeyboard(): void {
  heldNotes.value = EMPTY_HELD
  for (const fn of [...clearListeners]) {
    try {
      fn()
    } catch (err) {
      console.error('keyboard clear listener failed', err)
    }
  }
}

// ---- dev hook ----

type InjectEvent = { type: 'on' | 'off' | 'pedal'; midi?: number; velocity?: number; down?: boolean; t?: number }

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __keyboard: unknown }).__keyboard = {
    inject(events: InjectEvent[]) {
      const base = performance.now()
      events.forEach((ev, i) => {
        const t = ev.t ?? base + i * 10
        if (ev.type === 'on') emitKeyboard({ type: 'on', midi: ev.midi ?? 60, velocity: ev.velocity ?? 80, t })
        else if (ev.type === 'off') emitKeyboard({ type: 'off', midi: ev.midi ?? 60, t })
        else emitKeyboard({ type: 'pedal', down: ev.down ?? false, t })
      })
    },
  }
}
