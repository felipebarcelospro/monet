import { spawn } from 'node:child_process'

import { z } from 'incur'

import {
  type CommandContext,
  appBundlePath,
  findNote,
  messages,
  openVault,
  vaultOptions,
  writeNote,
} from '../lib/context.js'
import { buildGraph } from '../lib/graph.js'
import { SearchEngine } from '../lib/search.js'
import { parseLinks } from '../lib/wikilink.js'

/** The arguments of `monet search`. */
export const searchArgs = z.object({
  query: z.string().describe('The text to search for'),
})

/** The options of `monet search`. */
export const searchOptions = z.object({
  ...vaultOptions,
  limit: z.number().default(20).describe('Maximum number of results'),
  tag: z.string().optional().describe('Only notes carrying this tag'),
})

/** The output of `monet search`. */
export const searchOutput = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      path: z.string(),
      score: z.number(),
      excerpt: z.string().optional(),
    }),
  ),
})

/** Runs `monet search`. */
export function runSearch(
  c: CommandContext<z.output<typeof searchArgs>, z.output<typeof searchOptions>, z.output<typeof searchOutput>>,
): z.output<typeof searchOutput> {
  const vault = openVault(c)
  const engine = new SearchEngine(vault.index)
  const results = engine.search(c.args.query, c.options.limit, c.options.tag)
  return {
    count: results.length,
    results: results.map((result) => ({
      id: result.noteID,
      title: result.title,
      path: result.path,
      score: Math.round(result.score * 100) / 100,
      excerpt: result.excerpt,
    })),
  }
}

/** The arguments of `monet link create`. */
export const linkCreateArgs = z.object({
  source: z.string().describe('The note that receives the link'),
})

/** The options of `monet link create`. */
export const linkCreateOptions = z.object({
  ...vaultOptions,
  target: z.string().describe('The note the link points at'),
  text: z.string().optional().describe('Display text of the link'),
})

/** The output of `monet link create`. */
export const linkCreateOutput = z.object({
  path: z.string(),
  target: z.string(),
  link: z.string(),
})

/** Runs `monet link create`. */
export function runLinkCreate(
  c: CommandContext<
    z.output<typeof linkCreateArgs>,
    z.output<typeof linkCreateOptions>,
    z.output<typeof linkCreateOutput>
  >,
): z.output<typeof linkCreateOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const source = findNote(vault, c.args.source)
  if (!source) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.source }),
      retryable: false,
    })
  }

  const target = findNote(vault, c.options.target)
  if (!target) {
    return c.error({
      code: 'LINK_TARGET_NOT_FOUND',
      message: messages_.get('error.invalidTarget', { target: c.options.target }),
      retryable: false,
      cta: {
        description: 'Find the right title:',
        commands: [{ command: 'search', args: { query: c.options.target } }],
      },
    })
  }

  const linkText = c.options.text
    ? `[[${target.title}|${c.options.text}]]`
    : `[[${target.title}]]`
  if (source.body.includes(linkText)) {
    return c.error({
      code: 'LINK_EXISTS',
      message: messages_.get('error.linkExists'),
      retryable: false,
    })
  }

  const body = source.body.endsWith('\n')
    ? `${source.body}${linkText}\n`
    : `${source.body}\n${linkText}\n`
  writeNote(vault, source, body)

  return c.ok(
    { path: source.relativePath, target: target.title, link: linkText },
    {
      cta: {
        description: messages_.get('link.created', { target: target.title }),
        commands: [
          { command: 'backlinks', args: { title: target.title } },
          { command: 'note show', args: { title: source.title } },
        ],
      },
    },
  )
}

/** The arguments of `monet link check`. */
export const linkCheckArgs = z.object({
  source: z.string().describe('The note that holds the link'),
})

/** The options of `monet link check`. */
export const linkCheckOptions = z.object({
  ...vaultOptions,
  target: z.string().describe('The target the link should point at'),
})

/** The output of `monet link check`. */
export const linkCheckOutput = z.object({
  path: z.string(),
  target: z.string(),
  resolved: z.boolean(),
  resolvedTo: z.string().optional(),
})

/** Runs `monet link check`. */
export function runLinkCheck(
  c: CommandContext<
    z.output<typeof linkCheckArgs>,
    z.output<typeof linkCheckOptions>,
    z.output<typeof linkCheckOutput>
  >,
): z.output<typeof linkCheckOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const source = findNote(vault, c.args.source)
  if (!source) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.source }),
      retryable: false,
    })
  }

  const links = parseLinks(source.body)
  const match = links.find(
    (link) => link.target.toLowerCase() === c.options.target.toLowerCase(),
  )
  if (!match) {
    return c.error({
      code: 'LINK_MISSING',
      message: messages_.get('error.linkMissing', { target: c.options.target }),
      retryable: false,
    })
  }

  const resolvedTo = vault.index.resolver.resolve(match.target)
  return {
    path: source.relativePath,
    target: match.target,
    resolved: resolvedTo !== undefined,
    resolvedTo,
  }
}

/** The arguments of `monet backlinks`. */
export const backlinksArgs = z.object({
  title: z.string().describe('Path, id, title or alias of the note'),
})

/** The options of `monet backlinks`. */
export const backlinksOptions = z.object({
  ...vaultOptions,
  limit: z.number().default(100).describe('Maximum number of backlinks to return'),
})

/** The output of `monet backlinks`. */
export const backlinksOutput = z.object({
  path: z.string(),
  count: z.number(),
  backlinks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      path: z.string(),
    }),
  ),
})

/** Runs `monet backlinks`. */
export function runBacklinks(
  c: CommandContext<
    z.output<typeof backlinksArgs>,
    z.output<typeof backlinksOptions>,
    z.output<typeof backlinksOutput>
  >,
): z.output<typeof backlinksOutput> {
  const vault = openVault(c)
  const messages_ = messages(c)

  const note = findNote(vault, c.args.title)
  if (!note) {
    return c.error({
      code: 'NOTE_NOT_FOUND',
      message: messages_.get('error.noteNotFound', { path: c.args.title }),
      retryable: false,
    })
  }

  const list = vault.index
    .backlinksOf(note.id)
    .slice(0, c.options.limit)
    .map((backlink) => ({
      id: backlink.id,
      title: backlink.title,
      path: backlink.relativePath,
    }))

  return { path: note.relativePath, count: list.length, backlinks: list }
}

/** The options of `monet graph`. */
export const graphOptions = z.object({
  ...vaultOptions,
  tag: z.string().optional().describe('Only include notes carrying this tag'),
})

/** The output of `monet graph`. */
export const graphOutput = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      linkCount: z.number(),
      backlinkCount: z.number(),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
    }),
  ),
})

/** Runs `monet graph`. */
export function runGraph(
  c: CommandContext<Record<string, never>, z.output<typeof graphOptions>, z.output<typeof graphOutput>>,
): z.output<typeof graphOutput> {
  const vault = openVault(c)

  const built = buildGraph(vault.index)
  if (!c.options.tag) return built

  const allowed = new Set(vault.index.notesTagged(c.options.tag).map((note) => note.id))
  return {
    nodes: built.nodes.filter((node) => allowed.has(node.id)),
    edges: built.edges.filter(
      (edge) => allowed.has(edge.source) && allowed.has(edge.target),
    ),
  }
}

/** The options of `monet tags`. */
export const tagsOptions = z.object({
  ...vaultOptions,
  limit: z.number().default(100).describe('Maximum number of tags to return'),
})

/** The output of `monet tags`. */
export const tagsOutput = z.object({
  count: z.number(),
  tags: z.array(
    z.object({
      tag: z.string(),
      count: z.number(),
    }),
  ),
})

/** Runs `monet tags`. */
export function runTags(
  c: CommandContext<Record<string, never>, z.output<typeof tagsOptions>, z.output<typeof tagsOutput>>,
): z.output<typeof tagsOutput> {
  const vault = openVault(c)
  const list = vault.index.sortedTags().slice(0, c.options.limit)
  return { count: list.length, tags: list }
}

/** The options of `monet open`. */
export const openOptions = z.object({
  ...vaultOptions,
  note: z.string().optional().describe('A note to open together with the vault'),
})

/** The output of `monet open`. */
export const openOutput = z.object({
  vault: z.string(),
  opened: z.boolean(),
})

/** Runs `monet open`. */
export function runOpen(
  c: CommandContext<Record<string, never>, z.output<typeof openOptions>, z.output<typeof openOutput>>,
): z.output<typeof openOutput> {
  const vault = openVault(c)
  const bundle = appBundlePath()

  if (!bundle) {
    return c.error({
      code: 'APP_NOT_INSTALLED',
      message:
        'The Monet app was not found in /Applications. Open the vault folder manually, or build the app with scripts/build-app.sh.',
      retryable: false,
    })
  }

  // The app reads the vault — and optionally the note — from its arguments.
  const args = ['-a', bundle, '--args', vault.root]
  if (c.options.note) args.push(c.options.note)

  const child = spawn('open', args, { stdio: 'ignore', detached: true })
  child.unref()

  return { vault: vault.root, opened: true }
}
