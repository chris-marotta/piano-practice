// Staff theory: where a note sits on a staff, ledger lines, the staff-reading levels and key signatures. Pure.
import { Note } from '@tonaljs/tonal'
import { noteMidi, scaleSequence } from './scales'
import type { ScaleRef } from './scales'

export type Clef = 'treble' | 'bass'

const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }

/** Diatonic step number of a letter + octave, ignoring any accidental (C0 = 0). */
function diatonic(note: string): number {
  const n = Note.get(note)
  if (n.empty || n.oct === undefined) throw new Error(`Not a note with octave: ${note}`)
  return n.oct * 7 + (LETTER_INDEX[n.letter] ?? 0)
}

// The middle line: treble B4, bass D3.
const MIDDLE_LINE: Record<Clef, number> = { treble: diatonic('B4'), bass: diatonic('D3') }

/** Diatonic steps from the middle line (negative below). Even = line, odd = space; the staff lines are -4..4. */
export function staffPosition(note: string, clef: Clef): number {
  return diatonic(note) - MIDDLE_LINE[clef]
}

/** The even positions from +/-6 out to the note; empty inside the staff. */
export function ledgerLines(position: number): number[] {
  const sign = position < 0 ? -1 : 1
  const out: number[] = []
  for (let p = 6; p <= Math.abs(position); p += 2) out.push(p * sign)
  return out
}

/** Notes by level, in introduction order. Level 6 (speed) adds none. */
export const STAFF_LEVEL_NOTES: Record<1 | 2 | 3 | 4 | 5, { clef: Clef; note: string }[]> = {
  1: [
    { clef: 'treble', note: 'C4' },
    { clef: 'bass', note: 'C4' },
    { clef: 'treble', note: 'G4' },
    { clef: 'bass', note: 'F3' },
  ],
  2: ['C5', 'D4', 'E4', 'F4', 'A4', 'B4', 'D5', 'E5', 'F5', 'G5'].map((note) => ({ clef: 'treble' as const, note })),
  3: ['C3', 'F2', 'G2', 'A2', 'B2', 'D3', 'E3', 'G3', 'A3', 'B3'].map((note) => ({ clef: 'bass' as const, note })),
  4: [
    ...['A3', 'B3', 'A5', 'B5', 'C6'].map((note) => ({ clef: 'treble' as const, note })),
    ...['C2', 'D2', 'E2', 'D4', 'E4'].map((note) => ({ clef: 'bass' as const, note })),
  ],
  5: [
    ...['F#4', 'Gb4', 'G#4', 'Ab4', 'A#4', 'Bb4', 'C#5', 'Db5', 'D#5', 'Eb5'].map((note) => ({
      clef: 'treble' as const,
      note,
    })),
    ...['G#2', 'Ab2', 'A#2', 'Bb2', 'C#3', 'Db3', 'D#3', 'Eb3', 'F#3', 'Gb3'].map((note) => ({
      clef: 'bass' as const,
      note,
    })),
  ],
}

const KEY_SIG_NOTES: Record<'#' | 'b', Record<Clef, string[]>> = {
  '#': {
    treble: ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4'],
    bass: ['F3', 'C3', 'G3', 'D3', 'A2', 'E3', 'B2'],
  },
  b: {
    treble: ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4'],
    bass: ['B2', 'E3', 'A2', 'D3', 'G2', 'C3', 'F2'],
  },
}

/** Staff positions of the first `count` sharps or flats, in the standard order and placement. */
export function keySignaturePositions(accidental: '#' | 'b', count: number, clef: Clef): number[] {
  return KEY_SIG_NOTES[accidental][clef].slice(0, count).map((n) => staffPosition(n, clef))
}

/** What to print before a note under a key signature: '' when the signature already says it, 'n' to cancel it. */
export function writtenAccidental(
  note: string,
  sig: { accidental: '#' | 'b' | ''; notes: string[] },
): '' | '#' | 'b' | 'n' | '##' | 'bb' {
  const n = Note.get(note)
  const own = n.acc as '' | '#' | 'b' | '##' | 'bb'
  const inSig = sig.accidental !== '' && sig.notes.some((s) => s[0] === n.letter)
  if (!inSig) return own
  return own === sig.accidental ? '' : own === '' ? 'n' : own
}

/** Octaves for a scale on the grand staff: RH from 4; LH from 3 when that octave tops out at or below E4, else 2. */
export function staffOctaves(ref: ScaleRef): { rh: 4; lh: 2 | 3 } {
  const asc = scaleSequence(ref, 1, 3).ascending
  return { rh: 4, lh: noteMidi(asc[asc.length - 1] as string) <= 64 ? 3 : 2 }
}
