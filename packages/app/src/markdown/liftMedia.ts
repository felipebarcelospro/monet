import type { Image, Paragraph, Root } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * Lifts a standalone image out of its paragraph.
 *
 * Markdown parses `![[image.png]]` and `![](clip.mp4)` on a line of their own as
 * a paragraph containing one image. The renderer draws images, video, audio,
 * file cards and note embeds as block elements, and a block element inside a
 * `<p>` is invalid HTML. Lifting the image to the document root keeps the DOM
 * valid and lets the figure own its margins.
 *
 * An image inside a sentence is left alone: it stays an inline `<img>`.
 */
export function remarkLiftMedia() {
  return (tree: Root): void => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || index === undefined) return

      const meaningful = node.children.filter(
        (child) => !(child.type === 'text' && child.value.trim().length === 0),
      )
      if (meaningful.length !== 1) return

      const only = meaningful[0] as Image
      if (only.type !== 'image') return

      parent.children.splice(index, 1, only)
      return index
    })
  }
}
