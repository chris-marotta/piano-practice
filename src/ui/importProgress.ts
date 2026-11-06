import type { AppState } from '../store/storage'
import { currentSession, navigate, update } from './state'
import { routeAfterImport } from './screens/settingsView'

/** Make `state` the app's progress and go where it belongs. Shared by Settings' Import and the backup prompt. */
export function importProgress(state: AppState): void {
  currentSession.value = null
  update(() => state)
  navigate(routeAfterImport(state))
}
