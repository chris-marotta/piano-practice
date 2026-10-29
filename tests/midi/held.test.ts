import { describe, expect, it } from 'vitest'
import { EMPTY_HELD, reduceHeld } from '../../src/midi/held'
import type { HeldState } from '../../src/midi/held'
import type { MidiEvent } from '../../src/midi/parse'

const on = (midi: number, t = 0): MidiEvent => ({ type: 'on', midi, velocity: 90, t })
const off = (midi: number, t = 0): MidiEvent => ({ type: 'off', midi, t })
const pedal = (down: boolean, t = 0): MidiEvent => ({ type: 'pedal', down, t })
const apply = (s: HeldState, events: MidiEvent[]): HeldState =>
  events.reduce((acc, e) => reduceHeld(acc, e).state, s)

describe('reduceHeld', () => {
  it('note-on holds and sounds; note-off releases', () => {
    let r = reduceHeld(EMPTY_HELD, on(60))
    expect([...r.state.held]).toEqual([60])
    expect([...r.state.sounding]).toEqual([60])
    expect(r.release).toEqual([])
    r = reduceHeld(r.state, off(60))
    expect(r.release).toEqual([60])
    expect(r.state.sounding.size).toBe(0)
    expect(r.state.held.size).toBe(0)
  })

  it('pedal sustains released notes', () => {
    const s = apply(EMPTY_HELD, [pedal(true), on(60), off(60)])
    expect(s.pedal).toBe(true)
    expect(s.held.size).toBe(0)
    expect([...s.sounding]).toEqual([60])
    const r = reduceHeld(s, pedal(false))
    expect(r.release).toEqual([60])
    expect(r.state.sounding.size).toBe(0)
    expect(r.state.pedal).toBe(false)
  })

  it('pedal up keeps keys still held', () => {
    const s = apply(EMPTY_HELD, [pedal(true), on(60), on(64), off(60)])
    const r = reduceHeld(s, pedal(false))
    expect(r.release).toEqual([60])
    expect([...r.state.sounding]).toEqual([64])
    expect([...r.state.held]).toEqual([64])
  })

  it('re-strike under pedal, then pedal up, leaves nothing sounding', () => {
    const s = apply(EMPTY_HELD, [pedal(true), on(60), off(60), on(60), off(60)])
    const r = reduceHeld(s, pedal(false))
    expect(r.state.sounding.size).toBe(0)
    expect(r.release).toEqual([60])
  })

  it('pedal down with nothing sounding releases nothing', () => {
    const r = reduceHeld(EMPTY_HELD, pedal(true))
    expect(r.release).toEqual([])
    expect(r.state.pedal).toBe(true)
  })

  it('ignores a stray note-off', () => {
    const r = reduceHeld(EMPTY_HELD, off(61))
    expect(r.release).toEqual([])
    expect(r.state).toEqual(EMPTY_HELD)
  })

  it('is pure: does not mutate the input state', () => {
    const before = apply(EMPTY_HELD, [on(60)])
    reduceHeld(before, off(60))
    expect([...before.held]).toEqual([60])
    expect([...before.sounding]).toEqual([60])
    expect(EMPTY_HELD.held.size).toBe(0)
    expect(EMPTY_HELD.sounding.size).toBe(0)
  })
})
