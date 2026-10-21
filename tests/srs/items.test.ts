import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  chordsId,
  enabledScales,
  idsForScale,
  parseId,
  placeItems,
  recallId,
  scaleId,
  stateFor,
} from '../../src/srs/items'
import type { Settings } from '../../src/srs/items'
import { MAJOR_ROOTS, MINOR_ROOTS } from '../../src/theory/scales'
import type { ScaleRef } from '../../src/theory/scales'

const ALL_MINORS: Settings = {
  ...DEFAULT_SETTINGS,
  minorForms: { natural: true, harmonic: true, melodic: true },
}

describe('defaults', () => {
  it('matches the spec', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      sessionMinutes: 10,
      minorForms: { natural: true, harmonic: false, melodic: false },
      octaves: 2,
      startTempo: 60,
      droneOn: true,
      droneVolumeDb: -12,
      metronomeOn: false,
    })
  })
})

describe('ids', () => {
  it('builds ids', () => {
    expect(scaleId({ root: 'E', form: 'major' })).toBe('scale:E:major')
    expect(recallId('keysig', { root: 'E', form: 'major' })).toBe('recall:keysig:E:major')
    expect(chordsId({ root: 'E', form: 'major' })).toBe('chords:E:major')
  })

  it('parses ids', () => {
    expect(parseId('recall:thumb:F#:natural')).toEqual({
      kind: 'recall',
      recallType: 'thumb',
      ref: { root: 'F#', form: 'natural' },
    })
    expect(parseId('scale:Eb:melodic')).toEqual({ kind: 'scale', ref: { root: 'Eb', form: 'melodic' } })
    expect(parseId('chords:Bb:major')).toEqual({ kind: 'chords', ref: { root: 'Bb', form: 'major' } })
  })

  it('round-trips every id for all 48 scale refs', () => {
    const refs: ScaleRef[] = [
      ...MAJOR_ROOTS.map((root) => ({ root, form: 'major' as const })),
      ...(['natural', 'harmonic', 'melodic'] as const).flatMap((form) =>
        MINOR_ROOTS.map((root) => ({ root, form })),
      ),
    ]
    expect(refs).toHaveLength(48)
    for (const ref of refs) {
      const ids = idsForScale(ref)
      expect(ids).toHaveLength(6)
      expect(new Set(ids).size).toBe(6)
      expect(parseId(ids[0] as string)).toEqual({ kind: 'scale', ref })
      expect(parseId(ids[5] as string)).toEqual({ kind: 'chords', ref })
      for (const id of ids.slice(1, 5)) {
        const parsed = parseId(id)
        expect(parsed.kind).toBe('recall')
        expect(parsed.ref).toEqual(ref)
        expect(recallId(parsed.recallType!, parsed.ref)).toBe(id)
      }
    }
  })

  it('throws on malformed ids', () => {
    for (const bad of [
      '',
      'scale',
      'scale:E',
      'scale:E:dorian',
      'scale:H:major',
      'scale:E:major:x',
      'recall:E:major',
      'recall:bogus:E:major',
      'recall:thumb:E',
      'chords:E',
      'foo:E:major',
    ]) {
      expect(() => parseId(bad), bad).toThrow()
    }
  })
})

describe('enabledScales', () => {
  it('defaults to 12 majors + 12 natural minors', () => {
    const s = enabledScales(DEFAULT_SETTINGS)
    expect(s).toHaveLength(24)
    expect(s.slice(0, 12).map((r) => r.root)).toEqual(MAJOR_ROOTS)
    expect(s.slice(0, 12).every((r) => r.form === 'major')).toBe(true)
    expect(s.slice(12).map((r) => r.root)).toEqual(MINOR_ROOTS)
    expect(s.slice(12).every((r) => r.form === 'natural')).toBe(true)
  })

  it('has 48 with all forms, ordered natural, harmonic, melodic', () => {
    const s = enabledScales(ALL_MINORS)
    expect(s).toHaveLength(48)
    expect(s[12]).toEqual({ root: 'A', form: 'natural' })
    expect(s[24]).toEqual({ root: 'A', form: 'harmonic' })
    expect(s[36]).toEqual({ root: 'A', form: 'melodic' })
  })

  it('allows no minor forms (majors only)', () => {
    const s = enabledScales({ ...DEFAULT_SETTINGS, minorForms: { natural: false, harmonic: false, melodic: false } })
    expect(s).toHaveLength(12)
  })
})

describe('stateFor', () => {
  it('returns a fresh scale state seeded from startTempo', () => {
    expect(stateFor('scale:A:harmonic', {}, '2026-10-21', DEFAULT_SETTINGS)).toEqual({
      id: 'scale:A:harmonic',
      introduced: false,
      box: 1,
      support: 0,
      levelStreak: 0,
      due: '2026-10-21',
      tempo: 60,
      history: [],
    })
    expect(stateFor('scale:A:harmonic', {}, '2026-10-21', { ...DEFAULT_SETTINGS, startTempo: 72 }).tempo).toBe(72)
  })

  it('has no tempo for recall and chord items', () => {
    expect(stateFor('recall:spell:E:major', {}, '2026-10-21', DEFAULT_SETTINGS)).not.toHaveProperty('tempo')
    expect(stateFor('chords:E:major', {}, '2026-10-21', DEFAULT_SETTINGS)).not.toHaveProperty('tempo')
  })

  it('returns the stored state when present', () => {
    const stored = placeItems({ 'scale:E:major': 'solid' }, DEFAULT_SETTINGS, '2026-10-20')
    expect(stateFor('scale:E:major', stored, '2026-10-25', DEFAULT_SETTINGS)).toBe(stored['scale:E:major'])
  })
})

describe('placeItems', () => {
  const items = placeItems(
    { 'scale:E:major': 'solid', 'scale:B:major': 'unknown', 'scale:A:natural': 'shaky' },
    DEFAULT_SETTINGS,
    '2026-10-20',
  )

  it('places solid at box 3 / L2 / introduced', () => {
    expect(items['scale:E:major']).toMatchObject({
      box: 3,
      support: 2,
      introduced: true,
      due: '2026-10-20',
      tempo: 60,
      levelStreak: 0,
      history: [],
    })
    expect(items['recall:spell:E:major']).toMatchObject({ box: 3, introduced: true, support: 0 })
    expect(items['recall:spell:E:major']).not.toHaveProperty('tempo')
    expect(items['chords:E:major']).toMatchObject({ box: 3, introduced: true, support: 0 })
  })

  it("places unknown at box 1 / L0 / not introduced", () => {
    expect(items['scale:B:major']).toMatchObject({ box: 1, support: 0, introduced: false })
    expect(items['chords:B:major']).toMatchObject({ box: 1, introduced: false })
  })

  it('places shaky at box 1 / L0 / introduced', () => {
    expect(items['scale:A:natural']).toMatchObject({ box: 1, support: 0, introduced: true, due: '2026-10-20' })
    expect(items['recall:thumb:A:natural']).toMatchObject({ box: 1, introduced: true })
  })

  it('treats missing choices as unknown and places every enabled scale (6 items each)', () => {
    expect(items['scale:C:major']).toMatchObject({ box: 1, introduced: false })
    expect(Object.keys(items)).toHaveLength(24 * 6)
    expect(Object.values(items).every((s) => s.due === '2026-10-20')).toBe(true)
  })

  it('only places enabled scales and seeds tempo from settings', () => {
    expect(items).not.toHaveProperty('scale:A:harmonic')
    const s = placeItems({}, { ...DEFAULT_SETTINGS, startTempo: 50 }, '2026-10-20')
    expect(s['scale:C:major']?.tempo).toBe(50)
  })

  it('keys each state by its id', () => {
    for (const [k, v] of Object.entries(items)) expect(v.id).toBe(k)
  })
})
