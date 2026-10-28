import {
  ChevronRight,
  BookOpen,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MoreHorizontal,
  Network,
  PanelRight,
  Pencil,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useT } from '../hooks/useT'
import { typeName } from '../lib/notes'
import { EMPTY_LIST, useStore } from '../state/store'
import { Editor, type EditorNote } from '../editor/Editor'
import { Markdown } from '../markdown/Markdown'
import { GraphPane } from './GraphPane'
import { MenuButton, MenuItem, MenuSeparator } from './Menu'

/** The third column: the editor bar and the page (or the graph). */
export function MainPane(): React.JSX.Element {
  const t = useT()
  const document = useStore((state) => state.document)
  const snapshot = useStore((state) => state.snapshot)
  const view = useStore((state) => state.view)
  const setView = useStore((state) => state.setView)
  const reading = useStore((state) => state.reading)
  const toggleReading = useStore((state) => state.toggleReading)
  const inspectorOpen = useStore((state) => state.prefs.inspectorOpen)
  const toggleInspector = useStore((state) => state.toggleInspector)
  const prefs = useStore((state) => state.prefs)
  const favorites = useStore((state) =>
    state.snapshot ? (state.prefs.favorites[state.snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST,
  )
  const tabs = useStore((state) => state.tabs)
  const closeTab = useStore((state) => state.closeTab)
  const selectNote = useStore((state) => state.selectNote)
  const toggleFavorite = useStore((state) => state.toggleFavorite)
  const updateTitle = useStore((state) => state.updateTitle)
  const updateBody = useStore((state) => state.updateBody)
  const titleFocusAt = useStore((state) => state.titleFocusAt)
  const openDialog = useStore((state) => state.openDialog)
  const copyPath = useStore((state) => state.copyPath)
  const copyWikilink = useStore((state) => state.copyWikilink)
  const revealNote = useStore((state) => state.revealNote)

  const titleRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const summary = document
    ? (snapshot?.notes.find((note) => note.id === document.id) ?? null)
    : null
  const type = summary?.type
  const folder = document?.path.includes('/')
    ? document.path.slice(0, document.path.lastIndexOf('/'))
    : ''

  useEffect(() => {
    if (!titleFocusAt) return
    const element = titleRef.current
    if (!element) return
    element.focus()
    element.select()
  }, [titleFocusAt])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    const element = titleRef.current
    if (element) {
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight}px`
    }
  }, [document?.id])

  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [document?.title])

  useEffect(() => {
    const onOpen = (event: Event): void => {
      const target = String((event as CustomEvent).detail ?? '').trim()
      if (!target || !snapshot) return
      const lower = target.toLowerCase()
      const note =
        snapshot.notes.find((item) => item.id === target) ??
        snapshot.notes.find((item) => item.title.toLowerCase() === lower) ??
        snapshot.notes.find((item) => item.path.replace(/\.md$/u, '').toLowerCase() === lower) ??
        snapshot.notes.find((item) => item.id.toLowerCase().endsWith(`/${lower}`))
      if (note) void useStore.getState().selectNote(note.id)
      else useStore.getState().showToast(t('error.notFound'), 'error')
    }
    window.addEventListener('monet:open-wikilink', onOpen)
    return () => window.removeEventListener('monet:open-wikilink', onOpen)
  }, [snapshot, t])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && useStore.getState().view === 'graph') {
        useStore.getState().setView('editor')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Following `[[Note#Heading]]`: scroll the reading page to the heading, or
  // move the editor cursor when the note is being edited.
  useEffect(() => {
    const onHeading = (event: Event): void => {
      const heading = String((event as CustomEvent).detail ?? '').trim()
      if (heading.length === 0) return
      if (!reading) {
        window.dispatchEvent(new CustomEvent('monet:outline', { detail: heading }))
        return
      }
      const page = scrollRef.current?.querySelector('.reading-page')
      const match = [...(page?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])].find(
        (element) => element.textContent?.trim() === heading,
      )
      match?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener('monet:open-heading', onHeading)
    return () => window.removeEventListener('monet:open-heading', onHeading)
  }, [reading])

  const editorNotes: EditorNote[] =
    snapshot?.notes.map((note) => ({ id: note.id, title: note.title, path: note.path })) ?? []

  return (
    <main className="column main">
      {tabs.length > 1 ? (
        <div className="editor-tabs" role="tablist">
          {tabs.map((tabId) => {
            const noteSummary = snapshot?.notes.find((n) => n.id === tabId)
            const isTabActive = document?.id === tabId
            const tabTitle = noteSummary?.title ?? tabId.split('/').pop() ?? tabId
            return (
              <div
                key={tabId}
                role="tab"
                aria-selected={isTabActive}
                className={`editor-tab ${isTabActive ? 'is-active' : ''}`}
                onClick={() => void selectNote(tabId)}
              >
                <span className="editor-tab-title">{tabTitle}</span>
                <button
                  type="button"
                  className="editor-tab-close"
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tabId)
                  }}
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
      <header className="editor-bar">
        {document ? (
          <div className="breadcrumb">
            <span className="crumb-type">{typeName(type ?? 'note', t)}</span>
            <ChevronRight className="crumb-sep" size={11} strokeWidth={2} />
            {folder ? (
              <>
                <span className="crumb-path">{folder}</span>
                <ChevronRight className="crumb-sep" size={11} strokeWidth={2} />
              </>
            ) : null}
            <span className="crumb-title">{document.title}</span>
          </div>
        ) : (
          <div className="breadcrumb">
            <span className="crumb-title">{t('editor.noNote.title')}</span>
          </div>
        )}

        <div className="editor-actions">
          {document ? (
            <button
              type="button"
              className={`icon-button ${document && favorites.includes(document.id) ? 'is-active' : ''}`}
              aria-label={t('palette.favorite')}
              title={t('palette.favorite')}
              onClick={() => toggleFavorite()}
            >
              <Star
                size={14}
                strokeWidth={1.7}
                fill={document && favorites.includes(document.id) ? 'currentColor' : 'none'}
              />
            </button>
          ) : null}

          <div className="segmented" role="tablist" aria-label={t('editor.editor')}>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'editor'}
              className={view === 'editor' ? 'is-active' : ''}
              onClick={() => setView('editor')}
              title={t('editor.editor')}
            >
              <Pencil size={12} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'graph'}
              className={view === 'graph' ? 'is-active' : ''}
              onClick={() => setView('graph')}
              title={t('editor.graph')}
            >
              <Network size={12} strokeWidth={1.8} />
            </button>
          </div>

          <button
            type="button"
            className={`icon-button ${reading ? 'is-active' : ''}`}
            aria-label={reading ? t('editor.editing') : t('editor.reading')}
            title={reading ? t('editor.editing') : t('editor.reading')}
            onClick={toggleReading}
            disabled={!document}
          >
            <BookOpen size={14} strokeWidth={1.7} />
          </button>

          <button
            type="button"
            className={`icon-button ${inspectorOpen ? 'is-active' : ''}`}
            aria-label={t('editor.inspector')}
            title={t('editor.inspector')}
            onClick={toggleInspector}
          >
            <PanelRight size={14} strokeWidth={1.7} />
          </button>

          {document ? (
            <MenuButton
              trigger={({ toggle }) => (
                <button type="button" className="icon-button" aria-label="More" onClick={toggle}>
                  <MoreHorizontal size={15} strokeWidth={1.8} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={Pencil}
                    onSelect={() => {
                      close()
                      openDialog({ kind: 'rename-note' })
                    }}
                  >
                    {t('editor.rename')}
                  </MenuItem>
                  <MenuItem
                    icon={Copy}
                    onSelect={() => {
                      close()
                      void copyWikilink()
                    }}
                  >
                    {t('palette.copyWikilink')}
                  </MenuItem>
                  <MenuItem
                    icon={Link2}
                    onSelect={() => {
                      close()
                      void copyPath()
                    }}
                  >
                    {t('palette.copyPath')}
                  </MenuItem>
                  <MenuItem
                    icon={ExternalLink}
                    onSelect={() => {
                      close()
                      void revealNote()
                    }}
                  >
                    {t('editor.reveal')}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    icon={Trash2}
                    danger
                    onSelect={() => {
                      close()
                      openDialog({ kind: 'delete-note' })
                    }}
                  >
                    {t('editor.delete')}
                  </MenuItem>
                </>
              )}
            </MenuButton>
          ) : null}
        </div>
      </header>

      {view === 'graph' ? (
        <GraphPane />
      ) : document ? (
        <div
          className={`editor-scroll ${prefs.bodyFont === 'serif' ? 'serif-body' : ''}`}
          ref={scrollRef}
        >
          {reading ? (
            <article className="editor-page reading-page">
              <h1 className="note-title reading-title">{document.title}</h1>
              <div className="title-rule" />
              <Markdown source={document.body} notePath={document.path} />
            </article>
          ) : (
            <article className="editor-page">
              <textarea
                ref={titleRef}
                className="note-title"
                value={document.title}
                placeholder={t('editor.untitled')}
                rows={1}
                onChange={(event) => updateTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    window.dispatchEvent(new Event('monet:focus-editor'))
                  }
                }}
                spellCheck={false}
              />
              <div className="title-rule" />
              <Editor
                key={document.id}
                value={document.body}
                placeholder={t('editor.bodyPlaceholder')}
                notes={editorNotes}
                notePath={document.path}
                onChange={updateBody}
              />
            </article>
          )}
        </div>
      ) : (
        <div className="editor-empty">
          <FileText className="empty-mark" size={30} strokeWidth={1.2} />
          <div className="empty-title">{t('editor.noNote.title')}</div>
          <div className="empty-body">{t('editor.noNote.body')}</div>
        </div>
      )}
    </main>
  )
}
