import { Component, type ErrorInfo, type ReactNode } from 'react'

import { translate } from '../shared/i18n'
import { useStore } from '../state/store'

interface State {
  error: Error | null
}

/**
 * Catches a render error and shows a readable card instead of a blank window.
 *
 * The window keeps running: the user can reload the interface without losing
 * the vault, and the error text can be copied into a bug report.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Monet window error', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const locale = useStore.getState().prefs.locale
    return (
      <div className="welcome">
        <div className="welcome-main">
          <div className="error-card">
            <div className="welcome-eyebrow">
              <span className="rule" />
              Monet
            </div>
            <h1 className="welcome-title">{translate(locale, 'error.title')}</h1>
            <p className="welcome-sub">{translate(locale, 'error.body')}</p>
            <pre className="error-message">{error.message}</pre>
            <div className="welcome-actions">
              <button
                type="button"
                className="button button-accent"
                onClick={() => window.location.reload()}
              >
                {translate(locale, 'error.reload')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
