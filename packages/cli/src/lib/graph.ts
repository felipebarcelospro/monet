import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
  return join(homedir(), 'Library', 'Application Support', 'Monet', 'locks')
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
