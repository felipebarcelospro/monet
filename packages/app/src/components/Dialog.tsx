import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useT } from '../hooks/useT'

/** A small modal used for renaming and deleting. */
export function Modal({
  title,
  children,
  onClose,
  width = 380,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  width?: number
}): React.JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="scrim modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** Asks for a single line of text. */
export function PromptDialog({
  title,
  label,
  initialValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  label?: string
  initialValue: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: (value: string) => void
}): React.JSX.Element {
  const t = useT()
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const submit = (): void => {
    const trimmed = value.trim()
    if (trimmed.length > 0) onConfirm(trimmed)
  }

  return (
    <Modal title={title} onClose={onCancel}>
      {label ? <p className="modal-body">{label}</p> : null}
      <input
        ref={ref}
        className="modal-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        spellCheck={false}
      />
      <div className="modal-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="button button-primary" onClick={submit}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** Confirms a destructive action. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const t = useT()
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="modal-body">{body}</p>
      <div className="modal-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="button button-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
