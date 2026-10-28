import { Copy, ExternalLink, Link2, ListFilter, Pencil, Star, Trash2 } from 'lucide-react'
import { useEffect } from 'react'

import { useT } from '../hooks/useT'
import { EMPTY_LIST, useStore } from '../state/store'
import { MenuItem, MenuSeparator } from './Menu'

/**
 * The right-click menu for notes and folders.
 *
 * A note is selected before its menu opens, so every action that works on the
 * open note works here too. Destructive and naming actions open a dialog.
 */
export function ContextMenu(): React.JSX.Element | null {
  const t = useT()
  const context = useStore((state) => state.context)
  const close = useStore((state) => state.closeContext)
  const openDialog = useStore((state) => state.openDialog)
  const toggleFavorite = useStore((state) => state.toggleFavorite)
  const copyWikilink = useStore((state) => state.copyWikilink)
  const copyPath = useStore((state) => state.copyPath)
  const revealNote = useStore((state) => state.revealNote)
  const setSource = useStore((state) => state.setSource)
  const favorites = useStore((state) =>
    state.snapshot ? (state.prefs.favorites[state.snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST,
  )
  const selectedId = useStore((state) => state.selectedId)

  useEffect(() => {
    if (!context) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [context, close])

  if (!context) return null

  const left = Math.min(context.x, window.innerWidth - 230)
  const top = Math.min(context.y, window.innerHeight - 260)

  return (
    <div
      className="scrim context-scrim"
      onMouseDown={close}
      onContextMenu={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <div
        className="menu context-menu"
        role="menu"
        style={{ left, top, right: 'auto' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {context.target.kind === 'note' ? (
          <>
            <MenuItem icon={Pencil} onSelect={() => openDialog({ kind: 'rename-note' })}>
              {t('palette.rename')}
            </MenuItem>
            <MenuItem
              icon={Star}
              selected={favorites.includes(selectedId ?? '')}
              onSelect={() => {
                close()
                toggleFavorite()
              }}
            >
              {favorites.includes(selectedId ?? '')
                ? t('palette.unfavorite')
                : t('palette.favorite')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={Link2}
              onSelect={() => {
                close()
                void copyWikilink()
              }}
            >
              {t('palette.copyWikilink')}
            </MenuItem>
            <MenuItem
              icon={Copy}
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
            <MenuItem icon={Trash2} danger onSelect={() => openDialog({ kind: 'delete-note' })}>
              {t('editor.delete')}
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              icon={Pencil}
              onSelect={() =>
                openDialog({
                  kind: 'rename-folder',
                  path: context.target.kind === 'folder' ? context.target.path : '',
                })
              }
            >
              {t('folder.rename')}
            </MenuItem>
            <MenuItem
              icon={ListFilter}
              onSelect={() => {
                close()
                if (context.target.kind === 'folder') {
                  setSource({ kind: 'folder', path: context.target.path })
                }
              }}
            >
              {t('folder.show')}
            </MenuItem>
          </>
        )}
      </div>
    </div>
  )
}
