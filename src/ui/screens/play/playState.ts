// Play tab selections and toggles. Module-level signals (memory only, no storage): separate from the
// Library's, and remembered for the rest of the visit. They never change Settings.
import { computed, effect, signal } from '@preact/signals'
import type { ChordTypeId } from '../../../theory/chords'
import type { ScaleRef } from '../../../theory/scales'
import {
  DEFAULT_TOGGLES,
  effectiveMode,
  fitHand,
  fittedWindow,
  type KeyWindow,
  type PlayHand,
  type PlayMode,
  type PlayTarget,
  type PlayToggles,
} from './playView'

export type TargetKind = PlayTarget['kind']

export interface PlayChordSel {
  root: string
  type: ChordTypeId
  inversion: number
}

/** ASSUMED: opens on a scale (C major), since scales are most of the daily practice. */
export const targetKind = signal<TargetKind>('scale')
export const scaleSel = signal<ScaleRef>({ root: 'C', form: 'major' })
/** One octave unless picked here: Play doesn't follow settings.octaves (a one-octave run fits a zoomed keyboard). */
export const octavesSel = signal<1 | 2>(1)
export const chordSel = signal<PlayChordSel>({ root: 'C', type: 'M', inversion: 0 })
export const mode = signal<PlayMode>('free')
export const hand = signal<PlayHand>('rh')
export const toggles = signal<PlayToggles>(DEFAULT_TOGGLES)
/**
 * Spec 4.3: the first note played (any mode) folds the picker to one summary line; tapping the line opens it again and
 * the next note folds it again. Play resets it to open on the way in and out, so leaving the tab never leaves it folded.
 */
export const pickerCollapsed = signal(false)

/** Play's drill level picker: the level picked in each drill, or null for the unlocked level (the schedule's). */
export const drillPick = signal<{ keys: number | null; staff: number | null }>({ keys: null, staff: null })

/** A new object only when the selection changes (guide.ts caches per target object). */
export const playTarget = computed<PlayTarget>(() => {
  const kind = targetKind.value
  if (kind === 'none') return { kind: 'none' }
  if (kind === 'chord') return { kind: 'chord', ...chordSel.value }
  return { kind: 'scale', ref: scaleSel.value, octaves: octavesSel.value }
})

/** The mode in force (one the target can't use falls back to Free). */
export const playMode = computed<PlayMode>(() => effectiveMode(mode.value, playTarget.value))
/** Hand only shapes a guided scale; elsewhere a hand change must not restart the run (or move the keyboard). */
export const playHand = computed<PlayHand>(() =>
  playMode.value === 'guided' && playTarget.value.kind === 'scale' ? hand.value : 'rh',
)
/** The keyboard zoomed to the target's run or voicings: guided scale per hand, Check / Free both hands (fitHand). */
export const fitted = computed<KeyWindow>(() =>
  fittedWindow(playTarget.value, fitHand(playMode.value, playTarget.value, hand.value)),
)

/** Free / Check (and a guided chord): the fitted window, moved by whole octaves on notes played off screen. */
export const keyWindow = signal<KeyWindow>(fitted.peek())

// A new target, mode or hand starts from the fitted window. Synchronous, so no frame draws the old one.
effect(() => {
  void playMode.value
  keyWindow.value = fitted.value
})

/** Restart: back to the fitted window (a guided scale's lock is cleared with the run). */
export function resetWindow(): void {
  keyWindow.value = fitted.peek()
}
