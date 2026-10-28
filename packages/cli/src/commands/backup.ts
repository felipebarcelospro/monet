import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'

import { Cli, z } from 'incur'

import { type CommandContext, messages, openVault, vaultOptions } from '../lib/context.js'

/** Folders that a snapshot never needs to copy. */
const SKIP = new Set(['.git', '.monet', 'node_modules', '.cache', 'dist', 'build'])

/** The default root for local snapshots. */
function backupRoot(): string {
  const override = process.env['MONET_BACKUP_DIR']
  if (override && override.trim().length > 0) return resolve(override)
  return join(homedir(), '.local', 'share', 'monet', 'backups')
}

/** Counts the files and bytes a snapshot will contain. */
function measure(root: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (SKIP.has(entry.name) || entry.name === '.DS_Store') continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      files += 1
      bytes += statSync(full).size
    }
  }

  walk(root)
  return { files, bytes }
}

/** A stable, sortable snapshot name. */
function snapshotName(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-').slice(0, 19)
  return `${basename(root)}-${stamp}`
}

/** Lists snapshots of one vault, newest first. */
function snapshots(root: string, vaultName: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${vaultName}-`))
    .map((entry) => entry.name)
    .sort()
    .reverse()
}

// ---------------------------------------------------------------------------
// monet backup
// ---------------------------------------------------------------------------

/** The options of `monet backup`. */
export const backupOptions = z.object({
  ...vaultOptions,
  output: z.string().optional().describe('Directory that receives the snapshots'),
  keep: z.number().int().min(1).default(10).describe('Number of snapshots to keep'),
})

/** The output of `monet backup`. */
export const backupOutput = z.object({
  vault: z.string(),
  destination: z.string(),
  files: z.number(),
  bytes: z.number(),
  kept: z.number(),
})

/** Runs `monet backup`. */
export function runBackup(
  c: CommandContext<
    Record<string, never>,
    z.output<typeof backupOptions>,
    z.output<typeof backupOutput>
  >,
): z.output<typeof backupOutput> {
  const vault = openVault(c)
  const root = vault.root
  const copy = messages(c)
  const targetRoot = resolve(c.options.output ?? backupRoot())

  const inside = (path: string): boolean => {
    const rel = relative(resolve(root), resolve(path))
    return rel.length === 0 || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))
  }

  if (inside(targetRoot)) {
    return c.error({
      code: 'BACKUP_INSIDE_VAULT',
      message: copy.get('error.backupInsideVault', { path: targetRoot }),
      retryable: false,
    })
  }

  const { files, bytes } = measure(root)
  if (files === 0) {
    return c.error({
      code: 'EMPTY_VAULT',
      message: copy.get('error.backupEmpty', { path: root }),
      retryable: false,
    })
  }

  const name = snapshotName(root)
  let destination = join(targetRoot, name)
  let counter = 2
  while (existsSync(destination)) {
    destination = join(targetRoot, `${name}-${counter}`)
    counter += 1
  }
  const staging = `${destination}.tmp-${process.pid}`

  try {
    mkdirSync(targetRoot, { recursive: true })
    cpSync(root, staging, {
      recursive: true,
      filter: (source) => {
        if (source === root) return true
        const entry = basename(source)
        return !SKIP.has(entry) && entry !== '.DS_Store'
      },
    })
    renameSync(staging, destination)
  } catch {
    rmSync(staging, { recursive: true, force: true })
    return c.error({
      code: 'BACKUP_FAILED',
      message: copy.get('error.backupFailed', { path: destination }),
      retryable: true,
    })
  }

  const all = snapshots(targetRoot, basename(root))
  for (const old of all.slice(c.options.keep)) {
    rmSync(join(targetRoot, old), { recursive: true, force: true })
  }

  return {
    vault: root,
    destination,
    files,
    bytes,
    kept: Math.min(all.length, c.options.keep),
  }
}

/** The `monet backup` command. */
export const backup = Cli.create('backup', {
  description: 'Write a local snapshot of the vault outside the vault folder.',
  options: backupOptions,
  output: backupOutput,
  examples: [
    {
      description: 'Keep the last ten snapshots in the default folder',
      options: {},
    },
  ],
  run: runBackup,
})
