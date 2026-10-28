import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import { atomicWriteFileSync, renderFrontmatter, renderNote } from '../src/write.js'
import { parseMarkdown } from '../src/frontmatter.js'

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
    expect(roundtripped.body.trim()).toBe('Body text here.')
  })
})
