import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The root of the installed package.
 *
 * The lookup walks up from this module until it finds the `package.json`
 * of the package, which works for a source checkout, an installed package
 * and a compiled `dist` folder alike.
 */
export function packageRoot(): string | undefined {
  let directory: string
  try {
    directory = dirname(fileURLToPath(import.meta.url))
  } catch {
    return undefined
  }

  let current = resolve(directory)
  const root = current.split('/')[0] ?? '/'
  while (current !== root) {
    if (existsSync(join(current, 'package.json'))) return current
    current = dirname(current)
  }
  return undefined
}

/**
 * The root of the repository, when the CLI runs from a source checkout.
 */
export function repositoryRoot(): string | undefined {
  const root = packageRoot()
  if (!root) return undefined
  const candidate = resolve(root, '..', '..')
  return existsSync(join(candidate, 'Package.swift')) ? candidate : undefined
}

/**
 * The candidate locations of the Monet application bundle.
 */
export function appBundleCandidates(): string[] {
  const candidates: string[] = []

  const override = process.env['MONET_APP_BUNDLE']
  if (override && override.length > 0) candidates.push(resolve(override))

  candidates.push('/Applications/Monet.app')
  candidates.push(join(process.env['HOME'] ?? '', 'Applications', 'Monet.app'))

  // The bundle produced by `scripts/build-app.sh`.
  candidates.push(join(process.cwd(), 'build', 'Monet.app'))
  const root = repositoryRoot()
  if (root) candidates.push(join(root, 'build', 'Monet.app'))

  return candidates
}
