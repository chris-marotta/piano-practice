// Pure view model for the scale step (no Preact, no window): unit tested in node.
import { familyOf, fingeringSequence } from '../../../data/fingerings'
import { formatNote, formatScale } from '../../../theory/format'
import { recallCard } from '../../../theory/recall'
import { noteMidi, scaleSequence, type ScaleRef } from '../../../theory/scales'
import { keyboardRange, type KeyMark } from '../../components/keyboardLayout'

/** RH starts at octave 4, LH an octave lower. */
const RH_OCTAVE = 4
const LH_OCTAVE = 3

/** A session scale is one octave per hand (the Library and Play keep their own octave choices). */
export const SESSION_OCTAVES = 1 as const

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

export type Direction = 'up' | 'down'

/** Melodic minor descends as natural minor (spec §3.1), so only it needs a separate "coming down" display (R16). */
export function hasDistinctDescent(ref: ScaleRef): boolean {
  return ref.form === 'melodic'
}

/**
 * L1: each hand's notes (with octave) and fingers, ascending ('up') or descending ('down', top tonic first).
 * `fingeringRef` is the session scale whose fingering to use; the Library passes the enharmonic
 * session scale for spellings with no fingering entry of their own (G♭ major -> F♯ major).
 */
export function fingerRows(
  ref: ScaleRef,
  octaves: 1 | 2,
  direction: Direction = 'up',
  fingeringRef: ScaleRef = ref,
): { rh: HandRow; lh: HandRow } {
  const row = (hand: 'rh' | 'lh', octave: number): HandRow => {
    const seq = scaleSequence(ref, octaves, octave)
    return {
      notes: direction === 'up' ? seq.ascending : seq.descending,
      fingers: fingeringSequence(fingeringRef, octaves, hand, direction),
    }
  }
  return { rh: row('rh', RH_OCTAVE), lh: row('lh', LH_OCTAVE) }
}

/** L0: hands together on one keyboard, fingering for the direction, note names on the keys. */
export function scaleKeyboard(
  ref: ScaleRef,
  octaves: 1 | 2,
  direction: Direction = 'up',
  fingeringRef: ScaleRef = ref,
): { low: number; high: number; marks: KeyMark[]; firstMidi: number } {
  const rows = fingerRows(ref, octaves, direction, fingeringRef)
  const marksFor = (hand: 'rh' | 'lh', row: HandRow): KeyMark[] =>
    row.notes.map((n, i) => ({ midi: noteMidi(n), hand, finger: row.fingers[i], label: formatNote(pitchClass(n)) }))
  const marks = [...marksFor('rh', rows.rh), ...marksFor('lh', rows.lh)]
  const midis = marks.map((m) => m.midi)
  return { ...keyboardRange(midis), marks, firstMidi: Math.min(...midis) }
}

export interface Panel {
  low: number
  high: number
  marks: KeyMark[]
}

/**
 * L0 for a session: one keyboard per hand, each ranged (whole white keys) around its own octave. LH runs
 * from octave 3, RH from octave 4, so the LH top tonic and the RH tonic are the same key (e.g. G major: 67).
 */
export function handPanels(
  ref: ScaleRef,
  direction: Direction = 'up',
  fingeringRef: ScaleRef = ref,
): { lh: Panel; rh: Panel } {
  const rows = fingerRows(ref, SESSION_OCTAVES, direction, fingeringRef)
  const panel = (hand: 'rh' | 'lh', row: HandRow): Panel => {
    const marks: KeyMark[] = row.notes.map((n, i) => ({
      midi: noteMidi(n),
      hand,
      finger: row.fingers[i],
      label: formatNote(pitchClass(n)),
    }))
    return { ...keyboardRange(marks.map((m) => m.midi)), marks }
  }
  return { lh: panel('lh', rows.lh), rh: panel('rh', rows.rh) }
}
