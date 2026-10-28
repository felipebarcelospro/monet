import {
  ArrowRightLeft,
  Calendar,
  Copy,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Link2,
  Moon,
  Network,
  PanelRight,
  Pencil,
  Search,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { fuzzySimilarity } from '@monet/core/browser'

import { useT } from '../hooks/useT'
import { relativeTime } from '../lib/notes'
import { EMPTY_LIST, useStore } from '../state/store'
import type { NoteSummary } from '../shared/contract'
import { typeIcon } from './Icons'
import type { Palette } from '../state/store'

interface Item {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  shortcut?: string
  run: () => void
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent)
const modKey = isMac ? '⌘' : 'Ctrl+'

/** The command palette (⌘K) and the quick switcher (⌘P). */
export function CommandPalette({
  mode,
  onClose,
}: {
  mode: Exclude<Palette, 'none'>
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const snapshot = useStore((state) => state.snapshot)
  const document = useStore((state) => state.document)
  const locale = useStore((state) => state.prefs.locale)
  const favorites = useStore((state) =>
    state.snapshot ? (state.prefs.favorites[state.snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST,
  )
  const selectNote = useStore((state) => state.selectNote)
  const createNote = useStore((state) => state.createNote)
  const openDailyNote = useStore((state) => state.openDailyNote)
  const openVaultDialog = useStore((state) => state.openVaultDialog)
  const setView = useStore((state) => state.setView)
  const view = useStore((state) => state.view)
  const toggleInspector = useStore((state) => state.toggleInspector)
  const cycleTheme = useStore((state) => state.cycleTheme)
  const openSettings = useStore((state) => state.openSettings)
  const copyPath = useStore((state) => state.copyPath)
  const copyWikilink = useStore((state) => state.copyWikilink)
  const revealNote = useStore((state) => state.revealNote)
  const deleteNote = useStore((state) => state.deleteNote)
  const toggleFavorite = useStore((state) => state.toggleFavorite)
  const openDialog = useStore((state) => state.openDialog)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const commands = useMemo<Item[]>(() => {
    const items: Item[] = [
      {
        id: 'new-note',
        title: t('palette.newNote'),
        icon: FilePlus2,
        shortcut: `${modKey}N`,
        run: () => void createNote(),
      },
      {
        id: 'daily-note',
        title: t('palette.dailyNote'),
        icon: Calendar,
        shortcut: `${modKey}Shift+D`,
        run: () => void openDailyNote(),
      },
      {
        id: 'open-vault',
        title: t('palette.openVault'),
        icon: FolderOpen,
        shortcut: `${modKey}O`,
        run: () => void openVaultDialog(),
      },
      {
        id: 'graph',
        title: view === 'graph' ? t('editor.editor') : t('palette.toggleGraph'),
        icon: view === 'graph' ? Pencil : Network,
        shortcut: `${modKey}G`,
        run: () => setView(view === 'graph' ? 'editor' : 'graph'),
      },
      {
        id: 'inspector',
        title: t('palette.toggleInspector'),
        icon: PanelRight,
        shortcut: `${modKey}2`,
        run: toggleInspector,
      },
      {
        id: 'theme',
        title: t('palette.toggleTheme'),
        icon: Moon,
        run: cycleTheme,
      },
      {
        id: 'settings',
        title: t('palette.settings'),
        icon: Settings2,
        shortcut: `${modKey},`,
        run: openSettings,
      },
    ]

    if (document) {
      const favorite = favorites.includes(document.id)
      items.push(
        {
          id: 'favorite',
          title: favorite ? t('palette.unfavorite') : t('palette.favorite'),
          icon: Star,
          run: () => toggleFavorite(),
        },
        {
          id: 'rename',
          title: t('palette.rename'),
          icon: Pencil,
          run: () => openDialog({ kind: 'rename-note' }),
        },
        {
          id: 'copy-wikilink',
          title: t('palette.copyWikilink'),
          icon: Link2,
          run: () => void copyWikilink(),
        },
        {
          id: 'copy-path',
          title: t('palette.copyPath'),
          icon: Copy,
          run: () => void copyPath(),
        },
        {
          id: 'reveal',
          title: t('palette.reveal'),
          icon: ExternalLink,
          run: () => void revealNote(),
        },
        {
          id: 'delete',
          title: t('palette.delete'),
          icon: Trash2,
          run: () => void deleteNote(),
        },
      )
    }

    return items
  }, [
    t,
    createNote,
    openVaultDialog,
    setView,
    view,
    toggleInspector,
    cycleTheme,
    openSettings,
    document,
    favorites,
    toggleFavorite,
    copyWikilink,
    copyPath,
    revealNote,
    deleteNote,
  ])

  const notes = useMemo(() => {
    if (mode !== 'notes' || !snapshot) return [] as NoteSummary[]
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) {
      return [...snapshot.notes].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 50)
    }
    return snapshot.notes
      .map((note) => {
        const titleScore = fuzzySimilarity(needle, note.title.toLowerCase()) ?? 0
        const pathScore = fuzzySimilarity(needle, note.path.toLowerCase()) ?? 0
        const tagScore = note.tags.some((tag) => tag.toLowerCase().includes(needle)) ? 0.4 : 0
        return { note, score: Math.max(titleScore, pathScore * 0.8) + tagScore }
      })
      .filter((entry) => entry.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((entry) => entry.note)
  }, [mode, snapshot, query])

  const items = useMemo<Item[]>(() => {
    if (mode === 'notes') {
      return notes.map((note) => ({
        id: note.id,
        title: note.title,
        subtitle: `${relativeTime(note.modifiedAt, locale)} · ${note.folder || '/'}`,
        icon: typeIcon(note.type),
        run: () => void selectNote(note.id),
      }))
    }
    const needle = query.trim().toLowerCase()
    return needle.length === 0
      ? commands
      : commands.filter((command) => command.title.toLowerCase().includes(needle))
  }, [mode, notes, commands, query, locale, selectNote])

  useEffect(() => {
    setActive(0)
  }, [query, mode])

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const element = container.querySelector<HTMLElement>(`[data-index="${active}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item: Item | undefined): void => {
    if (!item) return
    item.run()
    onClose()
  }

  const placeholder =
    mode === 'notes' ? t('palette.notesPlaceholder') : t('palette.commandsPlaceholder')

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'notes' ? t('palette.notes') : t('palette.commands')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((current) => Math.min(current + 1, items.length - 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((current) => Math.max(current - 1, 0))
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            run(items[active])
          }
        }}
      >
        <div className="palette-input">
          {mode === 'notes' ? (
            <Search size={16} strokeWidth={1.7} />
          ) : (
            <ArrowRightLeft size={16} strokeWidth={1.7} />
          )}
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
          />
          <span className="escape">esc</span>
        </div>

        <div className="palette-list" ref={listRef}>
          <div className="palette-group">
            {mode === 'notes' ? t('palette.notes') : t('palette.commands')}
          </div>
          {items.length === 0 ? (
            <div className="palette-empty">{t('palette.noResults')}</div>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  data-index={index}
                  className={`palette-item ${index === active ? 'is-active' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  <Icon className="palette-icon" size={14} strokeWidth={1.7} />
                  <span className="palette-title">{item.title}</span>
                  {item.subtitle ? (
                    <span className="palette-hint" style={{ fontFamily: 'var(--font-ui)' }}>
                      {item.subtitle}
                    </span>
                  ) : item.shortcut ? (
                    <span className="palette-hint">{item.shortcut}</span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>

        <div className="palette-footer">
          <span className="key">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            {mode === 'notes' ? t('palette.notes') : t('palette.commands')}
          </span>
          <span className="key">
            <kbd>↵</kbd>
            {mode === 'notes' ? t('inspector.open') : t('palette.run')}
          </span>
          <span className="key" style={{ marginLeft: 'auto' }}>
            <kbd>esc</kbd>
            {t('palette.close')}
          </span>
        </div>
      </div>
    </div>
  )
}
