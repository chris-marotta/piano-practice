import type { ComponentChildren, RefObject } from 'preact'
import { useEffect, useId, useRef } from 'preact/hooks'

interface Props {
  title: string
  children: ComponentChildren
  confirmLabel: string
  cancelLabel?: string
  /** Destructive action: the confirm button is drawn in the warning colour. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  /**
   * Where focus goes back to on close. Pass the button that opened the dialog: Safari doesn't focus
   * buttons on click, so document.activeElement (the fallback) is often just <body>.
   */
  returnFocus?: RefObject<HTMLElement | null>
}

/**
 * In-page confirm (window.confirm is blocked in some embedded contexts and looks out of place on
 * iPad). A native modal <dialog>: the page behind is inert, focus starts on Cancel (the safe choice)
 * and returns to the opener (`returnFocus`) on close, Escape cancels. Mount it to open, unmount to close.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  returnFocus,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const opener = returnFocus?.current ?? active
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    cancelRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      class="confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(e) => {
        // Escape: keep the element under our control; the parent unmounts it.
        e.preventDefault()
        onCancel()
      }}
    >
      <h2 id={`${id}-title`} class="confirm__title">
        {title}
      </h2>
      <div id={`${id}-body`} class="confirm__body">
        {children}
      </div>
      <div class="confirm__actions">
        <button ref={cancelRef} type="button" class="btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" class={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
