import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Folder,
  FolderOpen,
  Hash,
  NotebookText,
  Settings2,
  Star,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { useT } from '../hooks/useT'
import { typeName } from '../lib/notes'
import { bridge } from '../lib/bridge'
import { EMPTY_LIST, useStore } from '../state/store'
import type { FolderNode } from '../shared/contract'
import { TrafficLights, WindowChrome } from './Chrome'
import { toneColor, typeIcon, typeTone } from './Icons'
import { MenuButton, MenuItem, MenuSeparator } from './Menu'

/** The first column: library, types, folders and tags. */
export function Sidebar(): React.JSX.Element {
  const t = useT()
  const snapshot = useStore((state) => state.snapshot)
  const source = useStore((state) => state.source)
  const selectedId = useStore((state) => state.selectedId)
  const setSource = useStore((state) => state.setSource)
  const selectNote = useStore((state) => state.selectNote)
  const openSettings = useStore((state) => state.openSettings)
  const openContext = useStore((state) => state.openContext)
  const openVaultDialog = useStore((state) => state.openVaultDialog)
  const openVaultPath = useStore((state) => state.openVaultPath)
  const info = useStore((state) => state.info)
  const favorites = useStore((state) =>
    state.snapshot ? (state.prefs.favorites[state.snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST,
  )

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    favorites: false,
    types: false,
    folders: false,
    tags: false,
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!snapshot) return
    setExpanded(new Set(snapshot.folders.map((folder) => folder.path)))
  }, [snapshot?.root])

  if (!snapshot) return <aside className="column sidebar" />

  const recentCount = snapshot.notes.filter(
    (note) => Date.now() - note.modifiedAt <= 14 * 86_400_000,
  ).length
  const favoriteNotes = snapshot.notes
    .filter((note) => favorites.includes(note.id))
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, 8)

  const toggleSection = (key: string): void =>
    setCollapsed((current) => ({ ...current, [key]: !current[key] }))

  const toggleFolder = (path: string): void =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  return (
    <aside className="column sidebar">
      <div className="sidebar-top">
        <TrafficLights />
        <WindowChrome />
      </div>

      <nav className="sidebar-scroll" aria-label={t('nav.library')}>
        <div className="nav-group">
          <button
            type="button"
            className={`nav-row ${source.kind === 'all' ? 'is-active' : ''}`}
            onClick={() => setSource({ kind: 'all' })}
          >
            <NotebookText className="nav-icon" size={15} strokeWidth={1.7} />
            <span className="nav-label">{t('nav.allNotes')}</span>
            <span className="nav-count">{snapshot.stats.notes}</span>
          </button>
          <button
            type="button"
            className={`nav-row ${source.kind === 'recent' ? 'is-active' : ''}`}
            onClick={() => setSource({ kind: 'recent' })}
          >
            <Clock3 className="nav-icon" size={15} strokeWidth={1.7} />
            <span className="nav-label">{t('nav.recent')}</span>
            <span className="nav-count">{recentCount}</span>
          </button>
          <button
            type="button"
            className={`nav-row ${source.kind === 'favorites' ? 'is-active' : ''}`}
            onClick={() => setSource({ kind: 'favorites' })}
          >
            <Star className="nav-icon" size={15} strokeWidth={1.7} />
            <span className="nav-label">{t('nav.favorites')}</span>
            <span className="nav-count">{favorites.length}</span>
          </button>
        </div>

        {favoriteNotes.length > 0 ? (
          <>
            <SectionHeading
              label={t('nav.favorites')}
              count={favoriteNotes.length}
              open={!collapsed['favorites']}
              onToggle={() => toggleSection('favorites')}
            />
            {!collapsed['favorites'] ? (
              <div className="section-body">
                {favoriteNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`nav-row ${selectedId === note.id ? 'is-active' : ''}`}
                    onClick={() => void selectNote(note.id)}
                  >
                    <Star
                      className="nav-icon"
                      size={14}
                      strokeWidth={1.7}
                      style={{ color: 'var(--amber)' }}
                    />
                    <span className="nav-label">{note.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {snapshot.types.length > 0 ? (
          <>
            <SectionHeading
              label={t('nav.types')}
              count={snapshot.types.length}
              open={!collapsed['types']}
              onToggle={() => toggleSection('types')}
            />
            {!collapsed['types'] ? (
              <div className="section-body">
                {snapshot.types.map((type) => {
                  const Icon = typeIcon(type.tag)
                  return (
                    <button
                      key={type.tag}
                      type="button"
                      className={`nav-row type-row ${
                        source.kind === 'type' && source.type === type.tag ? 'is-active' : ''
                      }`}
                      onClick={() => setSource({ kind: 'type', type: type.tag })}
                    >
                      <Icon
                        className="nav-icon"
                        size={15}
                        strokeWidth={1.7}
                        style={{ color: toneColor(typeTone(type.tag)) }}
                      />
                      <span className="nav-label">{typeName(type.tag, t)}</span>
                      <span className="nav-count">{type.count}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </>
        ) : null}

        {snapshot.folders.length > 0 ? (
          <>
            <SectionHeading
              label={t('nav.folders')}
              count={snapshot.folders.length}
              open={!collapsed['folders']}
              onToggle={() => toggleSection('folders')}
            />
            {!collapsed['folders'] ? (
              <div className="section-body">
                {snapshot.folders.map((folder) => (
                  <FolderBranch
                    key={folder.path}
                    folder={folder}
                    depth={0}
                    expanded={expanded}
                    activePath={source.kind === 'folder' ? source.path : undefined}
                    onToggle={toggleFolder}
                    onContextMenu={(path, event) => {
                      event.preventDefault()
                      openContext({
                        x: event.clientX,
                        y: event.clientY,
                        target: { kind: 'folder', path },
                      })
                    }}
                    onSelect={(path) => {
                      setSource({ kind: 'folder', path })
                      setExpanded((current) => new Set(current).add(path))
                    }}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {snapshot.tags.length > 0 ? (
          <>
            <SectionHeading
              label={t('nav.tags')}
              count={snapshot.tags.length}
              open={!collapsed['tags']}
              onToggle={() => toggleSection('tags')}
            />
            {!collapsed['tags'] ? (
              <div className="section-body">
                {snapshot.tags.slice(0, 12).map((tag) => (
                  <button
                    key={tag.tag}
                    type="button"
                    className={`nav-row ${
                      source.kind === 'tag' && source.tag === tag.tag ? 'is-active' : ''
                    }`}
                    onClick={() => setSource({ kind: 'tag', tag: tag.tag })}
                  >
                    <Hash className="nav-icon" size={14} strokeWidth={1.7} />
                    <span className="nav-label">{tag.tag}</span>
                    <span className="nav-count">{tag.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        <MenuButton
          align="left"
          menuClassName="menu-up"
          trigger={({ toggle }) => (
            <button type="button" className="vault-button" onClick={toggle}>
              <span className="vault-dot" />
              <span className="vault-name">{snapshot.name}</span>
              <ChevronsUpDown
                size={11}
                strokeWidth={1.8}
                style={{ marginLeft: 'auto', opacity: 0.6 }}
              />
            </button>
          )}
        >
          {(close) => (
            <>
              {(info?.recentVaults ?? []).slice(0, 5).map((path) => (
                <MenuItem
                  key={path}
                  icon={Folder}
                  onSelect={() => {
                    close()
                    void openVaultPath(path)
                  }}
                  selected={path === snapshot.root}
                >
                  {path.split('/').pop() ?? path}
                </MenuItem>
              ))}
              {(info?.recentVaults?.length ?? 0) > 0 ? <MenuSeparator /> : null}
              <MenuItem
                icon={FolderOpen}
                onSelect={() => {
                  close()
                  void openVaultDialog()
                }}
              >
                {t('palette.openVault')}
              </MenuItem>
            </>
          )}
        </MenuButton>

        <button
          type="button"
          className="icon-button small"
          aria-label={t('nav.settings')}
          title={t('nav.settings')}
          onClick={openSettings}
        >
          <Settings2 size={14} strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  )
}

function SectionHeading({
  label,
  count,
  open,
  onToggle,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <div className="section-heading">
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={open}>
        <ChevronRight
          className={`section-chevron ${open ? 'open' : ''}`}
          size={10}
          strokeWidth={2}
        />
        {label}
      </button>
      <span className="nav-count" style={{ marginLeft: 'auto', background: 'transparent' }}>
        {count}
      </span>
    </div>
  )
}

function FolderBranch({
  folder,
  depth,
  expanded,
  activePath,
  onToggle,
  onSelect,
  onContextMenu,
}: {
  folder: FolderNode
  depth: number
  expanded: Set<string>
  activePath: string | undefined
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onContextMenu: (path: string, event: React.MouseEvent) => void
}): React.JSX.Element {
  const open = expanded.has(folder.path)
  const hasChildren = folder.children.length > 0
  const Icon = open ? FolderOpen : Folder

  return (
    <>
      <button
        type="button"
        className={`nav-row ${activePath === folder.path ? 'is-active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onContextMenu={(event) => onContextMenu(folder.path, event)}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('.nav-chevron')) {
            onToggle(folder.path)
            return
          }
          onSelect(folder.path)
        }}
      >
        {hasChildren ? (
          <ChevronRight className={`nav-chevron ${open ? 'open' : ''}`} size={11} strokeWidth={2} />
        ) : (
          <span style={{ width: 12, flex: 'none' }} />
        )}
        <Icon className="nav-icon nav-folder" size={15} strokeWidth={1.7} />
        <span className="nav-label">{folder.name}</span>
        <span className="nav-count">{folder.count}</span>
      </button>
      {open && hasChildren
        ? folder.children.map((child) => (
            <FolderBranch
              key={child.path}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              onToggle={onToggle}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))
        : null}
    </>
  )
}
