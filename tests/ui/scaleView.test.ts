import { describe, expect, it } from 'vitest'
import { fingeringSequence } from '../../src/data/fingerings'
import { noteMidi, type ScaleRef } from '../../src/theory/scales'
import type { KeyMark } from '../../src/ui/components/keyboardLayout'
import { SESSION_OCTAVES, handPanels, scaleHeader } from '../../src/ui/screens/steps/scaleView'

const G: ScaleRef = { root: 'G', form: 'major' }
const AMel: ScaleRef = { root: 'A', form: 'melodic' }

describe('SESSION_OCTAVES', () => {
  it('is one octave per hand', () => {
    expect(SESSION_OCTAVES).toBe(1)
    expect(scaleHeader(G, SESSION_OCTAVES, 60)).toBe('G major · 1 octave · ♩ = 60')
  })
})

describe('handPanels', () => {
  it('G major: LH G3..G4 (55-67), RH G4..G5 (67-79), both containing 67', () => {
    const { lh, rh } = handPanels(G)
    expect(lh.marks.map((m) => m.midi)).toEqual([55, 57, 59, 60, 62, 64, 66, 67])
    expect(rh.marks.map((m) => m.midi)).toEqual([67, 69, 71, 72, 74, 76, 78, 79])
    expect(lh.low).toBeLessThanOrEqual(67)
    expect(lh.high).toBeGreaterThanOrEqual(67)
    expect(rh.low).toBeLessThanOrEqual(67)
    expect(rh.high).toBeGreaterThanOrEqual(67)
  })

  it('the root dot marks both tonics in each panel: G major LH 55 and 67, RH 67 and 79', () => {
    const { lh, rh } = handPanels(G)
    const roots = (marks: KeyMark[]) => marks.filter((m) => m.root).map((m) => m.midi)
    expect(roots(lh.marks)).toEqual([55, 67])
    expect(roots(rh.marks)).toEqual([67, 79])
  })

  it('the tonics are the roots going down too, and on a black-key root', () => {
    const roots = (marks: KeyMark[]) => marks.filter((m) => m.root).map((m) => m.midi)
    expect(roots(handPanels(AMel, 'down').rh.marks).sort()).toEqual([69, 81])
    expect(roots(handPanels({ root: 'F#', form: 'major' }).rh.marks)).toEqual([66, 78])
  })

  it('no LH mark is above 67 and no RH mark is below 67', () => {
    for (const ref of [G, AMel, { root: 'F#', form: 'major' } as ScaleRef]) {
      const { lh, rh } = handPanels(ref)
      const lhTop = Math.max(...lh.marks.map((m) => m.midi))
      const rhBottom = Math.min(...rh.marks.map((m) => m.midi))
      expect(lhTop).toBe(rhBottom) // LH ends on the tonic where RH starts
    }
    const { lh, rh } = handPanels(G)
    expect(lh.marks.every((m) => m.midi <= 67)).toBe(true)
    expect(rh.marks.every((m) => m.midi >= 67)).toBe(true)
  })

  it('each panel range is padded to whole white keys (C..B) around its own hand', () => {
    const { lh, rh } = handPanels(G)
    expect([lh.low, lh.high]).toEqual([noteMidi('C3'), noteMidi('B4')])
    expect([rh.low, rh.high]).toEqual([noteMidi('C4'), noteMidi('B5')])
  })

  it('marks carry hand, finger and label; fingers equal fingeringSequence(ref, 1, hand, up)', () => {
    const { lh, rh } = handPanels(G)
    expect(lh.marks.every((m) => m.hand === 'lh')).toBe(true)
    expect(rh.marks.every((m) => m.hand === 'rh')).toBe(true)
    expect(lh.marks.map((m) => m.finger)).toEqual(fingeringSequence(G, 1, 'lh', 'up'))
    expect(rh.marks.map((m) => m.finger)).toEqual(fingeringSequence(G, 1, 'rh', 'up'))
    expect(rh.marks[0]).toEqual({ midi: 67, hand: 'rh', finger: 1, label: 'G', root: true })
  })

  it('melodic minor going down uses the descending notes and the down fingering', () => {
    const up = handPanels(AMel, 'up')
    const down = handPanels(AMel, 'down')
    const labels = (p: typeof up.rh) => p.marks.map((m) => m.label)
    expect(labels(up.rh)).toEqual(['A', 'B', 'C', 'D', 'E', 'F♯', 'G♯', 'A'])
    expect(labels(down.rh)).toEqual(['A', 'G', 'F', 'E', 'D', 'C', 'B', 'A'])
    expect(labels(down.lh)).toEqual(['A', 'G', 'F', 'E', 'D', 'C', 'B', 'A'])
    expect(down.rh.marks.map((m) => m.finger)).toEqual(fingeringSequence(AMel, 1, 'rh', 'down'))
    expect(down.lh.marks.map((m) => m.finger)).toEqual(fingeringSequence(AMel, 1, 'lh', 'down'))
    expect(down.rh.marks[0]!.midi).toBe(noteMidi('A5'))
    expect(down.lh.marks[0]!.midi).toBe(noteMidi('A4'))
  })

  it('uses fingeringRef for the fingers when given', () => {
    const Gb: ScaleRef = { root: 'Gb', form: 'major' }
    const Fs: ScaleRef = { root: 'F#', form: 'major' }
    expect(handPanels(Gb, 'up', Fs).rh.marks.map((m) => m.finger)).toEqual(fingeringSequence(Fs, 1, 'rh', 'up'))
  })
})
