/**
 * Copies the authored skill template into the package.
 *
 * The canonical template lives at the root of the repository, so that it is
 * versioned next to the app and the CLI. npm can only publish files that
 * live inside the package folder, so the template is copied in right before
 * the package is packed. The copy is generated, never edited by hand.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const source = resolve(packageRoot, '..', '..', 'MonetSkill')
const target = join(packageRoot, 'MonetSkill')

if (!existsSync(source)) {
  console.error(`The skill template was not found at ${source}`)
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`Copied the skill template into ${target}`)
