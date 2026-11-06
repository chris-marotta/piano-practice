import { describe, expect, it } from 'vitest'
import type { BackupStatus } from '../../src/backup/controller'
import { emptyState, type AppState } from '../../src/store/storage'
import { FOREIGN_TEXT, REPLACE_TEXT, aheadText, backupLine, formatSavedAt, showOnDone } from '../../src/ui/backupView'

const at = (d: number, h: number, m: number): number => new Date(2026, 10, d, h, m).getTime()
const NOW = at(6, 14, 2)
const NAME = 'piano-practice-backup.json'

describe('formatSavedAt', () => {
  it('same day shows HH:MM', () => expect(formatSavedAt(at(6, 14, 2), NOW)).toBe('14:02'))
  it('zero-pads 09:05', () => expect(formatSavedAt(at(6, 9, 5), NOW)).toBe('09:05'))
  it('previous day shows month and day', () => expect(formatSavedAt(at(5, 21, 40), NOW)).toBe('Nov 5, 21:40'))
})

describe('backupLine', () => {
  it('off', () =>
    expect(backupLine({ kind: 'off' }, NOW)).toEqual({ text: 'Auto-backup is off.', action: 'choose' }))
  it('on, never saved', () =>
    expect(backupLine({ kind: 'on', name: NAME, savedAt: null }, NOW)).toEqual({
      text: 'Backing up to piano-practice-backup.json',
      action: 'stop',
    }))
  it('on, saved same day', () =>
    expect(backupLine({ kind: 'on', name: NAME, savedAt: at(6, 14, 2) }, NOW)).toEqual({
      text: 'Backing up to piano-practice-backup.json · saved 14:02',
      action: 'stop',
    }))
  it('paused', () =>
    expect(backupLine({ kind: 'paused', name: NAME }, NOW)).toEqual({
      text: 'Backup paused: Chrome needs your OK.',
      action: 'resume',
    }))
  it('failed', () =>
    expect(backupLine({ kind: 'failed', name: NAME }, NOW)).toEqual({
      text: "Backup failed: the file couldn't be written.",
      action: 'choose',
    }))
  it('unsupported is null', () => expect(backupLine({ kind: 'unsupported' }, NOW)).toBeNull())
})

describe('showOnDone', () => {
  const all: BackupStatus[] = [
    { kind: 'unsupported' },
    { kind: 'off' },
    { kind: 'on', name: NAME, savedAt: null },
    { kind: 'paused', name: NAME },
    { kind: 'failed', name: NAME },
  ]
  it('true only for paused and failed', () =>
    expect(all.filter(showOnDone).map((s) => s.kind)).toEqual(['paused', 'failed']))
})

describe('aheadText', () => {
  const stateWith = (placedAt: string | null, items: number, sessions: number): AppState => ({
    ...emptyState(),
    placedAt,
    items: Object.fromEntries(
      Array.from({ length: items }, (_, i) => [`k${i}`, {} as AppState['items'][string]]),
    ),
    log: Array.from({ length: sessions }, () => ({ date: '2026-10-19', minutes: 10, completed: true })),
  })
  it('placed, plural items and sessions', () =>
    expect(aheadText(stateWith('2026-10-22', 48, 19))).toBe(
      "This backup has progress this browser doesn't (placed Thursday 22 October 2026 · 48 items · 19 sessions).",
    ))
  it('singular item and session', () =>
    expect(aheadText(stateWith('2026-10-22', 1, 1))).toContain(' · 1 item · 1 session).'))
  it('not placed', () =>
    expect(aheadText(stateWith(null, 0, 3))).toBe(
      "This backup has progress this browser doesn't (not placed · 0 items · 3 sessions).",
    ))
})

describe('prompt copy', () => {
  it('REPLACE_TEXT and FOREIGN_TEXT equal the spec copy', () => {
    expect(REPLACE_TEXT).toBe(
      "This replaces the backup with this browser's progress. The backup's extra progress will be lost.",
    )
    expect(FOREIGN_TEXT).toBe("This file isn't a Piano Practice backup. Replace it?")
  })
})
