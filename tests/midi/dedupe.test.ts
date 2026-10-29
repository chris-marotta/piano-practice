import { describe, expect, it } from 'vitest'
import { CROSS_PORT_WINDOW_MS, createDeduper } from '../../src/midi/dedupe'
import type { MidiEvent } from '../../src/midi/parse'

const on = (midi: number, t: number): MidiEvent => ({ type: 'on', midi, velocity: 80, t })
const off = (midi: number, t: number): MidiEvent => ({ type: 'off', midi, t })

describe('createDeduper (P17)', () => {
  it('the window is 5 ms', () => {
    expect(CROSS_PORT_WINDOW_MS).toBe(5)
  })

  it('the same note-on from two ports 2 ms apart passes once', () => {
    const d = createDeduper()
    expect(d.accept('A', on(60, 100))).toBe(true)
    expect(d.accept('B', on(60, 102))).toBe(false)
  })

  it('exactly 5 ms apart is still a duplicate; 6 ms is not', () => {
    const d = createDeduper()
    expect(d.accept('A', on(60, 100))).toBe(true)
    expect(d.accept('B', on(60, 105))).toBe(false)
    const e = createDeduper()
    expect(e.accept('A', on(60, 100))).toBe(true)
    expect(e.accept('B', on(60, 106))).toBe(true)
  })

  it('same-port repeats are never dropped, however close', () => {
    const d = createDeduper()
    expect(d.accept('A', on(60, 100))).toBe(true)
    expect(d.accept('A', off(60, 101))).toBe(true)
    expect(d.accept('A', on(60, 102))).toBe(true)
  })

  it('two ports 10 ms apart both pass', () => {
    const d = createDeduper()
    expect(d.accept('A', on(60, 100))).toBe(true)
    expect(d.accept('B', on(60, 110))).toBe(true)
  })

  it('different notes from two ports at once both pass', () => {
    const d = createDeduper()
    expect(d.accept('A', on(60, 100))).toBe(true)
    expect(d.accept('B', on(64, 100))).toBe(true)
  })

  it("the dropped port's matching off is dropped too; the kept port's off passes", () => {
    const d = createDeduper()
    d.accept('A', on(60, 100))
    d.accept('B', on(60, 102))
    expect(d.accept('B', off(60, 300))).toBe(false)
    expect(d.accept('A', off(60, 301))).toBe(true)
    // Only that one off: the next press on B is a fresh note.
    expect(d.accept('B', on(60, 1000))).toBe(true)
    expect(d.accept('B', off(60, 1200))).toBe(true)
  })

  it("the dropped port's off is dropped even when it arrives before the kept port's", () => {
    const d = createDeduper()
    d.accept('A', on(60, 100))
    d.accept('B', on(60, 101))
    expect(d.accept('A', off(60, 300))).toBe(true)
    expect(d.accept('B', off(60, 301))).toBe(false)
  })

  it('pedal messages always pass', () => {
    const d = createDeduper()
    expect(d.accept('A', { type: 'pedal', down: true, t: 100 })).toBe(true)
    expect(d.accept('B', { type: 'pedal', down: true, t: 101 })).toBe(true)
  })

  it('ports are compared by identity (objects work as ports)', () => {
    const a = {}
    const b = {}
    const d = createDeduper()
    expect(d.accept(a, on(60, 100))).toBe(true)
    expect(d.accept(b, on(60, 101))).toBe(false)
    expect(d.accept(a, on(62, 200))).toBe(true)
  })

  it('reset forgets pending drops', () => {
    const d = createDeduper()
    d.accept('A', on(60, 100))
    d.accept('B', on(60, 101))
    d.reset()
    expect(d.accept('B', off(60, 300))).toBe(true)
    expect(d.accept('B', on(60, 302))).toBe(true)
  })
})
