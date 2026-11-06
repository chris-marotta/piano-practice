import { useState } from 'preact/hooks'
import { backup } from '../../backup/fileBackup'
import { FOREIGN_TEXT, REPLACE_TEXT, aheadText } from '../backupView'
import { importProgress } from '../importProgress'
import { ConfirmDialog } from './ConfirmDialog'

/** App-level dialog that resolves the backup guard's prompt (backup file ahead of, or not, this browser). */
export function BackupPrompt() {
  const prompt = backup.prompt.value
  // The prompt object the Replace confirm is open for; any other prompt starts on the first dialog.
  const [confirmingFor, setConfirmingFor] = useState<typeof prompt>(null)

  if (prompt === null) return null

  if (prompt.kind === 'foreign') {
    return (
      <ConfirmDialog
        key="foreign"
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
  if (confirmingFor === prompt) {
    return (
      <ConfirmDialog
        key="replace"
        danger
        title="Replace the backup?"
        confirmLabel="Replace it"
        onConfirm={() => void backup.resolvePrompt('replace')}
        onCancel={() => setConfirmingFor(null)}
      >
        {REPLACE_TEXT}
      </ConfirmDialog>
    )
  }
  return (
    <ConfirmDialog
      key="ahead"
      title="This backup has more progress"
      confirmLabel="Import it"
      secondary={{ label: 'Replace it', onClick: () => setConfirmingFor(prompt) }}
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
