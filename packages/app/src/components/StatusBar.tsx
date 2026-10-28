import { FolderClosed, Link2, NotebookText } from 'lucide-react'

import { useT } from '../hooks/useT'
import { readingMinutes } from '../lib/notes'
import { useStore } from '../state/store'

/** The quiet strip at the bottom of the window. */
export function StatusBar(): React.JSX.Element {
  const t = useT()
  const snapshot = useStore((state) => state.snapshot)
  const document = useStore((state) => state.document)
  const saving = useStore((state) => state.saving)
  const dirty = useStore((state) => state.dirty)
  const savedAt = useStore((state) => state.savedAt)
  const info = useStore((state) => state.info)
  const summary = document
    ? (snapshot?.notes.find((note) => note.id === document.id) ?? null)
    : null
  const locale = useStore((state) => state.prefs.locale)

  return (
    <footer className="status-bar">
      <div className="status-group">
        <FolderClosed className="status-icon" size={11} strokeWidth={1.8} />
        <span>{snapshot?.name ?? t('status.noVault')}</span>
      </div>

      {snapshot ? (
        <>
          <div className="status-separator" />
          <div className="status-group">
            <NotebookText className="status-icon" size={11} strokeWidth={1.8} />
            <span>{t('status.notes', { count: snapshot.stats.notes })}</span>
          </div>
          <div className="status-group">
            <Link2 className="status-icon" size={11} strokeWidth={1.8} />
            <span>{t('status.links', { count: snapshot.stats.links })}</span>
          </div>
        </>
      ) : null}

      <div className="status-right">
        {summary ? (
          <>
            <span>{t('status.words', { count: summary.wordCount.toLocaleString(locale) })}</span>
            <span>{t('editor.readingTime', { count: readingMinutes(summary.wordCount) })}</span>
            <div className="status-separator" />
          </>
        ) : null}
        <div className="status-group">
          <span className={`status-dot ${saving ? 'saving' : dirty ? '' : 'saved'}`} />
          <span>
            {saving ? t('status.saving') : dirty ? t('status.saving') : t('status.saved')}
          </span>
        </div>
        <div className="status-separator" />
        <span>{t('status.local')}</span>
        <span>v{info?.version ?? '0.1.0'}</span>
        {savedAt ? <span className="sr-only">{new Date(savedAt).toISOString()}</span> : null}
      </div>
    </footer>
  )
}
