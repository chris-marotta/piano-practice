import { Key, Note, Scale } from '@tonaljs/tonal'

export type ScaleForm = 'major' | 'natural' | 'harmonic' | 'melodic'

export interface ScaleRef {
  root: string
  form: ScaleForm
}

/** Circle-of-fifths order; index i of MAJOR_ROOTS and MINOR_ROOTS is a relative pair. */
export const MAJOR_ROOTS: string[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
export const MINOR_ROOTS: string[] = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D']

const TONAL_NAME: Record<ScaleForm, string> = {
  major: 'major',
  natural: 'aeolian',
  harmonic: 'harmonic minor',
  melodic: 'melodic minor',
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']
const LETTERS = 'CDEFGAB'

/** The 7 pitch classes of the scale, ascending form, in tonal's ASCII spelling. */
export function scaleNotes(ref: ScaleRef): string[] {
  return Scale.get(`${ref.root} ${TONAL_NAME[ref.form]}`).notes
}

/** True for the five black keys, by pitch class: Cb, E#, B# and Fb are white keys. */
export function isBlackKey(note: string): boolean {
  return [1, 3, 6, 8, 10].includes(Note.chroma(note) as number)
}

/** Attach octave numbers to ascending pitch classes: the octave rises each time the letter wraps past B. */
function withOctaves(pitchClasses: string[], startOctave: number): string[] {
  let octave = startOctave
  let prevLetter = -1
  return pitchClasses.map((pc) => {
    const letter = LETTERS.indexOf(pc[0] as string)
    if (prevLetter !== -1 && letter < prevLetter) octave += 1
    prevLetter = letter
    return `${pc}${octave}`
  })
}

function ascendingFor(pitchClasses: string[], octaves: 1 | 2, startOctave: number): string[] {
  const first = withOctaves(pitchClasses, startOctave)
  const tonic = first[0] as string
  const upperTonic = Note.transpose(tonic, '8P')
  if (octaves === 1) return [...first, upperTonic]
  const second = first.map((n) => Note.transpose(n, '8P'))
  return [...first, ...second, Note.transpose(upperTonic, '8P')]
}

/** Notes with octave, tonic to tonic inclusive (8 or 15 notes). Melodic minor descends as natural minor. */
export function scaleSequence(
  ref: ScaleRef,
  octaves: 1 | 2,
  startOctave: number,
): { ascending: string[]; descending: string[] } {
  const ascending = ascendingFor(scaleNotes(ref), octaves, startOctave)
  if (ref.form !== 'melodic') return { ascending, descending: [...ascending].reverse() }
  const natural = ascendingFor(scaleNotes({ root: ref.root, form: 'natural' }), octaves, startOctave)
  return { ascending, descending: natural.reverse() }
}

function majorTonicOf(ref: ScaleRef): string {
  return ref.form === 'major' ? ref.root : Key.minorKey(ref.root).relativeMajor
}

/** Minors use their relative major's signature. */
export function keySignature(ref: ScaleRef): { count: number; accidental: '#' | 'b' | ''; notes: string[] } {
  const sig = Key.majorKey(majorTonicOf(ref)).keySignature
  if (sig === '') return { count: 0, accidental: '', notes: [] }
  const accidental = sig[0] as '#' | 'b'
  const order = accidental === '#' ? SHARP_ORDER : FLAT_ORDER
  return {
    count: sig.length,
    accidental,
    notes: order.slice(0, sig.length).map((letter) => `${letter}${accidental}`),
  }
}

/** Major -> its natural minor; any minor form -> its major. */
export function relativeKey(ref: ScaleRef): ScaleRef {
  if (ref.form === 'major') return { root: Key.majorKey(ref.root).minorRelative, form: 'natural' }
  return { root: Key.minorKey(ref.root).relativeMajor, form: 'major' }
}

/** Transpose a note (with or without octave) by an interval such as '5P'. Thin wrapper so only src/theory imports tonal. */
export function transpose(note: string, interval: string): string {
  return Note.transpose(note, interval)
}

/** MIDI number of a note with octave ('F#4' -> 66). Thin wrapper so UI code never imports tonal. Throws without an octave. */
export function noteMidi(note: string): number {
  const midi = Note.midi(note)
  if (midi === null || !/-?\d+$/.test(note)) throw new Error(`Not a note with octave: ${note}`)
  return midi
}

/**
 * The other common spelling of a note: C# <-> Db, F# <-> Gb, ... White keys come back unchanged
 * (no B <-> Cb); theoretical spellings come back plain (Cb -> B, E# -> F, F## -> G).
 */
export function enharmonic(note: string): string {
  return Note.enharmonic(note)
}

/** Pitch class number 0-11 (C = 0), spelling-agnostic: Cb -> 11, B# -> 0. */
export function chroma(note: string): number {
  const c = Note.chroma(note)
  if (c === undefined || Number.isNaN(c)) throw new Error(`Not a note: ${note}`)
  return c
}

/** Note name with octave for a MIDI number (61 -> 'C#4' or 'Db4'). White keys are the same either way. */
export function midiToName(midi: number, prefer: '#' | 'b'): string {
  return prefer === 'b' ? Note.fromMidi(midi) : Note.fromMidiSharps(midi)
}
