import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { z } from 'incur'

import {
  type ConcurrencyWarning,
  type Note,
  NoteConflictError,
  Vault,
  atomicWriteFileSync,
  detectConcurrentApp,
  notePath,
  renderNote,
  resolveVault,
  revisionOf,
} from '@monet/core'

import { appBundleCandidates } from './paths.js'
import { type Locale, Messages, resolveLocale } from './i18n.js'

/**
 * The options every Monet command accepts.
 *
 * They are declared per command instead of as CLI-level globals because
 * incur types a command's optional middleware against the CLI environment
 * and globals. Monet does not use per-command middleware, so keeping the
 * options local keeps every schema — and the inference that comes with it —
 * exact.
 */
export const vaultOptions = {
  vault: z.string().optional().describe('Path to the vault folder'),
  locale: z.enum(['en', 'pt-BR', 'es']).optional().describe('Locale for the messages'),
}

/** The subset of the incur run context the commands rely on. */
export interface CommandContext<Args = any, Options = any, Output = any> {
  /** The positional arguments. */
  args: Args
  /** The named options. */
  options: Options
  /** Whether the caller is an agent rather than a terminal. */
  agent: boolean
  /** The CLI name. */
  name: string
  /** The resolved output format. */
  format: string
  /** Returns a success result. */
  ok: (data: Output, meta?: { cta?: any }) => never
  /** Returns a failure result. */
  error: (options: { code: string; message: string; retryable?: boolean; cta?: any }) => never
}

/** Opens the vault the command should operate on. */
export function openVault(context: { options?: { vault?: string | undefined } }): Vault {
  const explicit = context.options?.vault
  const path = resolveVault(explicit)
  return Vault.open(path)
}

/** The locale the command should use. */
export function commandLocale(context: { options?: { locale?: string | undefined } }): Locale {
  return resolveLocale(context.options?.locale)
}

/** The message catalogue for the command. */
export function messages(context: { options?: { locale?: string | undefined } }): Messages {
  return new Messages(commandLocale(context))
}

/**
 * Detects whether the Monet app has the vault open.
 */
export function concurrencyWarning(vault: Vault): ConcurrencyWarning | undefined {
  return detectConcurrentApp(vault.root)
}

/**
 * Finds a note by path, id, title or alias.
 */
export function findNote(vault: Vault, target: string): Note | undefined {
  const trimmed = target.trim()
  if (trimmed.length === 0) return undefined

  const direct = vault.index.note(trimmed)
  if (direct) return direct

  const byPath = vault.index.notesByPath.get(trimmed)
  if (byPath) return byPath

  const resolved = vault.index.resolver.resolve(trimmed)
  if (resolved) return vault.index.note(resolved)

  const lower = trimmed.toLowerCase()
  return vault.index.notes.find(
    (note) =>
      note.title.toLowerCase() === lower ||
      note.relativePath.toLowerCase() === lower ||
      note.aliases.some((alias) => alias.toLowerCase() === lower),
  )
}

/**
 * Writes a note to disk, creating the folders it needs.
 */
export function writeNote(vault: Vault, note: Note, body: string): void {
  const absolute = vault.absolutePath(note.relativePath)

  // Refuse to overwrite a file that changed after this command read it. A
  // newly created note has no revision yet and is written unconditionally.
  if (note.revision.length > 0 && existsSync(absolute)) {
    const current = revisionOf(readFileSync(absolute, 'utf8'))
    if (current !== note.revision) throw new NoteConflictError(note.relativePath)
  }
  if (note.revision.length === 0 && existsSync(absolute)) {
    throw new NoteConflictError(note.relativePath)
  }

  const contents = renderNote(note, body)
  mkdirSync(dirname(absolute), { recursive: true })
  atomicWriteFileSync(absolute, contents)
  note.revision = revisionOf(contents)
}

/** Re-exported so every command builds paths the same way. */
export { notePath }

/**
 * The absolute path of the Monet app bundle, when it is installed.
 */
export function appBundlePath(): string | undefined {
  return appBundleCandidates().find((candidate) => existsSync(candidate))
}

/**
 * Reads a file, returning `undefined` when it does not exist.
 */
export function readIfPresent(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}
