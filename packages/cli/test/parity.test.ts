import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseMarkdown, stringList } from '@monet/core'
import { parseHeadings, parseLinks, parseTags } from '@monet/core'

/** The shared fixture, parsed by the TypeScript implementation. */
const fixtureFolder = fileURLToPath(new URL('../../../Fixtures', import.meta.url))
const markdown = readFileSync(`${fixtureFolder}/parity.md`, 'utf8')
const expectation = JSON.parse(readFileSync(`${fixtureFolder}/parity.json`, 'utf8'))

/**
 * The contract of the shared parser, asserted against a fixture that keeps
 * the exact expected frontmatter, links, tags and headings. Both clients of
 * the engine — the app and the CLI — depend on this behaviour.
 */
describe('the parser contract fixture', () => {
  it('parses the shared fixture the same way', () => {
    const document = parseMarkdown(markdown)
    const body = document.body

    const title = document.frontmatter['title']
    expect(title && 'value' in title ? title.value : undefined).toBe(expectation.note.title)

    const aliases = document.frontmatter['aliases']
    expect(aliases ? stringList(aliases) : []).toEqual(expectation.note.aliases)

    const frontmatterTags = document.frontmatter['tags']
    const tags = [...(frontmatterTags ? stringList(frontmatterTags) : []), ...parseTags(body)].map(
      (tag) => tag.replace(/^#+/u, '').trim(),
    )
    expect([...new Set(tags)]).toEqual(expectation.note.tags)

    const links = parseLinks(body)
    expect(links.length).toBe(expectation.links.length)
    for (const [index, expected] of expectation.links.entries()) {
      const actual = links[index]!
      expect(actual.target).toBe(expected.target)
      expect(actual.display ?? null).toBe(expected.display ?? null)
      expect(actual.anchor ?? null).toBe(expected.anchor ?? null)
      expect(actual.isEmbed).toBe(expected.isEmbed)
    }

    const headings = parseHeadings(body)
    expect(headings.length).toBe(expectation.headings.length)
    for (const [index, expected] of expectation.headings.entries()) {
      const actual = headings[index]!
      expect(actual.title).toBe(expected.title)
      expect(actual.level).toBe(expected.level)
    }
  })
})
