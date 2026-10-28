import { watch, type FSWatcher } from 'node:fs'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

import {
  type Note,
  type YAMLValue,
  atomicWriteFileSync,
  SearchEngine,
  Vault,
  VaultIndex,
  buildGraph,
  folderOf,
  isSafeRelativePath,
  parseNote,
  readNotes,
  renderNote,
  revisionOf,
  removeAppLock,
  sanitizeTitle,
  uniqueNotePath,
  writeAppLock,
} from '@monet/core'

import type {
  AssetSummary,
  CreateNoteInput,
  FolderNode,
  GraphData,
  NoteDocument,
  NoteSummary,
  SearchHit,
  TagCount,
  VaultSnapshot,
  WriteResult,
} from '../src/shared/contract'

/**
 * The vault service.
 *
 * The main process owns the vault: it reads the folder once, keeps the parsed
 * notes in memory, and updates the index incrementally. The window only ever
 * sees summaries; a body is read when a note is opened. That keeps a vault of
 * a few thousand notes responsive without shipping the whole folder over IPC
 * on every keystroke.
 */
/**
 * Extensions the window can show inline or hand to another app.
 *
 * Notes are excluded on purpose: they come from the index, not from this list.
 */
const ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'avif',
  'bmp',
  'ico',
  'tiff',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'ogv',
  'mkv',
  'mp3',
  'wav',
  'm4a',
  'ogg',
  'flac',
  'aac',
  'pdf',
  'csv',
  'tsv',
  'zip',
  'json',
  'txt',
  'rtf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'key',
  'pages',
  'numbers',
])

/** Folders that never contain user attachments. */
const ASSET_SKIP = new Set(['.git', '.obsidian', '.trash', '.fractal', 'node_modules'])

/** Lists the attachments of a vault, skipping hidden and backup folders. */
function scanAssets(root: string): AssetSummary[] {
  const found: AssetSummary[] = []

  const walk = (folder: string): void => {
    if (found.length >= 4000) return
    let entries: { name: string; isDirectory: () => boolean }[]
    try {
      entries = readdirSync(join(root, folder), { withFileTypes: true }) as unknown as {
        name: string
        isDirectory: () => boolean
      }[]
    } catch {
      return
    }
    for (const entry of entries) {
      const relative = folder.length > 0 ? `${folder}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || ASSET_SKIP.has(entry.name)) continue
        walk(relative)
        continue
      }
      const dot = entry.name.lastIndexOf('.')
      if (dot === -1) continue
      const extension = entry.name.slice(dot + 1).toLowerCase()
      if (!ASSET_EXTENSIONS.has(extension)) continue
      found.push({ path: relative, name: entry.name })
    }
  }

  walk('')
  return found.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'))
}

export class VaultService {
  private vault: Vault | null = null
  private notes = new Map<string, Note>()
  private index = new VaultIndex([])
  private searchEngine: SearchEngine | null = null
  private graphCache: GraphData | null = null
  private watcher: FSWatcher | null = null
  private pending = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null
  private ignoreWrites = new Map<string, number>()
  private summaries = new Map<string, NoteSummary>()
  private quietUntil = 0
  private assets: AssetSummary[] = []
  private assetTimer: NodeJS.Timeout | null = null

  /** The root of the open vault, if any. */
  get root(): string | undefined {
    return this.vault?.root
  }

  /** The display name of the open vault. */
  get name(): string | undefined {
    return this.vault ? basename(this.vault.root) : undefined
  }

  /** Opens a folder and indexes every Markdown file in it. */
  open(path: string): VaultSnapshot {
    this.close()

    const vault = Vault.open(path)
    this.vault = vault
    this.notes = new Map(vault.index.notes.map((note) => [note.id, note]))
    this.assets = scanAssets(vault.root)
    this.rebuildIndex()
    this.summaries = new Map()

    this.watcher = this.startWatcher(vault.root)
    writeAppLock({
      vault: vault.root,
      pid: process.pid,
      startedAt: Date.now(),
    })

    return this.snapshot()!
  }

  /** Closes the vault, the watcher and the lock file. */
  close(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.vault) removeAppLock(this.vault.root)
    this.vault = null
    this.notes.clear()
    this.summaries.clear()
    this.index = new VaultIndex([])
    this.searchEngine = null
    this.graphCache = null
  }

  /** The current snapshot, or `null` when no vault is open. */
  snapshot(): VaultSnapshot | null {
    if (!this.vault) return null
    const notes = [...this.notes.values()]
      .map((note) => this.summary(note))
      .sort((a, b) => b.modifiedAt - a.modifiedAt)

    return {
      root: this.vault.root,
      name: basename(this.vault.root),
      notes,
      folders: this.folderTree(notes),
      tags: this.index.sortedTags(),
      types: this.typeCounts(notes),
      assets: this.assets,
      stats: {
        notes: notes.length,
        links: [...this.index.outgoing.values()].reduce((sum, list) => sum + list.length, 0),
        words: notes.reduce((sum, note) => sum + note.wordCount, 0),
        unresolved: [...this.index.unresolved.values()].reduce((sum, list) => sum + list.length, 0),
      },
    }
  }

  /** Reads one note with its body. */
  read(id: string): NoteDocument | null {
    const note = this.notes.get(id)
    if (!note) return null
    return this.document(note)
  }

  /** Writes the body of a note, refusing to clobber an external edit. */
  write(id: string, body: string, expectedRevision?: string): WriteResult {
    const note = this.requireNote(id)
    const absolute = this.requireVault().absolutePath(note.relativePath)

    if (expectedRevision) {
      if (!existsSync(absolute)) {
        throw new Error('NOTE_CONFLICT: this note was removed on disk')
      }
      const current = revisionOf(readFileSync(absolute, 'utf8'))
      if (current !== expectedRevision) {
        throw new Error('NOTE_CONFLICT: this note changed on disk')
      }
    }

    const before = (this.index.outgoing.get(id) ?? []).join('\u0000')
    const contents = renderNote(note, body)
    this.writeFile(note.relativePath, contents)

    const updated = this.reloadNote(note.relativePath)
    this.rebuildIndex()

    const after = (this.index.outgoing.get(id) ?? []).join('\u0000')
    if (before !== after) this.summaries.clear()

    return {
      summary: this.summary(updated ?? note),
      modifiedAt: updated?.modifiedAt ?? Date.now(),
      revision: (updated ?? note).revision,
    }
  }

  /** Creates a note and returns it with the refreshed snapshot. */
  create(input: CreateNoteInput): { document: NoteDocument; snapshot: VaultSnapshot } {
    const vault = this.requireVault()
    const root = vault.root
    const title = (input.title ?? 'Untitled').trim() || 'Untitled'
    if (input.folder !== undefined && !isSafeRelativePath(input.folder)) {
      throw new Error('A folder must stay inside the vault')
    }
    const relativePath = uniqueNotePath(root, title, input.folder)
    if (!isSafeRelativePath(relativePath)) {
      throw new Error('A note path must stay inside the vault')
    }
    const frontmatter: Record<string, YAMLValue> = {
      created: { kind: 'string', value: new Date().toISOString().slice(0, 10) },
      type: { kind: 'string', value: 'note' },
    }
    if (input.tags && input.tags.length > 0) {
      frontmatter['tags'] = {
        kind: 'array',
        value: input.tags.map((tag) => ({ kind: 'string', value: tag })),
      }
    }
    const contents = renderNote({ frontmatter }, input.body ?? '')
    const absolute = vault.absolutePath(relativePath)
    mkdirSync(dirname(absolute), { recursive: true })
    this.ignoreWrites.set(absolute, Date.now())
    writeFileSync(absolute, contents, 'utf8')

    const note = this.reloadNote(relativePath)
    if (!note) throw new Error(`Could not create ${relativePath}`)
    this.rebuildIndex()
    this.summaries.clear()

    return { document: this.document(note), snapshot: this.snapshot()! }
  }

  /**
   * Renames a note and rewrites every wikilink that pointed at it.
   *
   * Renaming a file is the one operation that can silently break a vault.
   * Updating the inbound links in the same pass is what makes the operation
   * safe, and it is the reason the rename lives here rather than in the UI.
   */
  rename(id: string, title: string): { document: NoteDocument; snapshot: VaultSnapshot } {
    const note = this.requireNote(id)
    const root = this.requireVault().root
    const cleaned = title.trim()
    if (cleaned.length === 0) throw new Error('A note needs a title')

    const folder = folderOf(note.relativePath)
    const relativePath = uniqueNotePath(root, cleaned, folder)
    if (relativePath === note.relativePath) {
      return { document: this.document(note), snapshot: this.snapshot()! }
    }
    if (existsSync(join(root, relativePath))) {
      throw new Error('A note with that name already exists')
    }

    const inbound = this.index.backlinks.get(id) ?? []

    renameSync(join(root, note.relativePath), join(root, relativePath))
    this.notes.delete(id)
    this.ignoreWrites.set(join(root, relativePath), Date.now())

    for (const sourceID of inbound) {
      const source = this.notes.get(sourceID)
      if (!source) continue
      const rewritten = rewriteLinks(source, (link) => {
        const resolved = this.index.resolver.resolve(
          link.target,
          folderOf(source.relativePath),
          source.id,
        )
        return resolved === id ? sanitizeTitle(cleaned) : null
      })
      if (rewritten === null) continue
      const contents = renderNote(source, rewritten)
      this.ignoreWrites.set(join(root, source.relativePath), Date.now())
      writeFileSync(join(root, source.relativePath), contents, 'utf8')
      this.reloadNote(source.relativePath, contents)
    }

    // The renamed note keeps a title property in sync, when it had one.
    const renamed = this.reloadNote(relativePath)
    if (renamed && renamed.frontmatter['title']) {
      const frontmatter = {
        ...renamed.frontmatter,
        title: { kind: 'string', value: cleaned } as YAMLValue,
      }
      const contents = renderNote({ frontmatter }, renamed.body)
      this.ignoreWrites.set(join(root, relativePath), Date.now())
      writeFileSync(join(root, relativePath), contents, 'utf8')
      this.reloadNote(relativePath, contents)
    }

    this.rebuildIndex()
    this.summaries.clear()

    const document = this.read(relativePath.replace(/\.[^./\\]+$/u, ''))
    if (!document) throw new Error('The renamed note could not be read')
    return { document, snapshot: this.snapshot()! }
  }

  /** Moves a note to the Trash through Finder, and re-indexes. */
  async delete(id: string, trash: (path: string) => Promise<void>): Promise<VaultSnapshot> {
    const note = this.requireNote(id)
    const absolute = join(this.requireVault().root, note.relativePath)
    await trash(absolute)
    this.notes.delete(id)
    this.rebuildIndex()
    this.summaries.clear()
    return this.snapshot()!
  }

  /** Replaces a frontmatter property, or removes it when the value is null. */
  updateFrontmatter(
    id: string,
    key: string,
    value: string | string[] | null,
    expectedRevision?: string,
  ): { summary: NoteSummary; snapshot: VaultSnapshot; revision: string } {
    const note = this.requireNote(id)
    const absolute = this.requireVault().absolutePath(note.relativePath)

    if (expectedRevision) {
      if (!existsSync(absolute)) {
        throw new Error('NOTE_CONFLICT: this note was removed on disk')
      }
      const current = revisionOf(readFileSync(absolute, 'utf8'))
      if (current !== expectedRevision) {
        throw new Error('NOTE_CONFLICT: this note changed on disk')
      }
    }

    const frontmatter = { ...note.frontmatter }
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      delete frontmatter[key]
    } else {
      frontmatter[key] = toYAML(value)
    }

    const contents = renderNote({ ...note, frontmatter }, note.body)
    this.writeFile(note.relativePath, contents)
    const updated = this.reloadNote(note.relativePath)
    this.rebuildIndex()
    this.summaries.clear()

    return {
      summary: this.summary(updated ?? note),
      snapshot: this.snapshot()!,
      revision: (updated ?? note).revision,
    }
  }

  /**
   * Renames a folder on disk and rewrites every link that names it by path.
   *
   * Links by title keep working, because the title does not change. Links
   * that spell the folder out (`[[Projects/Old/Note]]`) are rewritten first,
   * then the folder moves, then the whole vault is read again.
   */
  renameFolder(path: string, name: string): VaultSnapshot {
    const root = this.requireVault().root
    const cleaned = name.trim()
    if (cleaned.length === 0 || cleaned === '.' || cleaned === '..' || /[/\\:]/u.test(cleaned)) {
      throw new Error('A folder name cannot be empty or contain slashes')
    }

    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const target = parent.length > 0 ? `${parent}/${cleaned}` : cleaned
    if (!isSafeRelativePath(target)) throw new Error('A folder must stay inside the vault')
    if (target === path) return this.snapshot()!
    if (existsSync(join(root, target))) {
      throw new Error('A folder with that name already exists')
    }

    for (const note of [...this.notes.values()]) {
      const rewritten = rewriteLinks(note, (link) => {
        const linkTarget = link.target
        if (linkTarget === path || linkTarget.startsWith(`${path}/`)) {
          return `${target}${linkTarget.slice(path.length)}`
        }
        return null
      })
      if (rewritten !== null) this.writeFile(note.relativePath, renderNote(note, rewritten))
    }

    this.quietUntil = Date.now() + 1500
    renameSync(join(root, path), join(root, target))

    this.notes = new Map(readNotes(root).map((note) => [note.id, note]))
    this.rebuildIndex()
    return this.snapshot()!
  }

  /** Runs a full-text search over the vault. */
  search(query: string, limit = 60): SearchHit[] {
    if (!this.searchEngine) this.searchEngine = new SearchEngine(this.index)
    return this.searchEngine.search(query, limit).map((hit) => ({
      id: hit.noteID,
      title: hit.title,
      path: hit.path,
      ...(hit.excerpt ? { excerpt: hit.excerpt } : {}),
      score: hit.score,
    }))
  }

  /** The link graph, with the degree of every node. */
  graph(): GraphData {
    if (this.graphCache) return this.graphCache
    const graph = buildGraph(this.index)
    this.graphCache = {
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        degree: node.linkCount + node.backlinkCount,
        tags: node.tags,
        folder: folderOf(this.notes.get(node.id)?.relativePath ?? ''),
      })),
      edges: graph.edges,
    }
    return this.graphCache
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireVault(): Vault {
    if (!this.vault) throw new Error('No vault is open')
    return this.vault
  }

  private requireNote(id: string): Note {
    const note = this.notes.get(id)
    if (!note) throw new Error(`Note not found: ${id}`)
    return note
  }

  private rebuildIndex(): void {
    this.index = new VaultIndex([...this.notes.values()])
    this.searchEngine = null
    this.graphCache = null
    this.summaries.clear()
  }

  /** Writes a file and remembers that the watcher should ignore the event. */
  private writeFile(relativePath: string, contents: string): void {
    const absolute = this.requireVault().absolutePath(relativePath)
    this.ignoreWrites.set(absolute, Date.now())
    atomicWriteFileSync(absolute, contents)
  }

  /** Re-reads a note from disk and puts it back in the map. */
  private reloadNote(relativePath: string, contents?: string): Note | undefined {
    const root = this.requireVault().root
    const absolute = join(root, relativePath)
    if (!existsSync(absolute)) return undefined
    try {
      const raw = contents ?? readFileSync(absolute, 'utf8')
      const stats = statSync(absolute)
      const note = parseNote(relativePath, raw, stats.mtimeMs, stats.birthtimeMs)
      this.notes.set(note.id, note)
      return note
    } catch {
      return undefined
    }
  }

  private document(note: Note): NoteDocument {
    return {
      id: note.id,
      path: note.relativePath,
      title: note.title,
      frontmatter: plainFrontmatter(note.frontmatter),
      body: note.body,
      revision: note.revision,
      modifiedAt: note.modifiedAt,
      createdAt: note.createdAt ?? note.modifiedAt,
    }
  }

  private summary(note: Note): NoteSummary {
    const cached = this.summaries.get(note.id)
    if (cached && cached.modifiedAt === note.modifiedAt) return cached

    const outgoing = this.index.outgoing.get(note.id) ?? []
    const backlinks = this.index.backlinks.get(note.id) ?? []
    const summary: NoteSummary = {
      id: note.id,
      path: note.relativePath,
      title: note.title,
      folder: folderOf(note.relativePath),
      tags: note.tags,
      aliases: note.aliases,
      ...(declared(note, 'type') ? { type: declared(note, 'type')!.toLowerCase() } : {}),
      ...(declared(note, 'status') ? { status: declared(note, 'status')!.toLowerCase() } : {}),
      excerpt: excerptOf(note.body),
      frontmatter: plainFrontmatter(note.frontmatter),
      modifiedAt: note.modifiedAt,
      createdAt: note.createdAt ?? note.modifiedAt,
      byteSize: note.byteSize,
      wordCount: wordCount(note.body),
      outgoing,
      backlinks,
      degree: outgoing.length + backlinks.length,
    }
    this.summaries.set(note.id, summary)
    return summary
  }

  private typeCounts(notes: NoteSummary[]): TagCount[] {
    const counts = new Map<string, number>()
    for (const note of notes) {
      const type = note.type
      if (!type) continue
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)))
  }

  private folderTree(notes: NoteSummary[]): FolderNode[] {
    const root: FolderNode = { name: '', path: '', count: notes.length, children: [] }
    const byPath = new Map<string, FolderNode>([['', root]])

    for (const note of notes) {
      const segments = note.folder.split('/').filter(Boolean)
      let current = ''
      let parent = root
      for (const segment of segments) {
        current = current.length === 0 ? segment : `${current}/${segment}`
        let node = byPath.get(current)
        if (!node) {
          node = { name: segment, path: current, count: 0, children: [] }
          byPath.set(current, node)
          parent.children.push(node)
        }
        node.count += 1
        parent = node
      }
    }

    const sort = (nodes: FolderNode[]): void => {
      nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      for (const node of nodes) sort(node.children)
    }
    sort(root.children)
    return root.children
  }

  private startWatcher(root: string): FSWatcher | null {
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        if (Date.now() < this.quietUntil) return
        const relativePath = String(filename).split('\\').join('/')
        if (relativePath.split('/').some((part) => part.startsWith('.'))) return

        if (!relativePath.toLowerCase().endsWith('.md')) {
          // A new image or attachment: refresh the list the window resolves
          // embeds against, without re-reading a single note.
          if (this.assetTimer) clearTimeout(this.assetTimer)
          this.assetTimer = setTimeout(() => {
            this.assetTimer = null
            if (this.vault) this.assets = scanAssets(this.vault.root)
          }, 800)
          return
        }

        const absolute = join(root, relativePath)
        const ignoredAt = this.ignoreWrites.get(absolute)
        if (ignoredAt && Date.now() - ignoredAt < 900) return

        this.pending.add(relativePath)
        if (this.flushTimer) clearTimeout(this.flushTimer)
        this.flushTimer = setTimeout(() => this.flush(), 140)
      })
      watcher.on('error', () => {
        // A watcher that fails must never take the app down; the vault is
        // still readable and writable, it just stops noticing outside edits.
      })
      return watcher
    } catch {
      return null
    }
  }

  private flush(): void {
    if (!this.vault) return
    const paths = [...this.pending]
    this.pending.clear()
    this.flushTimer = null

    let changed = false
    const touched: { id: string; modifiedAt: number }[] = []

    for (const relativePath of paths) {
      const absolute = join(this.vault.root, relativePath)
      const existing = [...this.notes.values()].find((note) => note.relativePath === relativePath)

      if (!existsSync(absolute)) {
        if (existing) {
          this.notes.delete(existing.id)
          changed = true
        }
        continue
      }

      const note = this.reloadNote(relativePath)
      if (note) {
        touched.push({ id: note.id, modifiedAt: note.modifiedAt })
        changed = true
      }
    }

    if (!changed) return
    this.rebuildIndex()
    this.onChanged(touched, this.snapshot())
  }

  /**
   * Called after an external change. The window installs the handler and
   * forwards the event to the renderer.
   */
  onChanged: (notes: { id: string; modifiedAt: number }[], snapshot: VaultSnapshot | null) => void =
    () => {}
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Reads a declared string property. */
function declared(note: Note, key: string): string | undefined {
  const value = note.frontmatter[key]
  if (!value) return undefined
  if (value.kind === 'string') return value.value
  if (value.kind === 'int' || value.kind === 'double') return String(value.value)
  return undefined
}

/** Converts a frontmatter value into a plain JavaScript value. */
function plain(value: YAMLValue): unknown {
  switch (value.kind) {
    case 'string':
    case 'int':
    case 'double':
    case 'bool':
      return value.value
    case 'null':
      return null
    case 'array':
      return value.value.map(plain)
    case 'mapping':
      return Object.fromEntries(Object.entries(value.value).map(([k, v]) => [k, plain(v)]))
  }
}

/** Converts a note's frontmatter into a plain object. */
export function plainFrontmatter(frontmatter: Record<string, YAMLValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(frontmatter).map(([key, value]) => [key, plain(value)]))
}

/** Converts a value written by the inspector into YAML. */
function toYAML(value: string | string[]): YAMLValue {
  if (Array.isArray(value)) {
    return { kind: 'array', value: value.map((item) => ({ kind: 'string', value: item })) }
  }
  return { kind: 'string', value }
}

/** The number of words in a body. */
export function wordCount(body: string): number {
  const trimmed = body.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length
}

/** Turns Markdown into a single line of plain text. */
export function plainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/~~~[\s\S]*?~~~/gu, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(
      /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu,
      (_m, target: string, alias?: string) => alias ?? target,
    )
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/^>\s?/gmu, '')
    .replace(/^[-*+]\s+/gmu, '')
    .replace(/^\d+\.\s+/gmu, '')
    .replace(/[*_~`]/gu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** The preview shown in the note list. */
export function excerptOf(body: string): string {
  const text = plainText(body)
  return text.length <= 220 ? text : `${text.slice(0, 220).trimEnd()}…`
}

/**
 * Rewrites the wikilinks of a note.
 *
 * `replacement` returns the new target, or `null` to leave the link alone.
 * The links are rewritten from the end so earlier offsets stay valid.
 */
export function rewriteLinks(
  note: Note,
  replacement: (link: Note['links'][number]) => string | null,
): string | null {
  let body = note.body
  let changed = false
  for (const link of [...note.links].sort((a, b) => b.start - a.start)) {
    const target = replacement(link)
    if (target === null) continue
    const raw = body.slice(link.start, link.end)
    const rewritten = raw.replace(/^(!?\[\[)([^\]|#]+)/u, `$1${target}`)
    if (rewritten !== raw) {
      body = body.slice(0, link.start) + rewritten + body.slice(link.end)
      changed = true
    }
  }
  return changed ? body : null
}

/** Returns the path of a note relative to the vault, for the Finder. */
export function absoluteNotePath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split('/'))
}
