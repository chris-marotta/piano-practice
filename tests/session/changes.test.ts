import { describe, expect, it } from 'vitest'
import { sessionChanges } from '../../src/session/changes'
import { chordsId, DEFAULT_SETTINGS, keyId, placeItems, recallId, scaleId, stateFor } from '../../src/srs/items'
import type { ItemState } from '../../src/srs/scheduler'

const TODAY = '2026-10-20'
const E = { root: 'E', form: 'major' as const }
const Fs = { root: 'F#', form: 'major' as const }

const base = placeItems({ [scaleId(E)]: 'solid', [scaleId(Fs)]: 'shaky' }, DEFAULT_SETTINGS, TODAY)
const set = (items: Record<string, ItemState>, id: string, patch: Partial<ItemState>) => ({
  ...items,
  [id]: { ...(items[id] as ItemState), ...patch },
})

describe('sessionChanges', () => {
  it('lists box moves up and down with the scale name', () => {
    let after = set(base, scaleId(E), { box: 4 })
    after = set(after, scaleId(Fs), { box: 1 })
    after = set(after, scaleId(Fs), { box: 1 })
    const before = set(base, scaleId(Fs), { box: 2 })
    const out = sessionChanges([scaleId(E), scaleId(Fs)], before, after, TODAY, DEFAULT_SETTINGS)
    expect(out.map((c) => c.text)).toEqual(['E major ↑ box 3 → 4', 'F♯ major ↓ box 2 → 1'])
    expect(out.map((c) => c.direction)).toEqual(['up', 'down'])
  })

  it('lists support changes separately from box changes', () => {
    const after = set(base, scaleId(E), { box: 4, support: 3 })
    const out = sessionChanges([scaleId(E)], base, after, TODAY, DEFAULT_SETTINGS)
    expect(out.map((c) => c.text)).toEqual(['E major ↑ box 3 → 4', 'E major ↑ support L2 → L3'])
  })

  it('names recall cards and chord sets', () => {
    let after = set(base, recallId('keysig', E), { box: 4 })
    after = set(after, chordsId(E), { box: 4 })
    after = set(after, recallId('thumb', E), { box: 1 })
    const ids = [recallId('keysig', E), recallId('thumb', E), chordsId(E)]
    expect(sessionChanges(ids, base, after, TODAY, DEFAULT_SETTINGS).map((c) => c.text)).toEqual([
      'E major chords ↑ box 3 → 4',
      'E major key signature card ↑ box 3 → 4',
      'E major thumb notes card ↓ box 3 → 1',
    ])
  })

  it('lists scales first, then chord sets, then recall cards, session order within each', () => {
    let after = set(base, recallId('keysig', E), { box: 4 })
    after = set(after, chordsId(E), { box: 4 })
    after = set(after, scaleId(E), { box: 4 })
    after = set(after, scaleId(Fs), { box: 2 })
    const ids = [recallId('keysig', E), scaleId(E), chordsId(E), scaleId(Fs)]
    expect(sessionChanges(ids, base, after, TODAY, DEFAULT_SETTINGS).map((c) => c.name)).toEqual([
      'E major',
      'F♯ major',
      'E major chords',
      'E major key signature card',
    ])
  })

  it('omits unchanged items (shaky keeps the box)', () => {
    const after = set(base, scaleId(E), { due: '2026-10-21', history: [{ date: TODAY, rating: 'shaky' }] })
    expect(sessionChanges([scaleId(E)], base, after, TODAY, DEFAULT_SETTINGS)).toEqual([])
  })

  it('treats an item missing before the session as new (box 1, L0)', () => {
    const ref = { root: 'A', form: 'harmonic' as const }
    const after = { ...base, [scaleId(ref)]: { ...(base[scaleId(E)] as ItemState), id: scaleId(ref), box: 2 as const, support: 0 as const } }
    expect(sessionChanges([scaleId(ref)], base, after, TODAY, DEFAULT_SETTINGS).map((c) => c.text)).toEqual([
      'A harmonic minor ↑ box 1 → 2',
    ])
  })

  it('skips ids with no state after, and lists each id once', () => {
    const after = set(base, scaleId(E), { box: 4 })
    const ref = { root: 'A', form: 'harmonic' as const }
    expect(sessionChanges([scaleId(E), scaleId(E), scaleId(ref)], base, after, TODAY, DEFAULT_SETTINGS)).toHaveLength(1)
  })

  it('names a key change "Key {label}", and sorts keys after recall cards', () => {
    const after = set(set(base, recallId('keysig', E), { box: 4 }), scaleId(E), { box: 4 })
    const keys = {
      ...after,
      [keyId(4)]: { ...stateFor(keyId(4), {}, TODAY, DEFAULT_SETTINGS), box: 2 as const },
      [keyId(8)]: { ...stateFor(keyId(8), {}, TODAY, DEFAULT_SETTINGS), box: 2 as const },
    }
    const out = sessionChanges([keyId(8), keyId(4), recallId('keysig', E), scaleId(E)], base, keys, TODAY, DEFAULT_SETTINGS)
    expect(out.map((c) => c.id)).toEqual([scaleId(E), recallId('keysig', E), keyId(8), keyId(4)])
    const e = out.find((c) => c.id === keyId(4))
    expect(e?.name).toBe('Key E')
    expect(e?.text).toBe('Key E ↑ box 1 → 2')
    expect(out.find((c) => c.id === keyId(8))?.text).toBe('Key G♯ / A♭ ↑ box 1 → 2')
  })
})
