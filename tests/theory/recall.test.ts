import { describe, expect, it } from 'vitest'
import { thumbNotes } from '../../src/data/fingerings'
import { RECALL_TYPES, recallCard } from '../../src/theory/recall'
import type { RecallWhy } from '../../src/theory/recall'
import { MAJOR_ROOTS, MINOR_ROOTS, keySignature, relativeKey, scaleNotes } from '../../src/theory/scales'
import type { ScaleRef } from '../../src/theory/scales'

describe('recallCard', () => {
  it('lists the four recall types', () => {
    expect(RECALL_TYPES).toEqual(['keysig', 'spell', 'relative', 'thumb'])
  })

  it('keysig', () => {
    expect(recallCard('keysig', { root: 'E', form: 'major' })).toMatchObject({ type: 'keysig',
      prompt: 'E major — how many sharps or flats? Name them in order.', answer: '4 sharps: F♯ C♯ G♯ D♯' })
    expect(recallCard('keysig', { root: 'C', form: 'major' }).answer).toBe('No sharps or flats')
    expect(recallCard('keysig', { root: 'F', form: 'major' }).answer).toBe('1 flat: B♭')
  })

  it('keysig for a minor form states the natural-minor signature', () => {
    expect(recallCard('keysig', { root: 'F#', form: 'harmonic' })).toMatchObject({ type: 'keysig',
      prompt: 'F♯ harmonic minor — how many sharps or flats? Name them in order.', answer: '3 sharps: F♯ C♯ G♯' })
    expect(recallCard('keysig', { root: 'A', form: 'natural' }).answer).toBe('No sharps or flats')
  })

  it('spell', () => {
    expect(recallCard('spell', { root: 'Bb', form: 'major' }).answer).toBe('B♭ C D E♭ F G A B♭')
    expect(recallCard('spell', { root: 'A', form: 'melodic' }).answer).toBe('Up: A B C D E F♯ G♯ A · Down: A G F E D C B A')
  })

  it('spell for non-melodic minors and double accidentals', () => {
    expect(recallCard('spell', { root: 'A', form: 'natural' })).toMatchObject({ type: 'spell',
      prompt: 'A natural minor — spell the scale.', answer: 'A B C D E F G A' })
    expect(recallCard('spell', { root: 'G#', form: 'harmonic' }).answer).toBe('G♯ A♯ B C♯ D♯ E F𝄪 G♯')
  })

  it('relative', () => {
    expect(recallCard('relative', { root: 'Ab', form: 'major' })).toMatchObject({
      prompt: 'Relative minor of A♭ major?', answer: 'F minor' })
    expect(recallCard('relative', { root: 'C#', form: 'natural' }).prompt).toBe('Relative major of C♯ minor?')
    expect(recallCard('relative', { root: 'C#', form: 'natural' }).answer).toBe('E major')
  })

  it('relative says just "minor" for every minor form and follows relativeKey as-is', () => {
    expect(recallCard('relative', { root: 'C#', form: 'harmonic' })).toMatchObject({
      prompt: 'Relative major of C♯ minor?', answer: 'E major' })
    expect(recallCard('relative', { root: 'Eb', form: 'melodic' }).answer).toBe('G♭ major')
    expect(recallCard('relative', { root: 'F#', form: 'major' }).answer).toBe('D♯ minor')
  })

  it('thumb', () => {
    expect(recallCard('thumb', { root: 'E', form: 'major' })).toMatchObject({
      prompt: 'E major — which notes does the right-hand thumb play?', answer: 'E, A' })
  })

  it('thumb for a minor form', () => {
    const card = recallCard('thumb', { root: 'A', form: 'natural' })
    expect(card.type).toBe('thumb')
    expect(card.prompt).toBe('A natural minor — which notes does the right-hand thumb play?')
    expect(card.answer).toBe('A, D')
  })
})

/** Every scale ref the app can produce: 12 majors, plus each minor root in all three forms. */
const ENABLED: ScaleRef[] = [
  ...MAJOR_ROOTS.map((root) => ({ root, form: 'major' as const })),
  ...(['natural', 'harmonic', 'melodic'] as const).flatMap((form) => MINOR_ROOTS.map((root) => ({ root, form }))),
]

const label = (ref: ScaleRef): string => `${ref.root} ${ref.form}`

function whyOf<K extends RecallWhy['kind']>(why: RecallWhy, kind: K): Extract<RecallWhy, { kind: K }> {
  expect(why.kind).toBe(kind)
  return why as Extract<RecallWhy, { kind: K }>
}

describe('recall why: pinned examples', () => {
  it('A major relative steps down to F#', () => {
    const card = recallCard('relative', { root: 'A', form: 'major' })
    expect(card.why).toEqual({ kind: 'steps', from: 'A', path: ['A', 'G#', 'G', 'F#'], direction: 'down' })
    expect(card.whyText).toBe('From A, step down 3 half-steps: A → G♯ → G → F♯.')
  })

  it('F# natural minor relative steps up to A', () => {
    const card = recallCard('relative', { root: 'F#', form: 'natural' })
    expect(card.why).toEqual({ kind: 'steps', from: 'F#', path: ['F#', 'G', 'G#', 'A'], direction: 'up' })
    expect(card.whyText).toBe('From F♯, step up 3 half-steps: F♯ → G → G♯ → A.')
  })

  it('relative steps for edge keys: flat keys use flats, 6 o\'clock keys land on tonal\'s spelling', () => {
    expect(recallCard('relative', { root: 'F', form: 'major' }).why).toMatchObject({ path: ['F', 'E', 'Eb', 'D'] })
    expect(recallCard('relative', { root: 'Db', form: 'major' }).why).toMatchObject({ path: ['Db', 'C', 'B', 'Bb'] })
    expect(recallCard('relative', { root: 'F#', form: 'major' }).whyText)
      .toBe('From F♯, step down 3 half-steps: F♯ → F → E → D♯.')
    expect(recallCard('relative', { root: 'Eb', form: 'melodic' }).whyText)
      .toBe('From E♭, step up 3 half-steps: E♭ → E → F → G♭.')
    expect(recallCard('relative', { root: 'C#', form: 'harmonic' }).why).toMatchObject({ path: ['C#', 'D', 'D#', 'E'] })
  })

  it('relative steps for C major and A minor (no accidentals): flats going down, sharps going up', () => {
    expect(recallCard('relative', { root: 'C', form: 'major' }).why).toMatchObject({ path: ['C', 'B', 'Bb', 'A'] })
    expect(recallCard('relative', { root: 'A', form: 'natural' }).why).toMatchObject({ path: ['A', 'A#', 'B', 'C'] })
  })

  it('A major keysig is 3 steps clockwise', () => {
    const card = recallCard('keysig', { root: 'A', form: 'major' })
    expect(card.why).toEqual({ kind: 'wheel', key: 'A', minor: false, steps: 3, accidental: '#', notes: ['F#', 'C#', 'G#'] })
    expect(card.whyText).toBe('A major is 3 steps clockwise from C major, so 3 sharps: F♯ C♯ G♯.')
  })

  it('F major keysig is 1 step anticlockwise (singular)', () => {
    const card = recallCard('keysig', { root: 'F', form: 'major' })
    expect(card.why).toMatchObject({ kind: 'wheel', steps: 1, accidental: 'b', notes: ['Bb'] })
    expect(card.whyText).toBe('F major is 1 step anticlockwise from C major, so 1 flat: B♭.')
  })

  it('C major keysig is at the top', () => {
    const card = recallCard('keysig', { root: 'C', form: 'major' })
    expect(card.why).toEqual({ kind: 'wheel', key: 'C', minor: false, steps: 0, accidental: '', notes: [] })
    expect(card.whyText).toBe('C major is at the top of the circle: no sharps or flats.')
  })

  it('minors count from A minor; harmonic and melodic add their sentence', () => {
    expect(recallCard('keysig', { root: 'E', form: 'harmonic' }).whyText).toMatch(
      / Harmonic minor raises the 7th as an accidental; it isn't in the key signature\.$/)
    expect(recallCard('keysig', { root: 'E', form: 'harmonic' }).whyText).toBe(
      "E minor is 1 step clockwise from A minor, so 1 sharp: F♯. Harmonic minor raises the 7th as an accidental; it isn't in the key signature.")
    expect(recallCard('keysig', { root: 'D', form: 'melodic' }).whyText).toBe(
      "D minor is 1 step anticlockwise from A minor, so 1 flat: B♭. Melodic minor raises the 6th and 7th going up; they aren't in the key signature.")
    expect(recallCard('keysig', { root: 'A', form: 'natural' }).whyText).toBe('A minor is at the top of the circle: no sharps or flats.')
    expect(recallCard('keysig', { root: 'A', form: 'harmonic' }).why).toEqual(
      { kind: 'wheel', key: 'A', minor: true, steps: 0, accidental: '', notes: [] })
  })

  it('keysig at the 6 o\'clock edge: F# major sharps, Eb minor flats', () => {
    expect(recallCard('keysig', { root: 'F#', form: 'major' }).whyText).toBe(
      'F♯ major is 6 steps clockwise from C major, so 6 sharps: F♯ C♯ G♯ D♯ A♯ E♯.')
    expect(recallCard('keysig', { root: 'Eb', form: 'natural' }).whyText).toBe(
      'E♭ minor is 6 steps anticlockwise from A minor, so 6 flats: B♭ E♭ A♭ D♭ G♭ C♭.')
    expect(recallCard('keysig', { root: 'Db', form: 'major' }).why).toMatchObject({ steps: 5, accidental: 'b' })
    expect(recallCard('keysig', { root: 'C#', form: 'natural' }).why).toMatchObject({ steps: 4, accidental: '#' })
  })

  it('spell names the accidentals in signature order', () => {
    const card = recallCard('spell', { root: 'A', form: 'major' })
    expect(card.why).toEqual({ kind: 'scale', notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#', 'A'], accidentals: ['F#', 'C#', 'G#'] })
    expect(card.whyText).toBe('The sharps are F♯ C♯ G♯; every other note is natural.')
    expect(recallCard('spell', { root: 'F', form: 'major' }).whyText).toBe('The flat is B♭; every other note is natural.')
    expect(recallCard('spell', { root: 'C', form: 'major' }).whyText).toBe('No sharps or flats: all natural notes.')
    expect(recallCard('spell', { root: 'A', form: 'natural' }).whyText).toBe('No sharps or flats: all natural notes.')
  })

  it('spell for harmonic minor includes the raised 7th, double sharp included', () => {
    expect(recallCard('spell', { root: 'A', form: 'harmonic' }).whyText).toBe('The sharp is G♯; every other note is natural.')
    expect(recallCard('spell', { root: 'E', form: 'harmonic' }).why).toMatchObject({ accidentals: ['F#', 'D#'] })
    expect(recallCard('spell', { root: 'G#', form: 'harmonic' }).whyText)
      .toBe('The sharps are C♯ G♯ D♯ A♯ F𝄪; every other note is natural.')
  })

  it('spell with both flats and sharps names each group (flagged: not in the brief template)', () => {
    expect(recallCard('spell', { root: 'D', form: 'harmonic' }).whyText)
      .toBe('The flat is B♭ and the sharp is C♯; every other note is natural.')
    expect(recallCard('spell', { root: 'G', form: 'harmonic' }).whyText)
      .toBe('The flats are B♭ E♭ and the sharp is F♯; every other note is natural.')
    expect(recallCard('spell', { root: 'G', form: 'melodic' }).whyText)
      .toBe('The flat is B♭ and the sharp is F♯; every other note is natural.')
  })

  it('spell for melodic minor carries the descending line', () => {
    expect(recallCard('spell', { root: 'A', form: 'melodic' }).why).toEqual({
      kind: 'scale',
      notes: ['A', 'B', 'C', 'D', 'E', 'F#', 'G#', 'A'],
      accidentals: ['F#', 'G#'],
      descending: ['A', 'G', 'F', 'E', 'D', 'C', 'B', 'A'],
    })
    expect(recallCard('spell', { root: 'A', form: 'major' }).why).not.toHaveProperty('descending')
  })

  it('thumb names two notes as "A and D" (every enabled scale has two today)', () => {
    const card = recallCard('thumb', { root: 'A', form: 'natural' })
    expect(card.why).toEqual({ kind: 'thumbs', notes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], thumbs: ['A', 'D'] })
    expect(card.whyText).toBe('Right-hand thumb on A and D.')
  })
})

describe('recall why: every enabled scale', () => {
  const ascii = /[A-G][#b]/

  it('covers 12 majors and 36 minors', () => {
    expect(ENABLED).toHaveLength(48)
  })

  for (const ref of ENABLED) {
    it(label(ref), () => {
      for (const type of RECALL_TYPES) {
        const { whyText } = recallCard(type, ref)
        expect(whyText.length, type).toBeGreaterThan(0)
        expect(whyText, type).not.toMatch(ascii)
      }

      const steps = whyOf(recallCard('relative', ref).why, 'steps')
      expect(steps.path).toHaveLength(4)
      expect(steps.from).toBe(ref.root)
      expect(steps.path[0]).toBe(ref.root)
      expect(steps.path[3]).toBe(relativeKey(ref).root)
      expect(steps.direction).toBe(ref.form === 'major' ? 'down' : 'up')
      steps.path.forEach((n) => expect(n).not.toMatch(/##|bb/))

      const sig = keySignature(ref)
      const wheel = whyOf(recallCard('keysig', ref).why, 'wheel')
      expect(wheel).toEqual({ kind: 'wheel', key: ref.root, minor: ref.form !== 'major',
        steps: sig.count, accidental: sig.accidental, notes: sig.notes })

      const scale = whyOf(recallCard('spell', ref).why, 'scale')
      const own = scaleNotes(ref).filter((n) => /[#b]/.test(n))
      expect([...scale.accidentals].sort()).toEqual([...own].sort())
      expect(scale.notes).toEqual([...scaleNotes(ref), ref.root])

      const thumbs = whyOf(recallCard('thumb', ref).why, 'thumbs')
      expect(thumbs.thumbs).toEqual(thumbNotes(ref, 'rh'))
      expect(thumbs.thumbs.length).toBeGreaterThan(0)
    })
  }
})
