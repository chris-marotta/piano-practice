// Auto-backup controller: the browser-free state machine behind the backup file (spec §5–§7).
// No window/navigator/document. The file handle, its store and the Save dialog are injected,
// so this runs (and is tested) in node; src/backup/fileBackup.ts wires it to Chrome.
import { effect, signal, type ReadonlySignal } from '@preact/signals'
import { BACKUP_DEBOUNCE_MS, checkBackupFile } from '../store/backup'
import { exportState, type AppState } from '../store/storage'

export type BackupStatus =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'on'; name: string; savedAt: number | null } // savedAt: epoch ms of the last good write
  | { kind: 'paused'; name: string }
  | { kind: 'failed'; name: string }

export type BackupPrompt = { kind: 'ahead'; file: AppState } | { kind: 'foreign' }

export interface BackupHandle {
  readonly name: string
  getFile(): Promise<{ text(): Promise<string> }>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission(d: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(d: { mode: 'readwrite' }): Promise<PermissionState>
}

export interface HandleStore {
  get(): Promise<BackupHandle | null>
  set(h: BackupHandle): Promise<void>
  clear(): Promise<void>
}

export interface BackupDeps {
  store: HandleStore
  /** The Save dialog. Resolves null when the user cancels. */
  pick(): Promise<BackupHandle | null>
  now(): number
}

export interface BackupController {
  readonly status: ReadonlySignal<BackupStatus>
  readonly prompt: ReadonlySignal<BackupPrompt | null>
  init(app: ReadonlySignal<AppState>): Promise<void>
  choose(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  resolvePrompt(choice: 'import' | 'replace' | 'cancel'): Promise<void>
  flush(): Promise<void>
}

const RW = { mode: 'readwrite' } as const

export function createBackup(deps: BackupDeps): BackupController {
  const status = signal<BackupStatus>({ kind: 'off' })
  const prompt = signal<BackupPrompt | null>(null)

  let app: ReadonlySignal<AppState> | null = null
  let dispose: (() => void) | null = null
  let handle: BackupHandle | null = null
  let guardPassed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  /** The running write loop, if any. Writes never overlap. */
  let running: Promise<void> | null = null
  /** One write is waiting behind the running one (only one is kept). */
  let queued = false
  // Bumped on stop, on a handle swap and on every guard run. A read or write that started under
  // an older generation finishes silently: it never changes status (R3) and never closes, so a
  // write abandoned mid-flight never commits to the file.
  let gen = 0

  const canWrite = () =>
    handle !== null && app !== null && guardPassed && status.peek().kind === 'on'

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function schedule() {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void requestWrite()
    }, BACKUP_DEBOUNCE_MS)
  }

  /** Invalidates everything in flight for the current handle. */
  function invalidate() {
    gen++
    guardPassed = false
    queued = false
    clearTimer()
  }

  async function writeOnce(): Promise<void> {
    const h = handle
    if (!h || !app || !canWrite()) return
    const g = gen
    try {
      const w = await h.createWritable()
      if (g !== gen) return
      await w.write(exportState(app.peek())) // the state as it is now, not when the write was asked for
      if (g !== gen) return
      await w.close()
      if (g !== gen) return
      status.value = { kind: 'on', name: h.name, savedAt: deps.now() }
    } catch {
      if (g === gen) status.value = { kind: 'failed', name: h.name }
    }
  }

  async function drain(): Promise<void> {
    await null // lets the caller assign `running` before this loop can clear it
    try {
      while (queued) {
        queued = false
        await writeOnce()
      }
    } finally {
      running = null
    }
  }

  /** Asks for a write now. Resolves when this and any queued write have finished. */
  function requestWrite(): Promise<void> {
    if (!canWrite()) return running ?? Promise.resolve()
    queued = true
    running ??= drain()
    return running
  }

  /** Spec §7: never overwrite a file holding progress this browser lacks. */
  async function runGuard(): Promise<void> {
    const h = handle
    if (!h || !app) return
    invalidate()
    const g = gen
    let text: string
    try {
      text = await (await h.getFile()).text()
    } catch {
      if (g === gen) status.value = { kind: 'failed', name: h.name }
      return
    }
    if (g !== gen) return
    const check = checkBackupFile(text, app.peek())
    if (check.kind === 'ok') {
      guardPassed = true
      prompt.value = null
      status.value = { kind: 'on', name: h.name, savedAt: null }
      await requestWrite()
    } else {
      prompt.value = check
      status.value = { kind: 'paused', name: h.name }
    }
  }

  function subscribe(a: ReadonlySignal<AppState>) {
    dispose?.()
    let first = true
    dispose = effect(() => {
      void a.value // the only tracked read
      if (first) {
        first = false // R2: subscribing is not a change; the start-up write is the guard's
        return
      }
      if (canWrite()) schedule()
    })
  }

  return {
    status,
    prompt,

    async init(a) {
      app = a
      let stored: BackupHandle | null
      try {
        stored = await deps.store.get()
      } catch {
        status.value = { kind: 'unsupported' }
        return
      }
      subscribe(a) // R4: every state but unsupported
      if (!stored) {
        status.value = { kind: 'off' }
        return
      }
      handle = stored
      let perm: PermissionState
      try {
        perm = await stored.queryPermission(RW)
      } catch {
        perm = 'denied'
      }
      if (handle !== stored) return // stop() or choose() ran meanwhile
      if (perm === 'granted') await runGuard()
      else if (perm === 'prompt') status.value = { kind: 'paused', name: stored.name }
      else status.value = { kind: 'failed', name: stored.name }
    },

    async choose() {
      let picked: BackupHandle | null
      try {
        picked = await deps.pick()
      } catch {
        invalidate()
        status.value = { kind: 'failed', name: handle?.name ?? '' }
        return
      }
      if (!picked) return // cancelled: nothing changes
      invalidate()
      handle = picked
      prompt.value = null
      try {
        await deps.store.set(picked)
      } catch {
        if (handle === picked) status.value = { kind: 'failed', name: picked.name }
        return
      }
      if (handle === picked) await runGuard()
    },

    async resume() {
      const h = handle
      if (!h) return
      let perm: PermissionState
      try {
        perm = await h.requestPermission(RW)
      } catch {
        perm = 'denied'
      }
      if (h !== handle) return
      if (perm === 'granted') await runGuard()
      else if (perm === 'denied') status.value = { kind: 'failed', name: h.name }
      // 'prompt': dismissed, stays as it was
    },

    async stop() {
      if (status.peek().kind === 'unsupported') return
      invalidate() // drops the pending timer and any queued write
      handle = null
      prompt.value = null
      status.value = { kind: 'off' }
      await deps.store.clear() // forgets the handle; never touches the file
    },

    async resolvePrompt(choice) {
      const h = handle
      if (!h || prompt.peek() === null) return
      prompt.value = null
      if (choice === 'cancel') return
      guardPassed = true
      status.value = { kind: 'on', name: h.name, savedAt: null }
      // 'import': the caller imports next, and that app change schedules the write.
      if (choice === 'replace') await requestWrite()
    },

    async flush() {
      if (timer !== null) {
        clearTimer()
        await requestWrite()
      } else if (running) {
        await running
      }
    },
  }
}
