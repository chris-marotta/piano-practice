// Pure view model for the Play tab (no Preact, no window): unit tested in node.
import type { MidiStatus } from '../../../midi/access'
import type { GuideNext, GuideState } from '../../../play/guide'
import { expectedRun } from '../../../play/sequence'
import { chordFingering, chordNotes, maxInversion, type ChordTypeId } from '../../../theory/chords'
import { formatNote, formatScale } from '../../../theory/format'
import { chroma, keySignature, noteMidi, scaleNotes, type ScaleRef } from '../../../theory/scales'
import { isBlack, whiteKeys, type KeyMark, type ReserveRows } from '../../components/keyboardLayout'
import { chordPanel, detection } from '../library/libraryView'

export type PlayMode = 'free' | 'guided' | 'check'
export type PlayHand = 'rh' | 'lh' | 'together'

export type PlayTarget =
  | { kind: 'none' }
  | { kind: 'scale'; ref: ScaleRef; octaves: 1 | 2 }
  | { kind: 'chord'; root: string; type: ChordTypeId; inversion: number }

export interface PlayToggles {
  highlight: boolean
  colours: boolean
  fingers: boolean
  drone: boolean
}

/**
 * The "Connect a keyboard for the full experience." line: not once connected, and not where Web MIDI is unsupported
 * (iPad), since the chip already says keyboard input needs Chrome on a computer.
 */
export function showConnectHint(status: MidiStatus): boolean {
  return status.kind !== 'connected' && status.kind !== 'unsupported'
}

export const DEFAULT_TOGGLES: PlayToggles = { highlight: true, colours: true, fingers: true, drone: false }

/** The Roli's 49 keys, C2..C6. */
export const DEFAULT_WINDOW = { low: 36, high: 84 } as const

export type KeyWindow = { low: number; high: number }

/** Check gives nothing away: no target outline, no finger numbers, no right/wrong colours. */
export function effectiveToggles(mode: PlayMode, t: PlayToggles): PlayToggles {
  return mode === 'check' ? { ...t, highlight: false, colours: false, fingers: false } : t
}

export function checkAvailable(target: PlayTarget): boolean {
  return target.kind === 'scale'
}

export function guideAvailable(target: PlayTarget): boolean {
  return target.kind !== 'none'
}

/** The mode actually in force: a mode the target can't use falls back to Free (the chosen one is kept for later). */
export function effectiveMode(mode: PlayMode, target: PlayTarget): PlayMode {
  if (mode === 'check' && !checkAvailable(target)) return 'free'
  if (mode === 'guided' && !guideAvailable(target)) return 'free'
  return mode
}

/** In target is by pitch class. Melodic minor counts its ascending and descending (natural) forms together. */
export function targetPitchClasses(target: PlayTarget): Set<number> {
  if (target.kind === 'none') return new Set()
  if (target.kind === 'chord') return new Set(chordNotes(target.root, target.type, target.inversion).map(chroma))
  const notes = scaleNotes(target.ref)
  if (target.ref.form === 'melodic') notes.push(...scaleNotes({ root: target.ref.root, form: 'natural' }))
  return new Set(notes.map(chroma))
}

/** Move by whole octaves until `midi` is on screen (the Roli's octave buttons). */
export function shiftWindow(w: KeyWindow, midi: number): KeyWindow {
  let { low, high } = w
  while (midi > high) {
    low += 12
    high += 12
  }
  while (midi < low) {
    low -= 12
    high -= 12
  }
  return low === w.low ? w : { low, high }
}

/** White keys of margin each side of the run, and the narrowest window drawn (about two octaves). */
const FIT_MARGIN = 2
const FIT_MIN_WHITES = 15

/** The `n`th white key strictly below (dir -1) or above (dir 1) `midi`. */
function whiteStep(midi: number, n: number, dir: -1 | 1): number {
  let m = midi
  for (let left = n; left > 0; ) {
    m += dir
    if (!isBlack(m)) left--
  }
  return m
}

/** Every note the run / guide can ask for, at its home octave. */
function fitNotes(target: Exclude<PlayTarget, { kind: 'none' }>, hand: PlayHand): number[] {
  if (target.kind === 'chord') {
    const out: number[] = []
    for (let inv = 0; inv <= maxInversion(target.type); inv++) out.push(...chordNotes(target.root, target.type, inv).map(noteMidi))
    return out
  }
  // As the guide and check use them: RH from octave 4, LH-only from octave 3, Together's LH is the RH run minus 12.
  const run = expectedRun(target.ref, target.octaves, hand === 'lh' ? 3 : 4).map((e) => e.midi)
  return hand === 'together' ? [...run, ...run.map((m) => m - 12)] : run
}

/**
 * The window drawn for a target, zoomed to what it asks for: the run (scale) or every inversion's voicing at octave 4
 * (chord), plus 2 white keys each side, widened evenly to at least 15 white keys (an odd one goes on top). Edges are
 * white keys. Nothing picked: the Roli's 49 keys. `hand`: the hand in force (RH outside a guided scale).
 */
export function fittedWindow(target: PlayTarget, hand: PlayHand): KeyWindow {
  if (target.kind === 'none') return DEFAULT_WINDOW
  const notes = fitNotes(target, hand)
  let low = whiteStep(Math.min(...notes), FIT_MARGIN, -1)
  let high = whiteStep(Math.max(...notes), FIT_MARGIN, 1)
  const short = FIT_MIN_WHITES - whiteKeys(low, high).length
  if (short > 0) {
    low = whiteStep(low, Math.floor(short / 2), -1)
    high = whiteStep(high, Math.ceil(short / 2), 1)
  }
  return { low, high }
}

interface ShownArgs {
  mode: PlayMode
  target: PlayTarget
  fitted: KeyWindow
  /** The fitted window moved by whole octaves on notes played off screen (shiftWindow). */
  follow: KeyWindow
  guide: GuideState | null
}

/**
 * The window the keyboard draws. Guided scale: the fitted window, moved by the octave the tonic locked (whole octaves;
 * the offset is one in practice, else the nearest). Everywhere else (Free, Check, a guided chord, which has no lock):
 * the followed window.
 */
export function shownWindow(a: ShownArgs): KeyWindow {
  if (a.mode !== 'guided' || a.target.kind !== 'scale') return a.follow
  const offset = a.guide?.offset ?? null
  if (offset === null) return a.fitted
  const shift = Math.round(offset / 12) * 12
  return shift === 0 ? a.fitted : { low: a.fitted.low + shift, high: a.fitted.high + shift }
}

/** Spelling for played notes: the key signature's accidental (P4). */
export function preferFor(ref: ScaleRef): '#' | 'b' {
  return keySignature(ref).accidental === 'b' ? 'b' : '#'
}

/** Free mode: name whatever is held (R17 detection), '—' under two notes or with no match. */
export function chordReadout(held: ReadonlySet<number>): string {
  const d = detection([...held])
  return d.status === 'match' ? (d.names[0] as string) : '—'
}

interface MarksArgs {
  mode: PlayMode
  target: PlayTarget
  toggles: PlayToggles
  held: ReadonlySet<number>
  next: GuideNext
  window: KeyWindow
  /** Guided: the key the guide just called wrong (shown bad for 400 ms). */
  flash?: number | null
}

/**
 * Guided chord step: the voicing with its RH fingering (chords are RH only). P14: voiced at octave 4, then moved by
 * whole octaves onto the keyboard: up while its bottom is below window.low, down while its top is above window.high
 * as long as the bottom stays >= window.low. (The step itself succeeds in any octave.)
 */
function chordStepMarks(
  target: Extract<PlayTarget, { kind: 'chord' }>,
  inversion: number,
  fingers: boolean,
  w: KeyWindow,
): KeyMark[] {
  const midis = chordNotes(target.root, target.type, inversion).map(noteMidi)
  const bottom = midis[0] as number
  const top = midis[midis.length - 1] as number
  let shift = 0
  while (bottom + shift < w.low) shift += 12
  while (top + shift > w.high && bottom + shift - 12 >= w.low) shift -= 12
  const f = chordFingering(target.type, inversion, 'rh')
  return midis.map((m, i) => ({ midi: m + shift, hand: 'rh', finger: fingers ? f?.[i] : undefined }))
}

/**
 * Key marks, spec §4.3 priority: pressed + in target (good ✓) > pressed + not in target (bad ×) > pressed with no
 * target > guided next note (hand colour + finger) > target outline. keyLooks resolves overlaps in that order; this
 * gives each pressed key exactly one state. In Guided the wrong-note flash is the guide's verdict, so it shows bad
 * even on a key that is in the scale (a right note in the wrong place).
 */
export function playMarks(a: MarksArgs): KeyMark[] {
  const t = effectiveToggles(a.mode, a.toggles)
  const pcs = targetPitchClasses(a.target)
  const inWindow = (m: number) => m >= a.window.low && m <= a.window.high
  const flash = a.mode === 'guided' && t.colours ? (a.flash ?? null) : null
  const marks: KeyMark[] = []

  for (const midi of a.held) {
    if (!inWindow(midi)) continue
    const state =
      a.target.kind === 'none' || !t.colours ? 'pressed' : midi === flash ? 'bad' : pcs.has(midi % 12) ? 'good' : 'bad'
    marks.push({ midi, hand: 'none', state })
  }
  if (flash !== null && !a.held.has(flash) && inWindow(flash)) marks.push({ midi: flash, hand: 'none', state: 'bad' })

  if (a.mode === 'guided' && a.next) {
    if ('chord' in a.next) {
      if (a.target.kind === 'chord') marks.push(...chordStepMarks(a.target, a.next.chord.inversion, t.fingers, a.window))
    } else {
      for (const hand of ['rh', 'lh'] as const) {
        const n = a.next[hand]
        if (n) marks.push({ midi: n.midi, hand, finger: t.fingers ? n.finger : undefined })
      }
    }
  }

  if (t.highlight && a.target.kind !== 'none') {
    for (let m = a.window.low; m <= a.window.high; m++) if (pcs.has(m % 12)) marks.push({ midi: m, hand: 'none', state: 'target' })
  }
  return marks
}

/** Badge rows to keep free so the keys don't jump while a run goes on (none where no finger can show). */
export function reserveRowsFor(mode: PlayMode, target: PlayTarget, hand: PlayHand): ReserveRows {
  if (mode !== 'guided') return false
  if (target.kind === 'scale' && hand !== 'rh') return true
  return 'rh'
}

// ---- words ----

export function targetTitle(target: PlayTarget): string {
  if (target.kind === 'none') return 'Free play'
  if (target.kind === 'chord') return chordPanel(target.root, target.type, target.inversion).symbol
  return `${formatScale(target.ref)} · ${target.octaves} octave${target.octaves === 2 ? 's' : ''}`
}

const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion']
const HAND_WORD = { rh: 'Right hand', lh: 'Left hand', together: 'Hands together' } as const
const plain = (name: string): string => formatNote(name.replace(/-?\d+$/, ''))
const slipWord = (n: number): string => `${n} slip${n === 1 ? '' : 's'}`

export interface GuidedStatus {
  headline: string
  detail: string
}

/** The line above the keyboard while a guided run is going. */
export function guidedStatus(target: PlayTarget, hand: PlayHand, g: GuideState): GuidedStatus {
  if (target.kind === 'chord') {
    const total = maxInversion(target.type) + 1
    const notes = chordNotes(target.root, target.type, g.index).map(plain).join(' ')
    return {
      headline: INVERSION_NAMES[g.index] as string,
      detail: `${notes} · step ${g.index + 1} of ${total} · ${slipWord(g.slips)}`,
    }
  }
  if (target.kind !== 'scale') return { headline: '', detail: '' }
  const run = expectedRun(target.ref, target.octaves, 4)
  if (g.offset === null) {
    return { headline: `Start on ${formatNote(target.ref.root)}`, detail: `${HAND_WORD[hand]} · any octave` }
  }
  const next = run[g.index]
  return {
    headline: next ? `Next: ${plain(next.name)}` : '',
    detail: `${HAND_WORD[hand]} · note ${g.index + 1} of ${run.length} · ${slipWord(g.slips)}`,
  }
}
