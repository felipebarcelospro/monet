import { describe, expect, it } from 'vitest'

import { buildGraph } from '../src/graph.js'
import { SearchEngine, fuzzySimilarity } from '../src/search.js'
import { type Note, Vault, VaultIndex } from '../src/vault.js'

/** Builds a note for the search tests. */
function note(
  id: string,
  relativePath: string,
  title: string,
  body: string,
  extra: Partial<Note> = {},
): Note {
  return {
    id,
    relativePath,
    title,
    aliases: [],
    tags: [],
    frontmatter: {},
    body,
    links: [],
    headings: [],
    modifiedAt: 0,
    byteSize: body.length,
    ...extra,
  }
}

function makeIndex(): VaultIndex {
  return new VaultIndex([
    note(
      'Graph Theory',
      'Math/Graph Theory.md',
      'Graph Theory',
      'Vertices, edges and adjacency matrices.',
      {
        tags: ['math'],
      },
    ),
    note(
      'Graph Rendering',
      'Rendering/Graph Rendering.md',
      'Graph Rendering',
      'Drawing a graph in three dimensions with Metal.',
      {
        tags: ['rendering', 'graph'],
      },
    ),
    note('Vault Format', 'Vault Format.md', 'Vault Format', 'Plain Markdown files on disk.', {
      aliases: ['Storage Layout'],
    }),
  ])
}

describe('search engine', () => {
  it('ranks an exact title match first', () => {
    const engine = new SearchEngine(makeIndex())
    const results = engine.search('Graph Rendering')
    expect(results[0]?.noteID).toBe('Graph Rendering')
    expect(results[0]?.score).toBe(1000)
  })

  it('ranks a prefix match above a body match', () => {
    const engine = new SearchEngine(makeIndex())
    const results = engine.search('Graph')
    expect(results[0]?.noteID).toBe('Graph Rendering')
    expect(results.length).toBe(2)
  })

  it('finds a match in the body', () => {
    const engine = new SearchEngine(makeIndex())
    const results = engine.search('Metal')
    expect(results[0]?.noteID).toBe('Graph Rendering')
    expect(results[0]?.excerpt).toBeTruthy()
  })

  it('finds an alias', () => {
    const engine = new SearchEngine(makeIndex())
    expect(engine.search('Storage Layout')[0]?.noteID).toBe('Vault Format')
  })

  it('finds a tag', () => {
    const engine = new SearchEngine(makeIndex())
    expect(engine.search('rendering')[0]?.noteID).toBe('Graph Rendering')
  })

  it('finds a fuzzy match', () => {
    const engine = new SearchEngine(makeIndex())
    const results = engine.search('grph rendring')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((result) => result.noteID === 'Graph Rendering')).toBe(true)
  })

  it('requires a subsequence for a fuzzy match', () => {
    expect(fuzzySimilarity('gth', 'graph theory')).toBeDefined()
    expect(fuzzySimilarity('zzz', 'graph theory')).toBeUndefined()
  })

  it('lists everything for an empty query', () => {
    const engine = new SearchEngine(makeIndex())
    expect(engine.search('').length).toBe(3)
  })

  it('respects the limit', () => {
    const engine = new SearchEngine(makeIndex())
    expect(engine.search('Graph', 1).length).toBe(1)
  })

  it('filters by tag', () => {
    const engine = new SearchEngine(makeIndex())
    expect(engine.search('Graph', 50, 'math').map((result) => result.noteID)).toEqual([
      'Graph Theory',
    ])
  })

  it('is deterministic', () => {
    const engine = new SearchEngine(makeIndex())
    expect(engine.search('Graph').map((result) => result.noteID)).toEqual(
      engine.search('Graph').map((result) => result.noteID),
    )
  })
})

describe('vault graph', () => {
  it('builds nodes and edges from the index', () => {
    const vault = Vault.open(new URL('../../../Fixtures/vault', import.meta.url).pathname)
    const graph = buildGraph(vault.index)
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.edges.length).toBeGreaterThan(0)
    for (const edge of graph.edges) {
      expect(graph.nodes.some((node) => node.id === edge.source)).toBe(true)
      expect(graph.nodes.some((node) => node.id === edge.target)).toBe(true)
    }
  })
})
