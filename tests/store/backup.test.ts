import { describe, expect, it } from 'vitest'
import { checkBackupFile, wouldLoseProgress } from '../../src/store/backup'
import { emptyState, exportState, parseImport, type AppState } from '../../src/store/storage'
import type { ItemState } from '../../src/srs/scheduler'

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

function stateWith(opts: {
  log?: number
  placedAt?: string | null
  items?: [string, number][]
}): AppState {
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

describe('wouldLoseProgress', () => {
  it('equal states → false', () => {
    const a = stateWith({ log: 2, placedAt: '2026-11-01', items: [['C-major', 2]] })
    const b = stateWith({ log: 2, placedAt: '2026-11-01', items: [['C-major', 2]] })
    expect(wouldLoseProgress(a, b)).toBe(false)
  })
  it('file has one more log entry → true', () => {
    expect(wouldLoseProgress(stateWith({ log: 3 }), stateWith({ log: 2 }))).toBe(true)
  })
  it('file placed, current not → true', () => {
    expect(wouldLoseProgress(stateWith({ placedAt: '2026-11-01' }), stateWith({}))).toBe(true)
  })
  it('file has an item id current lacks → true', () => {
    expect(
      wouldLoseProgress(
        stateWith({ items: [['a', 1], ['b', 1]] }),
        stateWith({ items: [['a', 1]] }),
      ),
    ).toBe(true)
  })
  it('same item, file history longer (3 vs 2) → true', () => {
    expect(wouldLoseProgress(stateWith({ items: [['a', 3]] }), stateWith({ items: [['a', 2]] }))).toBe(true)
  })
  it('current ahead on every count → false', () => {
    const file = stateWith({ log: 1, items: [['a', 1]] })
    const current = stateWith({ log: 2, placedAt: '2026-11-01', items: [['a', 3], ['b', 1]] })
    expect(wouldLoseProgress(file, current)).toBe(false)
  })
  it('both placed on different dates, same counts → false', () => {
    expect(
      wouldLoseProgress(stateWith({ placedAt: '2026-11-01' }), stateWith({ placedAt: '2026-11-05' })),
    ).toBe(false)
  })
})

describe('checkBackupFile', () => {
  const current = stateWith({ log: 2, placedAt: '2026-11-01', items: [['a', 2]] })
  const behind = stateWith({ log: 1, placedAt: '2026-11-01', items: [['a', 1]] })
  const ahead = stateWith({ log: 3, placedAt: '2026-11-01', items: [['a', 2], ['b', 1]] })

  it('empty text → ok', () => {
    expect(checkBackupFile('', current)).toEqual({ kind: 'ok' })
  })
  it('whitespace → ok', () => {
    expect(checkBackupFile('  \n', current)).toEqual({ kind: 'ok' })
  })
  it('same state → ok', () => {
    expect(checkBackupFile(exportState(current), current)).toEqual({ kind: 'ok' })
  })
  it('behind state → ok', () => {
    expect(checkBackupFile(exportState(behind), current)).toEqual({ kind: 'ok' })
  })
  it('ahead state → ahead with parsed file', () => {
    const text = exportState(ahead)
    const parsed = parseImport(text)
    if (!parsed.ok) throw new Error('fixture invalid')
    const res = checkBackupFile(text, current)
    expect(res).toEqual({ kind: 'ahead', file: parsed.state })
  })
  it('unrelated JSON → foreign', () => {
    expect(checkBackupFile('{"hello":1}', current)).toEqual({ kind: 'foreign' })
  })
  it('not JSON → foreign', () => {
    expect(checkBackupFile('not json', current)).toEqual({ kind: 'foreign' })
  })
  it('version 2 blob → foreign', () => {
    const v2 = { ...JSON.parse(exportState(current)), version: 2 }
    expect(checkBackupFile(JSON.stringify(v2), current)).toEqual({ kind: 'foreign' })
  })
})
