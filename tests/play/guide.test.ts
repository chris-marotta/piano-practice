import { describe, expect, it } from 'vitest'
import { fingeringSequence } from '../../src/data/fingerings'
import { createGuide, guideNext, guideResult, guideStep } from '../../src/play/guide'
import type { GuideState, GuideTarget } from '../../src/play/guide'
import { expectedRun } from '../../src/play/sequence'
import { EMPTY_HELD } from '../../src/midi/held'
import type { HeldState } from '../../src/midi/held'
import type { MidiEvent } from '../../src/midi/parse'
import { noteMidi } from '../../src/theory/scales'

const on = (midi: number, t: number): MidiEvent => ({ type: 'on', midi, velocity: 80, t })
const heldOf = (...midis: number[]): HeldState => ({ held: new Set(midis), sounding: new Set(midis), pedal: false })

const gMajorRh: GuideTarget = { kind: 'scale', ref: { root: 'G', form: 'major' }, octaves: 1, hand: 'rh' }
const gRun = expectedRun({ root: 'G', form: 'major' }, 1, 4).map((e) => e.midi)

function play(s: GuideState, midis: number[], start = 0, step = 500): GuideState {
  let cur = s
  midis.forEach((m, i) => {
    cur = guideStep(cur, on(m, start + i * step), EMPTY_HELD).state
  })
  return cur
}

describe('guide: scale, one hand', () => {
  it('locks an octave offset and finishes a clean run', () => {
    let s = createGuide(gMajorRh)
    s = play(s, gRun.map((m) => m - 12))
    expect(s.offset).toBe(-12)
    expect(s.slips).toBe(0)
    expect(s.done).toBe(true)
    expect(guideNext(s)).toBeNull()
    expect(guideResult(s)).toMatchObject({ slips: 0, evenness: 1, tempo: 60 })
  })

  it('a wrong note flashes, counts a slip and does not advance', () => {
    let s = createGuide(gMajorRh)
    s = play(s, gRun.slice(0, 6)) // G A B C D E, next F#
    const r = guideStep(s, on(77, 5000), EMPTY_HELD)
    expect(r.flash).toBe(77)
    expect(r.state.slips).toBe(1)
    expect(r.state.index).toBe(6)
    expect(r.state.onsets).toHaveLength(6)
  })

  it('ignores other notes before the tonic locks the octave', () => {
    const s = createGuide(gMajorRh)
    const r = guideStep(s, on(69, 0), EMPTY_HELD) // A4
    expect(r.state.slips).toBe(0)
    expect(r.flash).toBeNull()
    expect(r.state.offset).toBeNull()
    expect(r.state.index).toBe(0)
  })

  it('ignores note-off events', () => {
    const s = play(createGuide(gMajorRh), gRun.slice(0, 2))
    const r = guideStep(s, { type: 'off', midi: gRun[1] as number, t: 2000 }, EMPTY_HELD)
    expect(r.state).toBe(s)
    expect(r.flash).toBeNull()
  })

  it('melodic minor descent expects G natural and F natural', () => {
    const t: GuideTarget = { kind: 'scale', ref: { root: 'A', form: 'melodic' }, octaves: 1, hand: 'rh' }
    let s = createGuide(t)
    const run = expectedRun({ root: 'A', form: 'melodic' }, 1, 4).map((e) => e.midi)
    s = play(s, run.slice(0, 8)) // up to top A
    expect(s.slips).toBe(0)
    expect(guideNext(s)).toEqual({ rh: { midi: noteMidi('G5'), finger: expect.any(Number) } })
    s = play(s, [noteMidi('G5')], 9000)
    expect(guideNext(s)).toEqual({ rh: { midi: noteMidi('F5'), finger: expect.any(Number) } })
    expect(s.slips).toBe(0)
  })

  it('finger for E major RH index 3 matches fingeringSequence', () => {
    const ref = { root: 'E', form: 'major' as const }
    const t: GuideTarget = { kind: 'scale', ref, octaves: 1, hand: 'rh' }
    const run = expectedRun(ref, 1, 4).map((e) => e.midi)
    const s = play(createGuide(t), run.slice(0, 3))
    expect(s.index).toBe(3)
    const next = guideNext(s) as { rh: { midi: number; finger: number } }
    expect(next.rh.finger).toBe(fingeringSequence(ref, 1, 'rh', 'up')[3])
    expect(next.rh.finger).toBe(1)
    expect(next.rh.midi).toBe(run[3])
  })

  it('fingers going down come from the reversed (down) sequence, top note first', () => {
    const ref = { root: 'E', form: 'major' as const }
    const t: GuideTarget = { kind: 'scale', ref, octaves: 1, hand: 'rh' }
    const run = expectedRun(ref, 1, 4).map((e) => e.midi)
    const up = fingeringSequence(ref, 1, 'rh', 'up')
    const down = fingeringSequence(ref, 1, 'rh', 'down')
    let s = createGuide(t)
    for (let i = 0; i < run.length; i++) {
      const next = guideNext(s) as { rh: { midi: number; finger: number } }
      const top = 7
      expect(next.rh.finger).toBe(i <= top ? up[i] : down[i - top])
      s = play(s, [run[i] as number], i * 500)
    }
    expect(s.done).toBe(true)
  })

  it('LH uses octave 3 and the LH fingering', () => {
    const ref = { root: 'C', form: 'major' as const }
    const t: GuideTarget = { kind: 'scale', ref, octaves: 1, hand: 'lh' }
    const s = createGuide(t)
    expect(guideNext(s)).toEqual({ lh: { midi: noteMidi('C3'), finger: fingeringSequence(ref, 1, 'lh', 'up')[0] } })
  })

  it('applies the locked offset to guideNext', () => {
    const s = play(createGuide(gMajorRh), [gRun[0] as number + 12])
    expect(guideNext(s)).toMatchObject({ rh: { midi: (gRun[1] as number) + 12 } })
  })
})

describe('guide: together', () => {
  const together: GuideTarget = { kind: 'scale', ref: { root: 'G', form: 'major' }, octaves: 1, hand: 'together' }

  /** Locked on the G pair, index 1: the A pair (A3 57 + A4 69) is expected next. */
  function lockedTogether(): GuideState {
    let s = createGuide(together)
    s = guideStep(s, on(55, 0), EMPTY_HELD).state
    return guideStep(s, on(67, 50), EMPTY_HELD).state
  }

  it('shows both hands, LH 12 below', () => {
    const next = guideNext(createGuide(together)) as { rh: { midi: number }; lh: { midi: number } }
    expect(next.rh.midi).toBe(gRun[0])
    expect(next.lh.midi).toBe((gRun[0] as number) - 12)
  })

  it('pairs within 100 ms advance, in either order', () => {
    let s = createGuide(together)
    const run = gRun.slice(0, 3)
    run.forEach((m, i) => {
      const t = i * 600
      const first = i % 2 ? on(m, t) : on(m - 12, t)
      const second = i % 2 ? on(m - 12, t + 100) : on(m, t + 100)
      const a = guideStep(s, first, EMPTY_HELD)
      expect(a.state.pending).not.toBeNull()
      expect(a.state.index).toBe(i)
      s = guideStep(a.state, second, EMPTY_HELD).state
      expect(s.index).toBe(i + 1)
      expect(s.pending).toBeNull()
    })
    expect(s.slips).toBe(0)
    expect(s.offset).toBe(0)
  })

  it('a pair 200 ms apart is one slip, no flash, and the late partner is consumed', () => {
    let s = lockedTogether()
    s = guideStep(s, on(57, 1000), EMPTY_HELD).state // A3 pending
    const r = guideStep(s, on(69, 1200), EMPTY_HELD) // A4 200 ms later
    expect(r.state.slips).toBe(1)
    expect(r.flash).toBeNull()
    expect(r.state.index).toBe(1)
    expect(r.state.pending).toBeNull()
  })

  it('late pair then an immediate correct replay: still one slip, then advances', () => {
    let s = lockedTogether()
    s = guideStep(s, on(57, 1000), EMPTY_HELD).state
    s = guideStep(s, on(69, 1200), EMPTY_HELD).state
    s = guideStep(s, on(57, 1210), EMPTY_HELD).state
    s = guideStep(s, on(69, 1240), EMPTY_HELD).state
    expect(s.slips).toBe(1)
    expect(s.index).toBe(2)
  })

  it('a stray note between the pair counts once and does not break the pair', () => {
    let s = lockedTogether()
    s = guideStep(s, on(57, 1000), EMPTY_HELD).state // A3
    const stray = guideStep(s, on(61, 1010), EMPTY_HELD) // C#4
    expect(stray.flash).toBe(61)
    expect(stray.state.slips).toBe(1)
    s = guideStep(stray.state, on(69, 1020), EMPTY_HELD).state // A4 completes the pair
    expect(s.index).toBe(2)
    s = guideStep(s, on(59, 1500), EMPTY_HELD).state // B pair
    s = guideStep(s, on(71, 1520), EMPTY_HELD).state
    expect(s.slips).toBe(1)
    expect(s.index).toBe(3)
  })

  it('a wrong key first flashes once and never flashes the correct key', () => {
    let s = lockedTogether()
    const w = guideStep(s, on(61, 1000), EMPTY_HELD) // C#4: wrong
    expect(w.flash).toBe(61)
    s = guideStep(w.state, on(57, 1050), EMPTY_HELD).state // A3
    const r = guideStep(s, on(69, 1070), EMPTY_HELD)
    expect(r.flash).toBeNull()
    expect(r.state.slips).toBe(1)
    expect(r.state.index).toBe(2)
  })

  it('a late non-partner is one slip, then handled as a fresh note', () => {
    let s = lockedTogether()
    s = guideStep(s, on(57, 1000), EMPTY_HELD).state
    const r = guideStep(s, on(61, 1300), EMPTY_HELD) // wrong note, late
    expect(r.state.slips).toBe(2) // stale A3, plus C#4 itself
    expect(r.flash).toBe(61)
    expect(r.state.pending).toBeNull()
  })

  it('a pair 11 apart is one slip; the expected note stays pending', () => {
    let s = lockedTogether()
    s = guideStep(s, on(57, 1000), EMPTY_HELD).state
    const r = guideStep(s, on(68, 1050), EMPTY_HELD) // 11 above
    expect(r.state.slips).toBe(1)
    expect(r.flash).toBe(68)
    expect(r.state.pending).toEqual({ midi: 57, t: 1000 })
    expect(r.state.index).toBe(1)
  })

  it('guideNext still shows both notes while pending', () => {
    let s = createGuide(together)
    s = guideStep(s, on(55, 0), EMPTY_HELD).state
    expect(guideNext(s)).toMatchObject({ rh: { midi: 67 }, lh: { midi: 55 } })
  })

  it('a wrong pair (12 apart, wrong notes) slips on each wrong key and never advances', () => {
    let s = lockedTogether()
    const a1 = guideStep(s, on(58, 1000), EMPTY_HELD)
    expect(a1.flash).toBe(58)
    expect(a1.state.pending).toBeNull()
    const a2 = guideStep(a1.state, on(70, 1050), EMPTY_HELD)
    expect(a2.flash).toBe(70)
    expect(a2.state.slips).toBe(2)
    expect(a2.state.index).toBe(1)
  })

  it('finishes a clean together run', () => {
    let s = createGuide(together)
    gRun.forEach((m, i) => {
      s = guideStep(s, on(m - 12, i * 600), EMPTY_HELD).state
      s = guideStep(s, on(m, i * 600 + 40), EMPTY_HELD).state
    })
    expect(s.done).toBe(true)
    expect(s.slips).toBe(0)
    expect(guideNext(s)).toBeNull()
    expect(s.onsets).toHaveLength(gRun.length)
  })
})

describe('guide: chord', () => {
  const cMajor: GuideTarget = { kind: 'chord', root: 'C', type: 'M' }

  it('walks root, first and second inversion', () => {
    let s = createGuide(cMajor)
    expect(guideNext(s)).toEqual({ chord: { pcs: [0, 4, 7], bassPc: 0, inversion: 0 } })
    s = guideStep(s, on(60, 0), heldOf(60)).state
    s = guideStep(s, on(64, 10), heldOf(60, 64)).state
    s = guideStep(s, on(67, 20), heldOf(60, 64, 67)).state
    expect(s.index).toBe(1)
    expect(s.slips).toBe(0)
    expect(guideNext(s)).toEqual({ chord: { pcs: [4, 7, 0], bassPc: 4, inversion: 1 } })
    // release, then play E G C with E lowest
    s = guideStep(s, { type: 'off', midi: 60, t: 500 }, heldOf(64, 67)).state
    expect(s.index).toBe(1)
    s = guideStep(s, on(72, 600), heldOf(64, 67, 72)).state
    expect(s.index).toBe(2)
    s = guideStep(s, { type: 'off', midi: 64, t: 900 }, heldOf(67, 72)).state
    s = guideStep(s, on(76, 1000), heldOf(67, 72, 76)).state
    expect(s.done).toBe(true)
    expect(s.slips).toBe(0)
    expect(guideNext(s)).toBeNull()
    expect(s.onsets).toEqual([20, 600, 1000])
  })

  it('succeeds on an off event when the held set becomes right', () => {
    let s = createGuide(cMajor)
    s = guideStep(s, on(62, 0), heldOf(60, 64, 67, 62)).state // D is wrong: slip
    expect(s.slips).toBe(1)
    // chord is held plus a leftover; releasing the extra completes the step
    s = guideStep(s, { type: 'off', midi: 62, t: 100 }, heldOf(60, 64, 67)).state
    expect(s.index).toBe(1)
  })

  it('a note outside the chord is a slip with flash', () => {
    const s = createGuide(cMajor)
    const r = guideStep(s, on(61, 0), heldOf(61))
    expect(r.flash).toBe(61)
    expect(r.state.slips).toBe(1)
    expect(r.state.index).toBe(0)
  })

  it('wrong bass does not succeed', () => {
    const s = createGuide(cMajor)
    const r = guideStep(s, on(60, 0), heldOf(64, 67, 72)) // E G C: first inversion, not root
    expect(r.state.index).toBe(0)
    expect(r.state.slips).toBe(0)
  })

  it('seventh chords run four steps', () => {
    let s = createGuide({ kind: 'chord', root: 'C', type: '7' })
    const shapes = [
      [60, 64, 67, 70],
      [64, 67, 70, 72],
      [67, 70, 72, 76],
      [70, 72, 76, 79],
    ]
    shapes.forEach((sh, i) => {
      s = guideStep(s, on(sh[3] as number, i * 1000), heldOf(...sh)).state
    })
    expect(s.done).toBe(true)
  })
})
