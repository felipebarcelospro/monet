#!/usr/bin/env node
/**
 * Compiles the String Catalog into the `.lproj` folders that macOS reads.
 *
 * Xcode compiles `Localizable.xcstrings` into `<locale>.lproj/Localizable.strings`
 * as part of the build. Swift Package Manager copies the catalog verbatim, so
 * an app built with SwiftPM would show the raw keys at runtime.
 *
 * This script performs the same conversion, which keeps the catalog as the
 * single source of truth for the interface in every build.
 *
 * Usage:
 *   node scripts/compile-strings.mjs <catalog> <output directory>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [catalogPath, outputDirectory] = process.argv.slice(2)

if (!catalogPath || !outputDirectory) {
  console.error('usage: compile-strings.mjs <catalog> <output directory>')
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const sourceLanguage = catalog.sourceLanguage ?? 'en'
const strings = catalog.strings ?? {}

/** Escapes a value for the classic `.strings` format. */
function escape(value) {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\n/gu, '\\n')
    .replace(/\r/gu, '\\r')
    .replace(/\t/gu, '\\t')
}

/** The value of a key in a locale, falling back to the source language. */
function valueFor(key, locale) {
  const entry = strings[key]
  if (!entry) return undefined
  const localizations = entry.localizations ?? {}
  const unit = localizations[locale]?.stringUnit?.value
  if (typeof unit === 'string') return unit
  const source = localizations[sourceLanguage]?.stringUnit?.value
  return typeof source === 'string' ? source : undefined
}

// The locales of the catalog, plus the source language.
const locales = new Set([sourceLanguage])
for (const entry of Object.values(strings)) {
  for (const locale of Object.keys(entry.localizations ?? {})) locales.add(locale)
}

let written = 0
for (const locale of locales) {
  const lines = []
  for (const key of Object.keys(strings).sort()) {
    const value = valueFor(key, locale)
    if (value === undefined) continue
    lines.push(`"${escape(key)}" = "${escape(value)}";`)
  }
  if (lines.length === 0) continue

  const folder = join(outputDirectory, `${locale}.lproj`)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'Localizable.strings'), `${lines.join('\n')}\n`, 'utf8')
  written += 1
}

console.log(`Compiled ${Object.keys(strings).length} strings into ${written} locales`)
