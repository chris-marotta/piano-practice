import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MidiEvent } from '../../src/midi/parse'

// A fake sampler stands in for Tone.Sampler; getSampler/audioReady are controlled per test.
const sampler = {
  triggerAttack: vi.fn(),
  triggerRelease: vi.fn(),
  releaseAll: vi.fn(),
  loaded: true,
}
let current: typeof sampler | null = null

vi.mock('../../src/audio/piano', () => ({
  getSampler: () => current,
}))

import { clearKeyboard, emitKeyboard } from '../../src/midi/input'
import { createLiveVoice, releaseLive, startLiveSound, velocityToGain } from '../../src/audio/live'

const on = (midi: number, velocity = 90): MidiEvent => ({ type: 'on', midi, velocity, t: 0 })
const off = (midi: number): MidiEvent => ({ type: 'off', midi, t: 0 })
const pedal = (down: boolean): MidiEvent => ({ type: 'pedal', down, t: 0 })

describe('velocityToGain', () => {
  it('maps 127 to 1 and the floor to 0.15', () => {
    expect(velocityToGain(127)).toBeCloseTo(1)
    expect(velocityToGain(0)).toBeCloseTo(0.15 + 0.85 / 127)
    expect(velocityToGain(1)).toBeCloseTo(0.15 + 0.85 / 127)
    expect(velocityToGain(500)).toBeCloseTo(1)
  })
})

describe('createLiveVoice', () => {
  it('attacks on note-on and releases per reduceHeld, honouring the pedal', () => {
    const calls: string[] = []
    const v = createLiveVoice({ attack: (m) => calls.push(`a${m}`), release: (m) => calls.push(`r${m}`) })
    v.handle(on(60))
    v.handle(pedal(true))
    v.handle(off(60))
    expect(calls).toEqual(['a60'])
    v.handle(pedal(false))
    expect(calls).toEqual(['a60', 'r60'])
  })

  it('passes velocity as gain', () => {
    const gains: number[] = []
    const v = createLiveVoice({ attack: (_m, g) => gains.push(g), release: () => {} })
    v.handle(on(60, 127))
    expect(gains[0]).toBeCloseTo(1)
  })

  it('releaseAll releases everything still sounding, and empties the voice', () => {
    const calls: string[] = []
    const v = createLiveVoice({ attack: (m) => calls.push(`a${m}`), release: (m) => calls.push(`r${m}`) })
    v.handle(on(62))
    v.releaseAll()
    expect(calls.at(-1)).toBe('r62')
    const n = calls.length
    v.releaseAll()
    expect(calls).toHaveLength(n)
  })

  it('releaseAll also releases notes held by the pedal', () => {
    const calls: string[] = []
    const v = createLiveVoice({ attack: (m) => calls.push(`a${m}`), release: (m) => calls.push(`r${m}`) })
    v.handle(pedal(true))
    v.handle(on(60))
    v.handle(off(60))
    v.releaseAll()
    expect(calls).toEqual(['a60', 'r60'])
  })

  it('re-striking a note already sounding under the pedal attacks again, and pedal-up releases it', () => {
    const calls: string[] = []
    const v = createLiveVoice({ attack: (m) => calls.push(`a${m}`), release: (m) => calls.push(`r${m}`) })
    v.handle(pedal(true))
    v.handle(on(60))
    v.handle(off(60))
    v.handle(on(60)) // already sounding: reduceHeld yields no release, but this is a fresh strike
    v.handle(off(60))
    expect(calls).toEqual(['a60', 'a60'])
    v.handle(pedal(false))
    expect(calls).toEqual(['a60', 'a60', 'r60'])
  })

  it('an io that throws never propagates', () => {
    const bad = createLiveVoice({
      attack: () => {
        throw new Error('no ctx')
      },
      release: () => {
        throw new Error('x')
      },
    })
    expect(() => bad.handle(on(60))).not.toThrow()
    expect(() => bad.handle(off(60))).not.toThrow()
    expect(() => bad.releaseAll()).not.toThrow()
  })

  it('one failing release does not stop the others', () => {
    const calls: number[] = []
    const v = createLiveVoice({
      attack: () => {},
      release: (m) => {
        calls.push(m)
        throw new Error('x')
      },
    })
    v.handle(on(60))
    v.handle(on(64))
    v.releaseAll()
    expect(calls.sort()).toEqual([60, 64])
  })
})

describe('startLiveSound', () => {
  beforeEach(() => {
    current = null
    for (const f of [sampler.triggerAttack, sampler.triggerRelease, sampler.releaseAll]) f.mockReset()
    clearKeyboard()
  })

  it('is a silent no-op before the sampler exists (before the first tap / samples loaded)', () => {
    const stop = startLiveSound(() => true)
    expect(() => {
      emitKeyboard(on(60))
      emitKeyboard(off(60))
      emitKeyboard(pedal(true))
      clearKeyboard()
    }).not.toThrow()
    expect(sampler.triggerAttack).not.toHaveBeenCalled()
    stop()
  })

  it('plays through the sampler with velocity gain and releases on note-off', () => {
    current = sampler
    const stop = startLiveSound(() => true)
    emitKeyboard(on(60, 127))
    expect(sampler.triggerAttack).toHaveBeenCalledTimes(1)
    const [note, , gain] = sampler.triggerAttack.mock.calls[0] as [string, number, number]
    expect(note).toBe('C4')
    expect(gain).toBeCloseTo(1)
    emitKeyboard(off(60))
    expect(sampler.triggerRelease).toHaveBeenCalledTimes(1)
    expect((sampler.triggerRelease.mock.calls[0] as [string])[0]).toBe('C4')
    stop()
  })

  it('stays silent when keyboardSound is off, but still releases what was sounding', () => {
    current = sampler
    let enabled = true
    const stop = startLiveSound(() => enabled)
    emitKeyboard(on(60))
    enabled = false
    emitKeyboard(on(62))
    expect(sampler.triggerAttack).toHaveBeenCalledTimes(1)
    emitKeyboard(off(60))
    expect(sampler.triggerRelease).toHaveBeenCalledTimes(1)
    stop()
  })

  it('clearing the keyboard releases every sounding note', () => {
    current = sampler
    const stop = startLiveSound(() => true)
    emitKeyboard(on(60))
    emitKeyboard(on(64))
    sampler.triggerRelease.mockClear()
    clearKeyboard()
    expect(sampler.triggerRelease).toHaveBeenCalledTimes(2)
    stop()
  })

  it('releaseLive (called by stopAll) releases sounding notes', () => {
    current = sampler
    const stop = startLiveSound(() => true)
    emitKeyboard(on(60))
    emitKeyboard(pedal(true))
    emitKeyboard(off(60))
    sampler.triggerRelease.mockClear()
    releaseLive()
    expect(sampler.triggerRelease).toHaveBeenCalledTimes(1)
    stop()
  })

  it('unsubscribe stops further sound; a sampler that throws never propagates', () => {
    current = sampler
    sampler.triggerAttack.mockImplementation(() => {
      throw new Error('boom')
    })
    const stop = startLiveSound(() => true)
    expect(() => emitKeyboard(on(60))).not.toThrow()
    stop()
    sampler.triggerAttack.mockReset()
    emitKeyboard(on(62))
    expect(sampler.triggerAttack).not.toHaveBeenCalled()
    releaseLive() // nothing active; must not throw
  })
})
