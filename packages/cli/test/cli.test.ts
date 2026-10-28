import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cli } from '../src/index.js'
import { writeNote } from '../src/lib/context.js'
import { Vault } from '@monet/core'

/** The sample vault used by the CLI tests. */
const VAULT = fileURLToPath(new URL('../../../Fixtures/vault', import.meta.url))

/** A writable copy of the sample vault, used by the tests that mutate it. */
const scratch = join(mkdtempSync(join(tmpdir(), 'monet-cli-')), 'vault')
cpSync(VAULT, scratch, { recursive: true })

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** An isolated configuration, so selecting a vault never touches the user's. */
const configDir = mkdtempSync(join(tmpdir(), 'monet-config-'))
const originalConfig = process.env['MONET_CONFIG_DIR']
const originalVault = process.env['MONET_VAULT']

beforeEach(() => {
  process.env['MONET_CONFIG_DIR'] = configDir
  delete process.env['MONET_VAULT']
})

afterEach(() => {
  if (originalConfig === undefined) delete process.env['MONET_CONFIG_DIR']
  else process.env['MONET_CONFIG_DIR'] = originalConfig
  if (originalVault === undefined) delete process.env['MONET_VAULT']
  else process.env['MONET_VAULT'] = originalVault
})

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true })
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
    const { output, code } = await run(['search', 'release', '--vault', VAULT, '--format', 'json'])
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

  it('selects a vault and reuses it without --vault', async () => {
    const chosen = await run(['vault', 'use', scratch, '--format', 'json'])
    expect(chosen.code).toBe(0)
    const selected = JSON.parse(chosen.output) as { path: string; notes: number }
    expect(selected.path).toBe(scratch)
    expect(selected.notes).toBeGreaterThan(0)

    const current = await run(['vault', 'current', '--format', 'json'])
    expect(current.code).toBe(0)
    const info = JSON.parse(current.output) as { path: string; source: string; exists: boolean }
    expect(info.path).toBe(scratch)
    expect(info.source).toBe('config')
    expect(info.exists).toBe(true)

    // Every command now works without repeating --vault.
    const list = await run(['note', 'list', '--format', 'json'])
    expect(list.code).toBe(0)
    expect(list.output).toContain('Release Plan')
  })

  it('lists the current vault and the recent ones', async () => {
    await run(['vault', 'use', scratch])
    const { output, code } = await run(['vault', 'list', '--format', 'json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(output) as {
      current: string
      vaults: { path: string; current: boolean; notes: number | null }[]
    }
    expect(parsed.current).toBe(scratch)
    expect(parsed.vaults[0]?.path).toBe(scratch)
    expect(parsed.vaults[0]?.current).toBe(true)
    expect(parsed.vaults[0]?.notes).toBeGreaterThan(0)
  })

  it('refuses a folder that does not exist', async () => {
    const missing = join(configDir, 'not-a-vault')
    const { output, code } = await run(['vault', 'use', missing, '--format', 'json'])
    expect(code).toBe(1)
    expect(output).toContain('not-a-vault')
  })

  it('preserves a multiline frontmatter block and saves added tags', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'monet-edit-'))
    const file = join(directory, 'Note.md')
    writeFileSync(
      file,
      `---
title: Note
tags: [one]
description: |
  First line.
  Second line.
---
Body.
`,
      'utf8',
    )

    const { code } = await run([
      'note',
      'edit',
      'Note',
      '--tag',
      'two',
      '--append',
      'More.',
      '--vault',
      directory,
      '--format',
      'json',
    ])
    expect(code).toBe(0)

    const contents = readFileSync(file, 'utf8')
    expect(contents).toContain('description: |')
    expect(contents).toContain('  First line.\n  Second line.')
    expect(contents).toContain('  - one')
    expect(contents).toContain('  - two')
    expect(contents).toContain('More.')
    rmSync(directory, { recursive: true, force: true })
  })

  it('refuses to overwrite a note that changed after it was read', () => {
    const directory = mkdtempSync(join(tmpdir(), 'monet-conflict-'))
    const file = join(directory, 'Note.md')
    writeFileSync(file, '---\ntitle: Note\n---\nOriginal.\n', 'utf8')

    const vault = Vault.open(directory)
    const note = vault.index.notes[0]!
    writeFileSync(file, '---\ntitle: Note\n---\nChanged outside.\n', 'utf8')

    expect(() => writeNote(vault, note, 'Mine.')).toThrow(/changed on disk/)
    expect(readFileSync(file, 'utf8')).toContain('Changed outside.')
    rmSync(directory, { recursive: true, force: true })
  })

  it('writes a snapshot outside the vault and prunes old ones', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'monet-backup-src-'))
    const backups = mkdtempSync(join(tmpdir(), 'monet-backup-out-'))
    writeFileSync(join(directory, 'Note.md'), '# Note\n', 'utf8')

    const previous = process.env['MONET_BACKUP_DIR']
    process.env['MONET_BACKUP_DIR'] = backups
    try {
      const first = await run(['backup', '--vault', directory, '--keep', '1', '--format', 'json'])
      expect(first.code).toBe(0)
      const snapshot = JSON.parse(first.output) as { destination: string }
      expect(existsSync(join(snapshot.destination, 'Note.md'))).toBe(true)

      const second = await run(['backup', '--vault', directory, '--keep', '1', '--format', 'json'])
      expect(second.code).toBe(0)
      const remaining = readdirSync(backups).filter((entry) =>
        entry.startsWith('monet-backup-src-'),
      )
      expect(remaining).toHaveLength(1)
    } finally {
      if (previous === undefined) delete process.env['MONET_BACKUP_DIR']
      else process.env['MONET_BACKUP_DIR'] = previous
      rmSync(directory, { recursive: true, force: true })
      rmSync(backups, { recursive: true, force: true })
    }
  })

  it('refuses to create a note outside the vault', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'monet-escape-'))
    const outside = join(dirname(directory), 'monet-outside')

    const { output, code } = await run([
      'note',
      'new',
      'Escape',
      '--folder',
      '../monet-outside',
      '--vault',
      directory,
      '--format',
      'json',
    ])

    expect(code).toBe(1)
    expect(output).toContain('INVALID_PATH')
    expect(existsSync(join(outside, 'Escape.md'))).toBe(false)
    rmSync(directory, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
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
