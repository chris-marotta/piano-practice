import { describe, expect, it } from 'vitest'
import { staffPanel } from '../../src/ui/screens/library/staffPanelView'
import type { ScaleRef } from '../../src/theory/scales'

const lh = (r: ScaleRef) => staffPanel(r).notes.filter((n) => n.clef === 'bass')
const rh = (r: ScaleRef) => staffPanel(r).notes.filter((n) => n.clef === 'treble')
const printed = (r: ScaleRef, pc: string, beats?: (b: number) => boolean) =>
  rh(r).filter((n) => n.note.replace(/\d+$/, '') === pc && (!beats || beats(n.beat as number))).map((n) => n.accidental)

describe('staffPanel', () => {
  it('C major: no signature, 15 notes per hand, LH from C3', () => {
    const p = staffPanel({ root: 'C', form: 'major' })
    expect(p.keySignature).toBeUndefined()
    expect(p.notes).toHaveLength(30)
    expect(rh({ root: 'C', form: 'major' })).toHaveLength(15)
    expect(lh({ root: 'C', form: 'major' })[0]?.note).toBe('C3')
    expect(rh({ root: 'C', form: 'major' })[0]?.note).toBe('C4')
    expect(p.signatureText).toBe('No sharps or flats in the key signature.')
    expect(p.caption).toBe('Written where it reads easiest. Play it in any octave.')
  })

  it('beats run 0-14 up and back, tonics are landmarks', () => {
    const r = rh({ root: 'C', form: 'major' })
    expect(r.map((n) => n.beat)).toEqual([...Array(15).keys()])
    expect(r.filter((n) => n.mark === 'landmark').map((n) => n.beat)).toEqual([0, 7, 14])
  })

  it('A major: 3 sharps, nothing printed', () => {
    const ref: ScaleRef = { root: 'A', form: 'major' }
    const p = staffPanel(ref)
    expect(p.keySignature).toEqual({ accidental: '#', count: 3 })
    expect(p.notes.every((n) => n.accidental === '')).toBe(true)
    expect(p.signatureText).toBe("The key signature's sharps (F♯ C♯ G♯) apply to every F, C and G.")
  })

  it('F major: LH from F2, one flat reads "every B"', () => {
    const ref: ScaleRef = { root: 'F', form: 'major' }
    expect(lh(ref)[0]?.note).toBe('F2')
    expect(staffPanel(ref).signatureText).toBe("The key signature's flats (B♭) apply to every B.")
  })

  it('F# major: 6 sharps, E# prints nothing', () => {
    const ref: ScaleRef = { root: 'F#', form: 'major' }
    expect(staffPanel(ref).keySignature).toEqual({ accidental: '#', count: 6 })
    const e = printed(ref, 'E#')
    expect(e.length).toBeGreaterThan(0)
    expect(e.every((a) => a === '')).toBe(true)
  })

  it('Eb harmonic minor: D prints natural', () => {
    const d = printed({ root: 'Eb', form: 'harmonic' }, 'D')
    expect(d.length).toBeGreaterThan(0)
    expect(d.every((a) => a === 'n')).toBe(true)
  })

  it('G# harmonic minor: F double sharp prints ##', () => {
    const f = printed({ root: 'G#', form: 'harmonic' }, 'F##')
    expect(f.length).toBeGreaterThan(0)
    expect(f.every((a) => a === '##')).toBe(true)
  })

  it('D harmonic minor: C# prints #', () => {
    const c = printed({ root: 'D', form: 'harmonic' }, 'C#')
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((a) => a === '#')).toBe(true)
  })

  it('A melodic minor: raised F#/G# going up, natural F/G coming down', () => {
    const ref: ScaleRef = { root: 'A', form: 'melodic' }
    const up = (b: number) => b <= 7
    const down = (b: number) => b > 7
    expect(printed(ref, 'F#', up)).toEqual(['#'])
    expect(printed(ref, 'G#', up)).toEqual(['#'])
    expect(printed(ref, 'F', down)).toEqual([''])
    expect(printed(ref, 'G', down)).toEqual([''])
  })
})
