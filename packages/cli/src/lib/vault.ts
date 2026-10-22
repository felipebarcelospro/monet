import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

import {
  type MarkdownDocument,
  type YAMLValue,
  parseMarkdown,
  scalarText,
  stringList,
} from './frontmatter.js'
import {
  type Heading,
  type Wikilink,
  parseHeadings,
  parseLinks,
  parseTags,
  stripMarkdownExtension,
} from './wikilink.js'

/** A Markdown note stored inside a vault. */
export interface Note {
  /** The vault-relative path without the `.md` extension. */
  id: string
  /** The vault-relative path including the `.md` extension. */
  relativePath: string
  /** The display title. */
  title: string
  /** Alternative names the note can be linked by. */
  aliases: string[]
  /** Tags declared in the frontmatter or written inline. */
  tags: string[]
  /** The complete frontmatter mapping. */
  frontmatter: Record<string, YAMLValue>
  /** The Markdown body without the frontmatter block. */
  body: string
  /** The outgoing links and embeds found in the body. */
  links: Wikilink[]
  /** The headings found in the body. */
  headings: Heading[]
  /** The last modification time, in milliseconds since the epoch. */
  modifiedAt: number
  /** The byte size of the file on disk. */
  byteSize: number
}

/** A note reduced to the fields the resolver needs. */
export interface Candidate {
  id: string
  relativePath: string
  title: string
  aliases: string[]
  folder: string
}

/** Raised when a vault cannot be read. */
export class VaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultError'
  }
}

/** The file extensions treated as notes. */
export const NOTE_EXTENSIONS = new Set(['md', 'markdown'])

/** Folder names that are never scanned. */
export const IGNORED_FOLDERS = new Set([
  '.git',
  '.obsidian',
  '.trash',
  '.monet',
  'node_modules',
  '.idea',
  '.vscode',
])

/**
 * Resolves wikilink targets to concrete notes, the way Obsidian does.
 */
export class LinkResolver {
  private readonly notesByID = new Map<string, Candidate>()
  private readonly byPath = new Map<string, Candidate>()
  private readonly byFileName = new Map<string, Candidate[]>()
  private readonly byAlias = new Map<string, Candidate[]>()

  constructor(notes: Candidate[]) {
    for (const note of notes) {
      this.notesByID.set(note.id, note)
      this.byPath.set(note.relativePath.toLowerCase(), note)

      const lastComponent = note.relativePath.split('/').pop() ?? note.relativePath
      const fileName = lastComponent.replace(/\.[^./\\]+$/u, '').toLowerCase()
      const bucket = this.byFileName.get(fileName)
      if (bucket) bucket.push(note)
      else this.byFileName.set(fileName, [note])

      for (const alias of note.aliases) {
        const key = alias.trim().toLowerCase()
        if (key.length === 0) continue
        const aliases = this.byAlias.get(key)
        if (aliases) aliases.push(note)
        else this.byAlias.set(key, [note])
      }
    }
  }

  /**
   * Resolves a wikilink target to a note id.
   */
  resolve(target: string, sourceFolder = '', sourceID?: string): string | undefined {
    const trimmed = target.trim()
    if (trimmed.length === 0) return sourceID
    if (trimmed.startsWith('#')) return sourceID

    const withoutExtension = stripMarkdownExtension(trimmed)
    const lowercased = withoutExtension.toLowerCase()

    const exact = this.byPath.get(`${lowercased}.md`) ?? this.byPath.get(lowercased)
    if (exact) return exact.id
    const direct = this.notesByID.get(lowercased)
    if (direct) return direct.id

    if (!lowercased.includes('/')) {
      const candidates = this.byFileName.get(lowercased)
      if (candidates && candidates.length > 0) {
        return this.pickBest(candidates, sourceFolder)?.id
      }
    } else {
      const segments = lowercased.split('/')
      const tail = segments[segments.length - 1]!
      const candidates = this.byFileName.get(tail)
      if (candidates && candidates.length > 0) {
        const filtered = candidates.filter((candidate) =>
          candidate.relativePath.toLowerCase().endsWith(`${lowercased}.md`),
        )
        const best = this.pickBest(filtered.length > 0 ? filtered : candidates, sourceFolder)
        if (best) return best.id
      }
    }

    const aliases = this.byAlias.get(lowercased)
    if (aliases && aliases.length > 0) {
      return this.pickBest(aliases, sourceFolder)?.id
    }

    const titleMatches = [...this.notesByID.values()].filter(
      (note) => note.title.toLowerCase() === lowercased,
    )
    if (titleMatches.length > 0) return this.pickBest(titleMatches, sourceFolder)?.id

    return undefined
  }

  /**
   * Picks the most plausible candidate when several notes match.
   */
  private pickBest(candidates: Candidate[], sourceFolder: string): Candidate | undefined {
    if (candidates.length === 0) return undefined
    if (candidates.length === 1) return candidates[0]

    const sourcePrefix = sourceFolder.length === 0 ? '' : `${sourceFolder.toLowerCase()}/`
    const scored = candidates.map((candidate) => {
      const path = candidate.relativePath.toLowerCase()
      let score = 0
      if (sourceFolder.length > 0 && candidate.folder.toLowerCase() === sourceFolder.toLowerCase()) {
        score += 100
      }
      if (sourcePrefix.length > 0 && path.startsWith(sourcePrefix)) score += 50
      if (candidate.folder.length === 0) score += 10
      return { candidate, score, length: candidate.relativePath.length, path }
    })

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      if (a.length !== b.length) return a.length - b.length
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    })
    return scored[0]?.candidate
  }
}

/** The searchable, linkable index of a vault. */
export class VaultIndex {
  /** Every note in the vault, ordered by path. */
  readonly notes: Note[]
  /** Resolves wikilink targets to note ids. */
  readonly resolver: LinkResolver
  /** Backlinks: target note id -> the ids of notes that link to it. */
  readonly backlinks = new Map<string, string[]>()
  /** Outgoing links: source note id -> the ids of the notes it links to. */
  readonly outgoing = new Map<string, string[]>()
  /** Every tag in the vault mapped to the notes that declare it. */
  readonly tags = new Map<string, string[]>()
  /** Wikilinks that could not be resolved to a note. */
  readonly unresolved = new Map<string, string[]>()
  /** Notes keyed by their vault-relative path. */
  readonly notesByPath = new Map<string, Note>()

  constructor(notes: Note[]) {
    this.notes = [...notes].sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    for (const note of this.notes) this.notesByPath.set(note.relativePath, note)

    this.resolver = new LinkResolver(
      this.notes.map((note) => ({
        id: note.id,
        relativePath: note.relativePath,
        title: note.title,
        aliases: note.aliases,
        folder: folderOf(note.relativePath),
      })),
    )

    for (const note of this.notes) {
      for (const tag of note.tags) {
        const key = tag.toLowerCase()
        const bucket = this.tags.get(key)
        if (bucket) bucket.push(note.id)
        else this.tags.set(key, [note.id])
      }

      const targets: string[] = []
      for (const link of note.links) {
        if (link.target.length === 0) continue
        const resolved = this.resolver.resolve(link.target, folderOf(note.relativePath), note.id)
        if (!resolved) {
          const bucket = this.unresolved.get(link.target)
          if (bucket) bucket.push(note.id)
          else this.unresolved.set(link.target, [note.id])
          continue
        }
        if (resolved === note.id || targets.includes(resolved)) continue
        targets.push(resolved)
        const bucket = this.backlinks.get(resolved)
        if (bucket) bucket.push(note.id)
        else this.backlinks.set(resolved, [note.id])
      }
      this.outgoing.set(note.id, targets)
    }
  }

  /** The note with the given id, if it exists. */
  note(id: string): Note | undefined {
    return this.notes.find((note) => note.id === id)
  }

  /** The notes that link to the given note. */
  backlinksOf(id: string): Note[] {
    return (this.backlinks.get(id) ?? []).flatMap((noteID) => {
      const note = this.note(noteID)
      return note ? [note] : []
    })
  }

  /** The notes the given note links to. */
  outgoingLinksOf(id: string): Note[] {
    return (this.outgoing.get(id) ?? []).flatMap((noteID) => {
      const note = this.note(noteID)
      return note ? [note] : []
    })
  }

  /** The notes that declare the given tag. */
  notesTagged(tag: string): Note[] {
    return (this.tags.get(tag.toLowerCase()) ?? []).flatMap((noteID) => {
      const note = this.note(noteID)
      return note ? [note] : []
    })
  }

  /** All tags in the vault, sorted by how many notes use them. */
  sortedTags(): { tag: string; count: number }[] {
    return [...this.tags.entries()]
      .map(([tag, ids]) => ({ tag, count: ids.length }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag < b.tag ? -1 : 1))
  }
}

/** Returns the folder that contains a vault-relative path. */
export function folderOf(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index === -1 ? '' : relativePath.slice(0, index)
}

/** A folder of Markdown files, read from disk. */
export class Vault {
  /** The absolute path of the vault root. */
  readonly root: string
  /** The index of the vault. */
  readonly index: VaultIndex

  private constructor(root: string, index: VaultIndex) {
    this.root = root
    this.index = index
  }

  /**
   * Opens a vault folder and indexes it.
   */
  static open(path: string): Vault {
    const root = resolve(expandHome(path))
    if (!existsSync(root)) throw new VaultError(`Vault not found: ${root}`)
    if (!statSync(root).isDirectory()) throw new VaultError(`Not a directory: ${root}`)
    const index = new VaultIndex(readNotes(root))
    return new Vault(root, index)
  }

  /** Every Markdown file in the vault, sorted by path. */
  static markdownFiles(root: string): string[] {
    const files: string[] = []
    const walk = (directory: string): void => {
      let entries: string[]
      try {
        entries = readdirSync(directory)
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.startsWith('.')) continue
        const full = join(directory, entry)
        let stats
        try {
          stats = statSync(full)
        } catch {
          continue
        }
        if (stats.isDirectory()) {
          if (IGNORED_FOLDERS.has(entry)) continue
          walk(full)
          continue
        }
        if (!stats.isFile()) continue
        const extension = entry.split('.').pop()?.toLowerCase() ?? ''
        if (!NOTE_EXTENSIONS.has(extension)) continue
        files.push(full)
      }
    }
    walk(root)
    return files.sort()
  }

  /** The vault-relative path of an absolute path inside the vault. */
  relativePath(absolute: string): string | undefined {
    const rel = relative(this.root, absolute)
    if (rel.length === 0 || rel.startsWith('..')) return undefined
    return rel.split(sep).join('/')
  }

  /** The absolute path of a vault-relative path. */
  absolutePath(relativePath: string): string {
    return join(this.root, ...relativePath.split('/'))
  }

  /** Reads and parses a single note from disk. */
  readNote(relativePath: string): Note | undefined {
    const absolute = this.absolutePath(relativePath)
    if (!existsSync(absolute)) return undefined
    const raw = readFileSync(absolute, 'utf8')
    return parseNote(relativePath, raw, statSync(absolute).mtimeMs)
  }
}

/** Parses note contents into a `Note`. */
export function parseNote(
  relativePath: string,
  contents: string,
  modifiedAt = 0,
): Note {
  let document: MarkdownDocument
  try {
    document = parseMarkdown(contents)
  } catch {
    document = { frontmatter: {}, body: contents, raw: contents }
  }

  const id = relativePath.replace(/\.[^./\\]+$/u, '')
  const fileName = id.split('/').pop() ?? id
  const frontmatterTitle = scalarText(document.frontmatter['title'])
  const frontmatterName = scalarText(document.frontmatter['name'])
  const title =
    frontmatterTitle && frontmatterTitle.trim().length > 0
      ? frontmatterTitle.trim()
      : frontmatterName && frontmatterName.trim().length > 0
        ? frontmatterName.trim()
        : fileName

  const aliases: string[] = []
  const seenAliases = new Set<string>()
  for (const key of ['alias', 'aliases']) {
    const value = document.frontmatter[key]
    if (!value) continue
    for (const alias of stringList(value)) {
      const cleaned = alias.trim()
      if (cleaned.length === 0) continue
      const key2 = cleaned.toLowerCase()
      if (seenAliases.has(key2)) continue
      seenAliases.add(key2)
      aliases.push(cleaned)
    }
  }

  const frontmatterTags = document.frontmatter['tags']
    ? stringList(document.frontmatter['tags'])
    : []
  const inlineTags = parseTags(document.body)
  const tags: string[] = []
  const seenTags = new Set<string>()
  for (const tag of [...frontmatterTags, ...inlineTags]) {
    const cleaned = tag.trim().replace(/^#+/u, '').trim()
    if (cleaned.length === 0) continue
    const key = cleaned.toLowerCase()
    if (seenTags.has(key)) continue
    seenTags.add(key)
    tags.push(cleaned)
  }

  return {
    id,
    relativePath,
    title,
    aliases,
    tags,
    frontmatter: document.frontmatter,
    body: document.body,
    links: parseLinks(document.body),
    headings: parseHeadings(document.body),
    modifiedAt,
    byteSize: Buffer.byteLength(contents, 'utf8'),
  }
}

/** Reads every note in a vault folder. */
export function readNotes(root: string): Note[] {
  const notes: Note[] = []
  for (const file of Vault.markdownFiles(root)) {
    const rel = relative(root, file).split(sep).join('/')
    try {
      const raw = readFileSync(file, 'utf8')
      notes.push(parseNote(rel, raw, statSync(file).mtimeMs))
    } catch {
      // A file that cannot be read is skipped rather than failing the vault.
    }
  }
  return notes
}

/** Expands a leading `~` in a path. */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}
