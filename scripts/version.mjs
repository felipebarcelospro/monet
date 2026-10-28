import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Sets the same version in every shipped package.
 *
 * The three packages move together while Monet is pre-1.0, so a release is a
 * single version everywhere. This script edits the manifests; it does not
 * commit, tag or publish anything.
 *
 *   node scripts/version.mjs 0.2.0
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const version = process.argv[2]

if (!version || !/^\d+\.\d+\.\d+$/u.test(version)) {
  console.error('Usage: node scripts/version.mjs <major.minor.patch>')
  process.exit(1)
}

const manifests = [
  'package.json',
  'packages/core/package.json',
  'packages/cli/package.json',
  'packages/app/package.json',
]

for (const manifest of manifests) {
  const path = `${root}/${manifest}`
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const previous = json.version
  json.version = version
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`)
  console.log(`${manifest}: ${previous} → ${version}`)
}

console.log(`\nVersion set to ${version}. Update CHANGELOG.md, then commit and tag.`)
