import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useEffect, type CSSProperties } from 'react'

import { CommandPalette } from './components/Palette'
import { ContextMenu } from './components/ContextMenu'
import { Dialogs } from './components/Dialogs'
import { Inspector } from './components/Inspector'
import { MainPane } from './components/EditorPane'
import { NoteList } from './components/NoteList'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Welcome } from './components/Welcome'
import { useT } from './hooks/useT'
import { useWindowFocus } from './hooks/useWindowFocus'
import { bridge, isElectron } from './lib/bridge'
import { useStore } from './state/store'
import type { MenuAction } from './shared/contract'

/** The application: a boot screen, the welcome, or the three-column workspace. */
export function App(): React.JSX.Element {
  const t = useT()
  const ready = useStore((state) => state.ready)
  const snapshot = useStore((state) => state.snapshot)
  const prefs = useStore((state) => state.prefs)
  const palette = useStore((state) => state.palette)
  const settingsOpen = useStore((state) => state.settingsOpen)
  const toast = useStore((state) => state.toast)
  const dismissToast = useStore((state) => state.dismissToast)
  const boot = useStore((state) => state.boot)
  const focused = useWindowFocus()

  useEffect(() => {
    void boot()
  }, [boot])

  // Menu commands arrive from the native menu when running inside Electron.
  useEffect(() => {
    return bridge.onMenuAction((action: MenuAction) => {
      const state = useStore.getState()
      switch (action) {
        case 'new-note':
          void state.createNote()
          break
        case 'daily-note':
          void state.openDailyNote()
          break
        case 'close-tab':
          if (state.selectedId) state.closeTab(state.selectedId)
          break
        case 'open-vault':
          void state.openVaultDialog()
          break
        case 'command-palette':
          state.openPalette('commands')
          break
        case 'quick-switcher':
          state.openPalette('notes')
          break
        case 'search':
          state.setView('editor')
          if (!state.prefs.sidebarOpen) state.toggleSidebar()
          useStore.setState({ searchFocusAt: Date.now() })
          break
        case 'toggle-graph':
          state.setView(state.view === 'graph' ? 'editor' : 'graph')
          break
        case 'toggle-reading':
          state.toggleReading()
          break
        case 'toggle-inspector':
          state.toggleInspector()
          break
        case 'toggle-sidebar':
          state.toggleSidebar()
          break
        case 'settings':
          state.openSettings()
          break
        case 'reveal-note':
          void state.revealNote()
          break
        case 'copy-path':
          void state.copyPath()
          break
      }
    })
  }, [])

  // Keyboard shortcuts. Inside Electron the native menu owns the accelerators,
  // so the window only handles navigation keys there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useStore.getState()
      const meta = event.metaKey || event.ctrlKey
      const typing = isTyping(event.target)

      if (!isElectron && meta) {
        const key = event.key.toLowerCase()
        const shortcuts: Record<string, () => void> = {
          k: () => state.openPalette('commands'),
          p: () => state.openPalette('notes'),
          n: () => void state.createNote(),
          d: () => void state.openDailyNote(),
          w: () => {
            if (state.selectedId) state.closeTab(state.selectedId)
          },
          o: () => void state.openVaultDialog(),
          g: () => state.setView(state.view === 'graph' ? 'editor' : 'graph'),
          e: () => state.toggleReading(),
          '1': () => state.toggleSidebar(),
          '2': () => state.toggleInspector(),
          ',': () => state.openSettings(),
        }
        if (event.shiftKey && key === 'f') {
          event.preventDefault()
          useStore.setState({ searchFocusAt: Date.now() })
          return
        }
        const action = shortcuts[key]
        if (action) {
          event.preventDefault()
          action()
          return
        }
      }

      if (state.palette !== 'none' || state.settingsOpen || typing) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!state.snapshot) return
        event.preventDefault()
        state.selectRelative(event.key === 'ArrowDown' ? 1 : -1)
      }
    }

    const onBlur = (): void => {
      void useStore.getState().flushSave()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  if (!ready) return <div className="welcome" />

  if (!snapshot) {
    return (
      <div className={`app-root ${focused ? '' : 'window-inactive'}`}>
        <Welcome />
        {settingsOpen ? <Settings /> : null}
        {toast ? (
          <Toast message={toast.message} kind={toast.kind} onDismiss={dismissToast} />
        ) : null}
      </div>
    )
  }

  const shellStyle = {
    '--sidebar-width': `${prefs.sidebarWidth}px`,
    '--list-width': `${prefs.listWidth}px`,
    '--inspector-width': `${prefs.inspectorWidth}px`,
  } as CSSProperties

  const classes = [
    'shell',
    prefs.sidebarOpen ? '' : 'sidebar-hidden',
    prefs.editorWidth === 'narrow' ? 'reading-narrow' : '',
  ].join(' ')

  return (
    <div className={`app-root ${focused ? '' : 'window-inactive'}`}>
      <div className={classes} style={shellStyle}>
        <Sidebar />
        <NoteList />
        <MainPane />
        {prefs.inspectorOpen ? <Inspector /> : null}
        <StatusBar />
      </div>

      {palette !== 'none' ? (
        <CommandPalette mode={palette} onClose={() => useStore.getState().closePalette()} />
      ) : null}
      {settingsOpen ? <Settings /> : null}
      <Dialogs />
      <ContextMenu />
      {toast ? <Toast message={toast.message} kind={toast.kind} onDismiss={dismissToast} /> : null}
      <span className="sr-only" aria-live="polite">
        {t('status.saved')}
      </span>
    </div>
  )
}

function Toast({
  message,
  kind,
  onDismiss,
}: {
  message: string
  kind: 'info' | 'error'
  onDismiss: () => void
}): React.JSX.Element {
  const Icon = kind === 'error' ? AlertTriangle : CheckCircle2
  return (
    <div
      className={`toast ${kind === 'error' ? 'is-error' : ''}`}
      role="status"
      onClick={onDismiss}
    >
      <Icon className="toast-icon" size={12} strokeWidth={2} />
      {message}
    </div>
  )
}

/** Whether the keyboard is currently feeding text to an editor. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('.cm-editor')) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}
