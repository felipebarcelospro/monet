import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** The persisted configuration of the CLI. */
export interface MonetConfig {
  /** The absolute path of the default vault. */
  vault?: string
  /** The locale used for messages. */
  locale?: string
  /** Whether the CLI warns when the app has the vault open. */
  warnOnConcurrentEdit?: boolean
}

/** The directory the CLI stores its configuration in. */
export function configDirectory(): string {
  const override = process.env['MONET_CONFIG_DIR']
  if (override && override.length > 0) return override
  return join(homedir(), '.config', 'monet')
}

/** The path of the configuration file. */
export function configPath(): string {
  return join(configDirectory(), 'config.json')
}

/**
 * Reads the configuration, returning an empty configuration when it does not
 * exist.
 */
export function readConfig(): MonetConfig {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as MonetConfig
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Writes the configuration.
 */
export function writeConfig(config: MonetConfig): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(config, undefined, 2)}\n`, 'utf8')
}

/**
 * Resolves the vault to operate on.
 *
 * The order is: the explicit argument, the `MONET_VAULT` environment
 * variable, the configured vault, then the current working directory.
 */
export function resolveVault(explicit?: string): string {
  const candidates = [explicit, process.env['MONET_VAULT'], readConfig().vault]
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) return resolve(candidate.trim())
  }
  return resolve(process.cwd())
}
