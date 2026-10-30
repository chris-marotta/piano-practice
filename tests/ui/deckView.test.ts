import { describe, expect, it } from 'vitest'
import { thumbNotes } from '../../src/data/fingerings'
import { formatNote } from '../../src/theory/format'
import { recallCard, RECALL_TYPES } from '../../src/theory/recall'
import { chroma, type ScaleRef } from '../../src/theory/scales'
import type { KeyMark } from '../../src/ui/components/keyboardLayout'
import { isBlack } from '../../src/ui/components/keyboardLayout'
import { kickerFor, whyChips, whyKeyboard } from '../../src/ui/screens/steps/deckView'

const A: ScaleRef = { root: 'A', form: 'major' }
const G: ScaleRef = { root: 'G', form: 'major' }
const Fsm: ScaleRef = { root: 'F#', form: 'natural' }
const C: ScaleRef = { root: 'C', form: 'major' }
const Am: ScaleRef = { root: 'A', form: 'melodic' }

const pcOf = (midi: number): number => ((midi % 12) + 12) % 12
/** Marks that light a key (root-only dot carriers excluded). */
const lit = (marks: KeyMark[]): KeyMark[] => marks.filter((m) => !(m.root && m.hand === 'none' && !m.label))

describe('kickerFor', () => {
  it('names each of the 4 card types', () => {
    expect(kickerFor('relative')).toBe('WARM-UP · RELATIVE KEY')
    expect(kickerFor('keysig')).toBe('WARM-UP · KEY SIGNATURE')
    expect(kickerFor('spell')).toBe('WARM-UP · SPELL THE SCALE')
    expect(kickerFor('thumb')).toBe('WARM-UP · THUMB NOTES')
  })
})

describe('whyKeyboard: steps (relative)', () => {
  it('A major → marks A, G♯, G, F♯ walking down, steps numbered 1 and 2, F♯ the root', () => {
    const kb = whyKeyboard(recallCard('relative', A).why)
    expect(kb).not.toBeNull()
    const marks = kb!.marks
    expect(marks.map((m) => m.midi)).toEqual([69, 68, 67, 66]) // A4 G#4 G4 F#4
    expect(marks.map((m) => m.label)).toEqual(['A', '1', '2', 'F♯'])
    expect(marks.filter((m) => m.root).map((m) => m.midi)).toEqual([66])
    expect(kb!.low).toBeLessThanOrEqual(66)
    expect(kb!.high).toBeGreaterThanOrEqual(69)
  })

  it('F♯ minor → walks up 3 half-steps to A, A the root', () => {
    const marks = whyKeyboard(recallCard('relative', Fsm).why)!.marks
    expect(marks.map((m) => m.midi)).toEqual([66, 67, 68, 69])
    expect(marks.map((m) => m.label)).toEqual(['F♯', '1', '2', 'A'])
    expect(marks.filter((m) => m.root).map((m) => m.midi)).toEqual([69])
  })

  it('every relative card: 4 consecutive half-steps, the last one is the root', () => {
    for (const root of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']) {
      for (const form of ['major', 'natural'] as const) {
        const marks = whyKeyboard(recallCard('relative', { root, form }).why)!.marks
        const step = form === 'major' ? -1 : 1
        marks.forEach((m, i) => expect(m.midi).toBe((marks[0] as KeyMark).midi + step * i))
        expect(marks.map((m) => Boolean(m.root))).toEqual([false, false, false, true])
      }
    }
  })
})

describe('whyKeyboard: scale (spell)', () => {
  it('A major: tonic to tonic, ascending, note names on the keys, both A keys dotted', () => {
    const kb = whyKeyboard(recallCard('spell', A).why)!
    const keys = lit(kb.marks)
    expect(keys.map((m) => m.label)).toEqual(['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯', 'A'])
    expect(keys.map((m) => m.midi)).toEqual([69, 71, 73, 74, 76, 78, 80, 81])
    const roots = kb.marks.filter((m) => m.root).map((m) => m.midi)
    expect(roots).toEqual([69, 81])
  })

  it('every key in range is inside the marks window, starting and ending on white keys', () => {
    const kb = whyKeyboard(recallCard('spell', { root: 'F#', form: 'major' }).why)!
    const midis = kb.marks.map((m) => m.midi)
    expect(kb.low).toBeLessThan(Math.min(...midis))
    expect(kb.high).toBeGreaterThan(Math.max(...midis))
    expect(isBlack(kb.low)).toBe(false)
    expect(isBlack(kb.high)).toBe(false)
  })

  it('melodic minor down line, read low to high, lands on the same keys as the up line', () => {
    const why = recallCard('spell', Am).why
    if (why.kind !== 'scale' || !why.descending) throw new Error('expected a melodic scale why')
    const down = whyKeyboard({ kind: 'scale', notes: [...why.descending].reverse(), accidentals: [] })!
    expect(lit(down.marks).map((m) => m.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'])
    expect(lit(down.marks).map((m) => m.midi)).toEqual([69, 71, 72, 74, 76, 77, 79, 81])
  })
})

describe('whyKeyboard: thumbs', () => {
  it('G major: a finger-1 badge on each thumbNotes note and nowhere else; the tonic dotted', () => {
    const why = recallCard('thumb', G).why
    const kb = whyKeyboard(why)!
    const thumbs = thumbNotes(G, 'rh')
    const badged = kb.marks.filter((m) => m.finger !== undefined)
    expect(badged.every((m) => m.finger === 1 && m.hand === 'rh')).toBe(true)
    expect(badged.map((m) => pcOf(m.midi)).sort()).toEqual(thumbs.map(chroma).sort())
    expect(badged.map((m) => m.label)).toEqual(thumbs.map(formatNote))
    expect(lit(kb.marks)).toHaveLength(7) // the 7 scale notes, read as given
    expect(kb.marks.filter((m) => m.root).map((m) => pcOf(m.midi))).toEqual([chroma('G')])
  })

  it('reads why.thumbs as given for every major and natural minor (fingerings untouched)', () => {
    for (const root of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']) {
      const why = recallCard('thumb', { root, form: 'major' }).why
      if (why.kind !== 'thumbs') throw new Error('expected thumbs')
      const badged = whyKeyboard(why)!.marks.filter((m) => m.finger === 1)
      expect(badged.map((m) => m.label)).toEqual(why.thumbs.map(formatNote))
    }
  })
})

describe('whyKeyboard: wheel', () => {
  it('a key-signature card has no keyboard (it draws the wheel)', () => {
    expect(whyKeyboard(recallCard('keysig', A).why)).toBeNull()
  })
})

describe('whyChips', () => {
  it('relative: the shared key signature', () => {
    expect(whyChips(recallCard('relative', A).why)).toEqual({ label: 'Same key signature', notes: ['F#', 'C#', 'G#'] })
    expect(whyChips(recallCard('relative', Fsm).why)).toEqual({ label: 'Same key signature', notes: ['F#', 'C#', 'G#'] })
    expect(whyChips(recallCard('relative', C).why)).toEqual({ label: 'Same key signature', notes: [] })
  })

  it('key signature: the accidentals in order; none for C', () => {
    expect(whyChips(recallCard('keysig', A).why)).toEqual({ label: 'In order', notes: ['F#', 'C#', 'G#'] })
    expect(whyChips(recallCard('keysig', C).why)).toBeNull()
  })

  it("spell: the scale's own sharps and flats; thumbs: none", () => {
    expect(whyChips(recallCard('spell', A).why)).toEqual({ label: 'Sharps and flats', notes: ['F#', 'C#', 'G#'] })
    expect(whyChips(recallCard('thumb', A).why)).toBeNull()
  })

  it('melodic spell (R-T7b): one row per line; up from why.accidentals, down in signature order', () => {
    const Cm: ScaleRef = { root: 'C', form: 'melodic' }
    expect(whyChips(recallCard('spell', Cm).why, 'up')).toEqual({ label: 'Sharps and flats', notes: ['Eb'] })
    expect(whyChips(recallCard('spell', Cm).why, 'down')).toEqual({ label: 'Sharps and flats', notes: ['Bb', 'Eb', 'Ab'] })
    expect(whyChips(recallCard('spell', Am).why, 'up')).toEqual({ label: 'Sharps and flats', notes: ['F#', 'G#'] })
    // No accidentals coming down: an empty row, which renders the shared "no sharps or flats" text.
    expect(whyChips(recallCard('spell', Am).why, 'down')).toEqual({ label: 'Sharps and flats', notes: [] })
  })

  it('non-melodic spell cards are unchanged: the line argument is ignored', () => {
    const Ah: ScaleRef = { root: 'A', form: 'harmonic' }
    expect(whyChips(recallCard('spell', Ah).why, 'down')).toEqual(whyChips(recallCard('spell', Ah).why))
    expect(whyChips(recallCard('spell', Ah).why)).toEqual({ label: 'Sharps and flats', notes: ['G#'] })
    expect(whyChips(recallCard('spell', C).why, 'down')).toBeNull()
  })

  it('every card type has a kicker', () => {
    for (const t of RECALL_TYPES) expect(kickerFor(t)).toMatch(/^WARM-UP · /)
  })
})
