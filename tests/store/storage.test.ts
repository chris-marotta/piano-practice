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

describe('playLabels setting', () => {
  const load = (settings: object) =>
    loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...populated(), settings }) })).state.settings
  it('defaults to names', () => {
    expect(emptyState().settings.playLabels).toBe('names')
    expect(load({}).playLabels).toBe('names')
  })
  it('a missing or invalid value becomes names', () => {
    for (const bad of [undefined, 'bogus', 3, null, true, '']) expect(load({ playLabels: bad }).playLabels).toBe('names')
  })
  it('off, names and degrees round-trip', () => {
    for (const v of ['off', 'names', 'degrees']) expect(load({ playLabels: v }).playLabels).toBe(v)
  })
})

describe('lastDrillLevel setting', () => {
  const load = (settings: object) =>
    loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...populated(), settings }) })).state.settings
  it('defaults to 1, also for state saved before phase 3', () => {
    expect(emptyState().settings.lastDrillLevel).toBe(1)
    expect(load({}).lastDrillLevel).toBe(1)
  })
  it('a missing or invalid value becomes 1', () => {
    for (const bad of [undefined, 0, 5, 2.5, '2', null, true]) expect(load({ lastDrillLevel: bad }).lastDrillLevel).toBe(1)
  })
  it('1 to 4 round-trip', () => {
    for (const v of [1, 2, 3, 4]) expect(load({ lastDrillLevel: v }).lastDrillLevel).toBe(v)
  })
})

describe('ear settings', () => {
  const load = (settings: object) =>
    loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...populated(), settings }) })).state.settings
  it('a save without ear fields loads with the defaults', () => {
    expect(load({})).toMatchObject({ earExactOctave: false, lastEarLevel: 1 })
  })
  it('invalid values fall back to the defaults', () => {
    for (const bad of [7, '2', null, 0, 2.5]) expect(load({ lastEarLevel: bad }).lastEarLevel).toBe(1)
    for (const bad of [undefined, 'yes', 1, null]) expect(load({ earExactOctave: bad }).earExactOctave).toBe(false)
  })
  it('valid values are kept', () => {
    expect(load({ earExactOctave: true }).earExactOctave).toBe(true)
    for (const v of [1, 2, 3, 4, 5, 6]) expect(load({ lastEarLevel: v }).lastEarLevel).toBe(v)
  })
})

describe('staff settings', () => {
  const load = (settings: object) =>
    loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...populated(), settings }) })).state.settings
  it('a phase 3 save (no staff fields) loads with exact octave off and level 1', () => {
    expect(emptyState().settings).toMatchObject({ staffExactOctave: false, lastStaffLevel: 1 })
    expect(load({ lastDrillLevel: 3 })).toMatchObject({ staffExactOctave: false, lastStaffLevel: 1, lastDrillLevel: 3 })
  })
  it('invalid values fall back to the defaults', () => {
    for (const bad of [undefined, 'yes', 1, null]) expect(load({ staffExactOctave: bad }).staffExactOctave).toBe(false)
    for (const bad of [undefined, 0, 7, 2.5, '2', null, true]) expect(load({ lastStaffLevel: bad }).lastStaffLevel).toBe(1)
  })
  it('valid values round-trip', () => {
    expect(load({ staffExactOctave: true }).staffExactOctave).toBe(true)
    for (const v of [1, 2, 3, 4, 5, 6]) expect(load({ lastStaffLevel: v }).lastStaffLevel).toBe(v)
  })
  it('keeps staff items in a stored state', () => {
    const state = populated()
    const id = 'staff:treble:C4'
    state.items[id] = { id, introduced: true, box: 2, support: 0, levelStreak: 0, due: '2026-10-20', history: [] }
    const loaded = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify(state) })).state
    expect(loaded.items[id]?.box).toBe(2)
  })
})

describe('MIDI settings', () => {
  it('defaults: midiEnabled false, keyboardSound true', () => {
    expect(emptyState().settings).toMatchObject({ midiEnabled: false, keyboardSound: true })
  })

  it('wrong-typed values fall back per field', () => {
    const stored = { ...populated(), settings: { midiEnabled: 'yes', keyboardSound: 0 } }
    const r = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) }))
    expect(r.state.settings).toMatchObject({ midiEnabled: false, keyboardSound: true })
  })

  it('valid booleans round-trip', () => {
    const stored = { ...populated(), settings: { midiEnabled: true, keyboardSound: false } }
    const r = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) }))
    expect(r.state.settings).toMatchObject({ midiEnabled: true, keyboardSound: false })
  })
})

describe('settings.octaves from before phase 3', () => {
  it('a stored octaves: 2 loads without error and the merged settings have no octaves key', () => {
    const stored = { ...populated(), settings: { sessionMinutes: 20, octaves: 2 } }
    const r = loadState(fakeStorage({ [STORAGE_KEY]: JSON.stringify(stored) }))
    expect(r.notice).toBeNull()
    expect(r.state.settings.sessionMinutes).toBe(20)
    expect('octaves' in r.state.settings).toBe(false)
  })
})

describe('validation hardening', () => {
  const badSettings = { sessionMinutes: 7, octaves: '2', startTempo: 'fast', minorForms: { harmonic: 'yes' }, bogus: 1 }
  const expectDefaults = (settings: AppState['settings']) => {
    expect(settings).toEqual(DEFAULT_SETTINGS)
    expect('bogus' in settings).toBe(false)
  }

  it('loadState: wrong-typed settings fall back per field and unknown keys are dropped', () => {
    const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...populated(), settings: badSettings }) })
    const r = loadState(s)
    expect(r.notice).toBeNull()
    expectDefaults(r.state.settings)
  })

  it('parseImport: same per-field fallback', () => {
    const r = parseImport(JSON.stringify({ ...populated(), settings: badSettings }))
    expect(r.ok).toBe(true)
    if (r.ok) expectDefaults(r.state.settings)
  })

  it('keeps valid settings fields and clamps startTempo to 40-120', () => {
    const mk = (settings: object) => {
      const r = parseImport(JSON.stringify({ ...populated(), settings }))
      if (!r.ok) throw new Error('import failed')
      return r.state.settings
    }
    const ok = mk({ sessionMinutes: 20, startTempo: 90, droneVolumeDb: -6, droneOn: false, metronomeOn: true, minorForms: { natural: false, harmonic: true, melodic: true } })
    expect(ok).toEqual({ sessionMinutes: 20, startTempo: 90, droneVolumeDb: -6, droneOn: false, metronomeOn: true, midiEnabled: false, keyboardSound: true, playLabels: 'names', lastDrillLevel: 1, staffExactOctave: false, lastStaffLevel: 1, earExactOctave: false, lastEarLevel: 1, minorForms: { natural: false, harmonic: true, melodic: true } })
    expect(mk({ startTempo: 10 }).startTempo).toBe(40)
    expect(mk({ startTempo: 500 }).startTempo).toBe(120)
    expect(mk({ droneVolumeDb: 'loud', droneOn: 'yes', metronomeOn: 1 })).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects impossible calendar dates', () => {
    for (const due of ['2026-99-99', '2026-02-30', '2026-13-01', '2026-00-10']) {
      const st = populated()
      st.items['scale:C:major'] = { ...st.items['scale:C:major']!, due }
      expect(parseImport(JSON.stringify(st)), due).toMatchObject({ ok: false })
    }
    expect(parseImport(JSON.stringify({ ...populated(), log: [{ date: '2026-02-30', minutes: 5, completed: true }] }))).toMatchObject({ ok: false })
    const leap = populated()
    leap.log = [{ date: '2028-02-29', minutes: 5, completed: true }]
    expect(parseImport(JSON.stringify(leap))).toMatchObject({ ok: true })
  })

  it('levelStreak must be a non-negative integer', () => {
    for (const levelStreak of [-1, 1.5]) {
      const st = populated()
      st.items['scale:C:major'] = { ...st.items['scale:C:major']!, levelStreak }
      expect(parseImport(JSON.stringify(st)), String(levelStreak)).toMatchObject({ ok: false })
    }
    const st = populated()
    st.items['scale:C:major'] = { ...st.items['scale:C:major']!, levelStreak: 0 }
    expect(parseImport(JSON.stringify(st))).toMatchObject({ ok: true })
  })

  it('log minutes must be a finite number >= 0', () => {
    for (const minutes of [-1, null]) {
      const bad = { ...populated(), log: [{ date: '2026-10-20', minutes, completed: true }] }
      expect(parseImport(JSON.stringify(bad)), String(minutes)).toMatchObject({ ok: false })
    }
    const zero = { ...populated(), log: [{ date: '2026-10-20', minutes: 0, completed: false }] }
    expect(parseImport(JSON.stringify(zero))).toMatchObject({ ok: true })
  })

  it('does not overwrite an existing backup on a corrupt load', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{second', [BACKUP_KEY]: '{first' })
    const r = loadState(s)
    expect(r.notice).toBeTruthy()
    expect(s.getItem(BACKUP_KEY)).toBe('{first')
  })
})

