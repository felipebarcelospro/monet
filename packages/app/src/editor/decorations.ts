import type { Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

/**
 * Live Markdown styling.
 *
 * The text stays Markdown — nothing is hidden — but headings grow, links take
 * the accent colour, tags become small chips and the syntax markers step back
 * into a quiet grey. It is the difference between reading a file and reading
 * a note.
 */

const HEADING = /^(#{1,6})\s/
const FENCE = /^\s*(```|~~~)/
const QUOTE = /^\s*>\s?/
const LIST = /^(\s*)([-*+]|\d+[.)])\s/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/

const WIKILINK = /!?\[\[([^\]|#\n]+)(?:#[^\]|\n]+)?(?:\|([^\]\n]+))?\]\]/gu
const INLINE_CODE = /`([^`\n]+)`/gu
const STRONG = /\*\*([^*\n]+)\*\*/gu
const STRIKE = /~~([^~\n]+)~~/gu
const EMPHASIS = /(^|[^*])\*([^*\n]+)\*(?!\*)/gu
const URL = /https?:\/\/[^\s)>\]]+/gu
const TAG = /(^|\s)(#[A-Za-z0-9][A-Za-z0-9/_-]*)/gu

const headingLine = (level: number): Decoration =>
  Decoration.line({ class: `cm-h${Math.min(level, 4)}` })

const marker = Decoration.mark({ class: 'cm-marker' })
const strong = Decoration.mark({ class: 'cm-strong' })
const emphasis = Decoration.mark({ class: 'cm-emphasis' })
const strike = Decoration.mark({ class: 'cm-strikethrough' })
const code = Decoration.mark({ class: 'cm-inline-code' })
const url = Decoration.mark({ class: 'cm-url' })
const tag = Decoration.mark({ class: 'cm-hashtag' })

/** Builds the decorations for the current document. */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const add = (from: number, to: number, decoration: Decoration): void => {
    ranges.push(decoration.range(from, to))
  }
  const doc = view.state.doc

  // Find the fenced code blocks first, so their contents are left alone.
  const fenced = new Map<number, { first: boolean; last: boolean }>()
  const blocks: { start: number; end: number }[] = []
  let open = 0
  for (let number = 1; number <= doc.lines; number += 1) {
    const text = doc.line(number).text
    if (FENCE.test(text)) {
      if (open === 0) open = number
      else {
        blocks.push({ start: open, end: number })
        open = 0
      }
    }
  }
  if (open !== 0) blocks.push({ start: open, end: doc.lines })
  for (const block of blocks) {
    for (let number = block.start; number <= block.end; number += 1) {
      fenced.set(number, { first: number === block.start, last: number === block.end })
    }
  }

  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number)
    const text = line.text

    const fenceInfo = fenced.get(number)
    if (fenceInfo) {
      const first = fenceInfo.first
      const last = fenceInfo.last
      add(
        line.from,
        line.from,
        Decoration.line({
          class: `cm-code-line ${first ? 'cm-code-first' : ''} ${last ? 'cm-code-last' : ''}`,
        }),
      )
      const markerMatch = FENCE.exec(text)
      if (markerMatch) {
        add(line.from, line.from + markerMatch[0].length, marker)
      }
      continue
    }

    const heading = HEADING.exec(text)
    if (heading) {
      add(line.from, line.from, headingLine(heading[1]!.length))
      add(line.from, line.from + heading[0].length, marker)
    } else if (QUOTE.test(text)) {
      add(line.from, line.from, Decoration.line({ class: 'cm-quote' }))
      const match = QUOTE.exec(text)!
      add(line.from, line.from + match[0].length, marker)
    } else if (RULE.test(text)) {
      add(line.from, line.from, Decoration.line({ class: 'cm-rule' }))
    } else {
      const list = LIST.exec(text)
      if (list) {
        const start = line.from + list[1]!.length
        add(start, start + list[2]!.length, marker)
      }
    }

    // Inline spans.
    WIKILINK.lastIndex = 0
    for (let match = WIKILINK.exec(text); match; match = WIKILINK.exec(text)) {
      const start = line.from + match.index
      const end = start + match[0].length
      const target = match[1] ?? ''
      const innerStart = start + (match[0].startsWith('!') ? 3 : 2)
      const innerEnd = end - 2
      add(start, innerStart, marker)
      add(innerEnd, end, marker)
      if (innerEnd > innerStart) {
        add(
          innerStart,
          innerEnd,
          Decoration.mark({
            class: 'cm-wikilink',
            attributes: { 'data-target': target },
          }),
        )
      }
    }

    INLINE_CODE.lastIndex = 0
    for (let match = INLINE_CODE.exec(text); match; match = INLINE_CODE.exec(text)) {
      const start = line.from + match.index
      add(start, start + 1, marker)
      add(start + 1, start + match[0].length - 1, code)
      add(start + match[0].length - 1, start + match[0].length, marker)
    }

    STRONG.lastIndex = 0
    for (let match = STRONG.exec(text); match; match = STRONG.exec(text)) {
      const start = line.from + match.index
      add(start, start + 2, marker)
      add(start + 2, start + match[0].length - 2, strong)
      add(start + match[0].length - 2, start + match[0].length, marker)
    }

    STRIKE.lastIndex = 0
    for (let match = STRIKE.exec(text); match; match = STRIKE.exec(text)) {
      const start = line.from + match.index
      add(start, start + 2, marker)
      add(start + 2, start + match[0].length - 2, strike)
      add(start + match[0].length - 2, start + match[0].length, marker)
    }

    EMPHASIS.lastIndex = 0
    for (let match = EMPHASIS.exec(text); match; match = EMPHASIS.exec(text)) {
      const offset = (match[1] ?? '').length
      const start = line.from + match.index + offset
      const end = start + match[0].length - offset
      add(start, start + 1, marker)
      add(start + 1, end - 1, emphasis)
      add(end - 1, end, marker)
    }

    URL.lastIndex = 0
    for (let match = URL.exec(text); match; match = URL.exec(text)) {
      const start = line.from + match.index
      add(start, start + match[0].length, url)
    }

    TAG.lastIndex = 0
    for (let match = TAG.exec(text); match; match = TAG.exec(text)) {
      const offset = (match[1] ?? '').length
      const start = line.from + match.index + offset
      add(start, start + match[2]!.length, tag)
    }
  }

  // Spans are collected in whatever order they are found; the set sorts them.
  return Decoration.set(ranges, true)
}

/** The extension that keeps the decorations in sync with the document. */
export const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
)
