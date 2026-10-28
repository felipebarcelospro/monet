import { cpSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Packages a double-clickable Monet.app in the repository's build folder.
 *
 * `electron-builder` writes the bundle under build/electron; it is copied to
 * build/Monet.app, which is the location the CLI looks for when `monet open`
 * launches the app.
 */

const app = fileURLToPath(new URL('..', import.meta.url))
const repo = fileURLToPath(new URL('../../..', import.meta.url))

const build = spawnSync('node', ['scripts/build.mjs'], { cwd: app, stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)

const result = spawnSync('pnpm', ['exec', 'electron-builder', '--dir'], {
  cwd: app,
  stdio: 'inherit',
  env: process.env,
})
if (result.status !== 0) process.exit(result.status ?? 1)

const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
let candidates = []

if (process.platform === 'darwin') {
  candidates = [
    `${repo}/build/electron/mac-${arch}/Monet.app`,
    `${repo}/build/electron/mac/Monet.app`,
  ]
} else if (process.platform === 'win32') {
  candidates = [
    `${repo}/build/electron/win-unpacked`,
    `${repo}/build/electron/win-${arch}-unpacked`,
  ]
} else {
  candidates = [
    `${repo}/build/electron/linux-unpacked`,
    `${repo}/build/electron/linux-${arch}-unpacked`,
  ]
}

const produced = candidates.find((path) => existsSync(path))
if (!produced) {
  console.log(`Packaged into ${repo}/build/electron`)
  process.exit(0)
}

const target = process.platform === 'darwin'
  ? `${repo}/build/Monet.app`
  : `${repo}/build/app`

rmSync(target, { recursive: true, force: true })
cpSync(produced, target, { recursive: true, verbatimSymlinks: true })
console.log(`packaged ${target}`)
