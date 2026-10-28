# Changelog

All notable changes to Monet are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Issue and pull request templates, Dependabot, CodeQL and a release guide.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md` and this changelog.

## [0.1.0] — 2026-10-28

The first public MVP: a local-first vault shared by a desktop app, a CLI and
an MCP server.

### Added

- **Desktop app** built with Electron, React 19, Vite and CodeMirror 6.
  Frameless window, warm-paper design tokens, three-column layout, inspector,
  command palette, quick switcher, settings, welcome screen, context menus and
  a crash boundary.
- **Markdown rendering** for GFM tables, task lists, footnotes, strikethrough,
  images, video, audio, file attachments, Mermaid diagrams, KaTeX math,
  syntax-highlighted code, callouts and raw HTML.
- **Live editor blocks** that render tables, media, diagrams, display math,
  callouts and note embeds in place; click a block to edit its Markdown.
  Clickable task checkboxes.
- **Reading view** toggled with `⌘E`, with editorial typography and embedded
  notes.
- **Vault support** for frontmatter, `[[wikilinks]]`, `[[Note#Heading]]`,
  `![[embeds]]`, aliases, tags, backlinks, unresolved links and a deterministic
  force-directed graph.
- **CLI** for notes, search, links, backlinks, tags, graph export and opening
  the app. Human-readable output plus `--format json|yaml|md|jsonl`.
- **Vault management** with `monet vault list`, `monet vault current` and
  `monet vault use`, sharing one configuration with the app.
- **Local snapshots** with `monet backup`, outside the vault, with retention.
- **Search** with accent folding, multi-word matching, fuzzy titles and body
  excerpts; no model or network required.
- **MCP server** (`monet --mcp`) and agent skill installation
  (`monet mcp add`, `monet skills add`) in English, Portuguese and Spanish.
- **Localisation** for English, Brazilian Portuguese and Spanish across the
  app, CLI and skill.
- **Tests** for core parsing/resolution/search/graph, the CLI contract and MCP
  tool list, and the app vault service and Markdown resolution.
- **CI** for typecheck, tests and builds; a tag-triggered workflow for
  standalone CLI binaries.

### Security

- Electron renderer with `contextIsolation`, `sandbox` and no Node integration.
- Vault files served through a path-confined `monet://asset` protocol.
- Every write resolves against the vault root and rejects absolute paths and
  `..` segments; the app, CLI and MCP share the same guard.
- Note writes carry a content revision. The app and the CLI refuse to
  overwrite a note that changed on disk after it was read, so an agent edit is
  never silently replaced by a stale window.
- Multiline frontmatter block scalars (`|`, `>`, chomping) are parsed and
  written back; a body-only save preserves the original frontmatter block.
- The vault is documented as trusted input: raw HTML is rendered by design.

[Unreleased]: https://github.com/felipebarcelospro/monet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/felipebarcelospro/monet/releases/tag/v0.1.0
