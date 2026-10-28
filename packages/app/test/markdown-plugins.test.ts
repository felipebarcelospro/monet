import type { Root } from 'mdast'
import { describe, expect, it } from 'vitest'

import { remarkCallouts } from '../src/markdown/callouts'
import { remarkLiftMedia } from '../src/markdown/liftMedia'

/** A blockquote node with one paragraph, as Markdown would parse it. */
function quote(value: string): Root {
  return {
    type: 'root',
    children: [
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value }],
          },
        ],
      },
    ],
  }
}

describe('remarkCallouts', () => {
  it('turns a marker into a titled callout', () => {
    const tree = quote('[!warning] Cuidado\nO corpo continua aqui.')
    remarkCallouts()(tree)

    const callout = tree.children[0] as Extract<Root['children'][number], { type: 'blockquote' }>
    expect(callout.data?.hName).toBe('div')
    expect(callout.data?.hProperties?.className).toEqual(['callout', 'callout-warning'])

    const title = callout.children[0]
    expect(title?.type).toBe('paragraph')
    expect(title?.data?.hProperties?.className).toEqual(['callout-title'])

    const body = callout.children[1]
    expect(body?.type).toBe('paragraph')
    expect(JSON.stringify(body)).toContain('O corpo continua aqui.')
    expect(JSON.stringify(body)).not.toContain('[!warning]')
  })

  it('uses the type as a default title', () => {
    const tree = quote('[!tip]')
    remarkCallouts()(tree)
    const callout = tree.children[0] as Extract<Root['children'][number], { type: 'blockquote' }>
    expect(JSON.stringify(callout.children[0])).toContain('Tip')
  })

  it('leaves a normal quote alone', () => {
    const tree = quote('Just a quote.')
    const before = JSON.stringify(tree)
    remarkCallouts()(tree)
    expect(JSON.stringify(tree)).toBe(before)
  })
})

describe('remarkLiftMedia', () => {
  it('lifts a standalone image out of its paragraph', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'image', url: 'monet://asset/foto.png', alt: 'Foto' }],
        },
      ],
    }
    remarkLiftMedia()(tree)
    expect(tree.children[0]?.type).toBe('image')
  })

  it('keeps an image that shares a paragraph with text', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Veja ' },
            { type: 'image', url: 'monet://asset/foto.png', alt: '' },
          ],
        },
      ],
    }
    remarkLiftMedia()(tree)
    expect(tree.children[0]?.type).toBe('paragraph')
  })
})
