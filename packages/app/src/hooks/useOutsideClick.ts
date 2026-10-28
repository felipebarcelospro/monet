import { useEffect, useRef, type RefObject } from 'react'

/** Calls `onClose` when a pointer goes down outside the referenced element. */
export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  active = true,
): void {
  const handler = useRef(onClose)
  handler.current = onClose

  useEffect(() => {
    if (!active) return
    const onPointerDown = (event: PointerEvent): void => {
      const element = ref.current
      if (!element) return
      if (event.target instanceof Node && element.contains(event.target)) return
      handler.current()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, ref])
}
