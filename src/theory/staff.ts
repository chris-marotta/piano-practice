// Staff theory: where a note sits on a staff, ledger lines, the staff-reading levels and key signatures. Pure.
import { Note } from '@tonaljs/tonal'
import { formatNote } from './format'
import { enharmonic, midiToName, noteMidi, scaleSequence } from './scales'
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

/** Landmark notes per clef, low to high. */
export const LANDMARKS: Record<Clef, string[]> = {
  treble: ['C4', 'G4', 'C5', 'C6'],
  bass: ['C2', 'C3', 'F3', 'C4'],
}

export const LANDMARK_NAMES: Record<Clef, Record<string, string>> = {
  treble: {
    C4: 'middle C',
    G4: 'treble G (2nd line)',
    C5: 'treble C (3rd space)',
    C6: 'high C (2nd ledger line above)',
  },
  bass: {
    C2: 'low C (2nd ledger line below)',
    C3: 'bass C (2nd space)',
    F3: 'bass F (4th line)',
    C4: 'middle C',
  },
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

function letterOctave(d: number): string {
  return `${LETTERS[((d % 7) + 7) % 7]}${Math.floor(d / 7)}`
}

/** The nearest landmark (ties go to the lower one) and the natural notes from it to the note's letter, inclusive. */
export function staffRoute(note: string, clef: Clef): { landmark: string; steps: string[] } {
  const target = diatonic(note)
  let landmark = LANDMARKS[clef][0] as string
  for (const l of LANDMARKS[clef]) {
    if (Math.abs(diatonic(l) - target) < Math.abs(diatonic(landmark) - target)) landmark = l
  }
  const from = diatonic(landmark)
  const dir = target >= from ? 1 : -1
  const steps: string[] = []
  for (let d = from; d !== target + dir; d += dir) steps.push(letterOctave(d))
  return { landmark, steps }
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

/** Where a staff position sits, as a predicate phrase: 'is the 2nd space', 'sits on the 2nd ledger line below'. */
export function positionPhrase(position: number): string {
  const abs = Math.abs(position)
  const side = position < 0 ? 'below' : 'above'
  if (abs <= 4) {
    return position % 2 === 0
      ? `is the ${ORDINALS[(position + 4) / 2]} line`
      : `is the ${ORDINALS[(position + 3) / 2]} space`
  }
  if (abs === 5) return `sits just ${side} the staff`
  if (abs % 2 === 0) return `sits on the ${ORDINALS[(abs - 6) / 2]} ledger line ${side}`
  return `sits ${position < 0 ? 'under' : 'over'} the ${ORDINALS[(abs - 7) / 2]} ledger line ${side}`
}

/** The route from the nearest landmark to a note, as one plain-text hint. */
export function routeText(note: string, clef: Clef): string {
  const { landmark, steps } = staffRoute(note, clef)
  const name = (LANDMARK_NAMES[clef][landmark] as string) ?? landmark
  const n = Note.get(note)
  const letter = n.letter
  let text: string
  if (steps.length === 1) {
    text = `This is ${name}.`
  } else {
    const down = diatonic(note) < diatonic(landmark) ? ' down' : ''
    const list = steps.map((s) => s[0]).join(', ')
    text = `From ${name}${down}: ${list}. ${letter} ${positionPhrase(staffPosition(note, clef))}.`
  }
  if (n.acc === '#') {
    text += ` ${formatNote(n.pc)} is ${letter} raised a half-step: the black key just right of ${letter}.`
  } else if (n.acc === 'b') {
    text += ` ${formatNote(n.pc)} is ${letter} lowered a half-step: the black key just left of ${letter}.`
  }
  return text
}

/** The pitch class (with the note's accidental) at the same staff position in the other clef. */
export function otherClefReading(note: string, clef: Clef): string {
  const other: Clef = clef === 'treble' ? 'bass' : 'treble'
  const d = staffPosition(note, clef) + MIDDLE_LINE[other]
  return `${LETTERS[((d % 7) + 7) % 7]}${Note.get(note).acc}`
}

/** Four distinct answer names (ASCII, no octave), shuffled: the target plus the usual reading mistakes. */
export function staffChoices(note: string, clef: Clef, rng: () => number): string[] {
  const n = Note.get(note)
  const other = otherClefReading(note, clef)
  let names: string[]
  if (n.acc === '') {
    const i = LETTER_INDEX[n.letter] as number
    names = [n.letter, LETTERS[(i + 1) % 7] as string, LETTERS[(i + 6) % 7] as string, other]
  } else {
    names = [n.pc, enharmonic(n.pc), n.letter, other]
  }
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[names[i], names[j]] = [names[j] as string, names[i] as string]
  }
  return names
}

/** Feedback for the right key in the wrong octave (or the right one, when exact octave is off). */
export function octaveHint(shown: string, playedMidi: number, exactOctave: boolean): string {
  const diff = playedMidi - noteMidi(shown)
  const octaves = Math.max(1, Math.round(Math.abs(diff) / 12))
  const count = octaves === 1 ? 'one octave' : octaves === 2 ? 'two octaves' : `${octaves} octaves`
  const shownName = shown === 'C4' ? 'middle C' : formatNote(shown)
  const L = formatNote(Note.get(midiToName(playedMidi, '#')).pc)
  const lead = exactOctave ? 'Wrong octave.' : 'Right.'
  return `${lead} The staff shows ${shownName}; you played the ${L} ${count} ${diff > 0 ? 'up' : 'down'}.`
}
