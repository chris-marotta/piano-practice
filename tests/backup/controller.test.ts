import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signal } from '@preact/signals'
import {
  createBackup,
  type BackupController,
  type BackupHandle,
  type HandleStore,
} from '../../src/backup/controller'
import { emptyState, exportState, parseImport, type AppState } from '../../src/store/storage'
import type { ItemState } from '../../src/srs/scheduler'

// ---- state builders (mirrors tests/store/backup.test.ts) ----

function item(id: string, historyLength: number): ItemState {
  return {
    id,
    introduced: true,
    box: 1,
    support: 0,
    levelStreak: 0,
    due: '2026-11-06',
    history: Array.from({ length: historyLength }, (_, i) => ({
      date: `2026-11-0${(i % 9) + 1}`,
      rating: 'nailed' as const,
    })),
  }
}

function stateWith(opts: { log?: number; placedAt?: string | null; items?: [string, number][] }): AppState {
  const s = emptyState()
  s.log = Array.from({ length: opts.log ?? 0 }, (_, i) => ({
    date: `2026-11-0${(i % 9) + 1}`,
    minutes: 10,
    completed: true,
  }))
  s.placedAt = opts.placedAt ?? null
  for (const [id, n] of opts.items ?? []) s.items[id] = item(id, n)
  return s
}

// ---- fakes ----

type Permission = PermissionState | 'throw'

interface FakeHandle extends BackupHandle {
  /** Every string passed to write(), in order. */
  writes: string[]
  /** Contents at each close(): what actually lands in the file. */
  commits: string[]
  createWritableCalls: number
  getFileCalls: number
  requestPermissionCalls: number
  /** Most writables open at once. */
  maxOpen: number
  /** While true, each write() waits for release(). */
  holdWrites: boolean
  /** While true, each text() waits for release(). */
  holdReads: boolean
  release(): void
}

function fakeHandle(
  opts: {
    name?: string
    text?: string
    permission?: Permission
    requestResult?: Permission
    writeThrows?: boolean
    readThrows?: boolean
  } = {},
): FakeHandle {
  let open = 0
  let waiting: (() => void)[] = []
  const hold = () => new Promise<void>((r) => waiting.push(r))
  const h: FakeHandle = {
    name: opts.name ?? 'piano-practice-backup.json',
    writes: [],
    commits: [],
    createWritableCalls: 0,
    getFileCalls: 0,
    requestPermissionCalls: 0,
    maxOpen: 0,
    holdWrites: false,
    holdReads: false,
    release() {
      const w = waiting
      waiting = []
      for (const r of w) r()
    },
    async getFile() {
      h.getFileCalls++
      return {
        text: async () => {
          if (h.holdReads) await hold()
          if (opts.readThrows) throw new Error('read failed')
          return opts.text ?? ''
        },
      }
    },
    async createWritable() {
      h.createWritableCalls++
      open++
      h.maxOpen = Math.max(h.maxOpen, open)
      let buffer = ''
      return {
        write: async (data: string) => {
          h.writes.push(data)
          if (h.holdWrites) await hold()
          if (opts.writeThrows) {
            open--
            throw new Error('write failed')
          }
          buffer = data
        },
        close: async () => {
          open--
          h.commits.push(buffer)
        },
      }
    },
    async queryPermission() {
      if (opts.permission === 'throw') throw new Error('query failed')
      return opts.permission ?? 'granted'
    },
    async requestPermission() {
      h.requestPermissionCalls++
      if (opts.requestResult === 'throw') throw new Error('request failed')
      return opts.requestResult ?? 'granted'
    },
  }
  return h
}

interface FakeStore extends HandleStore {
  stored: BackupHandle | null
  setCalls: number
  clearCalls: number
}

function fakeStore(initial: BackupHandle | null | 'reject'): FakeStore {
  const s: FakeStore = {
    stored: initial === 'reject' ? null : initial,
    setCalls: 0,
    clearCalls: 0,
    async get() {
      if (initial === 'reject') throw new Error('no indexedDB')
      return s.stored
    },
    async set(h) {
      s.setCalls++
      s.stored = h
    },
    async clear() {
      s.clearCalls++
      s.stored = null
    },
  }
  return s
}

function setup(
  stored: BackupHandle | null | 'reject',
  pick: () => Promise<BackupHandle | null> = async () => null,
  initial: AppState = emptyState(),
) {
  const store = fakeStore(stored)
  const app = signal<AppState>(initial)
  const backup: BackupController = createBackup({ store, pick, now: () => 1_000 })
  return { store, app, backup }
}

/** A state one session ahead of `s`, so each call yields a distinct backup. */
function bump(s: AppState): AppState {
  return { ...s, log: [...s.log, { date: '2026-11-06', minutes: 5, completed: true }] }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('init', () => {
  it('init with no stored handle → off, no writes', async () => {
    const { backup, app } = setup(null)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'off' })
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(5000)
    expect(backup.status.value).toEqual({ kind: 'off' })
  })

  it('init when the store rejects → unsupported', async () => {
    const { backup, app } = setup('reject')
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'unsupported' })
  })

  it('init, permission prompt → paused, no read, no write', async () => {
    const h = fakeHandle({ permission: 'prompt' })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'paused', name: h.name })
    expect(h.getFileCalls).toBe(0)
    expect(h.createWritableCalls).toBe(0)
  })

  it('init, permission denied → failed', async () => {
    const h = fakeHandle({ permission: 'denied' })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'failed', name: h.name })
    expect(h.createWritableCalls).toBe(0)
  })

  it('init, queryPermission throws → failed', async () => {
    const h = fakeHandle({ permission: 'throw' })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'failed', name: h.name })
  })

  it('init, granted, empty file → on, one write equal to exportState(app.value), savedAt 1000', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h, undefined, stateWith({ log: 2 }))
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: 1000 })
    expect(h.writes).toEqual([exportState(app.value)])
    expect(h.commits).toEqual([exportState(app.value)])
  })

  it('R2: init, granted, empty file → still exactly one write after 5000 ms (subscribe run schedules nothing)', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h)
    await backup.init(app)
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.writes).toHaveLength(1)
    expect(h.createWritableCalls).toBe(1)
  })

  it('init, granted, file ahead → paused, prompt {kind:"ahead"} with the parsed file, no write', async () => {
    const fileText = exportState(stateWith({ log: 3, placedAt: '2026-11-01' }))
    const h = fakeHandle({ text: fileText })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'paused', name: h.name })
    const parsed = parseImport(fileText)
    if (!parsed.ok) throw new Error('fixture should parse')
    expect(backup.prompt.value).toEqual({ kind: 'ahead', file: parsed.state, mixed: false })
    expect(h.createWritableCalls).toBe(0)
  })

  it('I1: file ahead and current a strict subset → ahead prompt with mixed: false', async () => {
    const h = fakeHandle({ text: exportState(stateWith({ log: 3, items: [['a', 2], ['b', 1]] })) })
    const { backup, app } = setup(h, undefined, stateWith({ log: 1, items: [['a', 1]] }))
    await backup.init(app)
    const p = backup.prompt.value
    if (p?.kind !== 'ahead') throw new Error('expected an ahead prompt')
    expect(p.mixed).toBe(false)
  })

  it('I1: file ahead but current has an item the file lacks → ahead prompt with mixed: true', async () => {
    const h = fakeHandle({ text: exportState(stateWith({ log: 3, items: [['a', 2]] })) })
    const { backup, app } = setup(h, undefined, stateWith({ log: 1, items: [['a', 1], ['c', 1]] }))
    await backup.init(app)
    const p = backup.prompt.value
    if (p?.kind !== 'ahead') throw new Error('expected an ahead prompt')
    expect(p.mixed).toBe(true)
  })

  it('init, granted, foreign file → paused, prompt {kind:"foreign"}, no write', async () => {
    const h = fakeHandle({ text: 'my shopping list' })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'paused', name: h.name })
    expect(backup.prompt.value).toEqual({ kind: 'foreign' })
    expect(h.createWritableCalls).toBe(0)
  })

  it('init, granted, reading the file throws → failed, no write', async () => {
    const h = fakeHandle({ readThrows: true })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'failed', name: h.name })
    expect(h.createWritableCalls).toBe(0)
  })
})

describe('writes', () => {
  it('after on, three app changes within 2000 ms → exactly one more write, after 2000 ms from the last change, holding the last state', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(h.writes).toHaveLength(1)

    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(700)
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(700)
    app.value = bump(app.value)
    const last = app.value

    await vi.advanceTimersByTimeAsync(1999)
    expect(h.writes).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.writes).toHaveLength(2)
    expect(h.writes[1]).toBe(exportState(last))
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.writes).toHaveLength(2)
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: 1000 })
  })

  it('a write that throws → failed; later app changes call createWritable no more times', async () => {
    const h = fakeHandle({ writeThrows: true })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value).toEqual({ kind: 'failed', name: h.name })
    const calls = h.createWritableCalls
    expect(calls).toBe(1)
    for (let i = 0; i < 5; i++) {
      app.value = bump(app.value)
      await vi.advanceTimersByTimeAsync(2500)
    }
    expect(h.createWritableCalls).toBe(calls)
    expect(backup.status.value).toEqual({ kind: 'failed', name: h.name })
  })

  it('paused: app changes never call createWritable', async () => {
    const h = fakeHandle({ permission: 'prompt' })
    const { backup, app } = setup(h)
    await backup.init(app)
    for (let i = 0; i < 5; i++) {
      app.value = bump(app.value)
      await vi.advanceTimersByTimeAsync(2500)
    }
    await backup.flush()
    expect(h.createWritableCalls).toBe(0)
    expect(backup.status.value).toEqual({ kind: 'paused', name: h.name })
  })

  it('changes during an in-flight write → writes do not overlap; final file content is the last state', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h)
    await backup.init(app)
    h.holdWrites = true

    app.value = bump(app.value)
    const s1 = app.value
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.writes).toEqual([exportState(emptyState()), exportState(s1)]) // write 2 is in flight

    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(2000) // queued
    app.value = bump(app.value)
    const s3 = app.value
    await vi.advanceTimersByTimeAsync(2000) // still one queued
    expect(h.createWritableCalls).toBe(2)

    h.holdWrites = false
    h.release()
    await vi.runAllTimersAsync()

    expect(h.maxOpen).toBe(1)
    expect(h.createWritableCalls).toBe(3)
    expect(h.writes[2]).toBe(exportState(s3))
    expect(h.commits.at(-1)).toBe(exportState(s3))
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: 1000 })
  })
})

describe('stop', () => {
  it('stop with a pending debounce → advancing 5000 ms writes nothing; store cleared; status off', async () => {
    const h = fakeHandle()
    const { backup, app, store } = setup(h)
    await backup.init(app)
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(1000)
    await backup.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.writes).toHaveLength(1)
    expect(store.clearCalls).toBe(1)
    expect(store.stored).toBeNull()
    expect(backup.status.value).toEqual({ kind: 'off' })
    expect(backup.prompt.value).toBeNull()
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.createWritableCalls).toBe(1)
  })

  it('stop clears an open prompt', async () => {
    const h = fakeHandle({ text: 'not json' })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.prompt.value).toEqual({ kind: 'foreign' })
    await backup.stop()
    expect(backup.prompt.value).toBeNull()
    expect(backup.status.value).toEqual({ kind: 'off' })
  })

  it('R3: stop during an in-flight write → status stays off after it resolves, nothing committed, no more writes', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h)
    await backup.init(app)
    h.holdWrites = true
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(2000) // write 2 in flight
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(2000) // write 3 queued
    await backup.stop()
    h.holdWrites = false
    h.release()
    await vi.runAllTimersAsync()
    expect(backup.status.value).toEqual({ kind: 'off' })
    expect(h.createWritableCalls).toBe(2) // queued write dropped
    expect(h.commits).toHaveLength(1) // the abandoned write is never closed
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.createWritableCalls).toBe(2)
  })

  it('R3: stop while the guard is reading → its result does not resurrect status', async () => {
    const h = fakeHandle()
    h.holdReads = true
    const { backup, app } = setup(h)
    const initDone = backup.init(app)
    await vi.advanceTimersByTimeAsync(0)
    await backup.stop()
    h.release()
    await initDone
    await vi.runAllTimersAsync()
    expect(backup.status.value).toEqual({ kind: 'off' })
    expect(h.createWritableCalls).toBe(0)
  })
})

describe('choose', () => {
  it('choose, picker cancelled (pick → null) → status and store unchanged', async () => {
    const { backup, app, store } = setup(null, async () => null)
    await backup.init(app)
    await backup.choose()
    expect(backup.status.value).toEqual({ kind: 'off' })
    expect(store.setCalls).toBe(0)
    expect(store.stored).toBeNull()
  })

  it('choose, new handle with an empty file → store.set called, on, one write', async () => {
    const h = fakeHandle({ name: 'mine.json' })
    const { backup, app, store } = setup(null, async () => h)
    await backup.init(app)
    await backup.choose()
    expect(store.setCalls).toBe(1)
    expect(store.stored).toBe(h)
    expect(backup.status.value).toEqual({ kind: 'on', name: 'mine.json', savedAt: 1000 })
    expect(h.writes).toEqual([exportState(app.value)])
    // R4: changes after a later choose() are written.
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.writes).toHaveLength(2)
    expect(h.writes[1]).toBe(exportState(app.value))
  })

  it('choose, pick throws → failed', async () => {
    const { backup, app } = setup(null, async () => {
      throw new Error('boom')
    })
    await backup.init(app)
    await backup.choose()
    expect(backup.status.value.kind).toBe('failed')
  })

  it('R3: choose swaps the handle during an in-flight write → the old write does not change status', async () => {
    const old = fakeHandle({ name: 'old.json' })
    const next = fakeHandle({ name: 'new.json', text: 'foreign!' })
    const { backup, app } = setup(old, async () => next)
    await backup.init(app)
    old.holdWrites = true
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(2000) // old write in flight
    await backup.choose()
    expect(backup.status.value).toEqual({ kind: 'paused', name: 'new.json' })
    old.holdWrites = false
    old.release()
    await vi.runAllTimersAsync()
    expect(backup.status.value).toEqual({ kind: 'paused', name: 'new.json' })
    expect(backup.prompt.value).toEqual({ kind: 'foreign' })
    expect(next.createWritableCalls).toBe(0)
  })
})

describe('resume', () => {
  it('resume granted, file ok → on and writes', async () => {
    const h = fakeHandle({ permission: 'prompt', requestResult: 'granted' })
    const { backup, app } = setup(h)
    await backup.init(app)
    expect(backup.status.value.kind).toBe('paused')
    await backup.resume()
    expect(h.requestPermissionCalls).toBe(1)
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: 1000 })
    expect(h.writes).toEqual([exportState(app.value)])
    // R4: changes made after resume are written.
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.writes).toHaveLength(2)
  })

  it('resume denied → failed', async () => {
    const h = fakeHandle({ permission: 'prompt', requestResult: 'denied' })
    const { backup, app } = setup(h)
    await backup.init(app)
    await backup.resume()
    expect(backup.status.value).toEqual({ kind: 'failed', name: h.name })
    expect(h.createWritableCalls).toBe(0)
  })

  it('resume dismissed (prompt) → paused', async () => {
    const h = fakeHandle({ permission: 'prompt', requestResult: 'prompt' })
    const { backup, app } = setup(h)
    await backup.init(app)
    await backup.resume()
    expect(backup.status.value).toEqual({ kind: 'paused', name: h.name })
    expect(h.createWritableCalls).toBe(0)
  })
})

describe('resolvePrompt', () => {
  const aheadText = () => exportState(stateWith({ log: 4, placedAt: '2026-11-01', items: [['C-major', 3]] }))

  it("resolvePrompt('replace') → on, writes current state at once", async () => {
    const h = fakeHandle({ text: aheadText() })
    const { backup, app } = setup(h, undefined, stateWith({ log: 1 }))
    await backup.init(app)
    expect(backup.prompt.value?.kind).toBe('ahead')
    await backup.resolvePrompt('replace')
    expect(backup.prompt.value).toBeNull()
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: 1000 })
    expect(h.writes).toEqual([exportState(app.value)])
  })

  it("resolvePrompt('cancel') → paused, prompt null, no write", async () => {
    const h = fakeHandle({ text: aheadText() })
    const { backup, app } = setup(h)
    await backup.init(app)
    await backup.resolvePrompt('cancel')
    expect(backup.prompt.value).toBeNull()
    expect(backup.status.value).toEqual({ kind: 'paused', name: h.name })
    app.value = bump(app.value)
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.createWritableCalls).toBe(0)
  })

  it("resolvePrompt('import') then app.value = prompt.file → after 2000 ms one write equal to exportState(file); no new prompt", async () => {
    const h = fakeHandle({ text: aheadText() })
    const { backup, app } = setup(h)
    await backup.init(app)
    const p = backup.prompt.value
    if (p?.kind !== 'ahead') throw new Error('expected an ahead prompt')
    await backup.resolvePrompt('import')
    expect(backup.prompt.value).toBeNull()
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: null })
    expect(h.createWritableCalls).toBe(0)

    app.value = p.file
    await vi.advanceTimersByTimeAsync(1999)
    expect(h.writes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.writes).toEqual([exportState(p.file)])
    expect(backup.prompt.value).toBeNull()
    expect(h.getFileCalls).toBe(1)
    expect(backup.status.value).toEqual({ kind: 'on', name: h.name, savedAt: 1000 })
  })
})

describe('flush', () => {
  it('flush with a pending debounce → writes at once without advancing timers', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h)
    await backup.init(app)
    app.value = bump(app.value)
    await backup.flush()
    expect(h.writes).toHaveLength(2)
    expect(h.writes[1]).toBe(exportState(app.value))
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.writes).toHaveLength(2)
  })

  it('flush with nothing pending → no write', async () => {
    const h = fakeHandle()
    const { backup, app } = setup(h)
    await backup.init(app)
    await backup.flush()
    expect(h.writes).toHaveLength(1)
  })
})
