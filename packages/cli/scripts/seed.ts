/**
 * Generates the example vault used by the README, the screenshots and the
 * test suite.
 *
 * The vault is deterministic: the same seed always produces the same notes,
 * the same links and the same tags, so the tests can assert on exact values.
 *
 * Usage:
 *   bun run scripts/seed.ts [target] [--seed 42] [--notes 60]
 */

import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A deterministic pseudo random number generator. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
}

/** The shape of a generated note. */
interface SeedNote {
  title: string
  folder: string
  tags: string[]
  aliases: string[]
  body: string
}

/** The vocabulary the generated vault is built from. */
const PROJECTS = [
  'Monet Launch',
  'Vault Format Migration',
  'Graph Rendering',
  'CLI Rewrite',
  'Mobile Companion',
  'Search Relevance',
  'Sync Reliability',
  'Theme Engine',
]

const AREAS = [
  'Product',
  'Engineering',
  'Design',
  'Operations',
  'Research',
  'Community',
]

const RESOURCES = [
  'Markdown Reference',
  'Wikilink Syntax',
  'YAML Frontmatter',
  'Force Directed Layout',
  'Liquid Glass',
  'String Catalogs',
  'MCP Protocol',
  'Tree Shaking',
  'Typography',
  'Colour Theory',
]

const MEETINGS = [
  'Weekly Sync',
  'Architecture Review',
  'Design Critique',
  'Roadmap Planning',
  'User Interview',
  'Release Retrospective',
]

const PEOPLE = [
  'Ademar',
  'Felipe',
  'Renata',
  'Ingrid',
  'Otávio',
  'Camila',
  'Bruno',
  'Lúcia',
]

const TASK_LINES = [
  'Write the migration plan for the legacy vault format.',
  'Measure the cold start time of the index builder.',
  'Prototype the wikilink autocomplete.',
  'Audit the unresolved links and fix the ambiguous ones.',
  'Profile the graph layout with two thousand notes.',
  'Translate the help text into Brazilian Portuguese.',
  'Document the MCP tool names in the skill.',
  'Add a smoke test that runs a real tool over the sample vault.',
]

const NOTE_LINES = [
  'The index is rebuilt whenever a file changes, so a large vault pays the cost once.',
  'Link resolution is case-insensitive and ignores the file extension.',
  'Duplicate titles resolve to the note in the closest folder.',
  'Tags can be declared in the frontmatter or written inline.',
  'The graph layout is deterministic, so the same vault always looks the same.',
  'A backlink appears as soon as the note that points at it is written.',
  'Aliases let a note be linked by a second name.',
  'Everything is stored as plain Markdown, so the vault survives the app.',
]

/** Builds the list of notes that make up the example vault. */
export function buildNotes(count: number, seed: number): SeedNote[] {
  const random = makeRandom(seed)
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)]!

  const notes: SeedNote[] = []

  const push = (
    title: string,
    folder: string,
    tags: string[],
    aliases: string[],
    lines: string[],
  ): void => {
    notes.push({ title, folder, tags, aliases, body: lines.join('\n\n') })
  }

  PROJECTS.forEach((title, index) => {
    const owner = PEOPLE[index % PEOPLE.length]!
    push(
      title,
      'Projects',
      ['project', `area/${AREAS[index % AREAS.length]!.toLowerCase()}`],
      [title.replace(/^Monet\s/, 'M-')],
      [
        `# ${title}`,
        `Owner: ${owner}. Target: ${2026 + (index % 2)} Q${(index % 4) + 1}.`,
        ...TASK_LINES.slice(index % 3, (index % 3) + 3),
        `Related: [[${RESOURCES[index % RESOURCES.length]!}]] and [[${AREAS[index % AREAS.length]!}]].`,
      ],
    )
  })

  AREAS.forEach((title, index) => {
    push(
      title,
      'Areas',
      ['area', `area/${title.toLowerCase()}`],
      [],
      [
        `# ${title}`,
        `This area keeps the long lived notes of the ${title.toLowerCase()} practice.`,
        `See [[${PROJECTS[index % PROJECTS.length]!}]] for the current effort.`,
        NOTE_LINES[index % NOTE_LINES.length]!,
      ],
    )
  })

  RESOURCES.forEach((title, index) => {
    push(
      title,
      'Resources',
      ['resource', 'reference'],
      index % 3 === 0 ? [title.split(' ')[0]!] : [],
      [
        `# ${title}`,
        NOTE_LINES[index % NOTE_LINES.length]!,
        `Applies to [[${PROJECTS[index % PROJECTS.length]!}]] and [[${PROJECTS[(index + 1) % PROJECTS.length]!}]].`,
      ],
    )
  })

  MEETINGS.forEach((title, index) => {
    const date = `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, '0')}`
    push(
      `${title} ${date}`,
      'Meetings',
      ['meeting'],
      [],
      [
        `# ${title}`,
        `Date: ${date}. Attendees: ${PEOPLE[index % PEOPLE.length]!}, ${PEOPLE[(index + 3) % PEOPLE.length]!}.`,
        `Discussed [[${PROJECTS[index % PROJECTS.length]!}]] and [[${RESOURCES[(index + 2) % RESOURCES.length]!}]].`,
        TASK_LINES[(index + 2) % TASK_LINES.length]!,
      ],
    )
  })

  PEOPLE.forEach((title, index) => {
    push(
      title,
      'People',
      ['person'],
      [],
      [
        `# ${title}`,
        `Works on [[${PROJECTS[index % PROJECTS.length]!}]] and [[${AREAS[index % AREAS.length]!}]].`,
        `Contact: ${title.toLowerCase()}@example.com.`,
      ],
    )
  })

  // Daily notes give the vault a chronological spine.
  for (let day = 1; day <= 12; day += 1) {
    const date = `2026-03-${String(day).padStart(2, '0')}`
    push(
      date,
      'Daily',
      ['daily'],
      [],
      [
        `# ${date}`,
        `Morning: [[${PROJECTS[day % PROJECTS.length]!}]].`,
        `Afternoon: [[${RESOURCES[day % RESOURCES.length]!}]] and [[${PEOPLE[day % PEOPLE.length]!}]].`,
        TASK_LINES[day % TASK_LINES.length]!,
      ],
    )
  }

  // A couple of notes that link to something that does not exist, so the
  // unresolved link handling is visible in the example vault.
  push('Broken Link Example', 'Sandbox', ['sandbox'], [], [
    '# Broken Link Example',
    'This note points at [[A Note That Does Not Exist]] on purpose.',
  ])

  // Pad the vault with generated notes until the requested count is reached.
  let counter = 0
  while (notes.length < count) {
    const title = `Scratch ${String(counter + 1).padStart(2, '0')}`
    push(
      title,
      'Sandbox',
      ['scratch'],
      [],
      [
        `# ${title}`,
        NOTE_LINES[counter % NOTE_LINES.length]!,
        `Links to [[${PROJECTS[counter % PROJECTS.length]!}]].`,
      ],
    )
    counter += 1
  }

  return notes.slice(0, count)
}

/**
 * The root of the repository.
 *
 * The seed script is usually run through `pnpm --filter`, which sets the
 * working directory to the package. The paths it is given are resolved
 * against the repository root instead, so `pnpm seed ExampleVault` means the
 * same thing from anywhere.
 */
function repositoryRoot(): string {
  let current = resolve(dirname(fileURLToPath(import.meta.url)))
  const root = current.split('/')[0] ?? '/'
  while (current !== root) {
    if (existsSync(join(current, 'Package.swift'))) return current
    current = dirname(current)
  }
  return process.cwd()
}

/**
 * Writes the example vault to disk.
 */
export function seedVault(
  target: string,
  options: { seed?: number; notes?: number } = {},
): { vault: string; count: number } {
  const root = target.startsWith('/') ? resolve(target) : resolve(repositoryRoot(), target)
  const seed = options.seed ?? 42
  const count = options.notes ?? 60
  const notes = buildNotes(count, seed)

  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })

  notes.forEach((note, index) => {
    const relativePath = `${note.folder}/${note.title}.md`
    const absolute = join(root, ...relativePath.split('/'))
    mkdirSync(dirname(absolute), { recursive: true })

    const frontmatter = [
      '---',
      `title: ${note.title}`,
      `tags: [${note.tags.join(', ')}]`,
      ...(note.aliases.length > 0 ? [`aliases: [${note.aliases.join(', ')}]`] : []),
      'created: 2026-03-01',
      '---',
      '',
    ].join('\n')

    writeFileSync(absolute, `${frontmatter}${note.body}\n`, 'utf8')

    // Spread the modification dates over the last month, so the note list
    // groups them the way a vault that has been written over time would.
    const daysAgo = Math.floor(index / 3)
    const modified = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    try {
      utimesSync(absolute, modified, modified)
    } catch {
      // The date is cosmetic; a failure is not fatal.
    }
  })

  return { vault: root, count: notes.length }
}

const isMain = process.argv[1]?.includes('seed') ?? false
if (isMain) {
  const args = process.argv.slice(2)
  const target = args.find((arg) => !arg.startsWith('--')) ?? 'ExampleVault'
  const seedIndex = args.indexOf('--seed')
  const notesIndex = args.indexOf('--notes')
  const result = seedVault(target, {
    seed: seedIndex === -1 ? undefined : Number(args[seedIndex + 1]),
    notes: notesIndex === -1 ? undefined : Number(args[notesIndex + 1]),
  })
  console.log(`Seeded ${result.count} notes into ${result.vault}`)
}
