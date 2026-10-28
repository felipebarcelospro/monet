/**
 * The parts of the engine that are pure and safe to bundle for the renderer.
 *
 * The root entry point reads files from disk, so the window imports from here
 * instead. Nothing in this module may touch `node:` modules.
 */

export * from './wikilink.js'
export * from './search.js'
