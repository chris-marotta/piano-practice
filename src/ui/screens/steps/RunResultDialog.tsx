import { useEffect, useId, useRef } from 'preact/hooks'
import type { RunOutcome } from '../play/playRun'
import { RunResult } from '../play/RunResult'

interface Props {
  title: string
  outcome: RunOutcome
  onClose: () => void
  onUntick: () => void
}

/**
 * A detected rep's result card (spec §6), as a native modal <dialog> like ConfirmDialog: the page behind is inert,
 * focus starts on Close and returns to the tile, Escape or a tap on the backdrop closes. Mount to open, unmount to close.
 */
export function RunResultDialog({ title, outcome, onClose, onUntick }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    closeRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      class="run-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // A tap on the backdrop lands on the <dialog> itself; taps on the card land on its children.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <h2 id={`${id}-title`} class="run-dialog__title">
        {title}
      </h2>
      <RunResult outcome={outcome} />
      <div class="run-dialog__actions">
        <button type="button" class="btn" onClick={onUntick}>
          Untick
        </button>
        <button ref={closeRef} type="button" class="btn btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}
