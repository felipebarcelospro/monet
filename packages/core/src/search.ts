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
 * Folds a string for comparison: lower case and without diacritics.
 *
 * A note written as "Reunião" must be found by "reuniao", and an accented
 * body must not rank below an unaccented one just because of the keyboard.
 */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Splits a query into folded words. */
export function searchTerms(query: string): string[] {
  return foldText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0)
}

/**
 * A full-text search engine over a vault index.
 *
 * The ranking is deliberately lexical: exact and prefix titles first, then
 * aliases, tags and body matches. Multi-word queries require every term, in
 * any order, and accents are ignored. It is fast, deterministic and local —
 * no model, no network, no index to build.
 */
export class SearchEngine {
  private readonly index: VaultIndex
  private readonly bodies = new Map<string, string>()
  private readonly foldedBodies = new Map<string, string>()

  constructor(index: VaultIndex) {
    this.index = index
    for (const note of index.notes) {
      this.bodies.set(note.id, note.body)
      this.foldedBodies.set(note.id, foldText(note.body))
    }
  }

  /**
   * Runs a search and returns the best matches.
   */
  search(query: string, limit = 50, tagFilter?: string): SearchResult[] {
    const trimmed = query.trim()
    const candidates: Note[] = tagFilter ? this.index.notesTagged(tagFilter) : this.index.notes

    if (trimmed.length === 0) {
      return [...candidates]
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, limit)
        .map((note) => ({ noteID: note.id, title: note.title, path: note.relativePath, score: 1 }))
    }

    const needle = trimmed.toLowerCase()
    const folded = foldText(trimmed)
    const terms = searchTerms(trimmed)
    const results: SearchResult[] = []

    for (const note of candidates) {
      const lowerTitle = note.title.toLowerCase()
      const foldedTitle = foldText(note.title)
      const foldedBody = this.foldedBodies.get(note.id) ?? ''
      let score = 0
      let excerpt: string | undefined

      if (lowerTitle === needle || foldedTitle === folded) {
        score = 1000
      } else if (lowerTitle.startsWith(needle) || foldedTitle.startsWith(folded)) {
        score = 700
      } else if (lowerTitle.includes(needle) || foldedTitle.includes(folded)) {
        score = 500
      } else if (note.aliases.some((alias) => foldText(alias) === folded)) {
        score = 450
      } else if (note.aliases.some((alias) => foldText(alias).includes(folded))) {
        score = 380
      } else if (note.tags.some((tag) => foldText(tag).includes(folded))) {
        score = 300
      } else {
        const similarity = fuzzySimilarity(folded, foldedTitle)
        if (similarity !== undefined && similarity > 0.55) {
          score = 250 * similarity
        } else {
          // A phrase in the body is a strong signal, even after folding.
          const position = foldedBody.indexOf(folded)
          if (position !== -1) {
            const density = folded.length / Math.max(1, foldedBody.length)
            score = 200 + density * 100
            excerpt = makeExcerpt(note.body, position, folded.length)
          } else if (terms.length > 1) {
            const titleHits = terms.filter((term) => foldedTitle.includes(term)).length
            const bodyHits = terms.filter((term) => foldedBody.includes(term)).length

            if (titleHits === terms.length) {
              score = 600
            } else if (bodyHits === terms.length) {
              score = 230 + Math.min(40, terms.length * 4)
              excerpt = excerptForTerms(note.body, foldedBody, terms)
            } else if (bodyHits / terms.length >= 0.6) {
              score = 120
              excerpt = excerptForTerms(note.body, foldedBody, terms)
            }
          } else if (terms.length === 1) {
            // A word prefix in the body helps "autocom" find "autocomplete".
            const prefix = foldedBody.indexOf(terms[0]!)
            if (prefix !== -1) {
              score = 150
              excerpt = makeExcerpt(note.body, prefix, terms[0]!.length)
            }
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

/** Builds an excerpt around the first term that occurs in the body. */
function excerptForTerms(body: string, foldedBody: string, terms: string[]): string | undefined {
  for (const term of terms) {
    const position = foldedBody.indexOf(term)
    if (position !== -1) return makeExcerpt(body, position, term.length)
  }
  return undefined
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
