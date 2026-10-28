import { X } from 'lucide-react'

import { useT } from '../hooks/useT'
import { useStore } from '../state/store'
import { LOCALES, type MessageKey } from '../shared/i18n'
import type { BodyFont, EditorWidth, Locale, Theme } from '../shared/contract'

/** The preferences window: appearance, language, typography and about. */
export function Settings(): React.JSX.Element {
  const t = useT()
  const prefs = useStore((state) => state.prefs)
  const setPrefs = useStore((state) => state.setPrefs)
  const close = useStore((state) => state.closeSettings)
  const snapshot = useStore((state) => state.snapshot)
  const version = useStore((state) => state.info?.version ?? '0.1.0')

  const themes: { id: Theme; label: MessageKey }[] = [
    { id: 'system', label: 'settings.theme.system' },
    { id: 'light', label: 'settings.theme.light' },
    { id: 'dark', label: 'settings.theme.dark' },
  ]
  const fonts: { id: BodyFont; label: MessageKey }[] = [
    { id: 'sans', label: 'settings.bodyFont.sans' },
    { id: 'serif', label: 'settings.bodyFont.serif' },
  ]
  const widths: { id: EditorWidth; label: MessageKey }[] = [
    { id: 'narrow', label: 'settings.width.narrow' },
    { id: 'wide', label: 'settings.width.wide' },
  ]

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="settings" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="settings-head">
          <h2>{t('settings.title')}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t('settings.close')}
            onClick={close}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>{t('settings.appearance')}</h3>
            <div className="settings-row">
              <span className="settings-label">{t('settings.appearance')}</span>
              <Choice
                value={prefs.theme}
                options={themes.map((item) => ({ id: item.id, label: t(item.label) }))}
                onChange={(theme) => setPrefs({ theme })}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>{t('settings.language')}</h3>
            <div className="settings-row">
              <span className="settings-label">{t('settings.language')}</span>
              <Choice
                value={prefs.locale}
                options={LOCALES.map((item) => ({ id: item.id, label: item.label }))}
                onChange={(locale: Locale) => setPrefs({ locale })}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>{t('settings.typography')}</h3>
            <div className="settings-row">
              <span className="settings-label">{t('settings.bodyFont')}</span>
              <Choice
                value={prefs.bodyFont}
                options={fonts.map((item) => ({ id: item.id, label: t(item.label) }))}
                onChange={(bodyFont) => setPrefs({ bodyFont })}
              />
            </div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.width')}</span>
              <Choice
                value={prefs.editorWidth}
                options={widths.map((item) => ({ id: item.id, label: t(item.label) }))}
                onChange={(editorWidth) => setPrefs({ editorWidth })}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>{t('settings.about')}</h3>
            <div className="settings-about">
              <span className="monogram">M</span>
              <div>
                <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 12.5 }}>Monet</div>
                <div>{t('settings.version', { version })}</div>
              </div>
              <span
                style={{
                  marginLeft: 'auto',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={snapshot?.root}
              >
                {snapshot?.name ?? ''}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** A segmented choice. */
export function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="choice" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className={option.id === value ? 'is-active' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
