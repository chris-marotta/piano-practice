// Pure copy for the auto-backup status line (no Preact, no window).
import type { BackupStatus } from '../backup/controller'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number): string => String(n).padStart(2, '0')

/** Same local day as `now` -> 'HH:MM'; otherwise 'Mon D, HH:MM'. */
export function formatSavedAt(savedAt: number, now: number): string {
  const d = new Date(savedAt)
  const n = new Date(now)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? time : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`
}

export type BackupAction = 'choose' | 'stop' | 'resume'

/** The status text and the one button that fits it; null when backup isn't available. */
export function backupLine(status: BackupStatus, now: number): { text: string; action: BackupAction } | null {
  switch (status.kind) {
    case 'unsupported':
      return null
    case 'off':
      return { text: 'Auto-backup is off.', action: 'choose' }
    case 'on':
      return {
        text:
          `Backing up to ${status.name}` +
          (status.savedAt === null ? '' : ` · saved ${formatSavedAt(status.savedAt, now)}`),
        action: 'stop',
      }
    case 'paused':
      return { text: 'Backup paused: Chrome needs your OK.', action: 'resume' }
    case 'failed':
      return { text: "Backup failed: the file couldn't be written.", action: 'choose' }
  }
}

/** Done only mentions backup when it needs attention. */
export function showOnDone(status: BackupStatus): boolean {
  return status.kind === 'paused' || status.kind === 'failed'
}
