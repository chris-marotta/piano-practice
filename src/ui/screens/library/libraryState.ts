// Library selections. Module-level signals (memory only, no storage): leaving the tab and coming
// back keeps the last segment and selections for the rest of the visit.
import { signal } from '@preact/signals'
import type { ChordTypeId } from '../../../theory/chords'
import type { ScaleRef } from '../../../theory/scales'
import type { Direction } from '../steps/scaleView'

export type Segment = 'scales' | 'chords' | 'key' | 'what'

export interface ChordSel {
  root: string
  type: ChordTypeId
  inversion: number
}

export const segment = signal<Segment>('scales')
export const scaleSel = signal<ScaleRef>({ root: 'C', form: 'major' })
export const scaleDir = signal<Direction>('up')
export const chordSel = signal<ChordSel>({ root: 'C', type: 'M', inversion: 0 })
export const keySel = signal<ScaleRef>({ root: 'C', form: 'major' })
export const whatSel = signal<number[]>([])

/** Open a chord in the Chords segment (from Chords in a key). */
export function openChord(root: string, type: ChordTypeId): void {
  chordSel.value = { root, type, inversion: 0 }
  segment.value = 'chords'
}
