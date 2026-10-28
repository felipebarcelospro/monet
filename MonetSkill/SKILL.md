---
name: monet
description: Monet is a local-first Markdown vault for macOS with a 3D link graph. Use this skill to read, create, search and connect notes in a Monet vault from the terminal or through the Monet MCP server.
---

# Monet

Monet is a Markdown knowledge vault. Notes are plain `.md` files in a folder,
links are `[[wikilinks]]`, and the same folder can be opened by the macOS app
and by the `monet` CLI without any duplicated state.

This skill is installed together with the generated `monet-<command>` skills, which document every command of the CLI in detail.

## The vault

- A vault is an ordinary folder of Markdown files.
- Each note may start with an optional YAML frontmatter block.
- Links are written as `[[Note]]`, optionally with `[[Note|display text]]` or
  `[[Note#Heading]]`.
- Embeds are written as `![[Note]]`.
- Tags are written as `#tag` or declared in the frontmatter.
- Link resolution matches Obsidian: no extension needed, case-insensitive,
  aliases work, and duplicate titles resolve to the closest file.

## Choosing a vault

A single vault is all Monet needs. Point the CLI at it once:

```sh
monet vault use ~/Documents/Vault
monet vault current
```

From then on every command — and the app, and the MCP server — uses that
folder without a `--vault` flag. `monet vault list` shows the current vault
and the ones opened recently; `monet vault current` also says whether the
path came from the flag, the environment, the configuration or the current
directory.

The resolution order is: `--vault`, `MONET_VAULT`, the configured vault, the
current directory. When the vault is not obvious, run `monet vault current`
before reading or writing — never guess a path.

To open the vault in the macOS app:

```sh
monet open
```

## Reading notes

```sh
monet note list                      # every note in the vault
monet note list --tag project        # only notes carrying a tag
monet note show "Meeting Notes"      # print a note
monet note show "Meeting Notes" --format json
```

## Creating and editing notes

```sh
monet note new "Release Plan" --body "# Release Plan\n\nShip on Friday."
monet note new "Release Plan" --folder Projects
monet note edit "Release Plan" --body "Updated body"
monet note move "Release Plan" --to Archive/2026/Release Plan
monet note delete "Release Plan" --yes
```

Every write is a plain file write. The CLI warns when the Monet app currently
has the same vault open, because both can write to the same file.

## Linking notes

```sh
monet link create "Release Plan" --target "Launch Checklist"
monet link check "Release Plan" --target "Launch Checklist"
monet backlinks "Launch Checklist"
```

`monet link create` appends `[[Target]]` to the note body. `monet link check`
reports whether the link resolves, which is the fastest way to catch a
renamed note.

## Searching

```sh
monet search "release" --limit 20
monet search "releas"          # fuzzy: matches a typo
monet search "release" --tag project --format json
```

## Exploring the graph

```sh
monet graph --format json      # nodes and edges
monet graph --format json --tag project
```

The JSON shape is:

```json
{
  "nodes": [{ "id": "Release Plan", "title": "Release Plan", "tags": ["project"], "linkCount": 3, "backlinkCount": 1 }],
  "edges": [{ "source": "Release Plan", "target": "Launch Checklist" }]
}
```

The macOS app renders exactly this graph in 3D, with the same force-directed
layout, so a node id from the CLI is the same node you see in the app.

## Tags

```sh
monet tags                       # every tag with its note count
monet tags --format json
```

## MCP server

The CLI doubles as an MCP server. Agents can call the same commands as tools.

```sh
monet --mcp                       # stdio server
monet mcp add                     # register the CLI with your agent
```

Tool names are the command names with the group prefix, for example
`note_show`, `search`, `backlinks` and `graph`.

## Output formats

Every command supports `--format toon|json|yaml|md|jsonl`. The default is
TOON, which is compact and easy for an agent to read. Use `--format json`
when a program consumes the output.

## Common mistakes

- Linking with the `.md` extension works, but the Obsidian convention is
  `[[Note]]`.
- A note whose file name contains a slash cannot exist; use folders instead.
- Renaming a note breaks the links that pointed at it. `monet backlinks`
  tells you who pointed at it before you rename.
