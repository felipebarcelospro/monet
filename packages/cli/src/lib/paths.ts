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
  return existsSync(join(candidate, 'pnpm-workspace.yaml')) ? candidate : undefined
}

/**
 * The candidate locations of the Monet application bundle or executable.
 */
export function appBundleCandidates(): string[] {
  const candidates: string[] = []

  const override = process.env['MONET_APP_BUNDLE']
  if (override && override.length > 0) candidates.push(resolve(override))

  const platform = process.platform

  if (platform === 'darwin') {
    candidates.push('/Applications/Monet.app')
    candidates.push(join(process.env['HOME'] ?? '', 'Applications', 'Monet.app'))
    candidates.push(join(process.cwd(), 'build', 'Monet.app'))
  } else if (platform === 'win32') {
    const localAppData =
      process.env['LOCALAPPDATA'] ?? join(process.env['USERPROFILE'] ?? '', 'AppData', 'Local')
    candidates.push(join(localAppData, 'Programs', 'Monet', 'Monet.exe'))
    candidates.push(join(process.cwd(), 'build', 'electron', 'win-unpacked', 'Monet.exe'))
  } else {
    candidates.push('/usr/bin/monet-app')
    candidates.push('/usr/local/bin/monet-app')
    candidates.push(join(process.env['HOME'] ?? '', '.local', 'bin', 'monet-app'))
    candidates.push(join(process.cwd(), 'build', 'electron', 'linux-unpacked', 'monet'))
  }

  const root = repositoryRoot()
  if (root) {
    if (platform === 'darwin') {
      candidates.push(join(root, 'build', 'Monet.app'))
      candidates.push(join(root, 'build', 'electron', 'mac-arm64', 'Monet.app'))
      candidates.push(join(root, 'build', 'electron', 'mac', 'Monet.app'))
    } else if (platform === 'win32') {
      candidates.push(join(root, 'build', 'electron', 'win-unpacked', 'Monet.exe'))
    } else {
      candidates.push(join(root, 'build', 'electron', 'linux-unpacked', 'monet'))
    }
  }

  return candidates
}
