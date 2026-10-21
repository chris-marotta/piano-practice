// Pure view model for the scale step (no Preact, no window): unit tested in node.
import { familyOf, fingeringSequence } from '../../../data/fingerings'
import { formatNote, formatScale } from '../../../theory/format'
import { recallCard } from '../../../theory/recall'
import { noteMidi, scaleSequence, type ScaleRef } from '../../../theory/scales'
import { keyboardRange, type KeyMark } from '../../components/keyboardLayout'

/** RH starts at octave 4, LH an octave lower. */
const RH_OCTAVE = 4
const LH_OCTAVE = 3

const pitchClass = (n: string): string => n.replace(/-?\d+$/, '')

export function scaleHeader(ref: ScaleRef, octaves: 1 | 2, tempo: number): string {
  return `${formatScale(ref)} · ${octaves} ${octaves === 1 ? 'octave' : 'octaves'} · ♩ = ${tempo}`
}

/** '4 sharps: F♯ C♯ G♯ D♯' / 'No sharps or flats' (the same answer as the key-signature card). */
export function keySignatureText(ref: ScaleRef): string {
  return recallCard('keysig', ref).answer
}

export const SUPPORT_NAMES: Record<0 | 1 | 2 | 3, string> = {
  0: 'Keyboard',
  1: 'Finger numbers',
  2: 'Key signature',
  3: 'From memory',
}

export function familyLine(ref: ScaleRef): string | null {
  return familyOf(ref)
}

interface HandRow {
  notes: string[]
  fingers: number[]
}

/** L1: each hand's ascending notes (with octave) and fingers. */
export function fingerRows(ref: ScaleRef, octaves: 1 | 2): { rh: HandRow; lh: HandRow } {
  return {
    rh: {
      notes: scaleSequence(ref, octaves, RH_OCTAVE).ascending,
      fingers: fingeringSequence(ref, octaves, 'rh', 'up'),
    },
    lh: {
      notes: scaleSequence(ref, octaves, LH_OCTAVE).ascending,
      fingers: fingeringSequence(ref, octaves, 'lh', 'up'),
    },
  }
}

/** L0: hands together on one keyboard, ascending fingering, note names on the keys. */
export function scaleKeyboard(
  ref: ScaleRef,
  octaves: 1 | 2,
): { low: number; high: number; marks: KeyMark[]; firstMidi: number } {
  const rows = fingerRows(ref, octaves)
  const marksFor = (hand: 'rh' | 'lh', row: HandRow): KeyMark[] =>
    row.notes.map((n, i) => ({ midi: noteMidi(n), hand, finger: row.fingers[i], label: formatNote(pitchClass(n)) }))
  const marks = [...marksFor('rh', rows.rh), ...marksFor('lh', rows.lh)]
  const midis = marks.map((m) => m.midi)
  return { ...keyboardRange(midis), marks, firstMidi: Math.min(...midis) }
}
