import { Chord, Note } from '@tonaljs/tonal'
import { type ScaleRef, scaleNotes } from './scales'

export type ChordTypeId = 'M' | 'm' | 'dim' | 'aug' | 'sus2' | 'sus4' | 'maj7' | '7' | 'm7' | 'm7b5' | 'dim7' | '6' | 'add9' | '9'

export const CHORD_TYPES: { id: ChordTypeId; label: string }[] = [
  { id: 'M', label: 'Major' },
  { id: 'm', label: 'Minor' },
  { id: 'dim', label: 'Diminished' },
  { id: 'aug', label: 'Augmented' },
  { id: 'sus2', label: 'sus2' },
  { id: 'sus4', label: 'sus4' },
  { id: 'maj7', label: 'maj7' },
  { id: '7', label: '7' },
  { id: 'm7', label: 'm7' },
  { id: 'm7b5', label: 'm7♭5' },
  { id: 'dim7', label: 'dim7' },
  { id: '6', label: '6' },
  { id: 'add9', label: 'add9' },
  { id: '9', label: '9' },
]

/** Notes of the chord in root position, with octaves, ascending. */
function rootPositionNotes(root: string, type: ChordTypeId, octave: number): string[] {
  return Chord.getChord(type, `${root}${octave}`).notes
}

/** 3rd inversion only where there is a 7th (spec 3.3); triads, 6 and add9 stop at 2nd. */
const MAX_INVERSION: Record<ChordTypeId, number> = {
  M: 2, m: 2, dim: 2, aug: 2, sus2: 2, sus4: 2,
  maj7: 3, '7': 3, m7: 3, m7b5: 3, dim7: 3, '9': 3,
  '6': 2, add9: 2,
}

export function maxInversion(type: ChordTypeId): number {
  return MAX_INVERSION[type]
}

/** Inversion k moves each of the lowest k notes up whole octaves until it sits above the current top note, so the result always ascends (add9/9 have a 9th already above the octave). */
export function chordNotes(root: string, type: ChordTypeId, inversion: number, octave = 4): string[] {
  const result = rootPositionNotes(root, type, octave)
  for (let i = 0; i < inversion; i++) {
    let moved = Note.transpose(result.shift() as string, '8P')
    const top = Note.midi(result[result.length - 1] as string) as number
    while ((Note.midi(moved) as number) < top) moved = Note.transpose(moved, '8P')
    result.push(moved)
  }
  return result
}

type Hand = 'rh' | 'lh'

/** Triads (incl. dim, aug, sus) share one table by inversion. */
const TRIAD_FINGERING: Record<Hand, number[][]> = {
  rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
  lh: [[5, 3, 1], [5, 3, 1], [5, 2, 1]],
}

/** Four-note chords in root position only. */
const FOUR_NOTE_FINGERING: Record<Hand, number[]> = {
  rh: [1, 2, 3, 5],
  lh: [5, 3, 2, 1],
}

const TRIADS: ChordTypeId[] = ['M', 'm', 'dim', 'aug', 'sus2', 'sus4']
const FOUR_NOTE: ChordTypeId[] = ['maj7', '7', 'm7', 'm7b5', 'dim7', '6']

/** Finger numbers low to high; null where there is no standard fingering (add9, 9, inverted sevenths). */
export function chordFingering(type: ChordTypeId, inversion: number, hand: Hand): number[] | null {
  if (TRIADS.includes(type)) return TRIAD_FINGERING[hand][inversion] ?? null
  if (FOUR_NOTE.includes(type) && inversion === 0) return FOUR_NOTE_FINGERING[hand]
  return null
}

export interface DiatonicChord {
  numeral: string
  root: string
  type: 'M' | 'm' | 'dim' | 'aug'
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function semitonesUp(from: string, to: string): number {
  return (((Note.chroma(to) as number) - (Note.chroma(from) as number)) % 12 + 12) % 12
}

function classify(third: number, fifth: number): DiatonicChord['type'] {
  if (third === 4 && fifth === 7) return 'M'
  if (third === 3 && fifth === 7) return 'm'
  if (third === 3 && fifth === 6) return 'dim'
  return 'aug'
}

/** Triads stacked on each degree of the scale (ascending form). */
export function diatonicChords(ref: ScaleRef): DiatonicChord[] {
  const notes = scaleNotes(ref)
  return notes.map((root, i) => {
    const third = notes[(i + 2) % 7] as string
    const fifth = notes[(i + 4) % 7] as string
    const type = classify(semitonesUp(root, third), semitonesUp(root, fifth))
    const roman = type === 'M' || type === 'aug' ? (ROMAN[i] as string) : (ROMAN[i] as string).toLowerCase()
    const suffix = type === 'dim' ? '°' : type === 'aug' ? '+' : ''
    return { numeral: roman + suffix, root, type }
  })
}

/** The session chord set: degrees I IV V vi (major) or i iv V|v VI (minor). Melodic uses the harmonic set (ASSUMED). */
export function progression(ref: ScaleRef): DiatonicChord[] {
  const form = ref.form === 'melodic' ? 'harmonic' : ref.form
  const chords = diatonicChords({ root: ref.root, form })
  return [0, 3, 4, 5].map((i) => chords[i] as DiatonicChord)
}

/** Chord names for the given notes, lowest note as bass. Input order does not matter. */
export function detectChord(notes: string[]): string[] {
  const pitchClasses = [...notes]
    .sort((a, b) => (Note.midi(a) as number) - (Note.midi(b) as number))
    .map((n) => Note.pitchClass(n))
  return Chord.detect(pitchClasses)
}
