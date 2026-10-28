// src/components/ConfirmDialog.tsx
// In-app confirmation dialog. Native window.confirm() breaks the window focus
// on Windows/Electron: after the native dialog closes, inputs and clicks stop
// responding until the window is focused again. Destructive actions use this
// themed dialog instead of the native browser dialog.

import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import sdk from 'momai:sdk'

export interface ConfirmDialogProps {
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}) => {
  // The host overlay root keeps full-area dialogs inside the content area so
  // they never cover the sidebar/title bar. It is mounted before any extension
  // page, so reading it during the first render avoids a fallback flash.
  const [root] = useState<HTMLElement | null>(() => {
    try {
      return sdk.ui?.overlayRoot?.() ?? null
    } catch {
      return null
    }
  })
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  // Move focus into the dialog and restore the previous element on close, so
  // keyboard users never lose their place.
  useEffect(() => {
    const previous = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    cancelButtonRef.current?.focus()
    return () => {
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const dialog = (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center p-4 pointer-events-auto"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-fade-in"
      >
        <p id={titleId} className="text-sm font-semibold text-text">
          {message}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-xl border border-border bg-input/40 text-xs font-medium text-text-muted hover:bg-input hover:text-text transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-2 rounded-xl bg-error text-white text-xs font-semibold hover:opacity-90 active:scale-[0.99] transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  if (!root) {
    return createPortal(
      <div className="fixed inset-0 z-[80] pointer-events-auto">{dialog}</div>,
      document.body
    )
  }

  return createPortal(dialog, root)
}

export default ConfirmDialog
