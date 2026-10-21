import { describe, expect, it } from 'vitest'
import {
  DRONE_DB_MAX,
  DRONE_DB_MIN,
  LENGTH_OPTIONS,
  OCTAVE_OPTIONS,
  TEMPO_MAX,
  TEMPO_MIN,
  TEMPO_STEP,
  clampDroneDb,
  clampTempo,
  exportFilename,
  importSummary,
  resetPlacement,
  routeAfterImport,
  withMinorForm,
  withSettings,
} from '../../src/ui/screens/settingsView'
import { DEFAULT_SETTINGS, enabledScales, placeItems, scaleId } from '../../src/srs/items'
import { emptyState, exportState, parseImport } from '../../src/store/storage'
import type { AppState } from '../../src/store/storage'
import { buildSession } from '../../src/session/builder'
import { formatDay } from '../../src/ui/formatDate'

const TODAY = '2026-10-20'

const placed = (): AppState => {
  const s = emptyState()
  const choices = Object.fromEntries(enabledScales(s.settings).map((r) => [scaleId(r), 'solid' as const]))
  return {
    ...s,
    items: placeItems(choices, s.settings, TODAY),
    placedAt: TODAY,
    log: [{ date: '2026-10-19', minutes: 10, completed: true }],
  }
}

describe('options', () => {
  it('session lengths 5/10/15/20, octaves 1/2', () => {
    expect(LENGTH_OPTIONS.map((o) => o.value)).toEqual([5, 10, 15, 20])
    expect(LENGTH_OPTIONS.map((o) => o.label)).toEqual(['5 min', '10 min', '15 min', '20 min'])
    expect(OCTAVE_OPTIONS.map((o) => o.value)).toEqual([1, 2])
  })
  it('tempo 40–120 step 4, drone −40…0 dB', () => {
    expect([TEMPO_MIN, TEMPO_MAX, TEMPO_STEP]).toEqual([40, 120, 4])
    expect([DRONE_DB_MIN, DRONE_DB_MAX]).toEqual([-40, 0])
  })
})

describe('clampTempo', () => {
  it('keeps values on the 4-step grid from 40 to 120', () => {
    expect(clampTempo(60)).toBe(60)
    expect(clampTempo(61)).toBe(60)
    expect(clampTempo(62)).toBe(64)
    expect(clampTempo(20)).toBe(40)
    expect(clampTempo(500)).toBe(120)
    expect(clampTempo(Number.NaN)).toBe(DEFAULT_SETTINGS.startTempo)
  })
})

describe('clampDroneDb', () => {
  it('rounds to whole dB within −40…0', () => {
    expect(clampDroneDb(-12)).toBe(-12)
    expect(clampDroneDb(-12.4)).toBe(-12)
    expect(clampDroneDb(-60)).toBe(-40)
    expect(clampDroneDb(6)).toBe(0)
    expect(clampDroneDb(Number.NaN)).toBe(DEFAULT_SETTINGS.droneVolumeDb)
  })
})

describe('withSettings', () => {
  it('returns new state and settings objects; the input and DEFAULT_SETTINGS are untouched', () => {
    const before = emptyState()
    const snapshot = structuredClone(before)
    const defaults = structuredClone(DEFAULT_SETTINGS)
    const after = withSettings(before, { sessionMinutes: 20, octaves: 1, metronomeOn: true })
    expect(after.settings).toMatchObject({ sessionMinutes: 20, octaves: 1, metronomeOn: true })
    expect(after.settings.minorForms).toEqual(before.settings.minorForms)
    expect(after).not.toBe(before)
    expect(after.settings).not.toBe(before.settings)
    expect(before).toEqual(snapshot)
    expect(DEFAULT_SETTINGS).toEqual(defaults)
  })
  it('clamps tempo and drone volume', () => {
    const s = withSettings(emptyState(), { startTempo: 130, droneVolumeDb: -55 })
    expect(s.settings.startTempo).toBe(120)
    expect(s.settings.droneVolumeDb).toBe(-40)
  })
  it('keeps items, log and placedAt', () => {
    const before = placed()
    const after = withSettings(before, { droneOn: false })
    expect(after.items).toBe(before.items)
    expect(after.log).toBe(before.log)
    expect(after.placedAt).toBe(TODAY)
  })
  it('a start tempo change rewrites the tempo of every never-practiced scale, and only those', () => {
    const before = placed()
    const practiced = 'scale:G:major'
    before.items[practiced] = {
      ...(before.items[practiced] as NonNullable<AppState['items'][string]>),
      tempo: 76,
      history: [{ date: TODAY, rating: 'nailed' }],
    }
    const after = withSettings(before, { startTempo: 72 })
    expect(after.settings.startTempo).toBe(72)
    expect(after.items['scale:C:major']?.tempo).toBe(72)
    expect(after.items['scale:A:natural']?.tempo).toBe(72)
    expect(after.items[practiced]?.tempo).toBe(76)
    expect(after.items['recall:keysig:C:major']?.tempo).toBeUndefined()
    expect(after.items['chords:C:major']?.tempo).toBeUndefined()
    expect(before.items['scale:C:major']?.tempo).toBe(60) // input untouched
    const steps = buildSession(after.items, after.settings, TODAY)
    const first = steps.find((st) => st.kind === 'scale')
    expect(first).toMatchObject({ itemId: 'scale:C:major', tempo: 72 })
  })
  it('the rewrite uses the clamped tempo', () => {
    const after = withSettings(placed(), { startTempo: 131 })
    expect(after.items['scale:C:major']?.tempo).toBe(120)
  })
})

describe('withMinorForm', () => {
  it('toggles one form in a new minorForms object', () => {
    const before = emptyState()
    const after = withMinorForm(before, 'harmonic', true)
    expect(after.settings.minorForms).toEqual({ natural: true, harmonic: true, melodic: false })
    expect(after.settings.minorForms).not.toBe(before.settings.minorForms)
    expect(before.settings.minorForms.harmonic).toBe(false)
    expect(DEFAULT_SETTINGS.minorForms.harmonic).toBe(false)
  })
  it('allows every form off (majors only)', () => {
    const after = withMinorForm(emptyState(), 'natural', false)
    expect(after.settings.minorForms).toEqual({ natural: false, harmonic: false, melodic: false })
    expect(enabledScales(after.settings)).toHaveLength(12)
  })
  it('RF4: enabling harmonic after placement still builds a session', () => {
    const after = withMinorForm(placed(), 'harmonic', true)
    expect(buildSession(after.items, after.settings, TODAY).length).toBeGreaterThan(0)
  })
})

describe('resetPlacement', () => {
  it('clears placedAt and items, keeps log and settings', () => {
    const before = withMinorForm(placed(), 'melodic', true)
    const after = resetPlacement(before)
    expect(after.placedAt).toBeNull()
    expect(after.items).toEqual({})
    expect(after.log).toEqual(before.log)
    expect(after.settings).toEqual(before.settings)
    expect(Object.keys(before.items).length).toBeGreaterThan(0) // input untouched
  })
})

describe('exportFilename', () => {
  it('is piano-practice-YYYY-MM-DD.json', () => {
    expect(exportFilename(TODAY)).toBe('piano-practice-2026-10-20.json')
  })
})

describe('importSummary', () => {
  it('names the placement date and counts items and sessions', () => {
    const state = placed()
    expect(importSummary(state)).toEqual({
      placed: formatDay(TODAY),
      items: Object.keys(state.items).length,
      sessions: 1,
    })
  })
  it('an unplaced backup says so', () => {
    expect(importSummary(emptyState())).toEqual({ placed: null, items: 0, sessions: 0 })
  })
  it('counts only completed sessions', () => {
    const s = { ...emptyState(), log: [{ date: TODAY, minutes: 2, completed: false }] }
    expect(importSummary(s).sessions).toBe(0)
  })
})

describe('routeAfterImport', () => {
  it('Today when placed, Placement otherwise', () => {
    expect(routeAfterImport(placed())).toBe('today')
    expect(routeAfterImport(emptyState())).toBe('placement')
  })
})

describe('export → import round trip', () => {
  it('parseImport(exportState(s)) gives back the same state', () => {
    const state = withSettings(withMinorForm(placed(), 'harmonic', true), { droneVolumeDb: -20, startTempo: 72 })
    const result = parseImport(exportState(state))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toEqual(state)
  })
})
