import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import { useOutsideClick } from '../hooks/useOutsideClick'

/** A small dropdown anchored to its trigger. */
export function MenuButton({
  trigger,
  children,
  align = 'right',
  className = '',
  menuClassName = '',
}: {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  menuClassName?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useOutsideClick(ref, () => setOpen(false), open)

  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div
          className={`menu ${align === 'left' ? 'left' : ''} ${menuClassName}`}
          role="menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            }
          }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

/** A row in a dropdown. */
export function MenuItem({
  icon: Icon,
  children,
  onSelect,
  shortcut,
  selected = false,
  danger = false,
  disabled = false,
}: {
  icon?: LucideIcon
  children: ReactNode
  onSelect: () => void
  shortcut?: string
  selected?: boolean
  danger?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${danger ? 'danger' : ''} ${selected ? 'is-selected' : ''}`}
      disabled={disabled}
      onClick={onSelect}
      style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
    >
      {Icon ? (
        <Icon className="menu-icon" size={13} strokeWidth={1.7} />
      ) : (
        <span style={{ width: 13 }} />
      )}
      <span>{children}</span>
      {shortcut ? <span className="menu-shortcut">{shortcut}</span> : null}
      {selected ? <Check className="menu-check" size={12} strokeWidth={2} /> : null}
    </button>
  )
}

/** A caption that groups items. */
export function MenuLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="menu-label">{children}</div>
}

/** A hairline between groups. */
export function MenuSeparator(): React.JSX.Element {
  return <div className="menu-separator" role="separator" />
}
