import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseMarkdown, stringList } from '../src/lib/frontmatter.js'
import { Vault } from '../src/lib/vault.js'

let root = ''

/** Writes a note into the vault. */
function write(relativePath: string, contents: string): void {
  const absolute = join(root, ...relativePath.split('/'))
  mkdirSync(join(absolute, '..'), { recursive: true })
  writeFileSync(absolute, contents, 'utf8')
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'monet-vault-'))
  write(
    'Architecture.md',
    [
      '---',
      'title: Architecture',
      'tags: [design, core]',
      'aliases: [System Design]',
      '---',
      '# Architecture',
      '',
      'The [[Renderer]] renders the [[Scene]].',
    ].join('\n'),
  )
  write(
    'Renderer.md',
    ['---', 'tags: [core]', '---', '# Renderer', '', 'Back to [[Architecture]].'].join('\n'),
  )
  write(
    'Scene.md',
    ['# Scene', '', 'Referenced by [[Renderer]] and [[Missing Note]].'].join('\n'),
  )
  write('Nested/Deep/Note.md', '# Deep\n')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('frontmatter', () => {
  it('parses scalars, sequences and mappings', () => {
    const document = parseMarkdown(
      ['---', 'title: My Note', 'tags: [alpha, beta]', 'aliases:', '  - First', '  - Second', 'meta:', '  year: 2026', '---', 'Body'].join('\n'),
    )
    expect(document.frontmatter['title']).toEqual({ kind: 'string', value: 'My Note' })
    expect(stringList(document.frontmatter['tags']!)).toEqual(['alpha', 'beta'])
    expect(stringList(document.frontmatter['aliases']!)).toEqual(['First', 'Second'])
    expect(document.frontmatter['meta']).toEqual({
      kind: 'mapping',
      value: { year: { kind: 'int', value: 2026 } },
    })
    expect(document.body.trim()).toBe('Body')
  })

  it('rejects an unterminated frontmatter block', () => {
    expect(() => parseMarkdown('---\ntitle: X\n')).toThrow()
  })
})

describe('vault index', () => {
  it('indexes every note', () => {
    const vault = Vault.open(root)
    expect(vault.index.notes).toHaveLength(4)
  })

  it('indexes backlinks', () => {
    const vault = Vault.open(root)
    const backlinks = vault.index.backlinksOf('Renderer').map((note) => note.id)
    expect(backlinks.sort()).toEqual(['Architecture', 'Scene'])
  })

  it('indexes outgoing links', () => {
    const vault = Vault.open(root)
    const outgoing = vault.index.outgoingLinksOf('Architecture').map((note) => note.id)
    expect(outgoing.sort()).toEqual(['Renderer', 'Scene'])
  })

  it('tracks unresolved links', () => {
    const vault = Vault.open(root)
    expect(vault.index.unresolved.get('Missing Note')).toHaveLength(1)
    expect(vault.index.note('Missing Note')).toBeUndefined()
  })

  it('indexes tags', () => {
    const vault = Vault.open(root)
    expect(vault.index.notesTagged('design').map((note) => note.id)).toEqual(['Architecture'])
    expect(vault.index.notesTagged('core')).toHaveLength(2)
    expect(vault.index.sortedTags()[0]).toEqual({ tag: 'core', count: 2 })
  })

  it('resolves a link through an alias', () => {
    const vault = Vault.open(root)
    expect(vault.index.resolver.resolve('System Design')).toBe('Architecture')
  })

  it('resolves a link case-insensitively and without the extension', () => {
    const vault = Vault.open(root)
    expect(vault.index.resolver.resolve('architecture')).toBe('Architecture')
    expect(vault.index.resolver.resolve('Architecture.md')).toBe('Architecture')
  })

  it('resolves a folder qualified link', () => {
    const vault = Vault.open(root)
    expect(vault.index.resolver.resolve('Nested/Deep/Note')).toBe('Nested/Deep/Note')
  })

  it('builds the graph', () => {
    const vault = Vault.open(root)
    const graph = vault.index
    expect(graph.notes).toHaveLength(4)
    expect(graph.outgoing.get('Architecture')).toEqual(['Renderer', 'Scene'])
    expect(graph.backlinks.get('Renderer')?.sort()).toEqual(['Architecture', 'Scene'])
  })
})
