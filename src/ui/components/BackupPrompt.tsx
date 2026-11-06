import { useState } from 'preact/hooks'
import type { BackupPrompt as Prompt } from '../../backup/controller'
import { backup } from '../../backup/fileBackup'
import type { AppState } from '../../store/storage'
import { FOREIGN_TEXT, IMPORT_TEXT, REPLACE_TEXT, aheadText } from '../backupView'
import { importProgress } from '../importProgress'
import { ConfirmDialog } from './ConfirmDialog'

// The controller reports failure through `status`, so a rejection here needs no handling.
const ignore = () => {}

async function importIt(file: AppState): Promise<void> {
  await backup.resolvePrompt('import')
  // importProgress is synchronous and can't throw, so nothing cancellable sits between
  // resolvePrompt('import') and the import.
  importProgress(file)
}

/** App-level dialog that resolves the backup guard's prompt (backup file ahead of, or not, this browser). */
export function BackupPrompt() {
  const prompt = backup.prompt.value
  // The prompt object a second (Replace or Import) confirm is open for; any other prompt starts on the first dialog.
  const [confirming, setConfirming] = useState<{ for: Prompt; action: 'replace' | 'import' } | null>(null)

  if (prompt === null) return null

  if (prompt.kind === 'foreign') {
    return (
      <ConfirmDialog
        key="foreign"
        danger
        title="Replace this file?"
        confirmLabel="Replace it"
        onConfirm={() => void backup.resolvePrompt('replace').catch(ignore)}
        onCancel={() => void backup.resolvePrompt('cancel').catch(ignore)}
      >
        {FOREIGN_TEXT}
      </ConfirmDialog>
    )
  }

  const file = prompt.file
  if (confirming?.for === prompt && confirming.action === 'replace') {
    return (
      <ConfirmDialog
        key="replace"
        danger
        title="Replace the backup?"
        confirmLabel="Replace it"
        onConfirm={() => void backup.resolvePrompt('replace').catch(ignore)}
        onCancel={() => setConfirming(null)}
      >
        {REPLACE_TEXT}
      </ConfirmDialog>
    )
  }
  if (confirming?.for === prompt && confirming.action === 'import') {
    return (
      <ConfirmDialog
        key="import"
        danger
        title="Import the backup?"
        confirmLabel="Import it"
        onConfirm={() => void importIt(file).catch(ignore)}
        onCancel={() => setConfirming(null)}
      >
        {IMPORT_TEXT}
      </ConfirmDialog>
    )
  }
  return (
    <ConfirmDialog
      key="ahead"
      title="This backup has more progress"
      confirmLabel="Import it"
      secondary={{ label: 'Replace it', onClick: () => setConfirming({ for: prompt, action: 'replace' }) }}
      onConfirm={() => {
        // Mixed: this browser has progress the file lacks, so Import it asks again before dropping it.
        if (prompt.mixed) setConfirming({ for: prompt, action: 'import' })
        else void importIt(file).catch(ignore)
      }}
      onCancel={() => void backup.resolvePrompt('cancel').catch(ignore)}
    >
      {aheadText(file)}
    </ConfirmDialog>
  )
}
