// Pure view model for the Play tab (no Preact, no window): unit tested in node.
import type { GuideNext, GuideState } from '../../../play/guide'
import { expectedRun } from '../../../play/sequence'
import { chordFingering, chordNotes, maxInversion, type ChordTypeId } from '../../../theory/chords'
import { formatNote, formatScale } from '../../../theory/format'
import { chroma, keySignature, noteMidi, scaleNotes, type ScaleRef } from '../../../theory/scales'
import type { KeyMark, ReserveRows } from '../../components/keyboardLayout'
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

/** Guided chord step: the voicing at octave 4 with its RH fingering (chords are RH only). */
function chordStepMarks(target: Extract<PlayTarget, { kind: 'chord' }>, inversion: number, fingers: boolean): KeyMark[] {
  const notes = chordNotes(target.root, target.type, inversion)
  const f = chordFingering(target.type, inversion, 'rh')
  return notes.map((n, i) => ({ midi: noteMidi(n), hand: 'rh', finger: fingers ? f?.[i] : undefined }))
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
      if (a.target.kind === 'chord') marks.push(...chordStepMarks(a.target, a.next.chord.inversion, t.fingers))
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
