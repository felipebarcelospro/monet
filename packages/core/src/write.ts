import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { YAMLValue } from './frontmatter.js'
import type { Note, Vault } from './vault.js'

/**
 * Writing notes back to disk.
 *
 * The same renderer is used by the CLI and by the desktop app, so a note
 * edited in either place keeps byte-for-byte the same frontmatter shape.
 */

/** Renders a scalar for the frontmatter block. */
function scalarToText(value: YAMLValue): string {
  switch (value.kind) {
    case 'string':
      return quoteIfNeeded(value.value)
    case 'int':
    case 'double':
      return String(value.value)
    case 'bool':
      return value.value ? 'true' : 'false'
    case 'null':
      return ''
    case 'array':
    case 'mapping':
      return ''
  }
}

/** Quotes a string only when the YAML parser would read it as something else. */
export function quoteIfNeeded(value: string): string {
  const needsQuotes =
    value.length === 0 ||
    /^[-?:,[\]{}#&*!|>'"%@`]/u.test(value) ||
    /:\s/u.test(value) ||
    /\s#/u.test(value) ||
    /^(?:true|false|yes|no|null|~)$/iu.test(value) ||
    /^-?\d+(?:\.\d+)?$/u.test(value) ||
    value !== value.trim()
  return needsQuotes ? JSON.stringify(value) : value
}

/** Recursively renders YAML values with clean indentation. */
function renderYAMLNode(value: YAMLValue, indentLevel: number): string {
  const spaces = '  '.repeat(indentLevel)

  if (value.kind === 'array') {
    if (value.value.length === 0) return '[]'
    let output = '\n'
    for (const item of value.value) {
      if (item.kind === 'mapping') {
        const entries = Object.entries(item.value).sort(([a], [b]) => a.localeCompare(b))
        if (entries.length === 0) {
          output += `${spaces}- {}\n`
          continue
        }
        const [firstKey, firstVal] = entries[0]!
        output += `${spaces}- ${firstKey}: ${renderYAMLNode(firstVal, indentLevel + 1).trimStart()}\n`
        for (let i = 1; i < entries.length; i += 1) {
          const [k, v] = entries[i]!
          output += `${spaces}  ${k}: ${renderYAMLNode(v, indentLevel + 1).trimStart()}\n`
        }
      } else if (item.kind === 'array') {
        output += `${spaces}- ${renderYAMLNode(item, indentLevel + 1).trimStart()}`
      } else {
        output += `${spaces}- ${scalarToText(item)}\n`
      }
    }
    return output
  }

  if (value.kind === 'mapping') {
    const keys = Object.keys(value.value).sort()
    if (keys.length === 0) return '{}'
    let output = '\n'
    for (const key of keys) {
      const val = value.value[key]!
      output += `${spaces}${key}: ${renderYAMLNode(val, indentLevel + 1).trimStart()}\n`
    }
    return output
  }

  return `${scalarToText(value)}`
}

/** Renders a string as a YAML literal block scalar. */
function renderBlockScalar(value: string, indentLevel: number): string {
  const trailing = value.match(/\n*$/u)?.[0].length ?? 0
  const body = trailing > 0 ? value.slice(0, -trailing) : value
  const marker = trailing === 0 ? '|-' : trailing > 1 ? '|+' : '|'
  const spaces = '  '.repeat(indentLevel + 1)
  const lines = body.split('\n').map((line) => `${spaces}${line}`)
  if (trailing > 1) for (let index = 1; index < trailing; index += 1) lines.push('')
  return `${marker}\n${lines.join('\n')}\n`
}

/** Renders the frontmatter mapping. */
export function renderFrontmatter(frontmatter: Record<string, YAMLValue>): string {
  const keys = Object.keys(frontmatter).sort()
  if (keys.length === 0) return ''

  let output = '---\n'
  for (const key of keys) {
    const value = frontmatter[key]!
    if (value.kind === 'string' && value.value.includes('\n')) {
      output += `${key}: ${renderBlockScalar(value.value, 0)}`
      continue
    }
    if (value.kind === 'array') {
      output += `${key}:`
      const rendered = renderYAMLNode(value, 1)
      output += rendered.endsWith('\n') ? rendered : `${rendered}\n`
    } else if (value.kind === 'mapping') {
      output += `${key}:`
      const rendered = renderYAMLNode(value, 1)
      output += rendered.endsWith('\n') ? rendered : `${rendered}\n`
    } else if (value.kind === 'null') {
      output += `${key}:\n`
    } else {
      output += `${key}: ${scalarToText(value)}\n`
    }
  }
  output += '---\n'
  return output
}

/**
 * Renders a note back to its on-disk representation.
 *
 * When the parsed frontmatter still matches what was read, the original block
 * is reused verbatim: comments, key order and formatting survive a body-only
 * edit. Once a property changes, the block is rendered from the values.
 */
export function renderNote(
  note: Pick<Note, 'frontmatter' | 'frontmatterRaw' | 'frontmatterCanonical'>,
  body: string,
): string {
  const canonical = renderFrontmatter(note.frontmatter)
  const frontmatter =
    note.frontmatterRaw && note.frontmatterCanonical === canonical ? note.frontmatterRaw : canonical
  if (frontmatter.length === 0) return body
  // The block already ends with `---\n`; do not add a second newline, or
  // every save would grow a blank line between the frontmatter and the body.
  return `${frontmatter}${body.replace(/^\n+/u, '')}`
}

/** Builds a vault-relative path for a new note. */
export function notePath(title: string, folder?: string): string {
  const safe = sanitizeTitle(title)
  const fileName = `${safe}.md`
  const trimmed = folder?.trim().replace(/^\/+|\/+$/gu, '') ?? ''
  return trimmed.length > 0 ? `${trimmed}/${fileName}` : fileName
}

/** Turns a title into a file name that is safe on every filesystem. */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^\.+/u, '')
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'Untitled'
}

/**
 * Returns a note path that does not collide with an existing file.
 *
 * `Untitled` becomes `Untitled 2`, then `Untitled 3`, and so on — the
 * behaviour every notes application has, and the reason creating a note
 * never silently overwrites another one.
 */
export function uniqueNotePath(root: string, title: string, folder?: string): string {
  const first = notePath(title, folder)
  if (!existsSync(`${root}/${first}`)) return first

  const base = first.replace(/\.md$/u, '')
  let counter = 2
  while (existsSync(`${root}/${base} ${counter}.md`)) counter += 1
  return `${base} ${counter}.md`
}

/**
 * Writes data to a file atomically via a temporary file in the same folder.
 * Prevents file corruption if the process or power is interrupted mid-write.
 */
export function atomicWriteFileSync(filePath: string, contents: string): void {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const rand = Math.random().toString(36).slice(2, 8)
  const tempPath = join(dir, `.${process.pid}.${Date.now()}.${rand}.tmp`)
  try {
    writeFileSync(tempPath, contents, 'utf8')
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch {
      // Ignore cleanup error
    }
    throw error
  }
}

/** Writes a note to disk atomically, creating the folders it needs. */
export function writeNoteFile(vault: Vault, relativePath: string, contents: string): void {
  const absolute = vault.absolutePath(relativePath)
  atomicWriteFileSync(absolute, contents)
}
