/**
 * The contract between the Electron main process and the renderer.
 *
 * The renderer never touches the filesystem. It asks the vault service for a
 * snapshot, reads one note at a time, and writes through narrow, validated
 * messages. That keeps the window sandboxed and gives the CLI and the app a
 * single writer for the vault.
 */

/** The locales the app ships. */
export type Locale = 'en' | 'pt-BR' | 'es'

/** The appearance the user picked. */
export type Theme = 'system' | 'light' | 'dark'

/** How the note list is ordered. */
export type SortOrder = 'modified' | 'created' | 'title'

/** How wide the reading column is. */
export type EditorWidth = 'narrow' | 'wide'

/** The body typeface of the editor. */
export type BodyFont = 'sans' | 'serif'

/** A note without its body, which is all the list and the inspector need. */
export interface NoteSummary {
  id: string
  path: string
  title: string
  folder: string
  tags: string[]
  aliases: string[]
  /** The declared `type`, when the frontmatter has one. */
  type?: string
  /** The declared `status`, when the frontmatter has one. */
  status?: string
  /** A short, plain-text preview of the body. */
  excerpt: string
  /** The complete frontmatter, for the inspector. */
  frontmatter: Record<string, unknown>
  modifiedAt: number
  createdAt: number
  byteSize: number
  wordCount: number
  /** The ids of the notes this note links to. */
  outgoing: string[]
  /** The ids of the notes that link to this note. */
  backlinks: string[]
  /** The total number of links in both directions, used by the graph. */
  degree: number
}

/** A folder in the sidebar tree. */
export interface FolderNode {
  name: string
  path: string
  count: number
  children: FolderNode[]
}

/** A tag and how many notes declare it. */
export interface TagCount {
  tag: string
  count: number
}

/** The headline numbers of a vault. */
export interface VaultStats {
  notes: number
  links: number
  words: number
  unresolved: number
}

/** Everything the window needs to paint the three columns. */
/** A file that is not a note: an image, a video, a PDF or an audio clip. */
export interface AssetSummary {
  /** Path relative to the vault root. */
  path: string
  /** File name, used to resolve `![[name]]` embeds. */
  name: string
}

export interface VaultSnapshot {
  root: string
  name: string
  notes: NoteSummary[]
  folders: FolderNode[]
  tags: TagCount[]
  types: TagCount[]
  assets: AssetSummary[]
  stats: VaultStats
}

/** One note with its body, read only when it is opened. */
export interface NoteDocument {
  id: string
  path: string
  title: string
  frontmatter: Record<string, unknown>
  body: string
  modifiedAt: number
  createdAt: number
}

/** A search hit, computed in the main process. */
export interface SearchHit {
  id: string
  title: string
  path: string
  excerpt?: string
  score: number
}

/** A node of the link graph. */
export interface GraphNode {
  id: string
  title: string
  degree: number
  tags: string[]
  folder: string
}

/** An edge of the link graph. */
export interface GraphEdge {
  source: string
  target: string
}

/** The link graph, ready to be laid out by the renderer. */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** The user's preferences, stored outside the vault. */
export interface Preferences {
  theme: Theme
  locale: Locale
  sort: SortOrder
  editorWidth: EditorWidth
  bodyFont: BodyFont
  inspectorOpen: boolean
  sidebarOpen: boolean
  /** Favourite note ids, keyed by vault root. */
  favorites: Record<string, string[]>
  /** The width of the three columns, in pixels. */
  sidebarWidth: number
  listWidth: number
  inspectorWidth: number
}

/** What the app knows when it starts. */
export interface AppInfo {
  version: string
  platform: string
  preferences: Preferences
  recentVaults: string[]
  vault: VaultSnapshot | null
}

/** The result of writing a note. */
export interface WriteResult {
  summary: NoteSummary
  modifiedAt: number
}

/** A note creation request. */
export interface CreateNoteInput {
  title?: string
  folder?: string
  body?: string
  tags?: string[]
}

/** A frontmatter value the renderer may write. */
export type FrontmatterInput = string | string[] | null

/** The actions the native menu sends to the window. */
export type MenuAction =
  | 'new-note'
  | 'daily-note'
  | 'close-tab'
  | 'open-vault'
  | 'command-palette'
  | 'quick-switcher'
  | 'search'
  | 'toggle-graph'
  | 'toggle-reading'
  | 'toggle-inspector'
  | 'toggle-sidebar'
  | 'settings'
  | 'reveal-note'
  | 'copy-path'

/** The API the preload script exposes as `window.monet`. */
export interface MonetApi {
  info: () => Promise<AppInfo>
  openVaultDialog: () => Promise<VaultSnapshot | null>
  createVaultDialog: () => Promise<VaultSnapshot | null>
  openVault: (path: string) => Promise<VaultSnapshot>
  closeVault: () => Promise<void>
  snapshot: () => Promise<VaultSnapshot | null>
  readNote: (id: string) => Promise<NoteDocument | null>
  writeNote: (id: string, body: string) => Promise<WriteResult>
  createNote: (
    input: CreateNoteInput,
  ) => Promise<{ document: NoteDocument; snapshot: VaultSnapshot }>
  renameNote: (
    id: string,
    title: string,
  ) => Promise<{ document: NoteDocument; snapshot: VaultSnapshot }>
  deleteNote: (id: string) => Promise<VaultSnapshot>
  renameFolder: (path: string, name: string) => Promise<VaultSnapshot>
  revealNote: (id: string) => Promise<void>
  openAsset: (path: string) => Promise<void>
  updateFrontmatter: (
    id: string,
    key: string,
    value: FrontmatterInput,
  ) => Promise<{ summary: NoteSummary; snapshot: VaultSnapshot }>
  search: (query: string, limit?: number) => Promise<SearchHit[]>
  graph: (tag?: string) => Promise<GraphData>
  setPreferences: (patch: Partial<Preferences>) => Promise<Preferences>
  onVaultChanged: (listener: (snapshot: VaultSnapshot) => void) => () => void
  onNoteChanged: (listener: (event: { id: string; modifiedAt: number }) => void) => () => void
  onMenuAction: (listener: (action: MenuAction) => void) => () => void
  onPreferencesChanged: (listener: (preferences: Preferences) => void) => () => void
  minimize: () => Promise<void>
  closeWindow: () => Promise<void>
  zoomWindow: () => Promise<void>
  toggleFullscreen: () => Promise<void>
  copyText: (text: string) => Promise<void>
}
