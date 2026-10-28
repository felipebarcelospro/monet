# Architecture

Monet is a monorepo with one engine and two clients. The engine knows nothing
about Electron or React; the clients know nothing about parsing Markdown.

```
┌──────────────────────────── desktop app ────────────────────────────┐
│  main process            preload              renderer              │
│  VaultService  ──IPC──►  window.monet  ──►  zustand + React 19      │
│      │                                        │                     │
│      └────────────── @monet/core ◄────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
             ▲
             │                         CLI / MCP server
             └─────────────────────  @monet/cli  ──►  stdio MCP
```

## Packages

### `@monet/core` — the engine

Pure TypeScript. It has no Electron, React or UI imports. It exposes two entry
points:

- `@monet/core` — Node-only APIs (filesystem, writes, locks).
- `@monet/core/browser` — the browser-safe subset used by the renderer for
  link resolution and note summaries.

Responsibilities:

- **Scanning** — `Vault.open` walks a folder, reads `.md` files, parses YAML
  frontmatter and builds a `VaultIndex`.
- **Resolution** — `LinkResolver` follows Obsidian rules: case-insensitive,
  optional `.md`, aliases, closest folder, duplicate titles.
- **Index** — notes by id/path/title, outgoing and incoming links, unresolved
  targets, tags, types.
- **Search** — fuzzy title and body search with ranking.
- **Graph** — deterministic nodes and edges, shared by the app and CLI.
- **Writes** — `renderNote` / `writeNote` keep frontmatter and body in a known
  shape; no note is rewritten unless it must be.

The same fixture (`Fixtures/vault`) and parity checks keep the TypeScript
engine honest across clients.

### `@monet/cli` — the terminal and the MCP server

Built with [Incur](https://github.com/wevm/incur). One command declaration
generates:

- the CLI command and its `--help`,
- the JSON output schema (`--schema`),
- the agent manifest (`--llms`),
- shell completions,
- the MCP tool list (`monet --mcp`).

Commands live in `packages/cli/src/commands/`. Vault selection follows:
`--vault` → `MONET_VAULT` → `~/.config/monet/config.json` → current directory.
`monet vault list/current/use` manage that configuration. The app writes the
same file, so both clients agree on the current vault.

### `@monet/app` — the desktop window

Three processes/layers:

1. **Main** (`electron/main.ts`, `electron/vault-service.ts`) owns the vault,
   the filesystem, preferences, menus and the window.
2. **Preload** (`electron/preload.ts`) exposes one typed object,
   `window.monet`, defined by `MonetApi` in `src/shared/contract.ts`.
3. **Renderer** (`src/`) is a React 19 app with CodeMirror 6. It has no Node
   access; every disk operation crosses the typed bridge.

`src/lib/bridge.ts` returns `window.monet` inside Electron and an in-memory
mock in a plain browser, so the UI can be developed with Vite alone.

## Data flow

### Opening a vault

```
VaultService.open(path)
  → Vault.open(path)              @monet/core
  → readNotes(root)
  → VaultIndex
  → snapshot()                    notes, folders, tags, types, assets, stats
  → app:info / vault:changed IPC
  → store.snapshot
```

The renderer receives summaries only. A note body is read on demand
(`readNote(id)`) when it is selected; edits are written back with
`writeNote(id, body)`.

### Saving

The store owns the text. Typing updates the store immediately and schedules a
debounced save (about 550 ms). The main process writes the file and the file
watcher sees the change; a short quiet window prevents the watcher from
echoing the write back into the editor. External edits (another app, a sync
tool) arrive as `note:changed` and update an editor that is not dirty.

### Assets

The renderer never copies file bytes over IPC. The main process registers a
privileged scheme, `monet://asset/<vault-relative-path>`, and serves files with
the correct content type. The handler resolves the path against the vault root
and refuses anything outside it. Images, video, audio and PDFs are streamed by
Chromium's own decoders.

### Markdown

Rendering has two paths that share one vocabulary:

1. **Reading view** — `react-markdown` with `remark-gfm`, `remark-math`, the in-repo `remarkCallouts` and
   `remarkWikilinks`, `rehype-raw`,
   `rehype-katex` and `rehype-highlight`.
2. **Live editor blocks** — a CodeMirror `StateField` replaces tables, media,
   Mermaid fences, display math, callouts and note embeds with small React
   roots while the cursor is elsewhere. Clicking a block dispatches a
   selection back into the Markdown. Inline task checkboxes are `WidgetType`
   decorations that toggle `[ ]` / `[x]` in the document.

Block decorations **must** come from a state field. CodeMirror rejects block
decorations produced by a view plugin, because a block changes the height of
the document before layout.

### Graph

`GraphPane` requests `graph` from the main process, runs `d3-force` from a
deterministic phyllotaxis seed, and draws to a canvas with device-pixel-ratio
scaling. The same layout routine runs in the CLI, so a vault has one graph.

## The IPC contract

`src/shared/contract.ts` is the single source of truth for:

- snapshots (`VaultSnapshot`, `AssetSummary`, `NoteSummary`),
- documents (`NoteDocument`),
- menu actions and preferences,
- `MonetApi` — the surface exposed by the preload.

Adding an operation means changing three places together:

1. the method in `MonetApi`,
2. the handler in `electron/main.ts` (or `vault-service.ts`),
3. the implementation in `electron/preload.ts` and the mock in
   `src/lib/bridge.ts`.

Validate every argument at the boundary. Paths are resolved and checked
against the vault root, never trusted from the renderer.

## Configuration

| File | Purpose |
|---|---|
| `~/.config/monet/config.json` | Default vault, recent vaults, locale, concurrent-edit warning |
| Electron `userData` | Window preferences (theme, width, font, inspector, favourites) |
| `<vault>/.monet` | Per-vault app lock while a window is open |

`MONET_VAULT` and `MONET_CONFIG_DIR` override the environment for tests and
portable setups. `MONET_USER_DATA` gives the app a separate Electron profile,
which is how the screenshot script and the automated captures run beside your
own window.

## Testing

- **`packages/core/test`** — parser, resolver, search, graph and writes.
- **`packages/cli/test`** — commands, JSON contract, MCP contract and parity
  against the fixtures.
- **`packages/app/test`** — vault service operations and Markdown target
  resolution.

Fixtures live in `Fixtures/vault`, shared by the CLI and app tests. The
screenshot script uses `ExampleVault/`, which is generated by `pnpm seed` and
ignored by git.

## Design language

The interface is a warm-paper editorial layout: `#F7F6F2` paper, white
surfaces, one blue for selection (`#E9EDF9`), thin separators, pastel chips,
Instrument Sans for display and Inter for UI. Tokens live in
`packages/app/src/styles/tokens.css`; component styles in `app.css` and
Markdown styles in `markdown.css`. New UI should read from the tokens rather
than invent colours.

## Where to change what

| Change | Start here |
|---|---|
| Vault parsing, links, search | `packages/core/src` |
| CLI command or MCP tool | `packages/cli/src/commands` + `index.ts` |
| Vault selection | `packages/core/src/config.ts`, `packages/cli/src/commands/vault.ts` |
| Window, menus, IPC | `packages/app/electron` + `src/shared/contract.ts` |
| Markdown rendering | `packages/app/src/markdown` |
| Live editor blocks | `packages/app/src/editor/liveBlocks.tsx` |
| Graph | `packages/app/src/components/GraphPane.tsx` |
| Strings | `packages/app/src/shared/i18n.ts`, `packages/cli/src/lib/i18n.ts` |
