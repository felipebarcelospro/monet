import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { app } from 'electron'

import type { Locale, Preferences } from '../src/shared/contract'

/**
 * The preferences that belong to the window rather than to the vault.
 *
 * They live next to the Electron user data, never inside the vault, so a
 * folder opened in Monet stays a plain folder of Markdown files.
 */
export class PreferencesStore {
  private readonly path: string
  private values: Preferences

  constructor() {
    this.path = join(app.getPath('userData'), 'preferences.json')
    this.values = this.read()
  }

  /** The current preferences. */
  get(): Preferences {
    return { ...this.values, favorites: { ...this.values.favorites } }
  }

  /** Applies a validated patch and persists it. */
  set(patch: Partial<Preferences>): Preferences {
    const next: Preferences = { ...this.values }

    if (patch.theme === 'light' || patch.theme === 'dark' || patch.theme === 'system') {
      next.theme = patch.theme
    }
    if (patch.locale === 'en' || patch.locale === 'pt-BR' || patch.locale === 'es') {
      next.locale = patch.locale
    }
    if (patch.sort === 'modified' || patch.sort === 'created' || patch.sort === 'title') {
      next.sort = patch.sort
    }
    if (patch.editorWidth === 'narrow' || patch.editorWidth === 'wide') {
      next.editorWidth = patch.editorWidth
    }
    if (patch.bodyFont === 'sans' || patch.bodyFont === 'serif') {
      next.bodyFont = patch.bodyFont
    }
    if (typeof patch.inspectorOpen === 'boolean') next.inspectorOpen = patch.inspectorOpen
    if (typeof patch.sidebarOpen === 'boolean') next.sidebarOpen = patch.sidebarOpen
    if (patch.favorites && typeof patch.favorites === 'object') {
      next.favorites = { ...this.values.favorites, ...patch.favorites }
    }
    if (typeof patch.sidebarWidth === 'number')
      next.sidebarWidth = clamp(patch.sidebarWidth, 188, 320)
    if (typeof patch.listWidth === 'number') next.listWidth = clamp(patch.listWidth, 260, 460)
    if (typeof patch.inspectorWidth === 'number')
      next.inspectorWidth = clamp(patch.inspectorWidth, 240, 420)

    this.values = next
    this.write()
    return this.get()
  }

  /** The favourites of one vault. */
  favorites(root: string): string[] {
    return this.values.favorites[root] ?? []
  }

  /** Highlights the language of the system on the first run. */
  private read(): Preferences {
    const fallback = defaults(app.getLocale())
    if (!existsSync(this.path)) return fallback
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<Preferences>
      return {
        ...fallback,
        ...parsed,
        favorites: { ...fallback.favorites, ...(parsed.favorites ?? {}) },
      }
    } catch {
      return fallback
    }
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path, `${JSON.stringify(this.values, undefined, 2)}\n`, 'utf8')
    } catch {
      // Preferences are a convenience; failing to persist them is not fatal.
    }
  }
}

/** The first-run preferences. */
export function defaults(systemLocale: string): Preferences {
  return {
    theme: 'system',
    locale: localeOf(systemLocale),
    sort: 'modified',
    editorWidth: 'wide',
    bodyFont: 'sans',
    inspectorOpen: true,
    sidebarOpen: true,
    favorites: {},
    sidebarWidth: 250,
    listWidth: 352,
    inspectorWidth: 304,
  }
}

/** Maps a system language to a shipped locale. */
export function localeOf(language: string): Locale {
  const lower = language.toLowerCase()
  if (lower.startsWith('pt')) return 'pt-BR'
  if (lower.startsWith('es')) return 'es'
  return 'en'
}

/** Keeps a width inside a sensible range. */
function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)))
}
