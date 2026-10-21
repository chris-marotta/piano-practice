// Pure view models for the Library (no Preact, no window): unit tested in node.
import { familyOf } from '../../../data/fingerings'
import { scaleId } from '../../../srs/items'
import type { ItemState } from '../../../srs/scheduler'
import {
  CHORD_TYPES,
  chordFingering,
  chordNotes,
  detectChord,
  diatonicChords,
  maxInversion,
  type ChordTypeId,
  type DiatonicChord,
} from '../../../theory/chords'
import { formatChordName, formatNote, formatScale } from '../../../theory/format'
import {
  MAJOR_ROOTS,
  MINOR_ROOTS,
  chroma,
  enharmonic,
  keySignature,
  noteMidi,
  relativeKey,
  scaleNotes,
  scaleSequence,
  type ScaleForm,
  type ScaleRef,
} from '../../../theory/scales'
import { keyboardRange, type KeyMark } from '../../components/keyboardLayout'
import { hasDistinctDescent, keySignatureText, scaleKeyboard, type Direction } from '../steps/scaleView'

export interface KeyboardView {
  low: number
  high: number
  marks: KeyMark[]
  firstMidi: number
}

const pitchClass = (n: string): string => n.replace(/-?\d+$/, '')
const isMinor = (form: ScaleForm): boolean => form !== 'major'

// ---- root picker ----

/** 'chord' spells black keys the major-session way (D♭ E♭ F♯ A♭ B♭). */
export type PickerContext = ScaleForm | 'chord'

const sessionRoots = (ctx: PickerContext): string[] => (ctx === 'chord' || ctx === 'major' ? MAJOR_ROOTS : MINOR_ROOTS)

/** The session spelling of a pitch class: every pitch class appears once in each root list. */
function defaultSpelling(pc: number, ctx: PickerContext): string {
  return sessionRoots(ctx).find((r) => chroma(r) === pc) as string
}

export interface PickerKey {
  root: string
  label: string
  selected: boolean
}

/** The 12 root buttons, C..B. The selected one shows the current spelling (D♭, or an unusual C♭). */
export function pickerKeys(current: string, ctx: PickerContext): PickerKey[] {
  const currentPc = chroma(current)
  return Array.from({ length: 12 }, (_, pc) => {
    const root = pc === currentPc ? current : defaultSpelling(pc, ctx)
    return { root, label: formatNote(root), selected: pc === currentPc }
  })
}

const ACCIDENTAL_RANK = (n: string): number => ({ '': 0, '#': 1, b: 2 })[n.slice(1)] ?? 3

/**
 * The enharmonic toggle: [sharp, flat] for black keys, nothing for white keys (no B/C♭).
 * A theoretical spelling reached by navigation (C♭ major via A♭ minor) offers its plain spelling back.
 */
export function spellingOptions(root: string): { value: string; label: string }[] {
  const other = enharmonic(root)
  if (other === root) return []
  return [root, other]
    .sort((a, b) => ACCIDENTAL_RANK(a) - ACCIDENTAL_RANK(b))
    .map((value) => ({ value, label: formatNote(value) }))
}

/**
 * Root after a form change. Crossing major <-> minor moves to that form's session spelling unless the
 * current one already is one (D♭ major -> C♯ minor, F♯ minor -> F♯ major); between minor forms the
 * chosen spelling stays.
 */
export function respellForForm(root: string, from: ScaleForm, to: ScaleForm): string {
  if (isMinor(from) === isMinor(to)) return root
  if (sessionRoots(to).includes(root)) return root
  return defaultSpelling(chroma(root), to)
}

// ---- scales ----

/**
 * The session scale with the same keys as `ref` (its fingering source): itself for a session spelling,
 * else the enharmonic one (G♭ major -> F♯ major, D♯ minor -> E♭ minor). Never parseId: these spellings
 * have no item ids.
 */
export function sessionScaleFor(ref: ScaleRef): ScaleRef | null {
  const roots = sessionRoots(ref.form)
  if (roots.includes(ref.root)) return ref
  const twin = roots.find((r) => chroma(r) === chroma(ref.root))
  return twin ? { root: twin, form: ref.form } : null
}

/** Both hands, fingering from `fingeringRef`; with no fingering source, the notes without finger numbers. */
export function scaleKeyboardFor(
  ref: ScaleRef,
  octaves: 1 | 2,
  direction: Direction,
  fingeringRef: ScaleRef | null,
): KeyboardView {
  if (fingeringRef) return scaleKeyboard(ref, octaves, direction, fingeringRef)
  const marksFor = (hand: 'rh' | 'lh', octave: number): KeyMark[] => {
    const seq = scaleSequence(ref, octaves, octave)
    const notes = direction === 'up' ? seq.ascending : seq.descending
    return notes.map((n) => ({ midi: noteMidi(n), hand, label: formatNote(pitchClass(n)) }))
  }
  const marks = [...marksFor('rh', 4), ...marksFor('lh', 3)]
  const midis = marks.map((m) => m.midi)
  return { ...keyboardRange(midis), marks, firstMidi: Math.min(...midis) }
}

/** More than seven sharps or flats: say so and name the usual spelling instead of a broken list. */
function libraryKeySignature(ref: ScaleRef): string {
  const sig = keySignature(ref)
  if (sig.count <= 7) return keySignatureText(ref)
  const word = sig.accidental === '#' ? 'sharps' : 'flats'
  return `${sig.count} ${word}: a theoretical key, usually written as ${formatScale({ root: enharmonic(ref.root), form: ref.form })}`
}

export interface ScalePanel {
  title: string
  /** One octave ascending, tonic to tonic, display glyphs. */
  up: string[]
  /** Melodic minor only: one octave descending (natural minor). */
  down: string[] | null
  hasDirection: boolean
  keySignature: string
  relative: { label: string; name: string; ref: ScaleRef }
  /** null: no fingering source. `note` is set when the fingering is borrowed from the enharmonic session scale. */
  fingering: { note: string | null; family: string | null } | null
  keyboard: KeyboardView
}

export function scalePanel(ref: ScaleRef, octaves: 1 | 2, direction: Direction): ScalePanel {
  const source = sessionScaleFor(ref)
  const rel = relativeKey(ref)
  const borrowed = source !== null && source.root !== ref.root
  const up = [...scaleNotes(ref), ref.root].map(formatNote)
  const down = hasDistinctDescent(ref)
    ? [ref.root, ...scaleNotes({ root: ref.root, form: 'natural' }).slice(1).reverse(), ref.root].map(formatNote)
    : null
  return {
    title: formatScale(ref),
    up,
    down,
    hasDirection: hasDistinctDescent(ref),
    keySignature: libraryKeySignature(ref),
    relative: { label: ref.form === 'major' ? 'Relative minor' : 'Relative major', name: formatScale(rel), ref: rel },
    fingering: source
      ? borrowed
        ? { note: `Same fingering as ${formatScale(source)}`, family: null }
        : { note: null, family: familyOf(source) }
      : null,
    keyboard: scaleKeyboardFor(ref, octaves, hasDistinctDescent(ref) ? direction : 'up', source),
  }
}

/** ▶ tempo: the practiced tempo of the matching session scale if it has one, else the start tempo. */
export function libraryTempo(items: Record<string, ItemState>, ref: ScaleRef, startTempo: number): number {
  const source = sessionScaleFor(ref)
  return (source && items[scaleId(source)]?.tempo) || startTempo
}

// ---- chords ----

const SUFFIX: Record<ChordTypeId, string> = {
  M: '',
  m: 'm',
  dim: 'dim',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  maj7: 'maj7',
  '7': '7',
  m7: 'm7',
  m7b5: 'm7♭5',
  dim7: 'dim7',
  '6': '6',
  add9: 'add9',
  '9': '9',
}

const TYPE_NAME: Partial<Record<ChordTypeId, string>> = { M: 'major', m: 'minor', dim: 'diminished', aug: 'augmented' }
const typeName = (t: ChordTypeId): string => TYPE_NAME[t] ?? (CHORD_TYPES.find((c) => c.id === t)?.label as string)

const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion']
const INVERSION_SHORT = ['Root', '1st inv', '2nd inv', '3rd inv']

export function inversionOptions(type: ChordTypeId): { value: number; label: string }[] {
  return INVERSION_SHORT.slice(0, maxInversion(type) + 1).map((label, value) => ({ value, label }))
}

export function clampInversion(type: ChordTypeId, inversion: number): number {
  return Math.min(inversion, maxInversion(type))
}

export interface ChordPanel {
  /** Lead-sheet symbol, slash bass for inversions: 'C/G'. */
  symbol: string
  name: string
  /** Spelled low to high, display glyphs. */
  notes: string[]
  /** Null when there is no standard fingering for this voicing. */
  fingeringNote: string | null
  keyboard: KeyboardView
}

/** Always show at least C4..B5 so switching chords doesn't resize the keyboard. */
const CHORD_FLOOR = [60, 83]

export function chordPanel(root: string, type: ChordTypeId, inversion: number): ChordPanel {
  const notes = chordNotes(root, type, inversion)
  const fingers = chordFingering(type, inversion, 'rh')
  const marks: KeyMark[] = notes.map((n, i) => ({
    midi: noteMidi(n),
    hand: 'rh',
    finger: fingers?.[i],
    label: formatNote(pitchClass(n)),
  }))
  const midis = marks.map((m) => m.midi)
  const bass = pitchClass(notes[0] as string)
  return {
    symbol: `${formatNote(root)}${SUFFIX[type]}${inversion > 0 ? `/${formatNote(bass)}` : ''}`,
    name: `${formatNote(root)} ${typeName(type)} · ${INVERSION_NAMES[inversion]}`,
    notes: notes.map((n) => formatNote(pitchClass(n))),
    fingeringNote: fingers ? null : 'No standard fingering shown for this voicing',
    keyboard: { ...keyboardRange([...midis, ...CHORD_FLOOR]), marks, firstMidi: Math.min(...midis) },
  }
}

// ---- chords in a key ----

export interface KeyChord {
  numeral: string
  symbol: string
  root: string
  type: DiatonicChord['type']
}

export function keyChords(ref: ScaleRef): KeyChord[] {
  return diatonicChords(ref).map((c) => ({
    numeral: c.numeral,
    symbol: `${formatNote(c.root)}${SUFFIX[c.type]}`,
    root: c.root,
    type: c.type,
  }))
}

// ---- what's this chord? ----

/** Two octaves, C3..B4: as few keys as possible, so each is big enough to tap. */
export const WHAT_RANGE = { low: 48, high: 71 } as const

/** Black keys spelled as in the major session roots. */
const SPELL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const spell = (midi: number): string => `${SPELL[midi % 12]}${Math.floor(midi / 12) - 1}`

/** Tonal qualities of the app's own chord types: these names rank ahead of exotic readings (Em♯5). */
const COMMON = new Set(['M', 'm', 'dim', 'aug', 'sus2', 'sus4', 'maj7', '7', 'm7', 'm7b5', 'dim7', '6', 'Madd9', '9'])
const qualityOf = (name: string): string => (name.split('/')[0] as string).replace(/^[A-G](#{1,2}|b{1,2})?/, '')

export function toggleMidi(midis: number[], midi: number): number[] {
  return midis.includes(midi) ? midis.filter((m) => m !== midi) : [...midis, midi].sort((a, b) => a - b)
}

export function whatMarks(midis: number[]): KeyMark[] {
  return midis.map((midi) => ({ midi, hand: 'none', label: formatNote(pitchClass(spell(midi))) }))
}

export interface Detection {
  status: 'empty' | 'match' | 'none'
  names: string[]
  /** Tapped notes low to high, display glyphs. */
  notes: string[]
}

export function detection(midis: number[]): Detection {
  if (midis.length === 0) return { status: 'empty', names: [], notes: [] }
  const sorted = [...new Set(midis)].sort((a, b) => a - b)
  const raw = detectChord(sorted.map(spell))
  const ranked = [...raw.filter((n) => COMMON.has(qualityOf(n))), ...raw.filter((n) => !COMMON.has(qualityOf(n)))]
  return {
    status: ranked.length > 0 ? 'match' : 'none',
    names: ranked.map(formatChordName),
    notes: sorted.map((m) => formatNote(pitchClass(spell(m)))),
  }
}
