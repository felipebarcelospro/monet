import { Cli } from 'incur'

import { backup } from './commands/backup.js'
import { config, note } from './commands/note.js'
import { vault } from './commands/vault.js'
import {
  backlinksArgs,
  backlinksOptions,
  backlinksOutput,
  graphOptions,
  graphOutput,
  linkCheckArgs,
  linkCheckOptions,
  linkCheckOutput,
  linkCreateArgs,
  linkCreateOptions,
  linkCreateOutput,
  openOptions,
  openOutput,
  runBacklinks,
  runGraph,
  runLinkCheck,
  runLinkCreate,
  runOpen,
  runSearch,
  runTags,
  searchArgs,
  searchOptions,
  searchOutput,
  tagsOptions,
  tagsOutput,
} from './commands/misc.js'

/** The `monet link` command group. */
const link = Cli.create('link', {
  description: 'Create and verify wikilinks between notes.',
})
  .command('create', {
    description: 'Add a wikilink to a note',
    args: linkCreateArgs,
    options: linkCreateOptions,
    output: linkCreateOutput,
    run: runLinkCreate,
  })
  .command('check', {
    description: 'Check that a link resolves',
    args: linkCheckArgs,
    options: linkCheckOptions,
    output: linkCheckOutput,
    run: runLinkCheck,
  })

/**
 * The Monet command line interface.
 *
 * Every command is declared once. From that single declaration incur
 * generates the terminal CLI, the MCP server (`--mcp` and `/mcp` over HTTP),
 * the agent manifest (`--llms`), the JSON Schema (`--schema`), the shell
 * completions (`completions`) and the agent skills (`skills add`).
 */
export const cli = Cli.create('monet', {
  version: '0.1.0',
  package: '@monet/cli',
  description: 'Monet — command line access to a local Markdown vault.',
  mcp: {
    name: 'monet',
    title: 'Monet vault',
    instructions:
      'Monet exposes a local Markdown vault. Use `search` to find notes, `note_show` to read one, `note_new` to create one, `link_create` to connect two notes and `graph` to inspect the link graph.',
    tools: { discovery: 'direct' },
  },
  sync: {
    suggestions: [
      'open my Monet vault and show the graph',
      'find the notes that link to my release plan',
      'create a note and connect it to the project index',
    ],
  },
})
  .command(note)
  .command(link)
  .command('search', {
    description: 'Search the vault by title, alias, tag or body text.',
    args: searchArgs,
    options: searchOptions,
    output: searchOutput,
    examples: [{ args: { query: 'release' }, description: 'Find notes about a release' }],
    run: runSearch,
  })
  .command('backlinks', {
    description: 'List the notes that link to a note.',
    args: backlinksArgs,
    options: backlinksOptions,
    output: backlinksOutput,
    run: runBacklinks,
  })
  .command('graph', {
    description: 'Export the link graph of the vault as JSON.',
    options: graphOptions,
    output: graphOutput,
    run: runGraph,
  })
  .command('tags', {
    description: 'List the tags used in the vault.',
    options: tagsOptions,
    output: tagsOutput,
    run: runTags,
  })
  .command('open', {
    description: 'Open the vault in the Monet app.',
    options: openOptions,
    output: openOutput,
    run: runOpen,
  })
  .command(config)
  .command(vault)
  .command(backup)

export default cli
