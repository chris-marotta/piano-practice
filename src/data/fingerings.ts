import { MAJOR_ROOTS, MINOR_ROOTS, scaleNotes } from '../theory/scales'
import type { ScaleRef } from '../theory/scales'
import { formatScale } from '../theory/format'

export interface ScaleFingering {
  /** 15 fingers, two octaves ascending, tonic to tonic. */
  rh: number[]
  lh: number[]
}

export type Hand = 'rh' | 'lh'

/**
 * ASSUMED standard method-book fingerings, all to be verified by the piano teacher
 * (see fingering-checklist-for-teacher in the vault). Each row reads as 15 digits:
 * degrees 1-7 of octave one, degrees 1-7 of octave two, final tonic.
 * Keyed `${root}:major|minor`. Harmonic and melodic minor reuse the natural entry (ASSUMED in v1).
 */
const ROWS: Record<string, { rh: string; lh: string }> = {}

function addRow(keys: string[], rh: string, lh: string): void {
  for (const k of keys) ROWS[k] = { rh: rh.replace(/ /g, ''), lh: lh.replace(/ /g, '') }
}

addRow(
  ['C:major', 'G:major', 'D:major', 'A:major', 'E:major', 'A:minor', 'E:minor', 'D:minor', 'G:minor', 'C:minor'],
  '1231234 1231234 5',
  '5432132 1432132 1',
)
addRow(['B:major', 'B:minor'], '1231234 1231234 5', '4321432 1321432 1')
addRow(['F:major', 'F:minor'], '1234123 1234123 4', '5432132 1432132 1')
addRow(['Bb:major'], '4123123 4123123 4', '3214321 3214321 3')
addRow(['Eb:major'], '3123412 3123412 3', '3214321 3214321 3')
addRow(['Ab:major'], '3412312 3412312 3', '3214321 3214321 3')
addRow(['Db:major'], '2312341 2312341 2', '3214321 3214321 3')
addRow(['F#:major'], '2341231 2341231 2', '4321321 4321321 4')
addRow(['F#:minor'], '3412312 3412312 3', '4321321 4321321 4')
addRow(['C#:minor'], '3412312 3412312 3', '3214321 3214321 3')
// G# minor LH corrected during build (plan had 3214321, which put the thumb on F#): ruling R9.
addRow(['G#:minor'], '3412312 3412312 3', '3213214 3213214 3')
addRow(['Eb:minor'], '3123412 3123412 3', '2143213 2143213 2')
addRow(['Bb:minor'], '2123123 4123123 4', '2132143 2132143 2')

const digits = (s: string): number[] => [...s].map(Number)

export const FINGERINGS: Record<string, ScaleFingering> = Object.fromEntries(
  Object.entries(ROWS).map(([k, v]) => [k, { rh: digits(v.rh), lh: digits(v.lh) }]),
)

function keyOf(ref: ScaleRef): string {
  return `${ref.root}:${ref.form === 'major' ? 'major' : 'minor'}`
}

/** Harmonic and melodic minor return the natural-minor entry for the root. */
export function fingeringFor(ref: ScaleRef): ScaleFingering {
  const entry = FINGERINGS[keyOf(ref)]
  if (!entry) throw new Error(`No fingering for ${keyOf(ref)}`)
  return entry
}

/** First octave only: degrees 1-7 plus the final tonic. */
export function oneOctave(seq: number[]): number[] {
  return [...seq.slice(0, 7), seq[14] as number]
}

export function fingeringSequence(
  ref: ScaleRef,
  octaves: 1 | 2,
  hand: Hand,
  direction: 'up' | 'down',
): number[] {
  const full = fingeringFor(ref)[hand]
  const up = octaves === 1 ? oneOctave(full) : [...full]
  return direction === 'up' ? up : up.reverse()
}

/** Pitch classes in the first octave (degrees 1-7) played with finger 1, in scale order. */
export function thumbNotes(ref: ScaleRef, hand: Hand = 'rh'): string[] {
  const notes = scaleNotes(ref)
  return fingeringFor(ref)[hand].slice(0, 7).flatMap((f, i) => (f === 1 ? [notes[i] as string] : []))
}

const SESSION_SCALES: ScaleRef[] = [
  ...MAJOR_ROOTS.map((root) => ({ root, form: 'major' as const })),
  ...MINOR_ROOTS.map((root) => ({ root, form: 'natural' as const })),
]

/** Label for the first other session scale with identical RH and LH fingering, or null if unique. */
export function familyOf(ref: ScaleRef): string | null {
  const mine = fingeringFor(ref)
  const twin = SESSION_SCALES.find((other) => {
    if (keyOf(other) === keyOf(ref)) return false
    const f = fingeringFor(other)
    return f.rh.join() === mine.rh.join() && f.lh.join() === mine.lh.join()
  })
  return twin ? `Same fingering as ${formatScale(twin)}` : null
}
