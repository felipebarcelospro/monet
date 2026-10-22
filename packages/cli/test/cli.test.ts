import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { cli } from '../src/index.js'

/** The sample vault used by the CLI tests. */
const VAULT = fileURLToPath(new URL('./fixtures/vault', import.meta.url))

/** A writable copy of the sample vault, used by the tests that mutate it. */
const scratch = join(mkdtempSync(join(tmpdir(), 'monet-cli-')), 'vault')
cpSync(VAULT, scratch, { recursive: true })

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** Runs the CLI and captures what it writes. */
async function run(args: string[]): Promise<{ output: string; code: number }> {
  let output = ''
  let code = 0
  await cli.serve(args, {
    stdout(text: string) {
      output += text
    },
    exit(status: number) {
      code = status
    },
  })
  return { output, code }
}

describe('monet CLI', () => {
  it('lists the notes of the vault', async () => {
    const { output, code } = await run(['note', 'list', '--vault', VAULT])
    expect(code).toBe(0)
    expect(output).toContain('Release Plan')
    expect(output).toContain('Design Notes')
  })

  it('prints a note as JSON', async () => {
    const { output, code } = await run([
      'note',
      'show',
      'Release Plan',
      '--vault',
      VAULT,
      '--format',
      'json',
    ])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { title: string; body: string; tags: string[] }
    expect(parsed.title).toBe('Release Plan')
    expect(parsed.body).toContain('[[Design Notes]]')
    expect(parsed.tags).toContain('release')
  })

  it('searches the vault', async () => {
    const { output, code } = await run([
      'search',
      'release',
      '--vault',
      VAULT,
      '--format',
      'json',
    ])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { count: number; results: { title: string }[] }
    expect(parsed.count).toBeGreaterThan(0)
    expect(parsed.results[0]?.title).toBe('Release Plan')
  })

  it('lists the backlinks of a note', async () => {
    const { output, code } = await run([
      'backlinks',
      'Design Notes',
      '--vault',
      VAULT,
      '--format',
      'json',
    ])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { count: number; backlinks: { title: string }[] }
    // Both the index and the release plan link to the design notes.
    expect(parsed.count).toBe(2)
    expect(parsed.backlinks.map((backlink) => backlink.title).sort()).toEqual([
      'Index',
      'Release Plan',
    ])
  })

  it('exports the graph as JSON', async () => {
    const { output, code } = await run(['graph', '--vault', VAULT, '--format', 'json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as {
      nodes: { id: string }[]
      edges: { source: string; target: string }[]
    }
    expect(parsed.nodes.length).toBe(4)
    // Index -> Release Plan, Index -> Design Notes,
    // Release Plan -> Design Notes, Release Plan -> Checklist,
    // Design Notes -> Index.
    expect(parsed.edges.length).toBe(5)
  })

  it('lists the tags of the vault', async () => {
    const { output, code } = await run(['tags', '--vault', VAULT, '--format', 'json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { tags: { tag: string; count: number }[] }
    expect(parsed.tags.map((entry) => entry.tag)).toContain('project')
  })

  it('reports a missing note as an error', async () => {
    const { output, code } = await run(['note', 'show', 'Nope', '--vault', VAULT])
    expect(code).toBe(1)
    expect(output).toContain('NOTE_NOT_FOUND')
  })

  it('creates a link between two notes', async () => {
    const { output, code } = await run([
      'link',
      'create',
      'Checklist',
      '--target',
      'Design Notes',
      '--vault',
      scratch,
      '--format',
      'json',
    ])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { link: string }
    expect(parsed.link).toBe('[[Design Notes]]')

    // The link is now a real link in the file.
    const check = await run([
      'link',
      'check',
      'Checklist',
      '--target',
      'Design Notes',
      '--vault',
      scratch,
      '--format',
      'json',
    ])
    const checked = JSON.parse(check.output) as { resolved: boolean; resolvedTo: string }
    expect(checked.resolved).toBe(true)
    expect(checked.resolvedTo).toBe('Notes/Design Notes')
  })

  it('exposes the command manifest with --llms', async () => {
    const { output, code } = await run(['--llms'])
    expect(code).toBe(0)
    expect(output).toContain('search')
    expect(output).toContain('backlinks')
  })

  it('exposes the JSON schema of a command with --schema', async () => {
    const { output, code } = await run(['search', '--schema', '--format', 'json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as { args?: { properties?: unknown } }
    expect(parsed.args?.properties).toBeDefined()
  })

  it('generates shell completions', async () => {
    const { output, code } = await run(['completions', 'zsh'])
    expect(code).toBe(0)
    expect(output.length).toBeGreaterThan(0)
  })
})
