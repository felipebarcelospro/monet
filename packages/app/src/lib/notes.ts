import type { Locale, NoteSummary, SearchHit, SortOrder, VaultSnapshot } from '../shared/contract'
import type { MessageKey } from '../shared/i18n'

/** The collection the note list is showing. */
export type Source =
  | { kind: 'all' }
  | { kind: 'recent' }
  | { kind: 'favorites' }
  | { kind: 'type'; type: string }
  | { kind: 'folder'; path: string }
  | { kind: 'tag'; tag: string }

/** The notes the list should show, in the order it should show them. */
export function visibleNotes(
  snapshot: VaultSnapshot | null,
  source: Source,
  favorites: string[],
  sort: SortOrder,
  searchHits: SearchHit[] | null,
  now = Date.now(),
): NoteSummary[] {
  if (!snapshot) return []

  if (searchHits && searchHits.length >= 0) {
    const byID = new Map(snapshot.notes.map((note) => [note.id, note]))
    return searchHits.flatMap((hit) => {
      const note = byID.get(hit.id)
      return note ? [note] : []
    })
  }

  const filtered = snapshot.notes.filter((note) => {
    switch (source.kind) {
      case 'all':
        return true
      case 'recent':
        return now - note.modifiedAt <= 14 * 86_400_000
      case 'favorites':
        return favorites.includes(note.id)
      case 'type':
        return note.type === source.type
      case 'folder':
        return note.folder === source.path
      case 'tag':
        return note.tags.some((tag) => tag.toLowerCase() === source.tag.toLowerCase())
    }
  })

  return sortNotes(filtered, sort)
}

/** Sorts notes by the chosen order. */
export function sortNotes(notes: NoteSummary[], sort: SortOrder): NoteSummary[] {
  const sorted = [...notes]
  switch (sort) {
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
      break
    case 'created':
      sorted.sort((a, b) => b.createdAt - a.createdAt)
      break
    case 'modified':
      sorted.sort((a, b) => b.modifiedAt - a.modifiedAt)
      break
  }
  return sorted
}

/** The label of a source, localized. */
export function sourceLabel(
  source: Source,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  switch (source.kind) {
    case 'all':
      return t('nav.allNotes')
    case 'recent':
      return t('nav.recent')
    case 'favorites':
      return t('nav.favorites')
    case 'type':
      return typeName(source.type, t)
    case 'folder':
      return source.path.split('/').pop() ?? source.path
    case 'tag':
      return `#${source.tag}`
  }
}

/** The localized name of a declared type. */
export function typeName(
  type: string,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  const key = `type.${type}` as MessageKey
  const translated = t(key)
  return translated === key ? capitalize(type) : translated
}

/** The localized name of a status. */
export function statusName(
  status: string,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): string {
  const key = `status.${status}` as MessageKey
  const translated = t(key)
  return translated === key ? capitalize(status) : translated
}

/** Capitalizes a word without touching the rest. */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1)
}

/** A compact relative timestamp: “now”, “3 min ago”, “12 Oct”. */
export function relativeTime(timestamp: number, locale: Locale, now = Date.now()): string {
  const difference = timestamp - now
  const absolute = Math.abs(difference)

  if (absolute < 45_000) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
      0,
      'second',
    )
  }
  if (absolute < 3_600_000) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
      Math.round(difference / 60_000),
      'minute',
    )
  }
  if (absolute < 86_400_000) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
      Math.round(difference / 3_600_000),
      'hour',
    )
  }
  if (absolute < 7 * 86_400_000) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(
      Math.round(difference / 86_400_000),
      'day',
    )
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    new Date(timestamp),
  )
}

/** A full date for the inspector. */
export function longDate(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp))
}

/** A date with the time, for the inspector's modified row. */
export function dateTime(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

/** The reading time of a body, in minutes. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220))
}

/** The colour family of a tag, chosen deterministically. */
export function tagTone(tag: string): 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'rose' {
  let hash = 0
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) >>> 0
  }
  const tones = ['blue', 'green', 'amber', 'violet', 'rose', 'red'] as const
  return tones[hash % tones.length]!
}

/** The id without its extension, for a path. */
export function idOf(path: string): string {
  return path.replace(/\.[^./\\]+$/u, '')
}

/** The last segment of a folder path. */
export function folderName(path: string): string {
  return path.split('/').pop() ?? path
}

/** The number of notes in a folder subtree. */
export function folderCount(snapshot: VaultSnapshot | null, path: string): number {
  if (!snapshot) return 0
  return snapshot.notes.filter((note) => note.folder === path || note.folder.startsWith(`${path}/`))
    .length
}
