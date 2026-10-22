import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { packageRoot } from './paths.js'

/** The manifest that describes the authored skill template. */
export interface SkillTemplateManifest {
  /** The skill name, which must match the frontmatter of the SKILL.md. */
  name: string
  /** The version of the template. */
  version: string
  /** The description used in the skill frontmatter. */
  description: string
  /** The locale used when nothing else is specified. */
  defaultLocale: string
  /** The file that holds each locale. */
  locales: Record<string, string>
}

/**
 * The candidate directories that may hold the authored skill template.
 *
 * The template is a versioned file in the repository, never a string baked
 * into the code, so the lookup has to work in three situations: running from
 * a source checkout, running from an installed package, and running from a
 * standalone binary produced by `incur build`.
 */
function candidateRoots(): string[] {
  const candidates: string[] = []

  const override = process.env['MONET_SKILL_DIR']
  if (override && override.length > 0) candidates.push(resolve(override))

  const root = packageRoot()
  if (root) {
    // The package root holds the template in an installed package, the
    // repository root holds it in a source checkout.
    candidates.push(root)
    candidates.push(resolve(root, '..', '..'))
  }

  // A standalone binary ships the template next to the executable.
  candidates.push(join(dirname(process.execPath), 'MonetSkill'))
  candidates.push(join(process.cwd(), 'MonetSkill'))

  return candidates.map((candidate) => resolve(candidate))
}

/**
 * Finds the directory that holds the authored skill template.
 *
 * The template is installed by `monet skills add`, which uses incur's own
 * skill synchronisation: the template is included through `sync.include`, so
 * it lands in the canonical skills folder and is linked into every detected
 * agent — exactly like the generated command skills.
 */
export function findSkillTemplateRoot(): string | undefined {
  for (const root of candidateRoots()) {
    if (existsSync(join(root, 'template.json'))) return root
    // `MonetSkill/MonetSkill` shows up when the repository root is a candidate.
    const nested = join(root, 'MonetSkill')
    if (existsSync(join(nested, 'template.json'))) return nested
  }
  return undefined
}

/**
 * Reads the manifest of the authored skill template.
 */
export function readSkillManifest(root: string): SkillTemplateManifest {
  return JSON.parse(
    readFileSync(join(root, 'template.json'), 'utf8'),
  ) as SkillTemplateManifest
}
