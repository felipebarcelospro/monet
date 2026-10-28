import type {
  AppInfo,
  CreateNoteInput,
  FrontmatterInput,
  GraphData,
  MonetApi,
  NoteDocument,
  NoteSummary,
  Preferences,
  SearchHit,
  VaultSnapshot,
  WriteResult,
} from '../shared/contract'

/**
 * The window talks to the machine through `window.monet`, installed by the
 * preload script. When the interface is opened in a plain browser — the
 * design harness used while working on the visual system — a small in-memory
 * bridge stands in for it, reading a frozen snapshot of the example vault.
 */
export const bridge: MonetApi =
  typeof window !== 'undefined' && window.monet ? window.monet : createMockBridge()

/** Whether the interface is running inside Electron. */
export const isElectron = typeof window !== 'undefined' && Boolean(window.monet)

// ---------------------------------------------------------------------------
// The browser harness
// ---------------------------------------------------------------------------

interface MockData {
  snapshot: VaultSnapshot
  documents: NoteDocument[]
  preferences?: Preferences
}

function createMockBridge(): MonetApi {
  let data: MockData | null = null
  let loading: Promise<MockData> | null = null
  let preferences: Preferences = {
    theme: 'light',
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

  const load = async (): Promise<MockData> => {
    if (data) return data
    if (loading) return loading
    loading = fetch('./mock.json')
      .then((response) => response.json() as Promise<MockData>)
      .then((json) => {
        data = json
        if (json.preferences) preferences = { ...preferences, ...json.preferences }
        return json
      })
      .catch(() => {
        const empty: MockData = {
          snapshot: {
            root: '/Monet',
            name: 'Monet',
            notes: [],
            folders: [],
            tags: [],
            types: [],
            assets: [],
            stats: { notes: 0, links: 0, words: 0, unresolved: 0 },
          },
          documents: [],
        }
        data = empty
        return empty
      })
    return loading
  }

  const documentOf = (id: string): NoteDocument | undefined =>
    data?.documents.find((document) => document.id === id)

  const summaryOf = (document: NoteDocument): NoteSummary => ({
    id: document.id,
    path: document.path,
    title: document.title,
    folder: document.path.includes('/')
      ? document.path.slice(0, document.path.lastIndexOf('/'))
      : '',
    tags: Array.isArray(document.frontmatter['tags'])
      ? (document.frontmatter['tags'] as string[])
      : typeof document.frontmatter['tags'] === 'string'
        ? [document.frontmatter['tags'] as string]
        : [],
    aliases: [],
    ...(typeof document.frontmatter['type'] === 'string'
      ? { type: (document.frontmatter['type'] as string).toLowerCase() }
      : {}),
    ...(typeof document.frontmatter['status'] === 'string'
      ? { status: (document.frontmatter['status'] as string).toLowerCase() }
      : {}),
    excerpt: document.body
      .replace(/[#>*_[\]`]/gu, '')
      .replace(/\s+/gu, ' ')
      .slice(0, 200),
    frontmatter: document.frontmatter,
    modifiedAt: Date.now(),
    createdAt: document.createdAt,
    byteSize: document.body.length,
    wordCount: document.body.trim().split(/\s+/u).length,
    outgoing: [],
    backlinks: [],
    degree: 0,
  })

  return {
    async info(): Promise<AppInfo> {
      const mock = await load()
      return {
        version: '0.1.0',
        platform: 'browser',
        preferences,
        recentVaults: [mock.snapshot.root],
        vault: mock.snapshot,
      }
    },
    async openVaultDialog() {
      return data?.snapshot ?? null
    },
    async createVaultDialog() {
      return data?.snapshot ?? null
    },
    async openVault() {
      const mock = await load()
      return mock.snapshot
    },
    async closeVault() {},
    async snapshot() {
      return data?.snapshot ?? null
    },
    async readNote(id: string) {
      await load()
      return documentOf(id) ?? null
    },
    async writeNote(id: string, body: string): Promise<WriteResult> {
      const document = documentOf(id)
      if (!document) throw new Error('Note not found')
      document.body = body
      const summary = summaryOf(document)
      if (data) {
        data.snapshot.notes = data.snapshot.notes.map((note) => (note.id === id ? summary : note))
      }
      return { summary, modifiedAt: Date.now(), revision: 'mock' }
    },
    async createNote(input: CreateNoteInput) {
      const mock = await load()
      const title = input.title ?? 'Untitled'
      const id = `Inbox/${title}`
      const document: NoteDocument = {
        id,
        path: `${id}.md`,
        title,
        frontmatter: { type: 'note', created: new Date().toISOString().slice(0, 10) },
        body: input.body ?? '',
        revision: 'mock',
        modifiedAt: Date.now(),
        createdAt: Date.now(),
      }
      mock.documents.push(document)
      mock.snapshot.notes.unshift(summaryOf(document))
      return { document, snapshot: mock.snapshot }
    },
    async renameNote(id: string, title: string) {
      const mock = await load()
      const document = documentOf(id)
      if (!document) throw new Error('Note not found')
      document.title = title
      const summary = summaryOf(document)
      mock.snapshot.notes = mock.snapshot.notes.map((note) => (note.id === id ? summary : note))
      return { document, snapshot: mock.snapshot }
    },
    async deleteNote(id: string) {
      const mock = await load()
      mock.snapshot.notes = mock.snapshot.notes.filter((note) => note.id !== id)
      mock.documents = mock.documents.filter((document) => document.id !== id)
      return mock.snapshot
    },
    async renameFolder(path: string, name: string) {
      const mock = await load()
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      const target = parent ? `${parent}/${name}` : name
      mock.snapshot.notes = mock.snapshot.notes.map((note) => {
        if (note.folder !== path && !note.folder.startsWith(`${path}/`)) return note
        const folder = `${target}${note.folder.slice(path.length)}`
        const id = `${folder}/${note.id.split('/').pop()}`
        return { ...note, id, folder, path: `${id}.md` }
      })
      return mock.snapshot
    },
    async revealNote() {},
    async openAsset() {},
    async updateFrontmatter(id: string, key: string, value: FrontmatterInput) {
      const mock = await load()
      const document = documentOf(id)
      if (!document) throw new Error('Note not found')
      if (value === null) delete document.frontmatter[key]
      else document.frontmatter[key] = value
      if (key === 'title' && typeof value === 'string') document.title = value
      const summary = summaryOf(document)
      mock.snapshot.notes = mock.snapshot.notes.map((note) => (note.id === id ? summary : note))
      return { summary, snapshot: mock.snapshot, revision: 'mock' }
    },
    async search(query: string, limit = 60): Promise<SearchHit[]> {
      const mock = await load()
      const needle = query.toLowerCase()
      return mock.snapshot.notes
        .filter((note) => {
          const document = documentOf(note.id)
          return (
            note.title.toLowerCase().includes(needle) ||
            (document?.body.toLowerCase().includes(needle) ?? false)
          )
        })
        .slice(0, limit)
        .map((note) => ({ id: note.id, title: note.title, path: note.path, score: 1 }))
    },
    async graph(): Promise<GraphData> {
      const mock = await load()
      return {
        nodes: mock.snapshot.notes.map((note) => ({
          id: note.id,
          title: note.title,
          degree: note.degree,
          tags: note.tags,
          folder: note.folder,
        })),
        edges: mock.snapshot.notes.flatMap((note) =>
          note.outgoing.map((target) => ({ source: note.id, target })),
        ),
      }
    },
    async setPreferences(patch: Partial<Preferences>) {
      preferences = { ...preferences, ...patch }
      return preferences
    },
    onVaultChanged: () => () => {},
    onNoteChanged: () => () => {},
    onMenuAction: () => () => {},
    onPreferencesChanged: () => () => {},
    async minimize() {},
    async closeWindow() {},
    async zoomWindow() {},
    async toggleFullscreen() {},
    async copyText() {},
  }
}
