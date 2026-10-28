import { mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

import { Cli, z } from 'incur'

import {
  type CommandContext,
  concurrencyWarning,
  findNote,
  messages,
  notePath,
  openVault,
  vaultOptions,
  writeNote,
} from '../lib/context.js'
import { configPath, parseLinks, readConfig, selectVault, writeConfig } from '@monet/core'

// ---------------------------------------------------------------------------
// monet note new
// ---------------------------------------------------------------------------

/** The arguments of `monet note new`. */
export const noteNewArgs = z.object({
  title: z.string().describe('Title of the new note'),
})

/** The options of `monet note new`. */
export const noteNewOptions = z.object({
  ...vaultOptions,
  body: z.string().optional().describe('Initial body of the note'),
  folder: z.string().optional().describe('Folder inside the vault'),
  tag: z.array(z.string()).optional().describe('Tags to attach to the note'),
  alias: z.array(z.string()).optional().describe('Aliases for the note'),
})

/** The output of `monet note new`. */
export const noteNewOutput = z.object({
  path: z.string(),
  id: z.string(),
  title: z.string(),
})

/** Runs `monet note new`. */
export function runNoteNew(
  c: CommandContext<
    z.output<typeof noteNewArgs>,
    z.output<typeof noteNewOptions>,
    z.output<typeof noteNewOutput>
  >,
): z.output<typeof noteNewOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const relativePath = notePath(c.args.title, c.options.folder)
  if (vault.index.notesByPath.has(relativePath)) {
    return c.error({
      code: 'NOTE_EXISTS',
      message: messages_.get('error.noteExists', { path: relativePath }),
      retryable: false,
    })
  }

  const tags = c.options.tag ?? []
  const aliases = c.options.alias ?? []
  const body = c.options.body ?? `# ${c.args.title.trim()}\n\n`

  const frontmatter: Record<string, unknown> = {}
  if (tags.length > 0) {
    frontmatter['tags'] = {
      kind: 'array',
      value: tags.map((tag) => ({ kind: 'string', value: tag })),
    }
  }
  if (aliases.length > 0) {
    frontmatter['aliases'] = {
      kind: 'array',
      value: aliases.map((alias) => ({ kind: 'string', value: alias })),
    }
  }

  const created = {
    id: relativePath.replace(/\.[^./\\]+$/u, ''),
    relativePath,
    title: c.args.title.trim(),
    aliases,
    tags,
    frontmatter: frontmatter as never,
    body,
    links: parseLinks(body),
    headings: [],
    modifiedAt: Date.now(),
    byteSize: Buffer.byteLength(body, 'utf8'),
  }

  writeNote(vault, created, body)

  return c.ok(
    { path: relativePath, id: created.id, title: created.title },
    {
      cta: {
        description: messages_.get('note.created', { path: relativePath }),
        commands: [
          {
            command: 'note show',
            args: { title: created.title },
            description: 'Show the new note',
          },
          { command: 'note list' },
        ],
      },
    },
  )
}

// ---------------------------------------------------------------------------
// monet note list
// ---------------------------------------------------------------------------

/** The options of `monet note list`. */
export const noteListOptions = z.object({
  ...vaultOptions,
  tag: z.string().optional().describe('Only notes carrying this tag'),
  folder: z.string().optional().describe('Only notes inside this folder'),
  limit: z.number().default(100).describe('Maximum number of notes to return'),
})

/** The output of `monet note list`. */
export const noteListOutput = z.object({
  count: z.number(),
  notes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      path: z.string(),
      tags: z.array(z.string()),
      links: z.number(),
    }),
  ),
})

/** Runs `monet note list`. */
export function runNoteList(
  c: CommandContext<
    Record<string, never>,
    z.output<typeof noteListOptions>,
    z.output<typeof noteListOutput>
  >,
): z.output<typeof noteListOutput> {
  const vault = openVault(c)

  let notes = vault.index.notes
  if (c.options.tag) notes = vault.index.notesTagged(c.options.tag)
  if (c.options.folder) {
    const folder = c.options.folder.replace(/^\/+|\/+$/gu, '')
    notes = notes.filter((note) => note.relativePath.startsWith(`${folder}/`))
  }
  const limited = notes.slice(0, c.options.limit)

  return {
    count: limited.length,
    notes: limited.map((item) => ({
      id: item.id,
      title: item.title,
      path: item.relativePath,
      tags: item.tags,
      links: item.links.length,
    })),
  }
}

// ---------------------------------------------------------------------------
// monet note show
// ---------------------------------------------------------------------------

/** The arguments of `monet note show`. */
export const noteShowArgs = z.object({
  title: z.string().describe('Path, id, title or alias of the note'),
})

/** The options of `monet note show`. */
export const noteShowOptions = z.object({
  ...vaultOptions,
  links: z.boolean().default(false).describe('Include the outgoing links'),
})

/** The output of `monet note show`. */
export const noteShowOutput = z.object({
  path: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  aliases: z.array(z.string()),
  links: z.array(z.string()),
})

/** Runs `monet note show`. */
export function runNoteShow(
  c: CommandContext<
    z.output<typeof noteShowArgs>,
    z.output<typeof noteShowOptions>,
    z.output<typeof noteShowOutput>
  >,
): z.output<typeof noteShowOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const found = findNote(vault, c.args.title)
  if (!found) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.title }),
      retryable: false,
      cta: {
        description: 'List the notes to find the right title:',
        commands: [{ command: 'note list' }],
      },
    })
  }

  return {
    path: found.relativePath,
    title: found.title,
    body: found.body,
    tags: found.tags,
    aliases: found.aliases,
    links: c.options.links ? found.links.map((link) => link.target) : [],
  }
}

// ---------------------------------------------------------------------------
// monet note edit
// ---------------------------------------------------------------------------

/** The arguments of `monet note edit`. */
export const noteEditArgs = z.object({
  title: z.string().describe('Path, id, title or alias of the note'),
})

/** The options of `monet note edit`. */
export const noteEditOptions = z.object({
  ...vaultOptions,
  body: z.string().optional().describe('The new body of the note'),
  append: z.string().optional().describe('Text appended to the note'),
  tag: z.array(z.string()).optional().describe('Tags added to the note'),
})

/** The output of `monet note edit`. */
export const noteEditOutput = z.object({
  path: z.string(),
  title: z.string(),
  bytes: z.number(),
})

/** Runs `monet note edit`. */
export function runNoteEdit(
  c: CommandContext<
    z.output<typeof noteEditArgs>,
    z.output<typeof noteEditOptions>,
    z.output<typeof noteEditOutput>
  >,
): z.output<typeof noteEditOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const found = findNote(vault, c.args.title)
  if (!found) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.title }),
      retryable: false,
    })
  }

  const warning = concurrencyWarning(vault)
  let body = found.body
  if (c.options.body !== undefined) body = c.options.body
  if (c.options.append !== undefined) {
    body = body.endsWith('\n') ? `${body}${c.options.append}\n` : `${body}\n${c.options.append}\n`
  }
  if (c.options.tag && c.options.tag.length > 0) {
    const merged = new Set(found.tags.map((tag) => tag.toLowerCase()))
    for (const tag of c.options.tag) merged.add(tag.toLowerCase())
    found.tags = [...merged]
  }

  writeNote(vault, found, body)

  return c.ok(
    { path: found.relativePath, title: found.title, bytes: Buffer.byteLength(body, 'utf8') },
    {
      cta: {
        description: warning
          ? messages_.get('error.appRunning', { pid: warning.pid })
          : messages_.get('note.updated', { path: found.relativePath }),
        commands: [{ command: 'note show', args: { title: found.title } }],
      },
    },
  )
}

// ---------------------------------------------------------------------------
// monet note move
// ---------------------------------------------------------------------------

/** The arguments of `monet note move`. */
export const noteMoveArgs = z.object({
  title: z.string().describe('Path, id, title or alias of the note'),
})

/** The options of `monet note move`. */
export const noteMoveOptions = z.object({
  ...vaultOptions,
  to: z.string().describe('The new vault-relative path, including the .md extension'),
})

/** The output of `monet note move`. */
export const noteMoveOutput = z.object({
  from: z.string(),
  path: z.string(),
})

/** Runs `monet note move`. */
export function runNoteMove(
  c: CommandContext<
    z.output<typeof noteMoveArgs>,
    z.output<typeof noteMoveOptions>,
    z.output<typeof noteMoveOutput>
  >,
): z.output<typeof noteMoveOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const found = findNote(vault, c.args.title)
  if (!found) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.title }),
      retryable: false,
    })
  }

  const destination = c.options.to.endsWith('.md') ? c.options.to : `${c.options.to}.md`
  if (vault.index.notesByPath.has(destination)) {
    return c.error({
      code: 'NOTE_EXISTS',
      message: messages_.get('error.noteExists', { path: destination }),
      retryable: false,
    })
  }

  const absolute = vault.absolutePath(destination)
  mkdirSync(dirname(absolute), { recursive: true })
  renameSync(vault.absolutePath(found.relativePath), absolute)

  return c.ok(
    { from: found.relativePath, path: destination },
    {
      cta: {
        description: messages_.get('note.moved', { path: destination }),
        commands: [{ command: 'backlinks', args: { title: found.title } }],
      },
    },
  )
}

// ---------------------------------------------------------------------------
// monet note delete
// ---------------------------------------------------------------------------

/** The arguments of `monet note delete`. */
export const noteDeleteArgs = z.object({
  title: z.string().describe('Path, id, title or alias of the note'),
})

/** The options of `monet note delete`. */
export const noteDeleteOptions = z.object({
  ...vaultOptions,
  yes: z.boolean().default(false).describe('Confirm the deletion'),
})

/** The output of `monet note delete`. */
export const noteDeleteOutput = z.object({
  path: z.string(),
  deleted: z.boolean(),
})

/** Runs `monet note delete`. */
export function runNoteDelete(
  c: CommandContext<
    z.output<typeof noteDeleteArgs>,
    z.output<typeof noteDeleteOptions>,
    z.output<typeof noteDeleteOutput>
  >,
): z.output<typeof noteDeleteOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const found = findNote(vault, c.args.title)
  if (!found) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.title }),
      retryable: false,
    })
  }

  if (!c.options.yes) {
    return c.error({
      code: 'CONFIRMATION_REQUIRED',
      message: 'Pass --yes to confirm the deletion.',
      retryable: true,
      cta: {
        description: 'Confirm the deletion:',
        commands: [
          {
            command: 'note delete',
            args: { title: found.title },
            options: { yes: true },
            description: 'Delete the note',
          },
        ],
      },
    })
  }

  unlinkSync(vault.absolutePath(found.relativePath))

  return c.ok(
    { path: found.relativePath, deleted: true },
    {
      cta: {
        description: messages_.get('note.deleted', { path: found.relativePath }),
        commands: [{ command: 'note list' }],
      },
    },
  )
}

// ---------------------------------------------------------------------------
// monet note tags
// ---------------------------------------------------------------------------

/** The arguments of `monet note tags`. */
export const noteTagsArgs = z.object({
  title: z.string().describe('Path, id, title or alias of the note'),
})

/** The options of `monet note tags`. */
export const noteTagsOptions = z.object({ ...vaultOptions })

/** The output of `monet note tags`. */
export const noteTagsOutput = z.object({
  path: z.string(),
  tags: z.array(z.string()),
})

/** Runs `monet note tags`. */
export function runNoteTags(
  c: CommandContext<
    z.output<typeof noteTagsArgs>,
    z.output<typeof noteTagsOptions>,
    z.output<typeof noteTagsOutput>
  >,
): z.output<typeof noteTagsOutput> {
  const vault = openVault(c)
  const found = findNote(vault, c.args.title)
  if (!found) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages(c).get('error.noteNotFound', { path: c.args.title }),
      retryable: false,
    })
  }
  return { path: found.relativePath, tags: found.tags }
}

// ---------------------------------------------------------------------------
// monet config
// ---------------------------------------------------------------------------

/** The output of `monet config get`. */
export const configGetOutput = z.object({
  vault: z.string().optional(),
  locale: z.string().optional(),
  warnOnConcurrentEdit: z.boolean().optional(),
})

/** Runs `monet config get`. */
export function runConfigGet(): z.output<typeof configGetOutput> {
  const current = readConfig()
  return {
    vault: current.vault,
    locale: current.locale,
    warnOnConcurrentEdit: current.warnOnConcurrentEdit,
  }
}

/** The options of `monet config set`. */
export const configSetOptions = z.object({
  vault: z.string().optional().describe('The default vault folder'),
  locale: z.enum(['en', 'pt-BR', 'es']).optional().describe('The locale used for messages'),
})

/** The output of `monet config set`. */
export const configSetOutput = z.object({
  vault: z.string().optional(),
  locale: z.string().optional(),
})

/** Runs `monet config set`. */
export function runConfigSet(
  c: CommandContext<
    Record<string, never>,
    z.output<typeof configSetOptions>,
    z.output<typeof configSetOutput>
  >,
): z.output<typeof configSetOutput> {
  // `vault use` and `config set --vault` write the same configuration; the
  // only difference is that `vault use` validates the folder first.
  if (c.options.vault !== undefined) selectVault(c.options.vault)

  const current = readConfig()
  if (c.options.locale !== undefined) {
    current.locale = c.options.locale
    writeConfig(current)
  }

  return { vault: current.vault, locale: current.locale }
}

/** The output of `monet config path`. */
export const configPathOutput = z.object({ path: z.string() })

/** Runs `monet config path`. */
export function runConfigPath(): z.output<typeof configPathOutput> {
  return { path: configPath() }
}

// ---------------------------------------------------------------------------
// The command groups
// ---------------------------------------------------------------------------

/** The `monet note` command group. */
export const note = Cli.create('note', {
  description: 'Create, read and organise notes in the vault.',
})
  .command('new', {
    description: 'Create a new note',
    args: noteNewArgs,
    options: noteNewOptions,
    output: noteNewOutput,
    examples: [{ args: { title: 'Release Plan' }, description: 'Create a note in the vault root' }],
    run: runNoteNew,
  })
  .command('list', {
    description: 'List the notes in the vault',
    options: noteListOptions,
    output: noteListOutput,
    run: runNoteList,
  })
  .command('show', {
    description: 'Print a note',
    args: noteShowArgs,
    options: noteShowOptions,
    output: noteShowOutput,
    run: runNoteShow,
  })
  .command('edit', {
    description: 'Replace the body of a note, or append to it',
    args: noteEditArgs,
    options: noteEditOptions,
    output: noteEditOutput,
    run: runNoteEdit,
  })
  .command('move', {
    description: 'Move or rename a note',
    args: noteMoveArgs,
    options: noteMoveOptions,
    output: noteMoveOutput,
    run: runNoteMove,
  })
  .command('delete', {
    description: 'Delete a note',
    args: noteDeleteArgs,
    options: noteDeleteOptions,
    output: noteDeleteOutput,
    run: runNoteDelete,
  })
  .command('tags', {
    description: 'List the tags of a note',
    args: noteTagsArgs,
    options: noteTagsOptions,
    output: noteTagsOutput,
    run: runNoteTags,
  })

/** The `monet config` command group. */
export const config = Cli.create('config', {
  description: 'Read and write the CLI configuration.',
})
  .command('get', {
    description: 'Show the current configuration',
    output: configGetOutput,
    run: runConfigGet,
  })
  .command('set', {
    description: 'Change the configuration',
    options: configSetOptions,
    output: configSetOutput,
    run: runConfigSet,
  })
  .command('path', {
    description: 'Show the path of the configuration file',
    output: configPathOutput,
    run: runConfigPath,
  })
