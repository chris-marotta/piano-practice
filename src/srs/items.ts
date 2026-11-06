import { RECALL_TYPES } from '../theory/recall'
import type { RecallType } from '../theory/recall'
import { PC_ASCII } from '../theory/keyNames'
import { EAR_LEVEL_DEGREES, isEarDegree } from '../theory/ear'
import type { EarDegree } from '../theory/ear'
import { STAFF_LEVEL_NOTES } from '../theory/staff'
import type { Clef } from '../theory/staff'
import { MAJOR_ROOTS, MINOR_ROOTS } from '../theory/scales'
import type { ScaleForm, ScaleRef } from '../theory/scales'
import { TEMPO_START } from './scheduler'
import type { ItemState } from './scheduler'

/** Play's key labels: none, note names, or degrees (1 3 5 / scale position). */
export type PlayLabels = 'off' | 'names' | 'degrees'

export interface Settings {
  sessionMinutes: 5 | 10 | 15 | 20
  minorForms: { natural: boolean; harmonic: boolean; melodic: boolean }
  startTempo: number
  droneOn: boolean
  droneVolumeDb: number
  metronomeOn: boolean
  midiEnabled: boolean
  keyboardSound: boolean
  playLabels: PlayLabels
  /** The highest drill level reached. drillLevel never goes below it (sticky levels), and "Level {n} unlocked" shows once. */
  lastDrillLevel: 1 | 2 | 3 | 4
  /** Staff drill: tap or play the exact key the staff shows, not just the right letter. */
  staffExactOctave: boolean
  /** The highest Staff drill level reached; sticky like lastDrillLevel. */
  lastStaffLevel: 1 | 2 | 3 | 4 | 5 | 6
  /** Ear drill: count a played note only in the octave the app played. */
  earExactOctave: boolean
  /** The highest Ear drill level reached; sticky like lastDrillLevel. */
  lastEarLevel: 1 | 2 | 3 | 4 | 5 | 6
}

export const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 10,
  minorForms: { natural: true, harmonic: false, melodic: false },
  startTempo: TEMPO_START,
  droneOn: true,
  droneVolumeDb: -12,
  metronomeOn: false,
  midiEnabled: false,
  keyboardSound: true,
  playLabels: 'names',
  lastDrillLevel: 1,
  staffExactOctave: false,
  lastStaffLevel: 1,
  earExactOctave: false,
  lastEarLevel: 1,
}

// Ids use tonal's ASCII spelling for roots (F#, Bb), never the display glyphs.
export const scaleId = (ref: ScaleRef): string => `scale:${ref.root}:${ref.form}`
export const recallId = (type: RecallType, ref: ScaleRef): string => `recall:${type}:${ref.root}:${ref.form}`
export const chordsId = (ref: ScaleRef): string => `chords:${ref.root}:${ref.form}`

/** Name-that-key items, one per pitch class: `key:C`, `key:F#`. Not a `parseId` kind; use `parseKeyId`. */
export const keyId = (pc: number): string => `key:${PC_ASCII[pc]}`
export const KEY_IDS: string[] = PC_ASCII.map((_, pc) => keyId(pc))

/** The pitch class of a key id, or null for anything else (never throws). */
export function parseKeyId(id: string): number | null {
  if (!id.startsWith('key:')) return null
  const pc = PC_ASCII.indexOf(id.slice(4))
  return pc === -1 ? null : pc
}

/** Staff-reading items, one per clef and note: `staff:treble:F#4`. Not a `parseId` kind; use `parseStaffId`. */
export const staffId = (clef: Clef, note: string): string => `staff:${clef}:${note}`

/** The staff drill's 54 item ids, in level order. */
export const STAFF_IDS: string[] = Object.values(STAFF_LEVEL_NOTES).flatMap((notes) => notes.map((n) => staffId(n.clef, n.note)))

const STAFF_NOTE = /^[A-G](#{1,2}|b{1,2})?-?\d+$/

/** The clef and note of a staff id, or null for anything else (never throws). No direct tonal import here (a regex, not Note.get). */
export function parseStaffId(id: string): { clef: Clef; note: string } | null {
  const parts = id.split(':')
  if (parts.length !== 3 || parts[0] !== 'staff') return null
  const clef = parts[1]
  const note = parts[2] as string
  if ((clef !== 'treble' && clef !== 'bass') || !STAFF_NOTE.test(note)) return null
  return { clef, note }
}

/** Ear-training items, one per scale degree: `ear:b3`. Not a `parseId` kind; use `parseEarId`. */
export const earId = (d: EarDegree): string => `ear:${d}`

/** The ear drill's 12 item ids, in level order. */
export const EAR_IDS: string[] = Object.values(EAR_LEVEL_DEGREES).flatMap((ds) => ds.map(earId))

/** The degree of an ear id, or null for anything else (never throws). */
export function parseEarId(id: string): EarDegree | null {
  if (!id.startsWith('ear:')) return null
  const d = id.slice(4)
  return isEarDegree(d) ? d : null
}

const FORMS: ScaleForm[] = ['major', 'natural', 'harmonic', 'melodic']

function parseRef(root: string | undefined, form: string | undefined, id: string): ScaleRef {
  const validRoot = root !== undefined && (MAJOR_ROOTS.includes(root) || MINOR_ROOTS.includes(root))
  const validForm = FORMS.includes(form as ScaleForm)
  if (!validRoot || !validForm) throw new Error(`Malformed item id: "${id}"`)
  const ref = { root: root as string, form: form as ScaleForm }
  const rootsForForm = ref.form === 'major' ? MAJOR_ROOTS : MINOR_ROOTS
  if (!rootsForForm.includes(ref.root)) throw new Error(`Malformed item id: "${id}"`)
  return ref
}

export function parseId(id: string): { kind: 'scale' | 'recall' | 'chords'; ref: ScaleRef; recallType?: RecallType } {
  const parts = id.split(':')
  const kind = parts[0]
  if ((kind === 'scale' || kind === 'chords') && parts.length === 3) {
    return { kind, ref: parseRef(parts[1], parts[2], id) }
  }
  if (kind === 'recall' && parts.length === 4) {
    const recallType = parts[1] as RecallType
    if (!RECALL_TYPES.includes(recallType)) throw new Error(`Malformed item id: "${id}"`)
    return { kind, recallType, ref: parseRef(parts[2], parts[3], id) }
  }
  throw new Error(`Malformed item id: "${id}"`)
}

/** Majors in MAJOR_ROOTS order, then each enabled minor form in MINOR_ROOTS order. */
export function enabledScales(settings: Settings): ScaleRef[] {
  const refs: ScaleRef[] = MAJOR_ROOTS.map((root) => ({ root, form: 'major' }))
  for (const form of ['natural', 'harmonic', 'melodic'] as const) {
    if (settings.minorForms[form]) refs.push(...MINOR_ROOTS.map((root) => ({ root, form })))
  }
  return refs
}

/** Scale id, its 4 recall ids, then its chords id. */
export function idsForScale(ref: ScaleRef): string[] {
  return [scaleId(ref), ...RECALL_TYPES.map((t) => recallId(t, ref)), chordsId(ref)]
}

export type Placement = 'solid' | 'shaky' | 'unknown'

function freshState(id: string, today: string, settings: Settings): ItemState {
  const state: ItemState = {
    id,
    introduced: false,
    box: 1,
    support: 0,
    levelStreak: 0,
    due: today,
    history: [],
  }
  if (id.startsWith('scale:')) state.tempo = settings.startTempo
  return state
}

export function stateFor(
  id: string,
  items: Record<string, ItemState>,
  today: string,
  settings: Settings,
): ItemState {
  return items[id] ?? freshState(id, today, settings)
}

/** First-run placement. Scales missing from `choices` count as 'unknown'. */
export function placeItems(
  choices: Record<string, Placement>,
  settings: Settings,
  today: string,
): Record<string, ItemState> {
  const items: Record<string, ItemState> = {}
  for (const ref of enabledScales(settings)) {
    const choice = choices[scaleId(ref)] ?? 'unknown'
    for (const id of idsForScale(ref)) {
      const state = freshState(id, today, settings)
      if (choice === 'solid') {
        state.box = 3
        if (id.startsWith('scale:')) state.support = 2
      }
      state.introduced = choice !== 'unknown'
      items[id] = state
    }
  }
  return items
}
