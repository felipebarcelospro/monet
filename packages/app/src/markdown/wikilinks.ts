import type { Link, PhrasingContent, Root, Text } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * Turns `[[wikilinks]]` and `![[embeds]]` into ordinary link and image nodes.
 *
 * Keeping the transformation in a remark plugin means everything downstream —
 * tables, lists, emphasis — behaves exactly as it does for normal Markdown.
 * The `monet-note:` and `monet-embed:` schemes are resolved by the renderer.
 */

const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/gu

export function remarkWikilinks() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || !node.value.includes('[[')) return

      const value = node.value
      const children: PhrasingContent[] = []
      let last = 0

      for (const match of value.matchAll(WIKILINK)) {
        const start = match.index ?? 0
        if (start > last) children.push({ type: 'text', value: value.slice(last, start) })

        const isEmbed = match[1] === '!'
        const inner = match[2] ?? ''
        const [rawTarget, rawAlias] = inner.split('|')
        const target = (rawTarget ?? '').trim()
        const alias = rawAlias?.trim()
        const href = `${isEmbed ? 'monet-embed' : 'monet-note'}:${encodeURIComponent(target)}`

        if (isEmbed) {
          children.push({ type: 'image', url: href, alt: alias ?? target })
        } else {
          const link: Link = {
            type: 'link',
            url: href,
            children: [{ type: 'text', value: alias ?? target }],
          }
          children.push(link)
        }

        last = start + match[0].length
      }

      if (last === 0) return
      if (last < value.length) children.push({ type: 'text', value: value.slice(last) })

      parent.children.splice(index, 1, ...children)
      return index + children.length
    })
  }
}
