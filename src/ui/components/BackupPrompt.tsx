import { useEffect, useState } from 'preact/hooks'
import { backup } from '../../backup/fileBackup'
import { FOREIGN_TEXT, REPLACE_TEXT, aheadText } from '../backupView'
import { importProgress } from '../importProgress'
import { ConfirmDialog } from './ConfirmDialog'

/** App-level dialog that resolves the backup guard's prompt (backup file ahead of, or not, this browser). */
export function BackupPrompt() {
  const prompt = backup.prompt.value
  const [confirmingReplace, setConfirmingReplace] = useState(false)

  // A new or cleared prompt always starts on the first dialog.
  useEffect(() => setConfirmingReplace(false), [prompt])

  if (prompt === null) return null

  if (prompt.kind === 'foreign') {
    return (
      <ConfirmDialog
        danger
        title="Replace this file?"
        confirmLabel="Replace it"
        onConfirm={() => void backup.resolvePrompt('replace')}
        onCancel={() => void backup.resolvePrompt('cancel')}
      >
        {FOREIGN_TEXT}
      </ConfirmDialog>
    )
  }

  const file = prompt.file
  if (confirmingReplace) {
    return (
      <ConfirmDialog
        danger
        title="Replace the backup?"
        confirmLabel="Replace it"
        onConfirm={() => void backup.resolvePrompt('replace')}
        onCancel={() => setConfirmingReplace(false)}
      >
        {REPLACE_TEXT}
      </ConfirmDialog>
    )
  }
  return (
    <ConfirmDialog
      title="This backup has more progress"
      confirmLabel="Import it"
      secondary={{ label: 'Replace it', onClick: () => setConfirmingReplace(true) }}
      onConfirm={async () => {
        await backup.resolvePrompt('import')
        importProgress(file)
      }}
      onCancel={() => void backup.resolvePrompt('cancel')}
    >
      {aheadText(file)}
    </ConfirmDialog>
  )
}
