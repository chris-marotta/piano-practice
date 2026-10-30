// Pure view model for the warm-up deck (no Preact, no window): unit tested in node.
import { formatNote } from '../../../theory/format'
import type { RecallType, RecallWhy } from '../../../theory/recall'
import { chroma, keySignature } from '../../../theory/scales'
import { isBlack, type KeyMark } from '../../components/keyboardLayout'

const KICKER: Record<RecallType, string> = {
  relative: 'WARM-UP · RELATIVE KEY',
  keysig: 'WARM-UP · KEY SIGNATURE',
  spell: 'WARM-UP · SPELL THE SCALE',
  thumb: 'WARM-UP · THUMB NOTES',
}

export function kickerFor(type: RecallType): string {
  return KICKER[type]
}

/** Pictures start on the tonic in octave 4 (C4 = 60). */
const C4 = 60

/** Ascending MIDI numbers for notes in scale order: each note is the next key up with its pitch class. */
function climb(notes: string[]): number[] {
  const out: number[] = []
  for (const n of notes) {
    const prev = out[out.length - 1]
    if (prev === undefined) out.push(C4 + chroma(n))
    else out.push(prev + ((chroma(n) - (prev % 12) + 12) % 12 || 12))
  }
  return out
}

/** A whole tone of margin each side, widened to white keys: tight, but with neighbours to find your place by. */
function tightRange(midis: number[]): { low: number; high: number } {
  let low = Math.min(...midis) - 2
  let high = Math.max(...midis) + 2
  while (isBlack(low)) low--
  while (isBlack(high)) high++
  return { low, high }
}

/** A dot-only mark: the root dot on a key that another mark lights. */
const dot = (midi: number): KeyMark => ({ midi, hand: 'none', root: true })

/**
 * The keyboard for a card's why picture, or null for the wheel (key-signature cards).
 * - steps: tonic lit and named, the two half-steps between numbered 1 and 2, the answer named with the root dot.
 * - scale: the line tonic to tonic, note names on the keys, the tonic dotted.
 * - thumbs: the 7 scale notes in the right-hand colour, a finger-1 badge on each of `why.thumbs` as given.
 */
export function whyKeyboard(why: RecallWhy): { low: number; high: number; marks: KeyMark[] } | null {
  if (why.kind === 'wheel') return null
  let marks: KeyMark[]
  if (why.kind === 'steps') {
    const start = C4 + chroma(why.from)
    const sign = why.direction === 'down' ? -1 : 1
    const last = why.path.length - 1
    marks = why.path.map((n, i): KeyMark => {
      const midi = start + sign * i
      if (i === 0) return { midi, hand: 'none', label: formatNote(n) }
      if (i === last) return { midi, hand: 'none', label: formatNote(n), root: true, state: 'target' }
      return { midi, hand: 'none', label: String(i), state: 'played' }
    })
  } else {
    const tonic = chroma(why.notes[0] as string)
    const midis = climb(why.notes)
    const thumbs = why.kind === 'thumbs' ? new Set(why.thumbs.map(chroma)) : null
    const keys = why.notes.map((n, i): KeyMark => {
      const midi = midis[i] as number
      if (!thumbs) return { midi, hand: 'none', label: formatNote(n) }
      return { midi, hand: 'rh', label: formatNote(n), ...(thumbs.has(chroma(n)) ? { finger: 1 } : {}) }
    })
    marks = [...keys, ...midis.filter((m) => m % 12 === tonic).map(dot)]
  }
  return { ...tightRange(marks.map((m) => m.midi)), marks }
}

/** The chips under a why picture: the shared signature (relative), the accidentals in order (key signature), the scale's own sharps and flats (spell). */
export function whyChips(why: RecallWhy): { label: string; notes: string[] } | null {
  switch (why.kind) {
    case 'steps': {
      // Walking down starts on a major; walking up starts on a minor (relative minors share the natural minor's signature).
      const notes = keySignature({ root: why.from, form: why.direction === 'down' ? 'major' : 'natural' }).notes
      return { label: 'Same key signature', notes }
    }
    case 'wheel':
      return why.notes.length > 0 ? { label: 'In order', notes: why.notes } : null
    case 'scale':
      return why.accidentals.length > 0 ? { label: 'Sharps and flats', notes: why.accidentals } : null
    case 'thumbs':
      return null
  }
}
