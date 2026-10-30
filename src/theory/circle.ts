import { MAJOR_ROOTS, MINOR_ROOTS, chroma, keySignature } from './scales'
import type { ScaleRef } from './scales'

export interface CircleEntry {
  major: string
  minor: string
  count: number
  accidental: '#' | 'b' | ''
}

/**
 * The circle of fifths, clockwise from C / A minor, in the app's key spelling.
 * count and accidental are the major's signature. At index 6 the app pairs F# major (6 sharps)
 * with Eb minor (6 flats): same count, other accidental.
 */
export const CIRCLE: CircleEntry[] = MAJOR_ROOTS.map((major, i) => {
  const { count, accidental } = keySignature({ root: major, form: 'major' })
  return { major, minor: MINOR_ROOTS[i] as string, count, accidental }
})

/** Circle position of a key; matches by pitch class, so Gb major and D# minor land on index 6. */
export function circleIndex(ref: ScaleRef): number {
  const roots = ref.form === 'major' ? MAJOR_ROOTS : MINOR_ROOTS
  const target = chroma(ref.root)
  return roots.findIndex((root) => chroma(root) === target)
}
