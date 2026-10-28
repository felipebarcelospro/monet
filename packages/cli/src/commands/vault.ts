import { existsSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { Cli, z } from 'incur'

import { Vault, configPath, expandHome, readConfig, resolveVault, selectVault } from '@monet/core'

import { type CommandContext, messages, vaultOptions } from '../lib/context.js'

/** One vault known to the CLI. */
export const vaultSummary = z.object({
  name: z.string(),
  path: z.string(),
  current: z.boolean(),
  exists: z.boolean(),
  notes: z.number().nullable(),
})

/** Describes a folder without letting a permission error abort the listing. */
function describe(path: string, current: string): z.output<typeof vaultSummary> {
  const absolute = resolve(expandHome(path))
  let exists = false
  try {
    exists = existsSync(absolute) && statSync(absolute).isDirectory()
  } catch {
    exists = false
  }

  let notes: number | null = null
  if (exists) {
    try {
      notes = Vault.markdownFiles(absolute).length
    } catch {
      notes = null
    }
  }

  return {
    name: basename(absolute) || absolute,
    path: absolute,
    current: absolute === current,
    exists,
    notes,
  }
}

/**
 * Turns a command argument into a path.
 *
 * A full path always wins. When the argument is just a name, a vault already
 * in the recent list with that folder name is accepted, so `vault use Vault`
 * works after the folder was opened once.
 */
function resolveArgument(input: string): string {
  const trimmed = input.trim()
  const direct = resolve(expandHome(trimmed))
  if (existsSync(direct)) return direct

  const match = (readConfig().recentVaults ?? []).find(
    (entry) => basename(entry).toLowerCase() === trimmed.toLowerCase(),
  )
  return match ? resolve(expandHome(match)) : direct
}

// ---------------------------------------------------------------------------
// monet vault list
// ---------------------------------------------------------------------------

/** The output of `monet vault list`. */
export const vaultListOutput = z.object({
  current: z.string(),
  config: z.string(),
  vaults: z.array(vaultSummary),
})

/** Runs `monet vault list`. */
export function runVaultList(): z.output<typeof vaultListOutput> {
  const config = readConfig()
  const current = resolveVault()
  const candidates = [current, ...(config.recentVaults ?? [])]

  const seen = new Set<string>()
  const vaults: z.output<typeof vaultSummary>[] = []
  for (const candidate of candidates) {
    const info = describe(candidate, current)
    if (seen.has(info.path)) continue
    seen.add(info.path)
    vaults.push(info)
  }

  return { current, config: configPath(), vaults }
}

// ---------------------------------------------------------------------------
// monet vault current
// ---------------------------------------------------------------------------

/** The output of `monet vault current`. */
export const vaultCurrentOutput = z.object({
  path: z.string(),
  name: z.string(),
  source: z.enum(['flag', 'environment', 'config', 'directory']),
  exists: z.boolean(),
  notes: z.number(),
  config: z.string(),
})

/** Runs `monet vault current`. */
export function runVaultCurrent(
  c: CommandContext<
    Record<string, never>,
    { vault?: string | undefined },
    z.output<typeof vaultCurrentOutput>
  >,
): z.output<typeof vaultCurrentOutput> {
  const config = readConfig()
  const source = c.options.vault
    ? 'flag'
    : process.env['MONET_VAULT']
      ? 'environment'
      : config.vault
        ? 'config'
        : 'directory'

  const path = resolveVault(c.options.vault)
  const info = describe(path, path)

  return {
    path: info.path,
    name: info.name,
    source,
    exists: info.exists,
    notes: info.notes ?? 0,
    config: configPath(),
  }
}

// ---------------------------------------------------------------------------
// monet vault use
// ---------------------------------------------------------------------------

/** The argument of `monet vault use`. */
export const vaultUseArgs = z.object({
  path: z.string().describe('Path to the vault folder, or the name of a recent vault'),
})

/** The options of `monet vault use`. */
export const vaultUseOptions = z.object({
  locale: vaultOptions.locale,
})

/** The output of `monet vault use`. */
export const vaultUseOutput = z.object({
  path: z.string(),
  name: z.string(),
  notes: z.number(),
  previous: z.string().nullable(),
})

/** Runs `monet vault use`. */
export function runVaultUse(
  c: CommandContext<
    z.output<typeof vaultUseArgs>,
    z.output<typeof vaultUseOptions>,
    z.output<typeof vaultUseOutput>
  >,
): z.output<typeof vaultUseOutput> {
  const path = resolveArgument(c.args.path)
  const copy = messages(c)

  if (!existsSync(path)) {
    return c.error({
      code: 'VAULT_NOT_FOUND',
      message: copy.get('error.vaultNotFound', { path }),
      retryable: false,
    })
  }

  let isDirectory = false
  try {
    isDirectory = statSync(path).isDirectory()
  } catch {
    isDirectory = false
  }
  if (!isDirectory) {
    return c.error({
      code: 'VAULT_NOT_DIRECTORY',
      message: copy.get('error.vaultNotDirectory', { path }),
      retryable: false,
    })
  }

  const previous = readConfig().vault
  const previousPath = previous ? resolve(expandHome(previous)) : null

  let notes: number
  try {
    notes = Vault.open(path).index.notes.length
  } catch {
    return c.error({
      code: 'VAULT_UNREADABLE',
      message: copy.get('error.vaultUnreadable', { path }),
      retryable: false,
    })
  }

  selectVault(path)

  return { path, name: basename(path) || path, notes, previous: previousPath }
}

// ---------------------------------------------------------------------------
// The command group
// ---------------------------------------------------------------------------

/** The `monet vault` command group. */
export const vault = Cli.create('vault', {
  description: 'List, inspect and choose the vault every command works on.',
})
  .command('list', {
    description: 'List the current vault and the ones opened recently.',
    options: z.object({ locale: vaultOptions.locale }),
    output: vaultListOutput,
    run: runVaultList,
  })
  .command('current', {
    description: 'Show the vault a command would use right now, and where it came from.',
    options: z.object({ ...vaultOptions }),
    output: vaultCurrentOutput,
    run: runVaultCurrent,
  })
  .command('use', {
    description: 'Choose the default vault and remember it for the app and the CLI.',
    args: vaultUseArgs,
    options: vaultUseOptions,
    output: vaultUseOutput,
    examples: [
      {
        args: { path: '~/Documents/Vault' },
        description: 'Make ~/Documents/Vault the vault every command uses',
      },
    ],
    run: runVaultUse,
  })
