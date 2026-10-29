import { describe, expect, it } from 'vitest'
import { parseMidi } from '../../src/midi/parse'

describe('parseMidi', () => {
  it('parses note-on with velocity', () => {
    expect(parseMidi([0x90, 60, 100], 5)).toEqual({ type: 'on', midi: 60, velocity: 100, t: 5 })
  })

  it('ignores the channel', () => {
    expect(parseMidi([0x93, 60, 100], 5)).toMatchObject({ type: 'on', midi: 60 })
  })

  it('treats note-on velocity 0 as note-off', () => {
    expect(parseMidi([0x90, 60, 0], 5)).toEqual({ type: 'off', midi: 60, t: 5 })
  })

  it('parses note-off', () => {
    expect(parseMidi([0x80, 60, 64], 5)).toEqual({ type: 'off', midi: 60, t: 5 })
  })

  it('parses CC64 as pedal, down at >= 64', () => {
    expect(parseMidi([0xb0, 64, 127], 5)).toEqual({ type: 'pedal', down: true, t: 5 })
    expect(parseMidi([0xb0, 64, 64], 5)).toEqual({ type: 'pedal', down: true, t: 5 })
    expect(parseMidi([0xb0, 64, 63], 5)).toEqual({ type: 'pedal', down: false, t: 5 })
    expect(parseMidi([0xb0, 64, 10], 5)).toEqual({ type: 'pedal', down: false, t: 5 })
  })

  it('drops everything else', () => {
    expect(parseMidi([0xb0, 1, 64], 5)).toBeNull()
    expect(parseMidi([0xe0, 0, 64], 5)).toBeNull()
    expect(parseMidi([0xd0, 40], 5)).toBeNull()
    expect(parseMidi([0xf8], 5)).toBeNull()
    expect(parseMidi([], 5)).toBeNull()
  })

  it('drops truncated messages', () => {
    expect(parseMidi([0x90, 60], 5)).toBeNull()
    expect(parseMidi([0xb0, 64], 5)).toBeNull()
  })

  it('accepts typed arrays', () => {
    expect(parseMidi(new Uint8Array([0x90, 61, 90]), 1)).toEqual({ type: 'on', midi: 61, velocity: 90, t: 1 })
  })
})
