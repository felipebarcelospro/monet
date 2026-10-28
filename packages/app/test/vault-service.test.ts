import { cpSync, mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VaultService } from '../electron/vault-service'

const FIXTURE = fileURLToPath(new URL('../../../Fixtures/vault', import.meta.url))

let scratch: string
let service: VaultService

beforeEach(() => {
  scratch = join(mkdtempSync(join(tmpdir(), 'monet-app-')), 'vault')
  cpSync(FIXTURE, scratch, { recursive: true })
  service = new VaultService()
  service.open(scratch)
})

afterEach(() => {
  service.close()
  rmSync(join(scratch, '..'), { recursive: true, force: true })
})

describe('folder rename', () => {
  it('moves the folder on disk and keeps the notes readable', () => {
    const before = service.snapshot()!.notes.filter((note) => note.folder === 'Projects')
    expect(before.length).toBeGreaterThan(0)

    const snapshot = service.renameFolder('Projects', 'Initiatives')

    expect(existsSync(join(scratch, 'Projects'))).toBe(false)
    expect(existsSync(join(scratch, 'Initiatives'))).toBe(true)
    expect(snapshot.notes.some((note) => note.folder === 'Projects')).toBe(false)
    expect(snapshot.notes.filter((note) => note.folder === 'Initiatives')).toHaveLength(
      before.length,
    )
  })

  it('rewrites links that spell out the old folder path', () => {
    service.write('Index', '# Index\n\nSee [[Projects/Release Plan]] and [[Release Plan]].\n')

    service.renameFolder('Projects', 'Initiatives')

    const contents = readFileSync(join(scratch, 'Index.md'), 'utf8')
    expect(contents).toContain('[[Initiatives/Release Plan]]')
    expect(contents).toContain('[[Release Plan]]')
  })

  it('refuses a name that already exists', () => {
    expect(() => service.renameFolder('Projects', 'Notes')).toThrow(/already exists/)
  })

  it('refuses slashes and empty names', () => {
    expect(() => service.renameFolder('Projects', 'a/b')).toThrow()
    expect(() => service.renameFolder('Projects', '   ')).toThrow()
  })
})
