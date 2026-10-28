/**
 * The Monet vault engine.
 *
 * Everything in this package is pure Node: reading a folder of Markdown
 * files, parsing frontmatter and wikilinks, resolving links, computing
 * backlinks and tags, searching, and building the link graph. The desktop
 * app and the command line interface are two clients of this same engine,
 * which is what keeps them in agreement.
 */

export * from './config.js'
export * from './frontmatter.js'
export * from './revision.js'
export * from './graph.js'
export * from './search.js'
export * from './vault.js'
export * from './wikilink.js'
export * from './write.js'
