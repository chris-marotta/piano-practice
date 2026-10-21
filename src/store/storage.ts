// Persisted app state. Pure: the caller injects a Storage (or null when unavailable).
import { DEFAULT_SETTINGS, type Settings } from '../srs/items'
import type { ItemState } from '../srs/scheduler'

export interface SessionLog {
  date: string
  minutes: number
  completed: boolean
}

export interface AppState {
  version: 1
  settings: Settings
  items: Record<string, ItemState>
  log: SessionLog[]
  placedAt: string | null
}

export const STORAGE_KEY = 'piano-practice:v1'
export const BACKUP_KEY = 'piano-practice:corrupt-backup'

const NOT_SAVED_NOTICE = "Storage isn't available in this browser, so your progress won't be saved."
const CORRUPT_NOTICE =
  'Saved progress could not be read, so a fresh start was loaded. The old data is kept as a backup.'

export function emptyState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, minorForms: { ...DEFAULT_SETTINGS.minorForms } },
    items: {},
    log: [],
    placedAt: null,
  }
}

// ---- validation ----

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const inRange = (v: unknown, lo: number, hi: number): boolean =>
  isNum(v) && Number.isInteger(v) && v >= lo && v <= hi

const RATINGS = ['nailed', 'shaky', 'lost']

function isItemState(key: string, v: unknown): boolean {
  if (!isObject(v)) return false
  if (v.id !== key) return false
  if (typeof v.introduced !== 'boolean') return false
  if (!inRange(v.box, 1, 5) || !inRange(v.support, 0, 3)) return false
  if (!isNum(v.levelStreak) || !isDate(v.due)) return false
  if (v.tempo !== undefined && !isNum(v.tempo)) return false
  if (!Array.isArray(v.history)) return false
  return v.history.every((h) => isObject(h) && isDate(h.date) && typeof h.rating === 'string' && RATINGS.includes(h.rating))
}

function isLogEntry(v: unknown): boolean {
  return isObject(v) && isDate(v.date) && isNum(v.minutes) && typeof v.completed === 'boolean'
}

function mergeSettings(stored: Record<string, unknown>): Settings {
  const forms = isObject(stored.minorForms) ? stored.minorForms : {}
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    minorForms: { ...DEFAULT_SETTINGS.minorForms, ...forms },
  } as Settings
}

/** Structural check of parsed JSON. Returns a fresh AppState (settings merged over defaults) or null. */
function validate(raw: unknown): AppState | null {
  if (!isObject(raw) || raw.version !== 1) return null
  if (!isObject(raw.settings)) return null
  if (!isObject(raw.items)) return null
  for (const [k, v] of Object.entries(raw.items)) if (!isItemState(k, v)) return null
  if (!Array.isArray(raw.log) || !raw.log.every(isLogEntry)) return null
  if (raw.placedAt !== null && typeof raw.placedAt !== 'string') return null
  return {
    version: 1,
    settings: mergeSettings(raw.settings),
    items: raw.items as Record<string, ItemState>,
    log: raw.log as SessionLog[],
    placedAt: raw.placedAt,
  }
}

// ---- load / save ----

export function loadState(storage: Storage | null): {
  state: AppState
  persistent: boolean
  notice: string | null
} {
  if (!storage) return { state: emptyState(), persistent: false, notice: NOT_SAVED_NOTICE }

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { state: emptyState(), persistent: false, notice: NOT_SAVED_NOTICE }
  }
  if (raw === null) return { state: emptyState(), persistent: true, notice: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  const state = parsed === undefined ? null : validate(parsed)
  if (state) return { state, persistent: true, notice: null }

  try {
    storage.setItem(BACKUP_KEY, raw)
  } catch {
    // Backup is best-effort.
  }
  return { state: emptyState(), persistent: true, notice: CORRUPT_NOTICE }
}

export function saveState(storage: Storage | null, state: AppState): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

// ---- export / import ----

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

export function parseImport(
  json: string,
): { ok: true; state: AppState } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: "That file isn't valid JSON." }
  }
  if (!isObject(parsed)) return { ok: false, error: 'Not a Piano Practice backup file.' }
  if (parsed.version !== 1) return { ok: false, error: 'This backup is from an unsupported version.' }
  const state = validate(parsed)
  if (!state) return { ok: false, error: 'Not a Piano Practice backup file.' }
  return { ok: true, state }
}
