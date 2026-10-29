import { fingeringSequence } from '../data/fingerings'
import type { MidiEvent } from '../midi/parse'
import type { HeldState } from '../midi/held'
import { chordNotes, maxInversion } from '../theory/chords'
import type { ChordTypeId } from '../theory/chords'
import { chroma } from '../theory/scales'
import type { ScaleRef } from '../theory/scales'
import { evenness, tempoFromOnsets } from './analyse'
import { expectedRun } from './sequence'
import type { Expected } from './sequence'
import { PAIR_WINDOW_MS } from './thresholds'

export type GuideTarget =
  | { kind: 'scale'; ref: ScaleRef; octaves: 1 | 2; hand: 'rh' | 'lh' | 'together' }
  | { kind: 'chord'; root: string; type: ChordTypeId }

export interface GuideState {
  target: GuideTarget
  /** Scale: index into the expected run. Chord: inversion being asked for. */
  index: number
  /** Scale only: played MIDI minus expected MIDI once the tonic has locked the octave. */
  offset: number | null
  slips: number
  /** Times of the correct notes (Together: the earlier note of each pair; chord: the success times). */
  onsets: number[]
  /** Together only: a first note waiting for its octave partner. */
  pending: { midi: number; t: number } | null
  done: boolean
}

type Fingered = { midi: number; finger: number }
export type GuideNext =
  | { rh?: Fingered; lh?: Fingered }
  | { chord: { pcs: number[]; bassPc: number; inversion: number } }
  | null

export function createGuide(target: GuideTarget): GuideState {
  return { target, index: 0, offset: null, slips: 0, onsets: [], pending: null, done: false }
}

type ScaleTarget = Extract<GuideTarget, { kind: 'scale' }>

/** One-hand and Together both use the RH run from octave 4 (LH-only from octave 3). Together's LH is that run minus 12. */
function runFor(t: ScaleTarget): Expected[] {
  return expectedRun(t.ref, t.octaves, t.hand === 'lh' ? 3 : 4)
}

/** Index of the top note: the run is up (0..top) then down (top+1..). */
function topIndex(t: ScaleTarget): number {
  return t.octaves * 7
}

function fingerAt(t: ScaleTarget, hand: 'rh' | 'lh', i: number): number {
  const top = topIndex(t)
  if (i <= top) return fingeringSequence(t.ref, t.octaves, hand, 'up')[i] as number
  return fingeringSequence(t.ref, t.octaves, hand, 'down')[i - top] as number
}

function chordPcs(t: Extract<GuideTarget, { kind: 'chord' }>, inversion: number): number[] {
  return chordNotes(t.root, t.type, inversion).map(chroma)
}

export function guideNext(s: GuideState): GuideNext {
  if (s.done) return null
  const t = s.target
  if (t.kind === 'chord') {
    const pcs = chordPcs(t, s.index)
    return { chord: { pcs, bassPc: pcs[0] as number, inversion: s.index } }
  }
  const midi = (runFor(t)[s.index] as Expected).midi + (s.offset ?? 0)
  if (t.hand === 'together') {
    return {
      rh: { midi, finger: fingerAt(t, 'rh', s.index) },
      lh: { midi: midi - 12, finger: fingerAt(t, 'lh', s.index) },
    }
  }
  return { [t.hand]: { midi, finger: fingerAt(t, t.hand, s.index) } }
}

export function guideResult(s: GuideState): { slips: number; evenness: number | null; tempo: number | null } {
  return { slips: s.slips, evenness: evenness(s.onsets), tempo: tempoFromOnsets(s.onsets) }
}

type Step = { state: GuideState; flash: number | null }

/**
 * Advances the guide by one event. Pure: timestamps come from the events. `held` is the held-key state after the event
 * (used by chord steps only). Finished guides ignore everything.
 */
export function guideStep(s: GuideState, e: MidiEvent, held: HeldState): Step {
  if (s.done || e.type === 'pedal') return { state: s, flash: null }
  const t = s.target
  if (t.kind === 'chord') return chordStep(s, t, e, held)
  if (e.type !== 'on') return { state: s, flash: null }
  return t.hand === 'together' ? togetherStep(s, t, e) : scaleStep(s, t, e)
}

function advance(s: GuideState, t: ScaleTarget, patch: Partial<GuideState>, onset: number): GuideState {
  const index = s.index + 1
  return {
    ...s,
    ...patch,
    index,
    onsets: [...s.onsets, onset],
    done: index >= runFor(t).length,
  }
}

function scaleStep(s: GuideState, t: ScaleTarget, e: Extract<MidiEvent, { type: 'on' }>): Step {
  const run = runFor(t)
  const first = run[0] as Expected
  if (s.offset === null) {
    if (chroma(first.name) !== e.midi % 12) return { state: s, flash: null }
    return { state: advance(s, t, { offset: e.midi - first.midi }, e.t), flash: null }
  }
  if (e.midi - s.offset === (run[s.index] as Expected).midi) return { state: advance(s, t, {}, e.t), flash: null }
  return { state: { ...s, slips: s.slips + 1 }, flash: e.midi }
}

function togetherStep(s: GuideState, t: ScaleTarget, e: Extract<MidiEvent, { type: 'on' }>): Step {
  const run = runFor(t)
  const first = run[0] as Expected
  const locked = s.offset !== null
  const slip = (flash: number, pending: GuideState['pending']): Step =>
    locked ? { state: { ...s, slips: s.slips + 1, pending }, flash } : { state: { ...s, pending }, flash: null }

  const p = s.pending
  if (p === null) return { state: { ...s, pending: { midi: e.midi, t: e.t } }, flash: null }

  // The pending note timed out: it was a lone note. Count it now and let this event start a new pair.
  if (e.t - p.t > PAIR_WINDOW_MS) return slip(p.midi, { midi: e.midi, t: e.t })

  // Anything but an exact octave: a wrong pair.
  if (Math.abs(e.midi - p.midi) !== 12) return slip(e.midi, null)

  const upper = Math.max(e.midi, p.midi)
  const onset = Math.min(e.t, p.t)
  if (!locked) {
    if (chroma(first.name) !== upper % 12) return { state: { ...s, pending: null }, flash: null }
    return { state: advance(s, t, { offset: upper - first.midi, pending: null }, onset), flash: null }
  }
  if (upper - (s.offset as number) === (run[s.index] as Expected).midi) {
    return { state: advance(s, t, { pending: null }, onset), flash: null }
  }
  return slip(upper, null)
}

function chordStep(
  s: GuideState,
  t: Extract<GuideTarget, { kind: 'chord' }>,
  e: Extract<MidiEvent, { type: 'on' | 'off' }>,
  held: HeldState,
): Step {
  const pcs = chordPcs(t, s.index)
  if (e.type === 'on' && !pcs.includes(e.midi % 12)) {
    return { state: { ...s, slips: s.slips + 1 }, flash: e.midi }
  }
  const heldPcs = new Set([...held.held].map((m) => m % 12))
  const chordSet = new Set(pcs)
  const lowest = Math.min(...held.held)
  const match =
    held.held.size > 0 &&
    heldPcs.size === chordSet.size &&
    [...heldPcs].every((pc) => chordSet.has(pc)) &&
    lowest % 12 === pcs[0]
  if (!match) return { state: s, flash: null }
  const index = s.index + 1
  return {
    state: { ...s, index, onsets: [...s.onsets, e.t], done: index > maxInversion(t.type) },
    flash: null,
  }
}
