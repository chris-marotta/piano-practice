import { noteMidi, scaleSequence } from '../theory/scales'
import type { ScaleRef } from '../theory/scales'

export interface Expected {
  midi: number
  /** Tonal ASCII spelling with octave, e.g. 'F#5'. */
  name: string
}

/** Up then back down, tonic to tonic, with the top note played once. Melodic minor descends as natural minor. */
export function expectedRun(ref: ScaleRef, octaves: 1 | 2, startOctave: number): Expected[] {
  const { ascending, descending } = scaleSequence(ref, octaves, startOctave)
  return [...ascending, ...descending.slice(1)].map((name) => ({ midi: noteMidi(name), name }))
}
