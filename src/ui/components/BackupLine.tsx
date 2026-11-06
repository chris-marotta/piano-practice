import { backup } from '../../backup/fileBackup'
import { backupLine, showOnDone, type BackupAction } from '../backupView'
import { resumed } from '../state'

const RUN: Record<BackupAction, () => Promise<unknown>> = {
  choose: () => backup.choose(),
  stop: () => backup.stop(),
  resume: () => backup.resume(),
}
const LABEL: Record<BackupAction, string> = { choose: 'Choose file…', stop: 'Stop', resume: 'Resume' }

/** Auto-backup status text plus its one button. On Done it only shows when paused or failed. */
export function BackupLine({ where }: { where: 'settings' | 'done' }) {
  const status = backup.status.value
  void resumed.value // re-derive the "saved" time when the app returns to the foreground
  const line = backupLine(status, Date.now())
  if (!line || (where === 'done' && !showOnDone(status))) return null
  return (
    <div class="settings__actions">
      <p class="settings__note" role="status">
        {line.text}
      </p>
      {/* The controller reports failure through `status`, so a rejection needs no handling here. */}
      <button type="button" class="btn" onClick={() => void RUN[line.action]().catch(() => {})}>
        {LABEL[line.action]}
      </button>
    </div>
  )
}
