/**
 * Wikilink parsing.
 *
 * This is the TypeScript twin of `MonetCore/Links/WikilinkParser.swift`. The
 * two implementations must stay in lockstep: a link that resolves in the app
 * has to resolve in the CLI, and the other way around. `test/vault.test.ts`
 * asserts that both parsers agree on the shared fixture vault.
 */

/** A `[[wikilink]]` or `![[embed]]` found inside a note. */
export interface Wikilink {
  /** The literal target text between the brackets. */
  target: string
  /** The optional display text after a pipe. */
  display?: string
  /** The optional heading or block reference after a hash. */
  anchor?: string
  /** Whether the link was written as an embed. */
  isEmbed: boolean
  /** The character offset in the source text where the link starts. */
  start: number
  /** The character offset in the source text where the link ends. */
  end: number
}

/** A Markdown heading found in a note. */
export interface Heading {
  title: string
  level: number
  start: number
}

const FENCE_MARKERS = ['```', '~~~']

/** Returns the fence marker of a line, if it opens or closes a code block. */
function fenceMarker(line: string): string | undefined {
  const trimmed = line.trim()
  return FENCE_MARKERS.find((marker) => trimmed.startsWith(marker))
}

/**
 * Blanks out inline code spans, keeping every other offset intact.
 */
function removeInlineCode(line: string): string {
  if (!line.includes('`')) return line
  let output = ''
  let index = 0
  while (index < line.length) {
    if (line[index] === '`') {
      const close = line.indexOf('`', index + 1)
      if (close !== -1) {
        output += ' '.repeat(close - index + 1)
        index = close + 1
        continue
      }
    }
    output += line[index]
    index += 1
  }
  return output
}

/**
 * Splits the body into the runs of text that are safe to scan for links.
 *
 * Fenced code blocks are dropped entirely; inline code spans are blanked out
 * so that the offsets of the surrounding text stay valid.
 */
function codeMaskedSegments(body: string): { text: string; offset: number }[] {
  const segments: { text: string; offset: number }[] = []
  let current = ''
  let currentOffset = 0
  let inFence = false
  let activeFence = ''

  const lines = body.split('\n')
  let offset = 0
  for (const line of lines) {
    const marker = fenceMarker(line)
    if (marker !== undefined) {
      if (inFence) {
        if (marker === activeFence) {
          inFence = false
          activeFence = ''
          if (current.length > 0) {
            segments.push({ text: current, offset: currentOffset })
            current = ''
          }
        }
      } else {
        inFence = true
        activeFence = marker
        if (current.length > 0) {
          segments.push({ text: current, offset: currentOffset })
          current = ''
        }
        currentOffset = offset
      }
      offset += line.length + 1
      continue
    }

    if (inFence) {
      offset += line.length + 1
      continue
    }

    if (current.length === 0) currentOffset = offset
    current += removeInlineCode(line) + '\n'
    offset += line.length + 1
  }

  if (current.length > 0) segments.push({ text: current, offset: currentOffset })
  return segments
}

/**
 * Splits `Target|Display#Anchor` into its three parts.
 */
export function splitLinkContent(content: string): {
  target: string
  display?: string
  anchor?: string
} {
  let target = content
  let display: string | undefined
  let anchor: string | undefined

  const pipe = target.indexOf('|')
  if (pipe !== -1) {
    display = target.slice(pipe + 1).trim()
    target = target.slice(0, pipe)
  }

  const hash = target.indexOf('#')
  if (hash !== -1) {
    anchor = target.slice(hash + 1).trim()
    target = target.slice(0, hash)
  }

  return { target: target.trim(), display, anchor }
}

/**
 * Parses every wikilink and embed in a Markdown body.
 */
export function parseLinks(body: string): Wikilink[] {
  const links: Wikilink[] = []
  for (const segment of codeMaskedSegments(body)) {
    const { text, offset } = segment
    let index = 0
    while (index < text.length) {
      const isEmbed = text[index] === '!' && text[index + 1] === '['
      const bracket = isEmbed ? index + 1 : index
      if (text[bracket] !== '[' || text[bracket + 1] !== '[') {
        index += 1
        continue
      }
      const closing = text.indexOf(']]', bracket + 2)
      if (closing === -1) {
        index += 1
        continue
      }
      const content = text.slice(bracket + 2, closing)
      if (content.length === 0) {
        index = closing + 2
        continue
      }
      const parsed = splitLinkContent(content)
      links.push({
        target: parsed.target,
        display: parsed.display,
        anchor: parsed.anchor,
        isEmbed,
        start: offset + bracket,
        end: offset + closing + 2,
      })
      index = closing + 2
    }
  }
  return links
}

/**
 * Parses every heading in a Markdown body.
 */
export function parseHeadings(body: string): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  let activeFence = ''
  let offset = 0

  for (const line of body.split('\n')) {
    const marker = fenceMarker(line)
    if (marker !== undefined) {
      if (inFence && marker === activeFence) {
        inFence = false
        activeFence = ''
      } else if (!inFence) {
        inFence = true
        activeFence = marker
      }
      offset += line.length + 1
      continue
    }
    if (inFence) {
      offset += line.length + 1
      continue
    }

    const trimmed = line.trim()
    if (trimmed.startsWith('#')) {
      const hashes = /^#+/.exec(trimmed)?.[0] ?? ''
      const afterHashes = trimmed.slice(hashes.length)
      if (hashes.length <= 6 && afterHashes.startsWith(' ')) {
        headings.push({
          title: afterHashes.trim(),
          level: hashes.length,
          start: offset,
        })
      }
    }
    offset += line.length + 1
  }
  return headings
}

/**
 * Extracts inline `#tags` from a Markdown body.
 */
export function parseTags(body: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()

  for (const segment of codeMaskedSegments(body)) {
    const { text } = segment
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '#') continue
      const previous = index === 0 ? ' ' : text[index - 1]!
      const isBoundary = ' \n\t([{>,'.includes(previous)
      if (!isBoundary) continue

      let end = index + 1
      while (end < text.length && !/\s/.test(text[end]!) && text[end] !== '#') end += 1
      const raw = text.slice(index, end)
      // The leading `#` is the marker, not part of the name.
      const name = raw.slice(1).replace(/[.,;:!?)]$/u, '')
      if (name.length > 0 && !/\s/.test(name)) {
        const normalized = name.toLowerCase()
        if (!seen.has(normalized)) {
          seen.add(normalized)
          tags.push(name)
        }
      }
      index = end - 1
    }
  }
  return tags
}

/** Removes a trailing Markdown extension from a link target. */
export function stripMarkdownExtension(target: string): string {
  const lowered = target.toLowerCase()
  for (const ext of ['.md', '.markdown', '.canvas']) {
    if (lowered.endsWith(ext)) return target.slice(0, target.length - ext.length)
  }
  return target
}
