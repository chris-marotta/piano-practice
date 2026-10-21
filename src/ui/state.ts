// App-wide state. The only module that touches window.localStorage and window.location.hash.
import { effect, signal } from '@preact/signals'
import { loadState, saveState, type AppState } from '../store/storage'
import { localDate } from '../srs/dates'
import type { ItemState } from '../srs/scheduler'
import type { Step } from '../session/builder'
import { parseHash, resolveRoute, type Route } from './route'

export type { Route } from './route'

let storage: Storage | null
try {
  storage = window.localStorage
} catch {
  storage = null
}

const loaded = loadState(storage)

export const app = signal<AppState>(loaded.state)
/** False once storage is known not to persist (unavailable, or a save failed). */
export const persistent = signal<boolean>(loaded.persistent)
/** One-off message for the banner (storage problems at load). Null when dismissed. */
export const notice = signal<string | null>(loaded.notice)

/**
 * The session in progress (in memory only, never persisted). `before` is the item store as it was
 * when the session started, so the Done screen can show what moved.
 */
export interface CurrentSession {
  steps: Step[]
  index: number
  startedAt: number
  before: Record<string, ItemState>
  /** Set once the last step is done and the session is logged (index === steps.length). */
  minutes?: number
}

export const currentSession = signal<CurrentSession | null>(null)

/** Replace the state and save it. A failed save flips `persistent` off; the app keeps running in memory. */
export function update(fn: (s: AppState) => AppState): void {
  const next = fn(app.value)
  app.value = next
  if (!saveState(storage, next)) persistent.value = false
}

/** Local calendar date, 'YYYY-MM-DD'. */
export function today(): string {
  return localDate(new Date())
}

/**
 * Bumped each time the app comes back to the foreground. Screens that show "today" read it, so
 * an app left open overnight re-derives (and today() re-reads the date) when it is next looked at.
 */
export const resumed = signal(0)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resumed.value++
})

// ---- routing (hash based: the app is served from a relative base on GitHub Pages) ----

const placed = (): boolean => app.value.placedAt !== null

/** Dev-only pages (e.g. '#/dev-keyboard'). Always null in production builds. */
export const devPage = signal<string | null>(null)

function readDevPage(path: string): string | null {
  return import.meta.env.DEV && path.startsWith('dev-') ? path : null
}

const initialPath = parseHash(window.location.hash)
devPage.value = readDevPage(initialPath)

/**
 * Current screen. Assigning it directly rewrites the hash with replaceState (no history entry);
 * use navigate() to push a history entry. Unplaced users are always sent to 'placement'.
 */
export const route = signal<Route>(resolveRoute(initialPath, placed()))

/** Programmatic navigation; adds a history entry like a tab tap does. */
export function navigate(to: Route): void {
  devPage.value = null
  if (parseHash(window.location.hash) !== to) window.location.hash = `#/${to}`
  route.value = resolveRoute(to, placed())
}

/** Rewrite the hash to match the route (replaceState: redirects should not add history entries). */
function syncHash(r: Route): void {
  if (devPage.peek() === null && parseHash(window.location.hash) !== r) window.history.replaceState(null, '', `#/${r}`)
}

window.addEventListener('hashchange', () => {
  const path = parseHash(window.location.hash)
  devPage.value = readDevPage(path)
  if (devPage.value !== null) return
  route.value = resolveRoute(path, placed())
  syncHash(route.value) // the route may not change (e.g. already on placement), so the effect below won't fire
})

// Placement redirect: whatever sets the route, an unplaced state lands on placement.
effect(() => {
  if (!placed() && route.value !== 'placement') route.value = 'placement'
})

// Keep the hash in step with the route.
effect(() => syncHash(route.value))
