import { describe, expect, it } from 'vitest'
import {
  BACKUP_KEY,
  STORAGE_KEY,
  emptyState,
  exportState,
  loadState,
  parseImport,
  saveState,
  type AppState,
} from '../../src/store/storage'
import { DEFAULT_SETTINGS } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

const throwingStorage = {
  length: 0,
  clear() {
    throw new Error('denied')
  },
  getItem() {
    throw new Error('denied')
  },
  key() {
    throw new Error('denied')
  },
  removeItem() {
    throw new Error('denied')
  },
  setItem() {
    throw new Error('denied')
  },
} as unknown as Storage

const item = (id: string, over: Partial<ItemState> = {}): ItemState => ({
  id,
  introduced: true,
  box: 2,
  support: 1,
  levelStreak: 1,
  due: '2026-10-21',
  history: [{ date: '2026-10-20', rating: 'nailed' }],
  ...over,
})

const populated = (): AppState => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS, sessionMinutes: 15, minorForms: { natural: true, harmonic: true, melodic: false } },
  items: { 'scale:C:major': item('scale:C:major', { tempo: 68 }), 'chords:A:natural': item('chords:A:natural') },
  log: [{ date: '2026-10-20', minutes: 10, completed: true }],
  placedAt: '2026-10-19',
})

describe('emptyState', () => {
  it('has version 1, default settings, nothing else', () => {
    expect(emptyState()).toEqual({ version: 1, settings: DEFAULT_SETTINGS, items: {}, log: [], placedAt: null })
  })
  it('does not share nested objects with DEFAULT_SETTINGS', () => {
    const s = emptyState()
    s.settings.minorForms.harmonic = true
    expect(DEFAULT_SETTINGS.minorForms.harmonic).toBe(false)
    expect(emptyState().settings.minorForms.harmonic).toBe(false)
  })
})

describe('loadState', () => {
  it('null storage: in memory with a "won\'t be saved" notice', () => {
    expect(loadState(null)).toMatchObject({
      state: emptyState(),
      persistent: false,
      notice: expect.stringContaining("won't be saved"),
    })
  })

  it('throwing storage is not persistent', () => {
    const r = loadState(throwingStorage)
    expect(r.persistent).toBe(false)
    expect(r.state).toEqual(emptyState())
    expect(r.notice).toContain("won't be saved")
  })

  it('nothing stored: empty state, persistent, no notice', () => {
    expect(loadState(fakeStorage())).toEqual({ state: emptyState(), persistent: true, notice: null })
  })

  it('bad JSON: empty state, raw blob backed up, notice', () => {
    const bad = fakeStorage({ [STORAGE_KEY]: '{not json' })
    const r = loadState(bad)
    expect(r.state).toEqual(emptyState())
    expect(r.persistent).toBe(true)
    expect(bad.getItem(BACKUP_KEY)).toBe('{not json')
    expect(r.notice).toBeTruthy()
  })

  it('wrong version: empty state, backed up, notice', () => {
    const raw = JSON.stringify({ version: 99 })
    const s = fakeStorage({ [STORAGE_KEY]: raw })
    const r = loadState(s)
    expect(r.state).toEqual(emptyState())
    expect(r.notice).toBeTruthy()
    expect(s.getItem(BACKUP_KEY)).toBe(raw)
  })

  it('bad shape: backed up and starts fresh', () => {
    const raw = JSON.stringify({ ...populated(), items: { 'scale:C:major': { id: 'scale:C:major', box: 9 } } })
    const s = fakeStorage({ [STORAGE_KEY]: raw })
    const r = loadState(s)
    expect(r.state).toEqual(emptyState())
    expect(r.notice).toBeTruthy()
    expect(s.getItem(BACKUP_KEY)).toBe(raw)
  })

  it('item whose key does not match its id is rejected', () => {
    const st = populated()
    st.items['scale:G:major'] = item('scale:D:major')
    const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify(st) })
    expect(loadState(s).state).toEqual(emptyState())
  })

  it('unparseable item keys are accepted (parseId is not called)', () => {
    const st = populated()
    st.items['weird-key'] = item('weird-key')
    const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify(st) })
    const r = loadState(s)
    expect(r.notice).toBeNull()
    expect(r.state.items['weird-key']).toBeDefined()
  })

  it('corrupt blob with unwritable backup still returns a fresh state', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{nope' })
    s.setItem = () => {
      throw new Error('quota')
    }
    const r = loadState(s)
    expect(r.state).toEqual(emptyState())
    expect(r.notice).toBeTruthy()
    expect(r.persistent).toBe(true)
  })

  it('round-trips a saved state', () => {
    const s = fakeStorage()
    const st = populated()
    expect(saveState(s, st)).toBe(true)
    expect(loadState(s)).toEqual({ state: st, persistent: true, notice: null })
  })

  it('merges stored settings over defaults, including nested minorForms', () => {
    const st = populated()
    const stored = {
      ...st,
      settings: { sessionMinutes: 5, minorForms: { harmonic: true } },
    }
    const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) })
    const r = loadState(s)
    expect(r.notice).toBeNull()
    expect(r.state.settings).toEqual({
      ...DEFAULT_SETTINGS,
      sessionMinutes: 5,
      minorForms: { natural: true, harmonic: true, melodic: false },
    })
    r.state.settings.minorForms.melodic = true
    expect(DEFAULT_SETTINGS.minorForms.melodic).toBe(false)
  })
})

describe('saveState', () => {
  it('writes JSON under STORAGE_KEY', () => {
    const s = fakeStorage()
    expect(saveState(s, emptyState())).toBe(true)
    expect(JSON.parse(s.getItem(STORAGE_KEY)!)).toEqual(emptyState())
  })
  it('returns false when storage throws or is null', () => {
    expect(saveState(throwingStorage, emptyState())).toBe(false)
    expect(saveState(null, emptyState())).toBe(false)
  })
})

describe('export / import', () => {
  it('round-trips empty state', () => {
    expect(parseImport(exportState(emptyState()))).toEqual({ ok: true, state: emptyState() })
  })
  it('round-trips populated state', () => {
    expect(parseImport(exportState(populated()))).toEqual({ ok: true, state: populated() })
  })
  it('export is pretty-printed', () => {
    expect(exportState(emptyState())).toContain('\n  "version": 1')
  })
  it('rejects missing fields', () => {
    expect(parseImport('{"version":1}')).toMatchObject({ ok: false })
  })
  it('rejects bad JSON with a short human message', () => {
    const r = parseImport('nope')
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error.length).toBeLessThan(80)
  })
  it('rejects non-objects and arrays', () => {
    expect(parseImport('null')).toMatchObject({ ok: false })
    expect(parseImport('[]')).toMatchObject({ ok: false })
    expect(parseImport('42')).toMatchObject({ ok: false })
  })
  it('rejects wrong version', () => {
    expect(parseImport(JSON.stringify({ ...populated(), version: 2 }))).toMatchObject({ ok: false })
  })
  it('rejects bad item fields', () => {
    for (const bad of [
      { box: 0 },
      { box: 6 },
      { support: 4 },
      { support: -1 },
      { levelStreak: 'x' },
      { introduced: 1 },
      { due: 'tomorrow' },
      { history: {} },
    ]) {
      const st = populated()
      st.items['scale:C:major'] = { ...st.items['scale:C:major']!, ...bad } as ItemState
      expect(parseImport(JSON.stringify(st)), JSON.stringify(bad)).toMatchObject({ ok: false })
    }
  })
  it('rejects bad log entries and placedAt', () => {
    expect(parseImport(JSON.stringify({ ...populated(), log: [{ date: '2026-10-20', minutes: '5', completed: true }] }))).toMatchObject({ ok: false })
    expect(parseImport(JSON.stringify({ ...populated(), log: {} }))).toMatchObject({ ok: false })
    expect(parseImport(JSON.stringify({ ...populated(), placedAt: 5 }))).toMatchObject({ ok: false })
  })
  it('rejects items that is an array', () => {
    expect(parseImport(JSON.stringify({ ...populated(), items: [] }))).toMatchObject({ ok: false })
  })
  it('merges missing settings with defaults on import', () => {
    const r = parseImport(JSON.stringify({ ...populated(), settings: { droneOn: false } }))
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.state.settings).toEqual({ ...DEFAULT_SETTINGS, droneOn: false })
  })
})
