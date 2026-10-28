import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { atomicWriteFileSync, renderFrontmatter, renderNote } from '../src/write.js'
import { parseMarkdown, stringValue } from '../src/frontmatter.js'

describe('write & frontmatter preservation', () => {
  it('writes files atomically without corruption', () => {
    const dir = join(tmpdir(), `monet-atomic-test-${Date.now()}`)
    const filePath = join(dir, 'test-note.md')
    const content = '# Hello Atomic World\nSafe and sound.'

    atomicWriteFileSync(filePath, content)
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf8')).toBe(content)

    // Overwrite atomically
    const newContent = '# Updated Note\nStill intact.'
    atomicWriteFileSync(filePath, newContent)
    expect(readFileSync(filePath, 'utf8')).toBe(newContent)

    rmSync(dir, { recursive: true, force: true })
  })

  it('preserves literal block scalars across a rewrite', () => {
    const raw = `---
title: Block scalars
description: |
  First line.
  Second line.
summary: >-
  Folded text that becomes
  one paragraph.
items:
  - |
    Item one.
    Item two.
---
Body.`

    const parsed = parseMarkdown(raw)
    expect(stringValue(parsed.frontmatter['description']!)).toBe('First line.\nSecond line.\n')
    expect(stringValue(parsed.frontmatter['summary']!)).toBe(
      'Folded text that becomes one paragraph.',
    )
    const items = parsed.frontmatter['items']
    expect(items?.kind).toBe('array')
    if (items?.kind === 'array') {
      expect(stringValue(items.value[0]!)).toBe('Item one.\nItem two.\n')
    }

    const rendered = renderNote({ frontmatter: parsed.frontmatter }, parsed.body)
    const roundtripped = parseMarkdown(rendered)

    expect(stringValue(roundtripped.frontmatter['description']!)).toBe(
      'First line.\nSecond line.\n',
    )
    expect(stringValue(roundtripped.frontmatter['summary']!)).toBe(
      'Folded text that becomes one paragraph.',
    )
    const roundtrippedItems = roundtripped.frontmatter['items']
    if (roundtrippedItems?.kind === 'array') {
      expect(stringValue(roundtrippedItems.value[0]!)).toBe('Item one.\nItem two.\n')
    }
    expect(roundtripped.body).toBe('Body.')
  })

  it('keeps the original frontmatter block when only the body changes', () => {
    const raw = `---
# this comment must survive
title: Keep me
tags:
  - one
---
Old body.`

    const parsed = parseMarkdown(raw)
    const rendered = renderNote(
      {
        frontmatter: parsed.frontmatter,
        frontmatterRaw: parsed.frontmatterRaw,
        frontmatterCanonical: renderFrontmatter(parsed.frontmatter),
      },
      'New body.',
    )

    expect(rendered).toContain('# this comment must survive')
    expect(rendered).toContain('tags:\n  - one')
    expect(rendered).toContain('New body.')
    expect(rendered).not.toContain('Old body.')
  })

  it('preserves nested mappings and arrays in frontmatter', () => {
    const raw = `---
aliases:
  - Plan
  - Spec
authors:
  - name: Alice
    role: Admin
meta:
  priority: 1
  published: true
title: Complex Frontmatter Note
---
Body text here.`

    const parsed = parseMarkdown(raw)
    const rendered = renderNote({ frontmatter: parsed.frontmatter }, parsed.body)
    const roundtripped = parseMarkdown(rendered)

    expect(roundtripped.frontmatter['title']).toEqual({
      kind: 'string',
      value: 'Complex Frontmatter Note',
    })
    expect(roundtripped.frontmatter['aliases']).toBeDefined()
    expect(roundtripped.frontmatter['meta']).toBeDefined()
    const authors = roundtripped.frontmatter['authors']
    expect(authors?.kind).toBe('array')
    if (authors?.kind === 'array') {
      expect(authors.value[0]).toEqual({
        kind: 'mapping',
        value: {
          name: { kind: 'string', value: 'Alice' },
          role: { kind: 'string', value: 'Admin' },
        },
      })
    }
    expect(roundtripped.body.trim()).toBe('Body text here.')
  })
})
