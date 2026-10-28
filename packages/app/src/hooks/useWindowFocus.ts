import { useEffect, useState } from 'react'

/** Whether the window currently has the keyboard focus. */
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus())

  useEffect(() => {
    const onFocus = (): void => setFocused(true)
    const onBlur = (): void => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return focused
}
