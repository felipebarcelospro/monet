import { create } from 'zustand'

import { bridge } from '../lib/bridge'
import { visibleNotes, type Source } from '../lib/notes'
import type {
  AppInfo,
  FrontmatterInput,
  NoteDocument,
  NoteSummary,
  Preferences,
  SearchHit,
  Theme,
  VaultSnapshot,
} from '../shared/contract'
import { translate, type MessageKey } from '../shared/i18n'

/** A short message shown above the status bar. */
export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

/** The two workspaces of the main column. */
export type Workspace = 'editor' | 'graph'

/** The overlay that is open, if any. */
export type Palette = 'none' | 'commands' | 'notes'

/** A dialog that asks the user something before it changes the vault. */
export type DialogState =
  | { kind: 'rename-note' }
  | { kind: 'delete-note' }
  | { kind: 'rename-folder'; path: string }
  | null

/** What a context menu was opened on. */
export type ContextTarget = { kind: 'note'; id: string } | { kind: 'folder'; path: string }

/** A context menu, anchored at the pointer. */
export interface ContextState {
  x: number
  y: number
  target: ContextTarget
}

/** The interface state. */
interface AppState {
  booted: boolean
  ready: boolean
  info: AppInfo | null
  prefs: Preferences
  snapshot: VaultSnapshot | null

  source: Source
  selectedId: string | null
  document: NoteDocument | null
  documentLoading: boolean
  dirty: boolean
  saving: boolean
  savedAt: number | null

  view: Workspace
  palette: Palette
  settingsOpen: boolean
  toast: Toast | null

  searchQuery: string
  searchHits: SearchHit[] | null
  searchFocusAt: number
  titleFocusAt: number

  history: string[]
  historyIndex: number

  tabs: string[]
  closeTab: (id: string) => void
  openDailyNote: () => Promise<void>

  boot: () => Promise<void>
  openVaultDialog: () => Promise<void>
  openVaultPath: (path: string) => Promise<void>
  createVaultDialog: () => Promise<void>
  selectNote: (id: string | null, options?: { pushHistory?: boolean }) => Promise<void>
  selectRelative: (offset: number) => void
  goBack: () => void
  goForward: () => void
  createNote: (title?: string) => Promise<void>
  updateBody: (body: string) => void
  updateTitle: (title: string) => void
  flushSave: () => Promise<boolean>
  save: () => Promise<boolean>
  deleteNote: (id?: string) => Promise<void>
  renameNote: (title: string) => Promise<void>
  setProperty: (key: string, value: FrontmatterInput) => Promise<void>
  toggleTag: (tag: string) => Promise<void>
  setSource: (source: Source) => void
  setSort: (sort: Preferences['sort']) => void
  setSearchQuery: (query: string) => void
  toggleFavorite: (id?: string) => void
  setView: (view: Workspace) => void
  reading: boolean
  setReading: (reading: boolean) => void
  toggleReading: () => void
  openPalette: (palette: Palette) => void
  closePalette: () => void
  openSettings: () => void
  closeSettings: () => void
  toggleInspector: () => void
  toggleSidebar: () => void
  cycleTheme: () => void
  setPrefs: (patch: Partial<Preferences>) => void
  applySnapshot: (snapshot: VaultSnapshot) => void
  copyPath: () => Promise<void>
  copyWikilink: () => Promise<void>
  revealNote: () => Promise<void>
  showToast: (message: string, kind?: 'info' | 'error') => void
  dismissToast: () => void

  dialog: DialogState
  context: ContextState | null
  openDialog: (dialog: DialogState) => void
  closeDialog: () => void
  openContext: (context: ContextState) => void
  closeContext: () => void
  renameFolder: (path: string, name: string) => Promise<void>
}

const defaultPreferences: Preferences = {
  theme: 'system',
  locale: 'en',
  sort: 'modified',
  editorWidth: 'wide',
  bodyFont: 'sans',
  inspectorOpen: true,
  sidebarOpen: true,
  favorites: {},
  sidebarWidth: 250,
  listWidth: 352,
  inspectorWidth: 304,
}

/**
 * A shared empty list. Selectors must return stable references: a fresh `[]`
 * on every call makes the store report a change on every render, which React
 * reports as an endless update loop.
 */
export const EMPTY_LIST: string[] = []

let saveTimer: ReturnType<typeof setTimeout> | number | null = null
let titleTimer: ReturnType<typeof setTimeout> | number | null = null
let searchTimer: ReturnType<typeof setTimeout> | number | null = null
let toastTimer: ReturnType<typeof setTimeout> | number | null = null
let saveSequence = 0
let loadSequence = 0
let searchSequence = 0
let listening = false
let themeMode: Theme = 'system'

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const darkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

darkQuery?.addEventListener('change', () => {
  if (themeMode === 'system') paintTheme()
})

/** Applies the theme to the document. */
function applyTheme(theme: Theme): void {
  themeMode = theme
  paintTheme()
}

function paintTheme(): void {
  if (typeof document === 'undefined') return
  const isDark = darkQuery ? darkQuery.matches : false
  const dark = themeMode === 'dark' || (themeMode === 'system' && isDark)
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<AppState>((set, get) => {
  const t = (key: MessageKey, values?: Record<string, string | number>): string =>
    translate(get().prefs.locale, key, values)

  const favoritesOf = (snapshot: VaultSnapshot | null, prefs: Preferences): string[] =>
    snapshot ? (prefs.favorites[snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST

  const pushHistory = (id: string): void => {
    const { history, historyIndex } = get()
    if (history[historyIndex] === id) return
    const next = [...history.slice(0, historyIndex + 1), id]
    set({ history: next, historyIndex: next.length - 1 })
  }

  const adoptVault = (snapshot: VaultSnapshot): void => {
    const state = get()
    set({
      snapshot,
      source: { kind: 'all' },
      selectedId: null,
      document: null,
      view: 'editor',
      searchQuery: '',
      searchHits: null,
      history: [],
      historyIndex: -1,
      reading: false,
      info: state.info
        ? {
            ...state.info,
            vault: snapshot,
            recentVaults: [
              snapshot.root,
              ...state.info.recentVaults.filter((path) => path !== snapshot.root),
            ],
          }
        : state.info,
    })
    selectFirstVisible()
    get().showToast(t('toast.vaultOpened'))
  }

  const selectFirstVisible = (): void => {
    const state = get()
    const notes = visibleNotes(
      state.snapshot,
      state.source,
      favoritesOf(state.snapshot, state.prefs),
      state.prefs.sort,
      state.searchHits,
    )
    if (notes[0]) void get().selectNote(notes[0].id)
    else set({ selectedId: null, document: null })
  }

  const scheduleSave = (): void => {
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      saveTimer = null
      void get().save()
    }, 550)
  }

  const installListeners = (): void => {
    if (listening) return
    listening = true

    bridge.onVaultChanged((snapshot) => {
      get().applySnapshot(snapshot)
    })

    bridge.onNoteChanged((event) => {
      const state = get()
      if (state.document?.id !== event.id || state.dirty) return
      void bridge.readNote(event.id).then((document) => {
        const current = get()
        if (!document || current.document?.id !== event.id || current.dirty) return
        set({ document, savedAt: document.modifiedAt })
      })
    })

    bridge.onPreferencesChanged((prefs) => {
      set({ prefs })
      applyTheme(prefs.theme)
    })
  }

  return {
    booted: false,
    ready: false,
    info: null,
    prefs: defaultPreferences,
    snapshot: null,

    source: { kind: 'all' },
    selectedId: null,
    document: null,
    documentLoading: false,
    dirty: false,
    saving: false,
    savedAt: null,

    view: 'editor',
    reading: false,
    palette: 'none',
    settingsOpen: false,
    toast: null,

    searchQuery: '',
    searchHits: null,
    searchFocusAt: 0,
    titleFocusAt: 0,

    history: [],
    historyIndex: -1,

    tabs: [],

    closeTab(id) {
      const { tabs, selectedId } = get()
      const nextTabs = tabs.filter((t) => t !== id)
      if (selectedId === id) {
        const nextId = nextTabs[nextTabs.length - 1] ?? null
        set({ tabs: nextTabs, selectedId: nextId })
        if (nextId) void get().selectNote(nextId)
      } else {
        set({ tabs: nextTabs })
      }
    },

    async openDailyNote() {
      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const title = `${yyyy}-${mm}-${dd}`
      const snapshot = get().snapshot

      if (!snapshot) return

      // Check if note already exists
      const existing = snapshot.notes.find(
        (n) => n.title === title || n.id.endsWith(title) || n.path.includes(title),
      )
      if (existing) {
        await get().selectNote(existing.id)
        return
      }

      // Check for daily template or create in Daily folder
      const folder = snapshot.folders.some((f) => f.name.toLowerCase().includes('daily'))
        ? '40-Daily'
        : 'Daily'

      try {
        const result = await bridge.createNote({
          title,
          folder,
          tags: ['daily'],
          body: `## Daily Log - ${title}\n\n- [ ] Plan the day\n\n### Notes\n`,
        })
        adoptVault(result.snapshot)
        set((state) => ({
          tabs: state.tabs.includes(result.document.id)
            ? state.tabs
            : [...state.tabs, result.document.id],
        }))
        await get().selectNote(result.document.id)
      } catch (error) {
        get().showToast(t('error.generic'), 'error')
        console.error(error)
      }
    },

    dialog: null,
    context: null,

    async boot() {
      if (get().booted) return
      set({ booted: true })
      try {
        const info = await bridge.info()
        set({ info, prefs: info.preferences, snapshot: info.vault, ready: true })
        applyTheme(info.preferences.theme)
        installListeners()

        const params = new URLSearchParams(window.location.search)
        if (params.get('view') === 'graph') set({ view: 'graph' })
        if (params.get('palette')) {
          set({ palette: params.get('palette') === 'notes' ? 'notes' : 'commands' })
        }
        if (params.get('settings') === '1') set({ settingsOpen: true })

        if (info.vault) {
          const requested = params.get('note')
          const match = requested
            ? (info.vault.notes.find((note) => note.id === requested) ??
              info.vault.notes.find((note) => note.title.toLowerCase() === requested.toLowerCase()))
            : undefined
          const first = match ?? info.vault.notes[0]
          if (first) await get().selectNote(first.id, { pushHistory: false })
          if (params.get('reading') === '1') set({ reading: true })
        }
      } catch (error) {
        set({ ready: true })
        get().showToast(t('error.vaultOpen'), 'error')
        console.error(error)
      }
    },

    async openVaultDialog() {
      if (!(await get().flushSave())) return
      const snapshot = await bridge.openVaultDialog()
      if (snapshot) adoptVault(snapshot)
    },

    async openVaultPath(path) {
      if (!(await get().flushSave())) return
      try {
        const snapshot = await bridge.openVault(path)
        adoptVault(snapshot)
      } catch (error) {
        get().showToast(t('error.vaultOpen'), 'error')
        console.error(error)
      }
    },

    async createVaultDialog() {
      if (!(await get().flushSave())) return
      const snapshot = await bridge.createVaultDialog()
      if (snapshot) adoptVault(snapshot)
    },

    async selectNote(id, options) {
      if (!id) {
        set({ selectedId: null, document: null, dirty: false })
        return
      }
      if (get().selectedId === id && get().document?.id === id) return

      if (!(await get().flushSave())) return
      const token = ++loadSequence
      set({ selectedId: id, documentLoading: true, dirty: false })
      if (options?.pushHistory !== false) pushHistory(id)

      try {
        const document = await bridge.readNote(id)
        if (token !== loadSequence) return
        if (!document) {
          set({ documentLoading: false })
          get().showToast(t('error.noteOpen'), 'error')
          return
        }
        set((state) => ({
          document,
          documentLoading: false,
          savedAt: document.modifiedAt,
          view: state.view,
          tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id],
        }))
      } catch (error) {
        set({ documentLoading: false })
        get().showToast(t('error.noteOpen'), 'error')
        console.error(error)
      }
    },

    selectRelative(offset) {
      const state = get()
      const notes = visibleNotes(
        state.snapshot,
        state.source,
        favoritesOf(state.snapshot, state.prefs),
        state.prefs.sort,
        state.searchHits,
      )
      if (notes.length === 0) return
      const current = notes.findIndex((note) => note.id === state.selectedId)
      const next = current === -1 ? 0 : Math.min(notes.length - 1, Math.max(0, current + offset))
      const note = notes[next]
      if (note) void get().selectNote(note.id)
    },

    goBack() {
      const { history, historyIndex } = get()
      const next = historyIndex - 1
      if (next < 0) return
      const id = history[next]
      set({ historyIndex: next })
      if (id) void get().selectNote(id, { pushHistory: false })
    },

    goForward() {
      const { history, historyIndex } = get()
      const next = historyIndex + 1
      if (next >= history.length) return
      const id = history[next]
      set({ historyIndex: next })
      if (id) void get().selectNote(id, { pushHistory: false })
    },

    async createNote(title) {
      if (!(await get().flushSave())) return
      const source = get().source
      const folder = source.kind === 'folder' ? source.path : ''
      const result = await bridge.createNote({ title: title ?? 'Untitled', folder })
      set({
        snapshot: result.snapshot,
        document: result.document,
        selectedId: result.document.id,
        documentLoading: false,
        dirty: false,
        savedAt: result.document.modifiedAt,
        view: 'editor',
        titleFocusAt: Date.now(),
        searchQuery: '',
        searchHits: null,
      })
      pushHistory(result.document.id)
      get().showToast(t('toast.noteCreated'))
    },

    updateBody(body) {
      const document = get().document
      if (!document) return
      set({ document: { ...document, body }, dirty: true })
      scheduleSave()
    },

    updateTitle(title) {
      const document = get().document
      if (!document) return

      const snapshot = get().snapshot
      set({
        document: { ...document, title },
        snapshot: snapshot
          ? {
              ...snapshot,
              notes: snapshot.notes.map((note) =>
                note.id === document.id ? { ...note, title } : note,
              ),
            }
          : null,
      })

      if (titleTimer) window.clearTimeout(titleTimer)
      titleTimer = window.setTimeout(() => {
        titleTimer = null
        const current = get().document
        if (!current) return
        const trimmed = current.title.trim()
        if (trimmed.length === 0) return
        void bridge
          .updateFrontmatter(current.id, 'title', trimmed, current.revision)
          .then((result) => {
            if (get().document?.id !== current.id) return
            set({
              snapshot: result.snapshot,
              document: get().document ? { ...get().document!, revision: result.revision } : null,
            })
          })
          .catch((error: unknown) => {
            const conflict = error instanceof Error && error.message.includes('NOTE_CONFLICT')
            get().showToast(t(conflict ? 'error.conflict' : 'error.save'), 'error')
          })
      }, 700)
    },

    async flushSave() {
      if (saveTimer) {
        window.clearTimeout(saveTimer)
        saveTimer = null
      }
      return get().save()
    },

    async save(): Promise<boolean> {
      const state = get()
      const document = state.document
      if (!document || !state.dirty) return true

      const body = document.body
      const id = document.id
      const sequence = ++saveSequence
      set({ saving: true })

      try {
        const result = await bridge.writeNote(id, body, document.revision)
        if (sequence !== saveSequence) return false
        set((current) => {
          const stillOpen = current.document?.id === id
          const dirty = stillOpen ? current.document!.body !== body : false
          const notes = current.snapshot
            ? current.snapshot.notes.map((note) => (note.id === id ? result.summary : note))
            : []
          return {
            document: stillOpen
              ? { ...current.document!, revision: result.revision }
              : current.document,
            saving: dirty,
            dirty,
            savedAt: result.modifiedAt,
            snapshot: current.snapshot ? { ...current.snapshot, notes } : null,
          }
        })
        if (get().dirty) scheduleSave()
        return true
      } catch (error) {
        set({ saving: false })
        const conflict = error instanceof Error && error.message.includes('NOTE_CONFLICT')
        get().showToast(t(conflict ? 'error.conflict' : 'error.save'), 'error')
        console.error(error)
        return false
      }
    },

    async deleteNote(id) {
      const target = id ?? get().selectedId
      if (!target) return
      if (!(await get().flushSave())) return
      try {
        const snapshot = await bridge.deleteNote(target)
        set({ snapshot, selectedId: null, document: null, history: [], historyIndex: -1 })
        selectFirstVisible()
        get().showToast(t('toast.deleted'))
      } catch (error) {
        get().showToast(t('error.generic'), 'error')
        console.error(error)
      }
    },

    async renameNote(title) {
      const document = get().document
      if (!document) return
      const trimmed = title.trim()
      if (trimmed.length === 0) return
      if (!(await get().flushSave())) return
      try {
        const result = await bridge.renameNote(document.id, trimmed)
        set({
          snapshot: result.snapshot,
          document: result.document,
          selectedId: result.document.id,
          history: [result.document.id],
          historyIndex: 0,
        })
        get().showToast(t('toast.renamed'))
      } catch (error) {
        get().showToast(t('error.generic'), 'error')
        console.error(error)
      }
    },

    async setProperty(key, value) {
      const document = get().document
      if (!document) return
      try {
        const result = await bridge.updateFrontmatter(document.id, key, value, document.revision)
        const frontmatter = { ...get().document?.frontmatter }
        if (value === null) delete frontmatter[key]
        else frontmatter[key] = value
        set({
          snapshot: result.snapshot,
          document: get().document
            ? { ...get().document!, frontmatter, revision: result.revision }
            : null,
        })
      } catch (error) {
        get().showToast(t('error.generic'), 'error')
        console.error(error)
      }
    },

    async toggleTag(tag) {
      const state = get()
      const document = state.document
      if (!document) return
      const note = state.snapshot?.notes.find((item) => item.id === document.id)
      const tags = note?.tags ?? []
      const exists = tags.some((item) => item.toLowerCase() === tag.toLowerCase())
      const next = exists
        ? tags.filter((item) => item.toLowerCase() !== tag.toLowerCase())
        : [...tags, tag]
      await get().setProperty('tags', next.length > 0 ? next : null)
    },

    setSource(source) {
      set({ source, searchQuery: '', searchHits: null, palette: 'none' })
      const state = get()
      const notes = visibleNotes(
        state.snapshot,
        source,
        favoritesOf(state.snapshot, state.prefs),
        state.prefs.sort,
        null,
      )
      if (notes.length === 0) {
        set({ selectedId: null, document: null })
        return
      }
      if (!notes.some((note) => note.id === state.selectedId)) {
        void get().selectNote(notes[0]!.id)
      }
    },

    setSort(sort) {
      get().setPrefs({ sort })
    },

    setSearchQuery(query) {
      set({ searchQuery: query })
      const sequence = ++searchSequence
      if (searchTimer) window.clearTimeout(searchTimer)

      if (query.trim().length === 0) {
        set({ searchHits: null })
        return
      }

      searchTimer = window.setTimeout(() => {
        searchTimer = null
        void bridge.search(query.trim(), 80).then((hits) => {
          if (sequence !== searchSequence) return
          set({ searchHits: hits })
        })
      }, 140)
    },

    toggleFavorite(id) {
      const state = get()
      const snapshot = state.snapshot
      if (!snapshot) return
      const target = id ?? state.selectedId
      if (!target) return

      const current = new Set(state.prefs.favorites[snapshot.root] ?? [])
      if (current.has(target)) current.delete(target)
      else current.add(target)

      const favorites = { ...state.prefs.favorites, [snapshot.root]: [...current] }
      set({ prefs: { ...state.prefs, favorites } })
      void bridge.setPreferences({ favorites })
      if (state.source.kind === 'favorites') {
        const notes = visibleNotes(
          { ...snapshot },
          state.source,
          [...current],
          state.prefs.sort,
          null,
        )
        if (notes[0]) void get().selectNote(notes[0].id)
        else set({ selectedId: null, document: null })
      }
    },

    setView(view) {
      set({ view })
    },

    setReading(reading) {
      set({ reading, view: reading ? 'editor' : get().view })
    },

    toggleReading() {
      const next = !get().reading
      set({ reading: next, view: 'editor' })
    },

    openPalette(palette) {
      set({ palette })
    },

    closePalette() {
      set({ palette: 'none' })
    },

    openSettings() {
      set({ settingsOpen: true })
    },

    closeSettings() {
      set({ settingsOpen: false })
    },

    toggleInspector() {
      const inspectorOpen = !get().prefs.inspectorOpen
      set({ prefs: { ...get().prefs, inspectorOpen } })
      void bridge.setPreferences({ inspectorOpen })
    },

    toggleSidebar() {
      const sidebarOpen = !get().prefs.sidebarOpen
      set({ prefs: { ...get().prefs, sidebarOpen } })
      void bridge.setPreferences({ sidebarOpen })
    },

    cycleTheme() {
      const isDark = darkQuery ? darkQuery.matches : false
      const dark = themeMode === 'dark' || (themeMode === 'system' && isDark)
      get().setPrefs({ theme: dark ? 'light' : 'dark' })
    },

    setPrefs(patch) {
      const prefs = { ...get().prefs, ...patch }
      set({ prefs })
      if (patch.theme) applyTheme(patch.theme)
      void bridge.setPreferences(patch).then((validated) => {
        set({ prefs: validated })
      })
    },

    applySnapshot(snapshot) {
      const state = get()
      const rootChanged = state.snapshot?.root !== snapshot.root
      set({ snapshot })

      if (rootChanged) {
        set({ source: { kind: 'all' }, history: [], historyIndex: -1 })
      }

      const selected = state.selectedId
      const exists = selected ? snapshot.notes.some((note) => note.id === selected) : false

      if (selected && !exists) {
        set({ selectedId: null, document: null })
        selectFirstVisible()
        return
      }

      if (!selected && snapshot.notes[0]) {
        void get().selectNote(snapshot.notes[0].id, { pushHistory: false })
      }
    },

    async copyPath() {
      const document = get().document
      if (!document) return
      await bridge.copyText(document.path)
      get().showToast(t('toast.copiedPath'))
    },

    async copyWikilink() {
      const document = get().document
      if (!document) return
      await bridge.copyText(`[[${document.title}]]`)
      get().showToast(t('toast.copiedLink'))
    },

    async revealNote() {
      const document = get().document
      if (document) await bridge.revealNote(document.id)
    },

    showToast(message, kind = 'info') {
      if (toastTimer) clearTimeout(toastTimer)
      set({ toast: { id: Date.now(), message, kind } })
      toastTimer = setTimeout(() => {
        set({ toast: null })
        toastTimer = null
      }, 2400)
    },

    openDialog(dialog) {
      set({ dialog, context: null })
    },

    closeDialog() {
      set({ dialog: null })
    },

    openContext(context) {
      set({ context })
    },

    closeContext() {
      set({ context: null })
    },

    async renameFolder(path, name) {
      const trimmed = name.trim()
      if (trimmed.length === 0) return
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      const target = parent.length > 0 ? `${parent}/${trimmed}` : trimmed
      if (target === path) return

      if (!(await get().flushSave())) return
      const remap = (id: string): string =>
        id.startsWith(`${path}/`) ? `${target}${id.slice(path.length)}` : id

      try {
        const snapshot = await bridge.renameFolder(path, trimmed)
        const state = get()
        const root = snapshot.root
        const favorites = (state.prefs.favorites[root] ?? EMPTY_LIST).map(remap)
        const source: Source =
          state.source.kind === 'folder' &&
          (state.source.path === path || state.source.path.startsWith(`${path}/`))
            ? { kind: 'folder', path: remap(state.source.path) }
            : state.source

        set({
          snapshot,
          source,
          history: state.history.map(remap),
          prefs: { ...state.prefs, favorites: { ...state.prefs.favorites, [root]: favorites } },
        })
        void bridge.setPreferences({ favorites: { [root]: favorites } })

        const selected = state.selectedId ? remap(state.selectedId) : null
        if (selected && selected !== state.selectedId) {
          await get().selectNote(selected, { pushHistory: false })
        }
        get().showToast(translate(get().prefs.locale, 'toast.renamed'))
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        get().showToast(
          translate(
            get().prefs.locale,
            message.includes('already exists') ? 'folder.exists' : 'error.generic',
          ),
          'error',
        )
        console.error(error)
      }
    },

    dismissToast() {
      if (toastTimer) window.clearTimeout(toastTimer)
      toastTimer = null
      set({ toast: null })
    },
  }
})

/** The favourites of the open vault. */
export function useFavorites(): string[] {
  return useStore((state) =>
    state.snapshot ? (state.prefs.favorites[state.snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST,
  )
}

/** The notes the list should show. */
export function useVisibleNotes(): NoteSummary[] {
  const snapshot = useStore((state) => state.snapshot)
  const source = useStore((state) => state.source)
  const sort = useStore((state) => state.prefs.sort)
  const favorites = useStore((state) =>
    state.snapshot ? (state.prefs.favorites[state.snapshot.root] ?? EMPTY_LIST) : EMPTY_LIST,
  )
  const searchHits = useStore((state) => state.searchHits)
  return visibleNotes(snapshot, source, favorites, sort, searchHits)
}
