// The browser edge of auto-backup: Chrome's Save dialog, the IndexedDB handle store and app start.
// Nothing else touches showSaveFilePicker, file handles or the backup IndexedDB. Imports safely
// in node (every browser global is guarded), so the picker wrapper is unit-tested.
// Does not import src/ui/state.ts (it touches `document` at load): main.tsx passes `app` in.
import { signal, type ReadonlySignal } from '@preact/signals'
import type { AppState } from '../store/storage'
import { createBackup, type BackupController, type BackupHandle } from './controller'
import { idbHandleStore } from './idb'

export const backupSupported: boolean =
  typeof window !== 'undefined' &&
  typeof window.showSaveFilePicker === 'function' &&
  typeof indexedDB !== 'undefined'

/** Wraps the Save dialog: cancelling (AbortError) is not an error, it resolves null. */
export function pickWith(
  show: (o: SaveFilePickerOptions) => Promise<BackupHandle>,
): () => Promise<BackupHandle | null> {
  return async () => {
    try {
      return await show({
        suggestedName: 'piano-practice-backup.json',
        types: [{ description: 'Piano Practice backup', accept: { 'application/json': ['.json'] } }],
      })
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return null
      throw err
    }
  }
}

function unsupportedController(): BackupController {
  const none = async () => {}
  return {
    status: signal({ kind: 'unsupported' as const }),
    prompt: signal(null),
    init: none,
    choose: none,
    resume: none,
    stop: none,
    resolvePrompt: none,
    flush: none,
  }
}

export const backup: BackupController = backupSupported
  ? createBackup({
      store: idbHandleStore(),
      // An arrow, so the picker keeps `window` as `this`.
      pick: pickWith((o) => window.showSaveFilePicker(o)),
      now: Date.now,
    })
  : unsupportedController()

/** Catches the file up on start and flushes when the tab is hidden. No-op where unsupported. */
export function startBackup(app: ReadonlySignal<AppState>): void {
  if (!backupSupported) return
  void backup.init(app)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void backup.flush()
  })
}
