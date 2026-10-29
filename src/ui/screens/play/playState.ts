// Play tab selections and toggles. Module-level signals (memory only, no storage): separate from the
// Library's, and remembered for the rest of the visit. They never change Settings.
import { computed, signal } from '@preact/signals'
import type { ChordTypeId } from '../../../theory/chords'
import type { ScaleRef } from '../../../theory/scales'
import { app } from '../../state'
import { DEFAULT_TOGGLES, DEFAULT_WINDOW, type KeyWindow, type PlayHand, type PlayMode, type PlayTarget, type PlayToggles } from './playView'

export type TargetKind = PlayTarget['kind']

export interface PlayChordSel {
  root: string
  type: ChordTypeId
  inversion: number
}

/** ASSUMED: opens on a scale (C major), since scales are most of the daily practice. */
export const targetKind = signal<TargetKind>('scale')
export const scaleSel = signal<ScaleRef>({ root: 'C', form: 'major' })
/** Null: follow settings.octaves. */
export const octavesSel = signal<1 | 2 | null>(null)
export const chordSel = signal<PlayChordSel>({ root: 'C', type: 'M', inversion: 0 })
export const mode = signal<PlayMode>('free')
export const hand = signal<PlayHand>('rh')
export const toggles = signal<PlayToggles>(DEFAULT_TOGGLES)
export const keyWindow = signal<KeyWindow>(DEFAULT_WINDOW)

// A primitive, so an unrelated settings save doesn't hand out a new target (and restart the run).
const settingsOctaves = computed(() => app.value.settings.octaves)
export const octaves = computed<1 | 2>(() => octavesSel.value ?? settingsOctaves.value)

/** A new object only when the selection changes (guide.ts caches per target object). */
export const playTarget = computed<PlayTarget>(() => {
  const kind = targetKind.value
  if (kind === 'none') return { kind: 'none' }
  if (kind === 'chord') return { kind: 'chord', ...chordSel.value }
  return { kind: 'scale', ref: scaleSel.value, octaves: octaves.value }
})
