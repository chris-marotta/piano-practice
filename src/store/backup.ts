// Auto-backup guard. Pure: no window/navigator/document. Spec §7.
// Decides whether the backup file holds progress this browser lacks, so a write never loses it.
import { parseImport, type AppState } from './storage'

export const BACKUP_DEBOUNCE_MS = 2000

/** True if writing `current` over `file` would drop progress the file has (spec §7's three triggers). */
export function wouldLoseProgress(file: AppState, current: AppState): boolean {
  if (file.log.length > current.log.length) return true
  if (file.placedAt !== null && current.placedAt === null) return true
  for (const [id, item] of Object.entries(file.items)) {
    const mine = current.items[id]
    if (!mine || item.history.length > mine.history.length) return true
  }
  return false
}

export type FileCheck = { kind: 'ok' } | { kind: 'ahead'; file: AppState } | { kind: 'foreign' }

export function checkBackupFile(text: string, current: AppState): FileCheck {
  if (text.trim() === '') return { kind: 'ok' }
  const parsed = parseImport(text)
  if (!parsed.ok) return { kind: 'foreign' }
  return wouldLoseProgress(parsed.state, current) ? { kind: 'ahead', file: parsed.state } : { kind: 'ok' }
}
