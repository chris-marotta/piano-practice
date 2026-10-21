import { describe, expect, it } from 'vitest'
import { RECALL_TYPES, recallCard } from '../../src/theory/recall'

describe('recallCard', () => {
  it('lists the four recall types', () => {
    expect(RECALL_TYPES).toEqual(['keysig', 'spell', 'relative', 'thumb'])
  })

  it('keysig', () => {
    expect(recallCard('keysig', { root: 'E', form: 'major' })).toEqual({ type: 'keysig',
      prompt: 'E major — how many sharps or flats? Name them in order.', answer: '4 sharps: F♯ C♯ G♯ D♯' })
    expect(recallCard('keysig', { root: 'C', form: 'major' }).answer).toBe('No sharps or flats')
    expect(recallCard('keysig', { root: 'F', form: 'major' }).answer).toBe('1 flat: B♭')
  })

  it('keysig for a minor form states the natural-minor signature', () => {
    expect(recallCard('keysig', { root: 'F#', form: 'harmonic' })).toEqual({ type: 'keysig',
      prompt: 'F♯ harmonic minor — how many sharps or flats? Name them in order.', answer: '3 sharps: F♯ C♯ G♯' })
    expect(recallCard('keysig', { root: 'A', form: 'natural' }).answer).toBe('No sharps or flats')
  })

  it('spell', () => {
    expect(recallCard('spell', { root: 'Bb', form: 'major' }).answer).toBe('B♭ C D E♭ F G A B♭')
    expect(recallCard('spell', { root: 'A', form: 'melodic' }).answer).toBe('Up: A B C D E F♯ G♯ A · Down: A G F E D C B A')
  })

  it('spell for non-melodic minors and double accidentals', () => {
    expect(recallCard('spell', { root: 'A', form: 'natural' })).toEqual({ type: 'spell',
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
