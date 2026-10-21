// Pure helpers for the Settings screen (no Preact, no window): unit tested in node.
import { DEFAULT_SETTINGS } from '../../srs/items'
import type { Settings } from '../../srs/items'
import type { AppState } from '../../store/storage'
import { formatDay } from '../formatDate'
import type { Route } from '../route'

export const LENGTH_OPTIONS: { value: Settings['sessionMinutes']; label: string }[] = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
]

export const OCTAVE_OPTIONS: { value: Settings['octaves']; label: string }[] = [
  { value: 1, label: '1 octave' },
  { value: 2, label: '2 octaves' },
]

export type MinorForm = keyof Settings['minorForms']

export const MINOR_FORM_OPTIONS: { form: MinorForm; label: string }[] = [
  { form: 'natural', label: 'Natural' },
  { form: 'harmonic', label: 'Harmonic' },
  { form: 'melodic', label: 'Melodic' },
]

export const TEMPO_MIN = 40
export const TEMPO_MAX = 120
export const TEMPO_STEP = 4
export const DRONE_DB_MIN = -40
export const DRONE_DB_MAX = 0

/** Snap to the 4-bpm grid from 40, within 40–120. */
export function clampTempo(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_SETTINGS.startTempo
  const snapped = TEMPO_MIN + Math.round((bpm - TEMPO_MIN) / TEMPO_STEP) * TEMPO_STEP
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, snapped))
}

/** Whole dB within −40…0. */
export function clampDroneDb(db: number): number {
  if (!Number.isFinite(db)) return DEFAULT_SETTINGS.droneVolumeDb
  return Math.min(DRONE_DB_MAX, Math.max(DRONE_DB_MIN, Math.round(db)))
}

export type SettingsPatch = Partial<Omit<Settings, 'minorForms'>>

/**
 * New state with the patch applied to a copy of settings (tempo and drone volume clamped).
 * A start tempo change also resets the tempo of every scale never practiced (empty history):
 * placement stores a tempo in each scale, so without this the setting would reach nothing.
 */
export function withSettings(state: AppState, patch: SettingsPatch): AppState {
  const settings: Settings = { ...state.settings, ...patch, minorForms: { ...state.settings.minorForms } }
  if (patch.startTempo !== undefined) settings.startTempo = clampTempo(patch.startTempo)
  if (patch.droneVolumeDb !== undefined) settings.droneVolumeDb = clampDroneDb(patch.droneVolumeDb)
  if (patch.startTempo === undefined) return { ...state, settings }
  const items = { ...state.items }
  for (const [id, item] of Object.entries(items)) {
    if (id.startsWith('scale:') && item.history.length === 0 && item.tempo !== settings.startTempo) {
      items[id] = { ...item, tempo: settings.startTempo }
    }
  }
  return { ...state, settings, items }
}

/** Turn one minor form on or off. Any combination is allowed, including none (majors only). */
export function withMinorForm(state: AppState, form: MinorForm, on: boolean): AppState {
  return {
    ...state,
    settings: { ...state.settings, minorForms: { ...state.settings.minorForms, [form]: on } },
  }
}

export const REDO_MESSAGE = 'This resets all scale progress. Your practice log and streak are kept.'

/** Redo placement: scale progress cleared, log and settings kept. */
export function resetPlacement(state: AppState): AppState {
  return { ...state, placedAt: null, items: {} }
}

export function exportFilename(today: string): string {
  return `piano-practice-${today}.json`
}

export const SHARE_TITLE = 'Piano Practice backup'

/** The slice of `navigator` the export needs (injected, so this stays testable in node). */
export interface ShareTarget {
  share?: (data: { files?: File[]; title?: string }) => Promise<void>
  canShare?: (data: { files?: File[] }) => boolean
}

/**
 * True when the backup should go through the Share sheet (Save to Files). The home-screen app on
 * iPad can't reliably save an <a download>, so share wins wherever the browser can share files.
 */
export function canShareFile(nav: ShareTarget, file: File): boolean {
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: [file] }) === true
  } catch {
    return false
  }
}

/** The person closed the Share sheet: do nothing (no download, no message). */
export function isShareAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

/** What an import will bring in, for the confirm step. `placed` is null for an unplaced backup. */
export function importSummary(state: AppState): { placed: string | null; items: number; sessions: number } {
  return {
    placed: state.placedAt === null ? null : formatDay(state.placedAt),
    items: Object.keys(state.items).length,
    sessions: state.log.filter((e) => e.completed).length,
  }
}

export function routeAfterImport(state: AppState): Extract<Route, 'today' | 'placement'> {
  return state.placedAt === null ? 'placement' : 'today'
}
