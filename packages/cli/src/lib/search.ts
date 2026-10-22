import type { Note, VaultIndex } from './vault.js'

/** A single search result. */
export interface SearchResult {
  /** The id of the matching note. */
  noteID: string
  /** The display title of the note. */
  title: string
  /** The vault-relative path of the note. */
  path: string
  /** The score produced by the ranking function; higher is better. */
  score: number
  /** A short excerpt around the match, when the match was in the body. */
  excerpt?: string
}

/**
 * A full-text, fuzzy search engine over a vault index.
 *
 * The ranking mirrors `MonetCore/Search/SearchEngine.swift` exactly so the
 * app and the CLI return the same order for the same query.
 */
export class SearchEngine {
  private readonly index: VaultIndex
  private readonly bodies = new Map<string, string>()

  constructor(index: VaultIndex) {
    this.index = index
    for (const note of index.notes) {
      this.bodies.set(note.id, note.body.toLowerCase())
    }
  }

  /**
   * Runs a search and returns the best matches.
   */
  search(query: string, limit = 50, tagFilter?: string): SearchResult[] {
    const trimmed = query.trim()
    const candidates: Note[] = tagFilter
      ? this.index.notesTagged(tagFilter)
      : this.index.notes

    if (trimmed.length === 0) {
      return [...candidates]
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, limit)
        .map((note) => ({ noteID: note.id, title: note.title, path: note.relativePath, score: 1 }))
    }

    const needle = trimmed.toLowerCase()
    const results: SearchResult[] = []

    for (const note of candidates) {
      const lowerTitle = note.title.toLowerCase()
      let score = 0
      let excerpt: string | undefined

      if (lowerTitle === needle) {
        score = 1000
      } else if (lowerTitle.startsWith(needle)) {
        score = 700
      } else if (lowerTitle.includes(needle)) {
        score = 500
      } else if (note.aliases.some((alias) => alias.toLowerCase() === needle)) {
        score = 450
      } else if (note.aliases.some((alias) => alias.toLowerCase().includes(needle))) {
        score = 380
      } else if (note.tags.some((tag) => tag.toLowerCase().includes(needle))) {
        score = 300
      } else {
        const similarity = fuzzySimilarity(needle, lowerTitle)
        if (similarity !== undefined && similarity > 0.55) {
          score = 250 * similarity
        } else {
          const body = this.bodies.get(note.id)
          const position = body?.indexOf(needle) ?? -1
          if (body && position !== -1) {
            const density = needle.length / Math.max(1, body.length)
            score = 200 + density * 100
            excerpt = makeExcerpt(body, position, needle.length)
          }
        }
      }

      if (score > 0) {
        results.push({
          noteID: note.id,
          title: note.title,
          path: note.relativePath,
          score,
          excerpt,
        })
      }
    }

    return results
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        if (a.title !== b.title) return a.title < b.title ? -1 : 1
        return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
      })
      .slice(0, limit)
  }
}

/**
 * Scores how well `needle` fuzzily matches `haystack`.
 */
export function fuzzySimilarity(needle: string, haystack: string): number | undefined {
  if (needle.length === 0 || haystack.length === 0) return undefined

  let needleIndex = 0
  let haystackIndex = 0
  let matches = 0
  let contiguous = 0
  let bestContiguous = 0
  let firstMatchOffset = 0
  let didFindFirst = false

  while (needleIndex < needle.length && haystackIndex < haystack.length) {
    if (needle[needleIndex] === haystack[haystackIndex]) {
      matches += 1
      if (!didFindFirst) {
        firstMatchOffset = haystackIndex
        didFindFirst = true
        contiguous = 1
      } else {
        contiguous += 1
      }
      bestContiguous = Math.max(bestContiguous, contiguous)
      needleIndex += 1
    } else {
      contiguous = 0
    }
    haystackIndex += 1
  }

  if (matches !== needle.length) return undefined

  const coverage = matches / needle.length
  const contiguity = bestContiguous / needle.length
  const positionPenalty = 1 - (firstMatchOffset / Math.max(1, haystack.length)) * 0.2
  return Math.min(1, (coverage * 0.5 + contiguity * 0.5) * positionPenalty)
}

/**
 * Builds a short excerpt centred on a match.
 */
export function makeExcerpt(body: string, position: number, length: number): string {
  const context = 60
  const start = Math.max(0, position - context)
  const end = Math.min(body.length, position + length + context)
  let excerpt = body.slice(start, end).replace(/\n/gu, ' ')
  if (start > 0) excerpt = `…${excerpt}`
  if (end < body.length) excerpt += '…'
  return excerpt.trim()
}
