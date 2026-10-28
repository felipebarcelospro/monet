import { describe, expect, it } from 'vitest'

import {
  parseHeadings,
  parseLinks,
  parseTags,
  splitLinkContent,
  stripMarkdownExtension,
} from '../src/wikilink.js'

describe('wikilink parser', () => {
  it('parses a simple link', () => {
    const links = parseLinks('See [[Project Plan]] for details.')
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toBe('Project Plan')
    expect(links[0]!.display).toBeUndefined()
    expect(links[0]!.anchor).toBeUndefined()
    expect(links[0]!.isEmbed).toBe(false)
  })

  it('parses a display alias', () => {
    const links = parseLinks('See [[Project Plan|the plan]].')
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toBe('Project Plan')
    expect(links[0]!.display).toBe('the plan')
  })

  it('parses a heading anchor', () => {
    const links = parseLinks('[[Budget#Q1 Numbers]]')
    expect(links[0]!.target).toBe('Budget')
    expect(links[0]!.anchor).toBe('Q1 Numbers')
  })

  it('parses an embed', () => {
    const links = parseLinks('![[Diagram]]')
    expect(links[0]!.isEmbed).toBe(true)
    expect(links[0]!.target).toBe('Diagram')
  })

  it('parses a folder qualified target', () => {
    expect(parseLinks('[[Projects/Alpha]]')[0]!.target).toBe('Projects/Alpha')
  })

  it('parses several links', () => {
    const links = parseLinks('[[One]] and [[Two]] and [[Three|three]]')
    expect(links.map((link) => link.target)).toEqual(['One', 'Two', 'Three'])
  })

  it('ignores links inside fenced code blocks', () => {
    const body = [
      'Real link [[Alpha]]',
      '',
      '```',
      'Fake link [[Beta]]',
      '```',
      '',
      'Another [[Gamma]]',
    ].join('\n')
    expect(parseLinks(body).map((link) => link.target)).toEqual(['Alpha', 'Gamma'])
  })

  it('ignores links inside inline code', () => {
    const links = parseLinks('Use `[[NotALink]]` but [[RealLink]] works.')
    expect(links.map((link) => link.target)).toEqual(['RealLink'])
  })

  it('ignores single brackets', () => {
    expect(parseLinks('[Normal link](https://example.com) and [Text]')).toHaveLength(0)
  })

  it('splits the content into target, display and anchor', () => {
    // Obsidian writes the anchor before the pipe: [[Note#Section|Shown]].
    expect(splitLinkContent('Note#Section|Shown')).toEqual({
      target: 'Note',
      display: 'Shown',
      anchor: 'Section',
    })
    // A hash after the pipe belongs to the display text.
    expect(splitLinkContent('Note|Shown#Section')).toEqual({
      target: 'Note',
      display: 'Shown#Section',
      anchor: undefined,
    })
  })

  it('strips a markdown extension', () => {
    expect(stripMarkdownExtension('Notes/Alpha.md')).toBe('Notes/Alpha')
    expect(stripMarkdownExtension('Notes/Alpha')).toBe('Notes/Alpha')
  })

  it('parses headings', () => {
    const body = '# Title\n\n## Section One\n\nText\n\n### Deep'
    const headings = parseHeadings(body)
    expect(headings.map((heading) => heading.title)).toEqual(['Title', 'Section One', 'Deep'])
    expect(headings.map((heading) => heading.level)).toEqual([1, 2, 3])
  })

  it('parses tags', () => {
    const tags = parseTags('Tagged #project and #area/frontend plus #multi-word.')
    expect(tags).toContain('project')
    expect(tags).toContain('area/frontend')
    // Obsidian allows hyphens and slashes in a tag.
    expect(tags).toContain('multi-word')
  })

  it('stops a tag at whitespace', () => {
    expect(parseTags('This #not a tag')).toEqual(['not'])
  })

  it('does not parse headings as tags', () => {
    expect(parseTags('# Heading\n\nSome #real text')).toEqual(['real'])
  })
})
