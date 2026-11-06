import { describe, expect, it } from 'vitest'
import {
  EAR_HOME_S,
  compareEvents,
  createEarVoices,
  homeEvents,
  promptEvents,
  walkEvents,
} from '../../src/audio/earSchedule'

describe('promptEvents', () => {
  it('plays the tonic, a gap, then the note', () => {
    const r = promptEvents({ tonic: 60, target: 67, withTonic: true, home: false })
    expect(r.onset).toBeCloseTo(1.05)
    expect(r.events).toHaveLength(2)
    expect(r.events[0]).toEqual({ midi: 60, time: 0, dur: 0.8 })
    expect(r.events[1]?.midi).toBe(67)
    expect(r.events[1]?.time).toBeCloseTo(1.05)
    expect(r.events[1]?.dur).toBe(1.2)
  })
  it('plays just the note at 0', () => {
    const r = promptEvents({ tonic: 60, target: 67, withTonic: false, home: false })
    expect(r.onset).toBe(0)
    expect(r.events).toEqual([{ midi: 67, time: 0, dur: 1.2 }])
  })
  it('home plays the tonic for 1.5 s, a 0.5 s gap, then the note', () => {
    const r = promptEvents({ tonic: 60, target: 67, withTonic: true, home: true })
    expect(r.onset).toBeCloseTo(2.0)
    expect(r.events[0]).toEqual({ midi: 60, time: 0, dur: 1.5 })
  })
})

describe('walkEvents', () => {
  it('walks 4 home with a long last note', () => {
    const e = walkEvents(60, '4')
    expect(e.map((x) => x.midi)).toEqual([65, 64, 62, 60])
    expect(e.map((x) => x.time)).toEqual([0, 0.35, 0.7, 1.05].map((t) => expect.closeTo(t, 6)))
    expect(e.map((x) => x.dur).slice(0, 3)).toEqual([0.35, 0.35, 0.35])
    expect(e[3]?.dur).toBe(1.0)
  })
  it('is empty for degree 1', () => {
    expect(walkEvents(60, '1')).toEqual([])
  })
})

describe('homeEvents', () => {
  it('is the tonic at 0 for EAR_HOME_S', () => {
    expect(homeEvents(62)).toEqual([{ midi: 62, time: 0, dur: EAR_HOME_S }])
  })
})

describe('compareEvents', () => {
  it('spaces tonic, target and given 1.45 s apart', () => {
    const e = compareEvents(60, 67, 66)
    expect(e.map((x) => x.midi)).toEqual([60, 67, 66])
    expect(e.map((x) => x.time)).toEqual([0, 1.45, 2.9].map((t) => expect.closeTo(t, 6)))
    expect(e.every((x) => x.dur === 1.2)).toBe(true)
  })
})

describe('createEarVoices', () => {
  it('tracks only what ear audio started and has not released', () => {
    const v = createEarVoices()
    v.start(60)
    v.start(67)
    v.end(60)
    expect(v.owned()).toEqual([67])
    expect(v.clear()).toEqual([67])
    expect(v.owned()).toEqual([])
  })
  it('never owns a note it did not start (a held key)', () => {
    const v = createEarVoices()
    v.start(60)
    v.end(64)
    expect(v.owned()).not.toContain(64)
    expect(v.clear()).toEqual([60])
  })
  it('clear is idempotent', () => {
    const v = createEarVoices()
    v.start(60)
    v.clear()
    expect(v.clear()).toEqual([])
  })
})
