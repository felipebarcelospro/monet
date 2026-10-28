import { createHash } from 'node:crypto'

/**
 * A short, stable fingerprint of a note's bytes.
 *
 * Revision checks are how Monet avoids one client silently overwriting work
 * from another: the app remembers the revision it opened, the CLI remembers
 * the revision it read, and a write only lands if the file still matches.
 * A hash is used instead of mtime because external tools and sync clients do
 * not always update mtimes predictably.
 */
export function revisionOf(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex').slice(0, 32)
}

/** Raised when a note changed on disk after it was read. */
export class NoteConflictError extends Error {
  readonly path: string

  constructor(path: string) {
    super(`The note changed on disk: ${path}`)
    this.name = 'NoteConflictError'
    this.path = path
  }
}
