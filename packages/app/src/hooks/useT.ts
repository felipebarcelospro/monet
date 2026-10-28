import { useCallback } from 'react'

import { useStore } from '../state/store'
import { translate, type MessageKey } from '../shared/i18n'

/** The translator, bound to the language in the preferences. */
export function useT(): (key: MessageKey, values?: Record<string, string | number>) => string {
  const locale = useStore((state) => state.prefs.locale)
  return useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  )
}
