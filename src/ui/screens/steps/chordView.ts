// Pure view model for the chord step (no Preact, no window): unit tested in node.
import { chordFingering, chordNotes, type DiatonicChord } from '../../../theory/chords'
import { formatNote } from '../../../theory/format'
import { noteMidi } from '../../../theory/scales'
import { voiceLedCadence } from '../../../theory/voiceLeading'
import { keyboardRange, type KeyMark } from '../../components/keyboardLayout'

const QUALITY: Record<DiatonicChord['type'], string> = {
  M: 'major',
  m: 'minor',
  dim: 'diminished',
  aug: 'augmented',
}

const pitchClass = (n: string): string => n.replace(/-?\d+$/, '')

export function chordCard(c: DiatonicChord): { numeral: string; name: string; quality: string } {
  return { numeral: c.numeral, name: formatNote(c.root), quality: QUALITY[c.type] }
}

/** Right-hand marks with the standard fingering for this inversion. */
export function chordMarks(notes: string[], type: DiatonicChord['type'], inversion: number): KeyMark[] {
  const fingers = chordFingering(type, inversion, 'rh')
  return notes.map((n, i) => ({ midi: noteMidi(n), hand: 'rh', finger: fingers?.[i], label: formatNote(pitchClass(n)) }))
}

const INVERSION_LABELS = ['Root position', '1st inversion', '2nd inversion']

export function inversionsOfTonic(tonic: DiatonicChord): { label: string; notes: string[]; inversion: number }[] {
  return INVERSION_LABELS.map((label, inversion) => ({ label, notes: chordNotes(tonic.root, tonic.type, inversion), inversion }))
}

/** One C..B range covering every voicing the step can show, so the keyboard never shifts. */
export function chordStepRange(chords: DiatonicChord[], includeInversions: boolean): { low: number; high: number } {
  const notes = chords.flatMap((c) => chordNotes(c.root, c.type, 0))
  const tonic = chords[0]
  if (includeInversions && tonic) {
    notes.push(...inversionsOfTonic(tonic).flatMap((v) => v.notes))
    notes.push(...voiceLedCadence(chords).flatMap((c) => c.notes))
  }
  return keyboardRange(notes.map(noteMidi))
}
