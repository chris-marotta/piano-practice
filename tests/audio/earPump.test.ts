import { describe, expect, it } from 'vitest'
import { createEarPump, type EarSamplerLike } from '../../src/audio/earPump'
import { createEarVoices } from '../../src/audio/earSchedule'

/** Models Tone's Sampler: a release stops and forgets every active source of that pitch. */
function fakeSampler() {
  const active = new Map<number, number>()
  const calls: string[] = []
  const s: EarSamplerLike & { active: Map<number, number>; calls: string[]; releaseAll: () => void } = {
    active,
    calls,
    triggerAttack(m) {
      active.set(m, (active.get(m) ?? 0) + 1)
      calls.push(`attack ${m}`)
    },
    triggerRelease(m, t) {
      calls.push(`release ${m} @${t}`)
      active.delete(m)
    },
    releaseAll() {
      calls.push('releaseAll')
    },
  }
  return s
}

describe('createEarPump', () => {
  const events = [{ midi: 60, time: 0, dur: 1 }, { midi: 67, time: 2, dur: 1 }]

  it('does not release a note before its end is inside the window', () => {
    const s = fakeSampler()
    let t = 10
    const p = createEarPump(s, () => t, events, 10, createEarVoices(), 0.2)
    p.tick()
    expect(s.calls).toEqual(['attack 60'])
    t = 10.5
    p.tick()
    expect(s.calls).toEqual(['attack 60'])
    t = 10.85
    p.tick()
    expect(s.calls).toContain('release 60 @11')
  })

  it('stop reaches a still-active source of a handed-over note', () => {
    const s = fakeSampler()
    let t = 10
    const p = createEarPump(s, () => t, events, 10, createEarVoices(), 0.2)
    p.tick()
    t = 10.5
    p.stop()
    expect(s.calls).toContain('release 60 @10.5')
    expect(s.active.has(60)).toBe(false)
    expect(s.calls).not.toContain('releaseAll')
  })

  it('stop after a normal end releases nothing twice, and is idempotent', () => {
    const s = fakeSampler()
    let t = 10
    const p = createEarPump(s, () => t, events, 10, createEarVoices(), 0.2)
    t = 10.9
    p.tick()
    const before = s.calls.length
    p.stop()
    p.stop()
    expect(s.calls.length).toBe(before)
  })

  it('finishes when everything is attacked and released', () => {
    const s = fakeSampler()
    let t = 10
    const p = createEarPump(s, () => t, events, 10, createEarVoices(), 0.2)
    expect(p.tick()).toBe(false)
    t = 13
    expect(p.tick()).toBe(true)
  })

  it('an exception releases and clears owned voices', () => {
    const s = fakeSampler()
    const v = createEarVoices()
    let t = 10
    const p = createEarPump(s, () => t, events, 10, v, 0.2)
    p.tick()
    s.triggerAttack = () => {
      throw new Error('x')
    }
    t = 12
    expect(p.tick()).toBe(true)
    expect(v.owned()).toEqual([])
  })
})
