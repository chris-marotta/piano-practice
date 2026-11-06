// Pure view model for the Play tab (no Preact, no window): unit tested in node.
import type { MidiStatus } from '../../../midi/access'
import { guideRun, type GuideNext, type GuideState } from '../../../play/guide'
import { expectedRun, type Expected } from '../../../play/sequence'
import type { PlayLabels } from '../../../srs/items'
import { CHORD_TYPES, chordDegrees, chordFingering, chordNotes, maxInversion, type ChordTypeId } from '../../../theory/chords'
import { formatNote, formatScale } from '../../../theory/format'
import { chroma, keySignature, noteMidi, scaleNotes, type ScaleForm, type ScaleRef } from '../../../theory/scales'
import { isBlack, whiteKeys, type KeyMark, type ReserveRows } from '../../components/keyboardLayout'
import { chordPanel, detection, pickerKeys, type PickerContext } from '../library/libraryView'

export type { PlayLabels }
export type PlayMode = 'free' | 'guided' | 'check' | 'keys' | 'staff' | 'ear'
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

/** Check gives nothing away: no target glow, no finger numbers, no right/wrong colours. */
export function effectiveToggles(mode: PlayMode, t: PlayToggles): PlayToggles {
  return mode === 'check' ? { ...t, highlight: false, colours: false, fingers: false } : t
}

export function checkAvailable(target: PlayTarget): boolean {
  return target.kind === 'scale'
}

export function guideAvailable(target: PlayTarget): boolean {
  return target.kind !== 'none'
}

/**
 * The mode actually in force: a mode the target can't use falls back to Free (the chosen one is kept for later).
 * Keys and Staff ignore the target, so they are always available.
 */
export function effectiveMode(mode: PlayMode, target: PlayTarget): PlayMode {
  if (mode === 'check' && !checkAvailable(target)) return 'free'
  if (mode === 'guided' && !guideAvailable(target)) return 'free'
  return mode
}

/**
 * The mode to open Play in when something hands it a picked target (the circle page's "Play it"). Keys ignores the
 * target, so landing in Keys (or Staff) would hide the pick behind a drill round: go to Free instead. Others are kept.
 */
export function modeForPickedTarget(mode: PlayMode): PlayMode {
  // Ear takes the picked target's root as its key (R-E3), so it stays.
  return mode === 'keys' || mode === 'staff' ? 'free' : mode
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
 * white keys. Nothing picked: the Roli's 49 keys. `hand`: whose run (fitHand: Together for Check and Free).
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

/**
 * Whose run the keyboard is zoomed to. Guided scale: the chosen hand. Check and Free with a scale: both hands (LH
 * octave 3 through RH top), so a two-handed run doesn't make the keyboard jump octaves (ruling, review). Chords and
 * nothing: RH (the hand doesn't apply).
 */
export function fitHand(mode: PlayMode, target: PlayTarget, hand: PlayHand): PlayHand {
  if (target.kind !== 'scale') return 'rh'
  return mode === 'guided' ? hand : 'together'
}

/** Whole-octave following on notes off screen: everywhere but a guided scale, which follows its octave lock. */
export function followsNotes(mode: PlayMode, target: PlayTarget): boolean {
  return mode !== 'guided' || target.kind !== 'scale'
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
  if (followsNotes(a.mode, a.target)) return a.follow
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

/** The target's root as a pitch class, or null with no target. */
function rootPitchClass(target: PlayTarget): number | null {
  return target.kind === 'scale' ? chroma(target.ref.root) : target.kind === 'chord' ? chroma(target.root) : null
}

/**
 * Pitch class to degree, as scale position (1-based) or chord-tone number. Melodic minor adds the natural form's 6th and
 * 7th at the same positions, so F and F♯ in A melodic both read 6.
 */
function degreeMap(target: PlayTarget): Map<number, string> {
  const out = new Map<number, string>()
  if (target.kind === 'chord') {
    const degrees = chordDegrees(target.type)
    chordNotes(target.root, target.type, 0).forEach((n, i) => out.set(chroma(n), String(degrees[i])))
  } else if (target.kind === 'scale') {
    const forms: ScaleRef[] = [target.ref]
    if (target.ref.form === 'melodic') forms.push({ root: target.ref.root, form: 'natural' })
    for (const ref of forms) scaleNotes(ref).forEach((n, i) => out.set(chroma(n), String(i + 1)))
  }
  return out
}

/** Pitch class to note name, spelled as the scale or chord spells it. */
function nameMap(target: PlayTarget): Map<number, string> {
  const out = new Map<number, string>()
  const names =
    target.kind === 'chord'
      ? chordNotes(target.root, target.type, 0).map((n) => n.replace(/-?\d+$/, ''))
      : target.kind === 'scale'
        ? scaleNotes(target.ref)
        : []
  if (target.kind === 'scale' && target.ref.form === 'melodic') names.push(...scaleNotes({ root: target.ref.root, form: 'natural' }))
  for (const n of names) if (!out.has(chroma(n))) out.set(chroma(n), formatNote(n))
  return out
}

/** The degree label for a pitch class of the target (scale position 1-7, or chord tone 1 3 5 7), null if it isn't in it. */
export function degreeLabel(target: PlayTarget, pc: number): string | null {
  return degreeMap(target).get(((pc % 12) + 12) % 12) ?? null
}

interface MarksArgs {
  mode: PlayMode
  target: PlayTarget
  toggles: PlayToggles
  /** Key labels on target keys: none, note names or degrees. Wrong and out-of-target keys never get one. */
  labels: PlayLabels
  held: ReadonlySet<number>
  /** Notes still sounding (held keys plus keys let go under the sustain pedal); the let-go ones show as sustained. */
  sounding?: ReadonlySet<number>
  next: GuideNext
  window: KeyWindow
  /** Guided: the key the guide just called wrong (shown bad for 400 ms). */
  flash?: number | null
  /** Guided: the guide's state, for a scale's leg glow (index and octave offset). */
  guide?: GuideState | null
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
 * Guided scale glow: the run's own keys on the current leg (up is 0..top, down is top..end), at the locked octave.
 * Before the next note: played (dim); after it: target. The next note itself is the hand-coloured mark; the other leg
 * isn't shown. Together: the same for the LH run, 12 below.
 */
function legMarks(g: GuideState): KeyMark[] {
  const t = g.target
  if (t.kind !== 'scale') return []
  const { run, top } = guideRun(t)
  const [from, to] = g.index <= top ? [0, top] : [top, run.length - 1]
  const offset = g.offset ?? 0
  const shifts = t.hand === 'together' ? [0, -12] : [0]
  const marks: KeyMark[] = []
  for (let i = from; i <= to; i++) {
    if (i === g.index) continue
    const state = i < g.index ? 'played' : 'target'
    for (const s of shifts) marks.push({ midi: (run[i] as Expected).midi + offset + s, hand: 'none', state })
  }
  return marks
}

/**
 * Key marks, spec §4.3 priority: pressed + in target (good ✓) > pressed + not in target (bad ×) > pressed with no
 * target > guided next note (hand colour + finger) > target glow > played glow. keyLooks resolves overlaps in that
 * order; this gives each pressed key exactly one state. In Guided the wrong-note flash is the guide's verdict, so it
 * shows bad even on a key that is in the scale (a right note in the wrong place). The glow is every target pitch
 * class in the window, except in a guided scale: only the run's own notes, leg by leg (legMarks).
 * Labels (spec 4.1) go on the target's own marks (glow, the guide's next note, a right key), never on a wrong or plain
 * pressed key. Every root key gets `root`, with a mark of its own where it has none (the dot shows in every setting).
 */
export function playMarks(a: MarksArgs): KeyMark[] {
  const t = effectiveToggles(a.mode, a.toggles)
  const pcs = targetPitchClasses(a.target)
  const inWindow = (m: number) => m >= a.window.low && m <= a.window.high
  const flash = a.mode === 'guided' && t.colours ? (a.flash ?? null) : null
  const marks: KeyMark[] = []

  for (const midi of a.held) {
    // ASSUMED: a slip outside the locked octave's window isn't drawn.
    if (!inWindow(midi)) continue
    const state =
      a.target.kind === 'none' || !t.colours ? 'pressed' : midi === flash ? 'bad' : pcs.has(midi % 12) ? 'good' : 'bad'
    marks.push({ midi, hand: 'none', state })
  }
  if (flash !== null && !a.held.has(flash) && inWindow(flash)) marks.push({ midi: flash, hand: 'none', state: 'bad' })
  for (const midi of a.sounding ?? []) {
    if (!a.held.has(midi) && inWindow(midi)) marks.push({ midi, hand: 'none', state: 'sustained' })
  }

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
    if (a.mode === 'guided' && a.target.kind === 'scale') {
      if (a.guide) marks.push(...legMarks(a.guide))
    } else {
      for (let m = a.window.low; m <= a.window.high; m++) if (pcs.has(m % 12)) marks.push({ midi: m, hand: 'none', state: 'target' })
    }
  }
  return withLabelsAndRoots(marks, a)
}

/** The root dot on every root key in the window, and the label on the target's marks (see playMarks). */
function withLabelsAndRoots(marks: KeyMark[], a: MarksArgs): KeyMark[] {
  const rootPc = rootPitchClass(a.target)
  if (rootPc === null) return marks
  const names = a.labels === 'names' ? nameMap(a.target) : a.labels === 'degrees' ? degreeMap(a.target) : null
  const labelFor = (midi: number): string | undefined => names?.get(midi % 12)
  // 'pressed' and 'bad' say nothing about the target: no label there (Check, or Right / wrong off, would give it away).
  // A key with a bad mark (a pressed slip or the guide's flash) shows no label, whatever glow lies under it.
  const bad = new Set(marks.filter((m) => m.state === 'bad').map((m) => m.midi))
  const labelled = (m: KeyMark): KeyMark => {
    const isRoot = m.midi % 12 === rootPc
    const label = m.state === 'pressed' || bad.has(m.midi) ? undefined : labelFor(m.midi)
    return label === undefined && !isRoot ? m : { ...m, ...(label === undefined ? {} : { label }), ...(isRoot ? { root: true } : {}) }
  }
  const out = marks.map(labelled)
  const marked = new Set(marks.map((m) => m.midi))
  for (let midi = a.window.low; midi <= a.window.high; midi++) {
    if (midi % 12 === rootPc && !marked.has(midi)) {
      const label = labelFor(midi)
      out.push({ midi, hand: 'none', root: true, ...(label === undefined ? {} : { label }) })
    }
  }
  return out
}

/** Keys mode: questions in one round (spec §6.6). */
export const KEYS_ROUND_QUESTIONS = 8

/** Staff mode: questions in one round. */
export const STAFF_ROUND_QUESTIONS = 6

/** Ear mode: questions in one round. */
export const EAR_ROUND_QUESTIONS = 6

/** The key Ear drills in: the target's root, C when none is picked (R-E3). */
export const rootOf = (t: PlayTarget): string => (t.kind === 'scale' ? t.ref.root : t.kind === 'chord' ? t.root : 'C')

/** Badge rows to keep free so the keys don't jump while a run goes on (none where no finger can show). */
export function reserveRowsFor(mode: PlayMode, target: PlayTarget, hand: PlayHand): ReserveRows {
  if (mode !== 'guided') return false
  if (target.kind === 'scale' && hand !== 'rh') return true
  return 'rh'
}

// ---- random pick ----

/** One item, by an rng in [0, 1) (a 1 still lands on the last item). */
const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T

/** The RootPicker's 12 roots for a form or for chords, spelled as it offers them; `skipPc`: one pitch class left out. */
const rootsFor = (ctx: PickerContext, skipPc: number | null): string[] =>
  pickerKeys('C', ctx)
    .map((k) => k.root)
    .filter((r) => chroma(r) !== skipPc)

/**
 * Random: a form from major plus the minor forms enabled in Settings, then a root the RootPicker offers for that form.
 * Never the current scale (same form and pitch class, whatever the spelling). The octaves choice is the caller's.
 */
export function randomScale(
  current: ScaleRef,
  minorForms: { natural: boolean; harmonic: boolean; melodic: boolean },
  rng: () => number,
): ScaleRef {
  const forms: ScaleForm[] = ['major', ...(['natural', 'harmonic', 'melodic'] as const).filter((f) => minorForms[f])]
  const form = pick(forms, rng)
  const root = pick(rootsFor(form, form === current.form ? chroma(current.root) : null), rng)
  return { root, form }
}

type PlayChord = { root: string; type: ChordTypeId; inversion: number }

/** Random: any chord type, any root the chord RootPicker offers, root position. Never the current root and type. */
export function randomChord(current: PlayChord, rng: () => number): PlayChord {
  const type = pick(CHORD_TYPES.map((t) => t.id), rng)
  const root = pick(rootsFor('chord', type === current.type ? chroma(current.root) : null), rng)
  return { root, type, inversion: 0 }
}

// ---- words ----

export function targetTitle(target: PlayTarget): string {
  if (target.kind === 'none') return 'Free play'
  if (target.kind === 'chord') return chordPanel(target.root, target.type, target.inversion).symbol
  return `${formatScale(target.ref)} · ${target.octaves} octave${target.octaves === 2 ? 's' : ''}`
}

const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion']
const MODE_WORD: Record<PlayMode, string> = { free: 'Free', guided: 'Guided', check: 'Check', keys: 'Keys', staff: 'Staff', ear: 'Ear' }
const HAND_SHORT: Record<PlayHand, string> = { rh: 'RH', lh: 'LH', together: 'Together' }
const HAND_WORD = { rh: 'Right hand', lh: 'Left hand', together: 'Hands together' } as const
const plain = (name: string): string => formatNote(name.replace(/-?\d+$/, ''))
const slipWord = (n: number): string => `${n} slip${n === 1 ? '' : 's'}`

/**
 * The one line the picker collapses to once Chris plays: "D major · 1 oct · Guided RH", "A harmonic minor · 2 oct ·
 * Check Together", "C major chord, 1st inversion · Guided". Only a scale in Guided or Check names a hand (`hand`: the
 * one in force, see fitHand); a chord has no octaves; the chord's name and inversion are the Library's (chordPanel).
 * Ear: "Ear · Level 4 · Key of A" (`root`, the target's root). Keys and Staff ignore the target: "Keys · Level 2", "Staff · Level 3" (`drillLevel`, the level of the round on screen).
 */
export function pickerSummary(
  target: PlayTarget,
  octaves: 1 | 2,
  mode: PlayMode,
  hand: PlayHand,
  drillLevel = 1,
  practice = false,
  root = 'C',
): string {
  if (mode === 'ear') return `Ear · Level ${drillLevel} · Key of ${formatNote(root)}${practice ? ' · practice' : ''}`
  if (mode === 'keys' || mode === 'staff') return `${MODE_WORD[mode]} · Level ${drillLevel}${practice ? ' · practice' : ''}`
  if (target.kind === 'none') return 'Free play'
  const modeWord = MODE_WORD[mode]
  if (target.kind === 'chord') {
    // chordPanel's name is "C major · 1st inversion": the root position is left unsaid here.
    const [name] = chordPanel(target.root, target.type, target.inversion).name.split(' · ') as [string]
    const inversion = target.inversion > 0 ? `, ${INVERSION_NAMES[target.inversion]}` : ''
    return `${name} chord${inversion} · ${modeWord}`
  }
  const withHand = mode === 'free' ? modeWord : `${modeWord} ${HAND_SHORT[hand]}`
  return `${formatScale(target.ref)} · ${octaves} oct · ${withHand}`
}

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
