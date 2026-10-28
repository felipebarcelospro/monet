import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** A node in the vault graph. */
export interface GraphNode {
  id: string
  title: string
  tags: string[]
  linkCount: number
  backlinkCount: number
}

/** A directed edge in the vault graph. */
export interface GraphEdge {
  source: string
  target: string
}

/** The complete graph of a vault. */
export interface VaultGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Builds the link graph of a vault.
 */
export function buildGraph(index: {
  notes: { id: string; title: string; tags: string[] }[]
  outgoing: Map<string, string[]>
  backlinks: Map<string, string[]>
}): VaultGraph {
  const nodes: GraphNode[] = index.notes.map((note) => ({
    id: note.id,
    title: note.title,
    tags: note.tags,
    linkCount: index.outgoing.get(note.id)?.length ?? 0,
    backlinkCount: index.backlinks.get(note.id)?.length ?? 0,
  }))

  const edges: GraphEdge[] = []
  for (const [source, targets] of index.outgoing) {
    for (const target of targets) edges.push({ source, target })
  }
  return { nodes, edges }
}

/**
 * The information the Monet app publishes about a running instance.
 */
export interface AppLock {
  /** The absolute path of the vault the app has open. */
  vault: string
  /** The process id of the app. */
  pid: number
  /** The moment the app opened the vault, in milliseconds since the epoch. */
  startedAt: number
  /** The port the app listens on, when it exposes one. */
  port?: number
}

/** The directory the app and the CLI share for lock files. */
export function lockDirectory(): string {
  const override = process.env['MONET_STATE_DIR']
  if (override && override.length > 0) return override

  const home = homedir()
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Monet', 'locks')
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Monet', 'locks')
  }
  const dataHome = process.env['XDG_DATA_HOME'] ?? join(home, '.local', 'share')
  return join(dataHome, 'monet', 'locks')
}

/** The path of the lock file for a vault. */
export function lockPath(vault: string): string {
  const hash = createHash('sha256').update(vault).digest('hex').slice(0, 16)
  return join(lockDirectory(), `${hash}.json`)
}

/**
 * Reads the lock file of a vault, if the app has it open.
 *
 * The lock file is only trusted when the process it points at is alive, so a
 * crashed app never blocks the CLI.
 */
export function readAppLock(vault: string): AppLock | undefined {
  const path = lockPath(vault)
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as AppLock
    if (typeof parsed.pid !== 'number' || !isProcessAlive(parsed.pid)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

/**
 * Publishes the app's lock file, so the CLI can tell that a vault is open.
 *
 * The write is best effort: a read-only state directory must never stop the
 * app from opening a vault.
 */
export function writeAppLock(lock: AppLock): void {
  try {
    const path = lockPath(lock.vault)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(lock, undefined, 2)}\n`, 'utf8')
  } catch {
    // The CLI warning is a convenience, never a requirement.
  }
}

/** Removes the lock file of a vault. */
export function removeAppLock(vault: string): void {
  try {
    rmSync(lockPath(vault), { force: true })
  } catch {
    // Nothing to clean up.
  }
}

/**
 * Whether a process is alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * A warning about a vault the app currently has open.
 */
export interface ConcurrencyWarning {
  /** The vault the app has open. */
  vault: string
  /** The process id of the app. */
  pid: number
  /** Whether the app was detected through the lock file or a port scan. */
  detectedBy: 'lockfile' | 'port'
}

/**
 * Detects whether the Monet app currently has the vault open.
 *
 * The app writes a lock file into the shared state directory when it opens a
 * vault. The lock file is the primary signal; the port check is a fallback
 * for older builds that only published a port.
 */
export function detectConcurrentApp(vault: string): ConcurrencyWarning | undefined {
  const lock = readAppLock(vault)
  if (lock) {
    return { vault: lock.vault, pid: lock.pid, detectedBy: 'lockfile' }
  }
  const port = process.env['MONET_APP_PORT']
  if (port && isProcessAlive(Number(port))) {
    return { vault, pid: Number(port), detectedBy: 'port' }
  }
  return undefined
}
