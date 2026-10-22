/**
 * A dependency-free YAML subset parser for note frontmatter.
 *
 * This is the TypeScript twin of `MonetCore/Markdown/MarkdownDocument.swift`.
 * It supports scalars, inline sequences, block sequences and nested mappings
 * expressed with indentation — the whole YAML surface the vault format needs.
 */

/** A value decoded from a YAML document. */
export type YAMLValue =
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: number }
  | { kind: 'double'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'array'; value: YAMLValue[] }
  | { kind: 'mapping'; value: Record<string, YAMLValue> }

/** A parsed Markdown document split into frontmatter and body. */
export interface MarkdownDocument {
  frontmatter: Record<string, YAMLValue>
  body: string
  raw: string
}

/** Raised when the frontmatter block is malformed. */
export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrontmatterError'
  }
}

/** Renders a YAML value as a plain string. */
export function stringValue(value: YAMLValue): string {
  switch (value.kind) {
    case 'string':
      return value.value
    case 'int':
    case 'double':
      return String(value.value)
    case 'bool':
      return value.value ? 'true' : 'false'
    case 'null':
      return ''
    case 'array':
      return value.value.map(stringValue).join(', ')
    case 'mapping':
      return Object.keys(value.value)
        .sort()
        .map((key) => `${key}: ${stringValue(value.value[key]!)}`)
        .join(', ')
  }
}

/** Renders a scalar YAML value as text, or `undefined` for collections. */
export function scalarText(value: YAMLValue | undefined): string | undefined {
  if (!value) return undefined
  if (value.kind === 'string') return value.value
  if (value.kind === 'int' || value.kind === 'double') return String(value.value)
  if (value.kind === 'bool') return value.value ? 'true' : 'false'
  return undefined
}

/** Renders a YAML value as a list of strings. */
export function stringList(value: YAMLValue): string[] {
  switch (value.kind) {
    case 'string':
      return [value.value]
    case 'array':
      return value.value.flatMap(stringList)
    case 'mapping':
      return Object.keys(value.value).sort()
    default:
      return []
  }
}

/** Removes a trailing `#` comment that is not inside a quoted scalar. */
export function stripComment(raw: string): string {
  let quote: string | undefined
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!
    if (quote) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '#' && (index === 0 || raw[index - 1] === ' ')) {
      return raw.slice(0, index)
    }
  }
  return raw
}

/** Removes surrounding quotes from a scalar. */
export function unquote(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }
  return value
}

/** Parses a scalar into the most specific YAML value. */
export function parseScalar(raw: string): YAMLValue {
  const value = raw.trim()
  if (value.length === 0) return { kind: 'null' }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return { kind: 'string', value: unquote(value) }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return { kind: 'string', value: value.slice(1, -1) }
  }
  const lowered = value.toLowerCase()
  if (lowered === 'true' || lowered === 'yes') return { kind: 'bool', value: true }
  if (lowered === 'false' || lowered === 'no') return { kind: 'bool', value: false }
  if (lowered === 'null' || lowered === '~') return { kind: 'null' }
  if (/^-?\d+$/u.test(value)) return { kind: 'int', value: Number(value) }
  if (/^-?\d*\.\d+(?:[eE][+-]?\d+)?$/u.test(value)) return { kind: 'double', value: Number(value) }
  return { kind: 'string', value }
}

/** Splits an inline sequence body on commas that are not nested or quoted. */
export function splitInlineSequence(body: string): string[] {
  const items: string[] = []
  let current = ''
  let depth = 0
  let quote: string | undefined

  for (const character of body) {
    if (quote) {
      current += character
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '[') depth += 1
    if (character === ']') depth -= 1
    if (character === ',' && depth === 0) {
      items.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim().length > 0) items.push(current.trim())
  return items.filter((item) => item.length > 0)
}

/** Parses a scalar or an inline `[a, b]` sequence. */
export function parseScalarOrSequence(raw: string): YAMLValue {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1)
    return { kind: 'array', value: splitInlineSequence(inner).map(parseScalarOrSequence) }
  }
  return parseScalar(value)
}

interface FrontmatterLine {
  indent: number
  text: string
  number: number
}

/** Parses a block of `key: value` pairs at a given indentation level. */
function parseMappingBlock(
  lines: FrontmatterLine[],
  state: { index: number },
  indent: number,
): Record<string, YAMLValue> {
  const mapping: Record<string, YAMLValue> = {}

  while (state.index < lines.length) {
    const line = lines[state.index]!

    if (line.indent < indent) break
    if (line.indent > indent) {
      state.index += 1
      continue
    }
    if (line.text.startsWith('- ') || line.text === '-') break

    const separator = line.text.indexOf(':')
    if (separator === -1) {
      throw new FrontmatterError(`Malformed frontmatter on line ${line.number}: ${line.text}`)
    }

    const key = line.text.slice(0, separator).trim()
    const rest = line.text.slice(separator + 1).trim()
    state.index += 1

    if (rest.length > 0) {
      mapping[key] = parseScalarOrSequence(rest)
      continue
    }

    if (state.index >= lines.length) {
      mapping[key] = { kind: 'null' }
      continue
    }
    const next = lines[state.index]!
    if (next.indent <= line.indent) {
      mapping[key] = { kind: 'null' }
      continue
    }

    if (next.text.startsWith('- ') || next.text === '-') {
      const items: YAMLValue[] = []
      const sequenceIndent = next.indent
      while (
        state.index < lines.length &&
        lines[state.index]!.indent === sequenceIndent &&
        (lines[state.index]!.text.startsWith('- ') || lines[state.index]!.text === '-')
      ) {
        const item = lines[state.index]!.text.slice(1).trim()
        state.index += 1
        items.push(parseScalarOrSequence(item))
      }
      mapping[key] = { kind: 'array', value: items }
    } else {
      mapping[key] = { kind: 'mapping', value: parseMappingBlock(lines, state, next.indent) }
    }
  }

  return mapping
}

/** Parses the lines of a frontmatter block. */
export function parseFrontmatterBlock(lines: string[]): Record<string, YAMLValue> {
  const significant: FrontmatterLine[] = []
  lines.forEach((raw, index) => {
    const trimmed = stripComment(raw).trim()
    if (trimmed.length === 0) return
    const indent = raw.length - raw.trimStart().length
    significant.push({ indent, text: trimmed, number: index + 1 })
  })

  if (significant.length === 0) return {}
  const state = { index: 0 }
  return parseMappingBlock(significant, state, significant[0]!.indent)
}

/**
 * Splits raw Markdown into frontmatter and body.
 */
export function parseMarkdown(raw: string): MarkdownDocument {
  const normalized = raw.replace(/\r\n/gu, '\n')
  const lines = normalized.split('\n')

  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: normalized, raw }
  }

  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]!.trim() === '---') {
      closing = index
      break
    }
  }
  if (closing === -1) {
    throw new FrontmatterError('Unterminated frontmatter block')
  }

  const frontmatter = parseFrontmatterBlock(lines.slice(1, closing))
  const body = lines.slice(closing + 1).join('\n')
  return { frontmatter, body, raw }
}
