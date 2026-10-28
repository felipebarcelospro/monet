import type { Blockquote, Paragraph, Root } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * GitHub-style callouts: `> [!note]`, `> [!warning] Título`, and so on.
 *
 * The blockquote keeps its children; only two things change. The marker line
 * becomes a title paragraph, and the node becomes a `div` with a class the
 * stylesheet can colour. Everything after the marker stays ordinary Markdown,
 * so lists, links and code work inside a callout.
 */

const MARKER = /^\s*\[!([A-Za-z-]+)\]([+-]?)\s*(.*)$/u

const TITLES: Record<string, string> = {
  note: 'Note',
  abstract: 'Summary',
  summary: 'Summary',
  info: 'Info',
  todo: 'To do',
  tip: 'Tip',
  hint: 'Hint',
  success: 'Success',
  check: 'Done',
  question: 'Question',
  help: 'Help',
  faq: 'FAQ',
  warning: 'Warning',
  attention: 'Attention',
  caution: 'Caution',
  danger: 'Danger',
  error: 'Error',
  bug: 'Bug',
  example: 'Example',
  quote: 'Quote',
  cite: 'Quote',
  important: 'Important',
}

export function remarkCallouts() {
  return (tree: Root): void => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0]
      if (!first || first.type !== 'paragraph') return

      const head = first.children[0]
      if (!head || head.type !== 'text') return

      const [firstLine = '', ...restLines] = head.value.split('\n')
      const match = MARKER.exec(firstLine)
      if (!match) return

      const type = (match[1] ?? 'note').toLowerCase()
      const inline = (match[3] ?? '').trim()
      const rest = restLines.join('\n').replace(/^\n+/u, '')
      const label = inline.length > 0 ? inline : (TITLES[type] ?? type)

      if (rest.length > 0) {
        head.value = rest
      } else {
        first.children.shift()
        if (first.children.length === 0) node.children.shift()
      }

      const title: Paragraph = {
        type: 'paragraph',
        data: { hProperties: { className: ['callout-title'] } },
        children: [{ type: 'text', value: label }],
      }

      node.children.unshift(title)
      node.data = {
        ...node.data,
        hName: 'div',
        hProperties: { className: ['callout', `callout-${type}`] },
      }
    })
  }
}
