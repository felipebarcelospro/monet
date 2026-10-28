import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Assembles the publishable `monet-cli` tarball.
 *
 * The workspace package (`@monet/cli`) is compiled with `tsc` and imports
 * `@monet/core` at runtime, which only resolves inside the monorepo, so the
 * published package must stand alone: the CLI entry point and every workspace
 * dependency are bundled into one file that plain Node executes.
 *
 * The bundle and the manifest are staged in a temporary directory OUTSIDE the
 * repository and `npm pack` runs from there. When packing from a directory
 * inside the repository, npm applies .gitignore rules over the `files`
 * whitelist — even with a .npmignore present — which silently dropped the
 * generated files from the tarball.
 */

const pkg = fileURLToPath(new URL('..', import.meta.url))
const repo = fileURLToPath(new URL('../../..', import.meta.url))

const stage = mkdtempSync(join(tmpdir(), 'monet-npm-pack-'))

// The CLI entry point and every workspace dependency, in one file.
const bundled = spawnSync('bun', [
  'build', '--target=node', join(repo, 'packages/cli/src/bin.ts'),
  '--outfile', join(stage, 'monet.js'),
], { stdio: 'inherit' })
if (bundled.status !== 0) process.exit(bundled.status ?? 1)

// npm executes the bin through its shebang; the bundler only keeps it when
// the entry already has one, so guarantee it either way.
let source = readFileSync(join(stage, 'monet.js'), 'utf8')
if (!source.startsWith('#!')) source = `#!/usr/bin/env node\n${source}`
writeFileSync(join(stage, 'monet.js'), source)
chmodSync(join(stage, 'monet.js'), 0o755)

copyFileSync(join(repo, 'LICENSE'), join(stage, 'LICENSE'))
copyFileSync(join(pkg, 'README.md'), join(stage, 'README.md'))

// The staging manifest carries no scripts: `npm pack` runs from here and a
// prepack hook would re-run this script inside the stage.
const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
delete manifest.scripts
writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const packed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'pack', '--pack-destination', pkg,
], { cwd: stage, encoding: 'utf8' })
rmSync(stage, { recursive: true, force: true })
if (packed.status !== 0) {
  process.stdout.write(packed.stdout ?? '')
  process.stderr.write(packed.stderr ?? '')
  process.exit(packed.status ?? 1)
}

// npm prints the tarball file name as the last non-notice line.
const name = (packed.stdout ?? '')
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('npm notice'))
  .pop()
console.log(resolve(pkg, (name ?? 'monet-cli.tgz').trim()))
