import { describe, expect, it } from 'vitest'

import { resolveTarget } from '../src/markdown/resolve'
import type { AssetSummary, NoteSummary } from '../src/shared/contract'

const assets: AssetSummary[] = [
  { path: 'Attachments/paper-study.png', name: 'paper-study.png' },
  { path: 'Attachments/paper-study.mp4', name: 'paper-study.mp4' },
  { path: 'Attachments/vault-checklist.csv', name: 'vault-checklist.csv' },
  { path: 'Guides/local.png', name: 'local.png' },
]

function note(id: string, title: string): NoteSummary {
  return {
    id,
    path: `${id}.md`,
    title,
    folder: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
    tags: [],
    aliases: [],
    excerpt: '',
    frontmatter: {},
    modifiedAt: 0,
    createdAt: 0,
    byteSize: 0,
    wordCount: 0,
    outgoing: [],
    backlinks: [],
  }
}

const notes = [note('Resources/Wikilink Syntax', 'Wikilink Syntax')]

describe('Markdown target resolution', () => {
  it('finds an image by name anywhere in the vault', () => {
    const resolved = resolveTarget('paper-study.png', 'Guides/Markdown.md', assets, notes)
    expect(resolved).toMatchObject({
      kind: 'image',
      path: 'Attachments/paper-study.png',
      url: 'monet://asset/Attachments/paper-study.png',
    })
  })

  it('prefers the note folder for a relative path', () => {
    const resolved = resolveTarget('local.png', 'Guides/Note.md', assets, notes)
    expect(resolved).toMatchObject({ kind: 'image', path: 'Guides/local.png' })
  })

  it('resolves a link to a note and ignores the heading', () => {
    const resolved = resolveTarget('Wikilink Syntax#Formas', 'Guides/Note.md', assets, notes)
    expect(resolved).toMatchObject({ kind: 'note', id: 'Resources/Wikilink Syntax' })
  })

  it('resolves an attachment to a file card', () => {
    const resolved = resolveTarget(
      'Attachments/vault-checklist.csv',
      'Guides/Markdown.md',
      assets,
      notes,
    )
    expect(resolved).toEqual({ kind: 'file', path: 'Attachments/vault-checklist.csv' })
  })

  it('accepts a file name without its extension', () => {
    const resolved = resolveTarget('vault-checklist', 'Guides/Note.md', assets, notes)
    expect(resolved).toMatchObject({ kind: 'file', path: 'Attachments/vault-checklist.csv' })
  })

  it('leaves remote URLs alone', () => {
    const resolved = resolveTarget(
      'https://example.com/diagram.png',
      'Guides/Note.md',
      assets,
      notes,
    )
    expect(resolved).toEqual({ kind: 'external', url: 'https://example.com/diagram.png' })
  })

  it('reports a missing target by its base name', () => {
    const resolved = resolveTarget('Nope#Heading', 'Guides/Note.md', assets, notes)
    expect(resolved).toEqual({ kind: 'missing', target: 'Nope' })
  })
})
