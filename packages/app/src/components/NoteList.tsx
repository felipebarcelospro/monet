import { ArrowDownWideNarrow, Files, Plus, Search, Star, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useT } from '../hooks/useT'
import { relativeTime, sourceLabel, tagTone, typeName } from '../lib/notes'
import { useFavorites, useStore, useVisibleNotes } from '../state/store'
import type { NoteSummary } from '../shared/contract'
import { MenuButton, MenuItem } from './Menu'
import { toneColor, typeIcon, typeTone } from './Icons'
import { WindowChrome } from './Chrome'

/** The second column: the notes of the current source. */
export function NoteList(): React.JSX.Element {
  const t = useT()
  const snapshot = useStore((state) => state.snapshot)
  const source = useStore((state) => state.source)
  const sort = useStore((state) => state.prefs.sort)
  const locale = useStore((state) => state.prefs.locale)
  const selectedId = useStore((state) => state.selectedId)
  const setSort = useStore((state) => state.setSort)
  const selectNote = useStore((state) => state.selectNote)
  const openContext = useStore((state) => state.openContext)
  const createNote = useStore((state) => state.createNote)
  const query = useStore((state) => state.searchQuery)
  const setQuery = useStore((state) => state.setSearchQuery)
  const searchFocusAt = useStore((state) => state.searchFocusAt)
  const notes = useVisibleNotes()
  const favorites = useFavorites()

  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchFocusAt === 0) return
    setSearchOpen(true)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [searchFocusAt])

  useEffect(() => {
    if (!searchOpen) return
    inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (query.length > 0) setSearchOpen(true)
  }, [query])

  useEffect(() => {
    if (!selectedId) return
    const row = document.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(selectedId)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  if (!snapshot) return <section className="column notelist" />

  const title = sourceLabel(source, t)
  const count = notes.length

  const closeSearch = (): void => {
    setSearchOpen(false)
    setQuery('')
  }

  return (
    <section className="column notelist">
      <header className="list-header">
        <div className="inline-chrome">
          {/* The window chrome moves here when the sidebar is hidden. */}
          <InlineChrome />
        </div>
        <h1 className="list-title">{title}</h1>
        <span className="list-count">
          {count === 1 ? t('list.countOne') : t('list.count', { count })}
        </span>

        <div className="list-actions">
          <MenuButton
            align="right"
            trigger={({ toggle }) => (
              <button type="button" className="sort-button" onClick={toggle}>
                <ArrowDownWideNarrow size={12} strokeWidth={1.8} />
                {t(`list.sort.${sort}`)}
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  selected={sort === 'modified'}
                  onSelect={() => {
                    setSort('modified')
                    close()
                  }}
                >
                  {t('list.sort.modified')}
                </MenuItem>
                <MenuItem
                  selected={sort === 'created'}
                  onSelect={() => {
                    setSort('created')
                    close()
                  }}
                >
                  {t('list.sort.created')}
                </MenuItem>
                <MenuItem
                  selected={sort === 'title'}
                  onSelect={() => {
                    setSort('title')
                    close()
                  }}
                >
                  {t('list.sort.title')}
                </MenuItem>
              </>
            )}
          </MenuButton>

          <button
            type="button"
            className={`icon-button ${searchOpen ? 'is-active' : ''}`}
            aria-label={t('list.search')}
            title={t('list.search')}
            onClick={() => {
              if (searchOpen) closeSearch()
              else setSearchOpen(true)
            }}
          >
            <Search size={14} strokeWidth={1.8} />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label={t('list.newNote')}
            title={t('list.newNote')}
            onClick={() => void createNote()}
          >
            <Plus size={15} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <div className="list-search">
          <div className="search-field">
            <Search size={13} strokeWidth={1.8} />
            <input
              ref={inputRef}
              value={query}
              placeholder={t('list.searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  closeSearch()
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  if (notes[0]) void selectNote(notes[0].id)
                }
              }}
              spellCheck={false}
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="search-clear"
                aria-label={t('list.clearSearch')}
                onClick={() => setQuery('')}
              >
                <X size={11} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="list-scroll" role="listbox" aria-label={title}>
        {notes.length === 0 ? (
          <div className="list-empty">
            <Files className="empty-icon" size={26} strokeWidth={1.3} />
            <div className="empty-title">
              {query.length > 0 ? t('list.empty.title') : t('list.empty.title')}
            </div>
            <div className="empty-body">
              {query.length > 0 ? t('list.empty.search', { query }) : t('list.empty.body')}
            </div>
          </div>
        ) : (
          notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              selected={note.id === selectedId}
              favorite={favorites.includes(note.id)}
              locale={locale}
              onSelect={() => void selectNote(note.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                void selectNote(note.id)
                openContext({
                  x: event.clientX,
                  y: event.clientY,
                  target: { kind: 'note', id: note.id },
                })
              }}
            />
          ))
        )}
      </div>
    </section>
  )
}

function InlineChrome(): React.JSX.Element {
  return <WindowChrome inline />
}

function NoteRow({
  note,
  selected,
  favorite,
  locale,
  onSelect,
  onContextMenu,
}: {
  note: NoteSummary
  selected: boolean
  favorite: boolean
  locale: 'en' | 'pt-BR' | 'es'
  onSelect: () => void
  onContextMenu: (event: React.MouseEvent) => void
}): React.JSX.Element {
  const t = useT()
  const Icon = typeIcon(note.type)
  const tags = note.tags.slice(0, 2)

  return (
    <div
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      data-note-id={note.id}
      className={`note-row ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <div className="note-row-head">
        <Icon
          className="note-row-type"
          size={14}
          strokeWidth={1.7}
          style={{ color: toneColor(typeTone(note.type)) }}
        />
        <span className="note-row-title">{note.title}</span>
        {favorite ? (
          <Star
            className="note-row-flag"
            size={11}
            strokeWidth={1.8}
            fill="currentColor"
            style={{ opacity: 1 }}
          />
        ) : null}
      </div>

      {note.excerpt.length > 0 ? <p className="note-row-excerpt">{note.excerpt}</p> : null}

      {tags.length > 0 ? (
        <div className="note-row-tags">
          {tags.map((tag) => (
            <span key={tag} className={`chip tone-${tagTone(tag)}`}>
              {tag}
            </span>
          ))}
          {note.tags.length > 2 ? (
            <span className="chip tone-neutral">+{note.tags.length - 2}</span>
          ) : null}
        </div>
      ) : null}

      <div className="note-row-meta">
        <span>{relativeTime(note.modifiedAt, locale)}</span>
        <span className="created">
          {t('list.created', { when: relativeTime(note.createdAt, locale) })}
        </span>
      </div>

      {note.status ? (
        <span className="sr-only">
          {note.status} {typeName(note.type ?? 'note', t)}
        </span>
      ) : null}
    </div>
  )
}
