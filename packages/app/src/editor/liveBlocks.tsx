import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { createRoot, type Root } from 'react-dom/client'

import { Markdown } from '../markdown/Markdown'
import { startsBlock } from './blocks'

/**
 * Live blocks for the editor.
 *
 * A table, an image, a Mermaid diagram or a note embed is rendered in place
 * while the cursor is elsewhere. Putting the cursor inside the block brings
 * the Markdown back, so the note is always editable — no mode to switch.
 */

interface Block {
  from: number
  to: number
  source: string
  kind: string
}

/** A rendered block, mounted as a small React root. */
class BlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly notePath: string,
    readonly from: number,
    readonly kind: string,
  ) {
    super()
  }

  override eq(other: BlockWidget): boolean {
    return (
      other.source === this.source &&
      other.notePath === this.notePath &&
      other.kind === this.kind &&
      other.from === this.from
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const host = document.createElement('div')
    host.className = `cm-live cm-live-${this.kind}`
    const root: Root = createRoot(host)
    root.render(<Markdown source={this.source} notePath={this.notePath} />)
    ;(host as HTMLElement & { monetRoot?: Root }).monetRoot = root

    host.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement
      if (target.closest('a, button, video, audio, input, summary, .mermaid')) return
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true })
      view.focus()
    })

    return host
  }

  override destroy(dom: HTMLElement): void {
    ;(dom as HTMLElement & { monetRoot?: Root }).monetRoot?.unmount()
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** A clickable checkbox that toggles the `[ ]` / `[x]` in the note. */
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super()
  }

  override eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos
  }

  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('span')
    box.className = `cm-task${this.checked ? ' is-checked' : ''}`
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    box.tabIndex = 0

    const toggle = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 1, insert: this.checked ? ' ' : 'x' },
      })
      view.focus()
    }

    box.addEventListener('mousedown', toggle)
    box.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') toggle(event)
    })

    return box
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** Finds the blocks that should render, skipping the one with the cursor. */
export function liveBlocks(state: EditorState, notePath: string): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const doc = state.doc
  const blocks: Block[] = []

  let fenceStart = -1
  let fenceLanguage = ''

  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number)
    const text = line.text

    const fence = /^\s*(?:```|~~~)\s*([\w-]*)/u.exec(text)
    if (fence) {
      if (fenceStart === -1) {
        fenceStart = number
        fenceLanguage = fence[1]?.toLowerCase() ?? ''
      } else {
        if (fenceLanguage === 'mermaid') {
          blocks.push({
            from: doc.line(fenceStart).from,
            to: line.to,
            source: doc.sliceString(doc.line(fenceStart).from, line.to),
            kind: 'mermaid',
          })
        }
        fenceStart = -1
        fenceLanguage = ''
      }
      continue
    }
    if (fenceStart !== -1) continue

    // A task list item: the box becomes clickable, the source stays intact.
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+/u.exec(text)
    if (task) {
      const indent = task[1] ?? ''
      const local = task[0].slice(indent.length)
      const pos = line.from + indent.length + local.indexOf('[') + 1
      decorations.push(
        Decoration.replace({
          widget: new TaskWidget((task[2] ?? ' ').toLowerCase() === 'x', pos),
        }).range(line.from + indent.length, line.from + task[0].length),
      )
    }

    // A callout: `> [!note]` and every following quoted line.
    if (/^\s*>\s*\[![A-Za-z-]+\]/u.test(text)) {
      let end = number
      while (
        end < doc.lines &&
        doc
          .line(end + 1)
          .text.trimStart()
          .startsWith('>')
      )
        end += 1
      blocks.push({
        from: line.from,
        to: doc.line(end).to,
        source: doc.sliceString(line.from, doc.line(end).to),
        kind: 'callout',
      })
      number = end
      continue
    }

    // Display math: `$$` alone on a line, or `$$ … $$` in one line.
    if (/^\s*\$\$\s*$/u.test(text)) {
      let end = number + 1
      while (end <= doc.lines && !/^\s*\$\$\s*$/u.test(doc.line(end).text)) end += 1
      if (end <= doc.lines) {
        blocks.push({
          from: line.from,
          to: doc.line(end).to,
          source: doc.sliceString(line.from, doc.line(end).to),
          kind: 'math',
        })
        number = end
        continue
      }
    }
    if (/^\s*\$\$.+\$\$\s*$/u.test(text)) {
      blocks.push({ from: line.from, to: line.to, source: text, kind: 'math' })
      continue
    }

    // A table: a header row, a separator row, then the body.
    if (number < doc.lines && text.includes('|')) {
      const next = doc.line(number + 1).text
      const separator = /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/u.test(next)
      if (separator) {
        let end = number + 1
        while (
          end < doc.lines &&
          doc.line(end + 1).text.includes('|') &&
          doc.line(end + 1).text.trim() !== ''
        ) {
          end += 1
        }
        blocks.push({
          from: line.from,
          to: doc.line(end).to,
          source: doc.sliceString(line.from, doc.line(end).to),
          kind: 'table',
        })
        number = end
        continue
      }
    }

    // A line that is nothing but an image or an embed.
    if (text.trim().startsWith('![') || text.trim().startsWith('![[')) {
      if (startsBlock(text.trim())) {
        blocks.push({ from: line.from, to: line.to, source: text, kind: 'media' })
      }
    }
  }

  const ranges = state.selection.ranges
  for (const block of blocks) {
    const active = ranges.some((range) => range.from <= block.to && range.to >= block.from)
    if (active) continue
    decorations.push(
      Decoration.replace({
        widget: new BlockWidget(block.source, notePath, block.from, block.kind),
        block: true,
      }).range(block.from, block.to),
    )
  }

  decorations.sort((a, b) => a.from - b.from)
  return Decoration.set(decorations, true)
}

/**
 * The extension that keeps the rendered blocks in sync.
 *
 * A state field, not a view plugin: CodeMirror only accepts block
 * decorations from the state, because a block changes the height of the
 * document and the view must know about it before it lays the lines out.
 */
export function liveBlockExtension(notePath: string): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create: (state) => liveBlocks(state, notePath),
    update: (decorations, transaction) =>
      transaction.docChanged || transaction.selection !== undefined
        ? liveBlocks(transaction.state, notePath)
        : decorations,
    provide: (field) => EditorView.decorations.from(field),
  })
}
