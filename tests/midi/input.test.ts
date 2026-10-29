import { describe, expect, it, vi } from 'vitest'
import { clearKeyboard, emitKeyboard, heldNotes, onClear, onKeyboard } from '../../src/midi/input'
import { EMPTY_HELD } from '../../src/midi/held'
import type { MidiEvent } from '../../src/midi/parse'

const on = (midi: number, t = 0): MidiEvent => ({ type: 'on', midi, velocity: 80, t })
const off = (midi: number, t = 0): MidiEvent => ({ type: 'off', midi, t })

describe('keyboard input stream', () => {
  it('delivers events to subscribers until they unsubscribe', () => {
    const seen: MidiEvent[] = []
    const unsub = onKeyboard((e) => seen.push(e))
    emitKeyboard(on(60))
    unsub()
    emitKeyboard(on(62))
    expect(seen).toHaveLength(1)
    clearKeyboard()
  })

  it('maintains heldNotes from the stream', () => {
    clearKeyboard()
    emitKeyboard(on(64))
    expect([...heldNotes.value.held]).toContain(64)
    emitKeyboard(off(64))
    expect([...heldNotes.value.held]).not.toContain(64)
    clearKeyboard()
  })

  it('clearKeyboard resets held notes (cable pulled mid-note)', () => {
    emitKeyboard(on(60))
    emitKeyboard({ type: 'pedal', down: true, t: 1 })
    clearKeyboard()
    expect(heldNotes.value).toEqual(EMPTY_HELD)
  })

  it('onClear listeners fire once per clear and stop after unsubscribe', () => {
    let cleared = 0
    const u = onClear(() => cleared++)
    clearKeyboard()
    u()
    clearKeyboard()
    expect(cleared).toBe(1)
  })

  it('a throwing subscriber does not block the others or heldNotes', () => {
    clearKeyboard()
    const seen: number[] = []
    const u1 = onKeyboard(() => {
      throw new Error('boom')
    })
    const u2 = onKeyboard((e) => e.type === 'on' && seen.push(e.midi))
    emitKeyboard(on(67))
    u1()
    u2()
    expect(seen).toEqual([67])
    expect([...heldNotes.value.held]).toContain(67)
    clearKeyboard()
  })
})

describe('dev hook', () => {
  it('window.__keyboard.inject emits events with spaced default timestamps', async () => {
    const g = globalThis as unknown as { window?: Record<string, unknown> }
    const had = 'window' in g
    const prev = g.window
    g.window = {}
    try {
      // Fresh module instance so the hook installs against the stubbed window.
      vi.resetModules()
      const mod = await import('../../src/midi/input')
      const seen: MidiEvent[] = []
      mod.onKeyboard((e) => seen.push(e))
      const kb = (g.window as { __keyboard?: { inject(ev: unknown[]): void } }).__keyboard
      expect(kb).toBeDefined()
      kb!.inject([
        { type: 'on', midi: 60, velocity: 90 },
        { type: 'off', midi: 60 },
        { type: 'pedal', down: true, t: 5 },
      ])
      expect(seen.map((e) => e.type)).toEqual(['on', 'off', 'pedal'])
      expect(seen[1]!.t - seen[0]!.t).toBeCloseTo(10, 5)
      expect(seen[2]!.t).toBe(5)
      mod.clearKeyboard()
    } finally {
      if (had) g.window = prev
      else delete g.window
    }
  })
})
