# AGENTS.md

Guidance for any AI agent (or human) maintaining this repository. Read this
before changing code, copy or docs. It defines what Monet **is**, how it
**sounds**, and the rules that keep every contribution consistent.

---

## 1. What Monet is

**Monet is one brain for you and your agents.**

A local-first Markdown vault that works as a complete product, not developer
infrastructure: a quiet desktop app for people who think in writing, plus a
CLI and MCP server so AI agents work on the very same brain. Your notes stay
as plain `.md` files in a folder you own — no proprietary database, no cloud
dependency, no lock-in.

### The tagline

- **English:** One brain for you and your agents.
- **Portuguese (Brazil):** Um segundo cérebro — seu e dos seus agentes.
- **Spanish:** Un segundo cerebro: tuyo y de tus agentes.

Use it when a short, complete statement of the product is needed (site hero,
README intro, release notes opening, store descriptions).

### The category

Monet is **the shared second brain**: one vault, one engine, one folder of
plain Markdown that a person and their agents both use — not two tools that
happen to read the same files.

### The four pillars

Every feature, every sentence of copy, every decision should serve at least
one of these:

1. **Your files.** Plain Markdown in a folder you own. Obsidian-compatible.
   The index is derived state, never a second source of truth. Exporting or
   leaving costs nothing because nothing is trapped.
2. **Complete for you.** A real app for real thinking: rich editor with live
   blocks, interactive graph, backlinks, search, command palette, three
   languages. Not a demo, not a SDK, not "infrastructure with a UI later".
3. **Native for agents.** The CLI and MCP server are first-class clients of
   the same engine — not a bolt-on plugin. Skills are generated from the
   command declarations by [Incur](https://github.com/wevm/incur); there is
   nothing separate to author or keep in sync.
4. **Trustworthy.** Quiet software: local snapshots, deterministic behaviour,
   honest docs (unsigned builds stated plainly), no telemetry, no network
   calls in the search path. The vault is the user's; we are guests in it.

### The contrast (use sparingly, never name-and-shame)

| Alternative | What it is | Why Monet differs |
|---|---|---|
| Human notes app + agents bolted on | An app for people; agents get a prompt pack. | Monet's agents drive the same engine, with schemas and MCP tools. |
| Cloud AI notebook | Your brain lives on someone else's servers. | Monet is local-first; the folder is yours. |
| Prompt / skill packs | Instructions without an engine. | Monet ships the engine — commands, schemas, indexing, safe writes. |

Frame the difference calmly. Never disparage a competitor by name in product
copy; describe the trade-offs, let the reader decide.

---

## 2. How Monet sounds

**Tone: quiet, precise, human.** Monet competes on calm. Copy should feel
like a well-set page, not a landing page.

- **Human-first, not dev-first.** Write for the person taking notes. Say
  "your notes", "your vault", "your folder" — not "nodes", "entities",
  "stores".
- **No jargon in user-facing copy.** No "schema", "refactor", "merge",
  "endpoint". Prefer "structure", "reorganise", "combine", "connection".
  Technical terms are fine in code comments and ARCHITECTURE.md, where they
  are precise.
- **Plain sentences.** Short declaratives. One idea per sentence. Prefer the
  active voice. If a sentence needs a semicolon and two commas to survive,
  split it.
- **Honest and understated.** State limitations plainly ("The builds are not
  signed"), never oversell ("game-changing", "blazing fast" are banned). No
  exclamation marks in product copy.
- **English is the source of truth** for all repo copy (`README.md`, docs,
  app strings, CLI strings, release notes). Portuguese and Spanish
  translations follow; keep them natural, not literal. When talking with the
  project owner in conversation, Portuguese (Brazil).
- **Never invent facts.** Prices, benchmarks, version numbers, star counts:
  verify or omit. If a claim cannot be sourced, delete it.

### Words to prefer / avoid

| Prefer | Avoid |
|---|---|
| vault, folder, note | database, store, node (in user copy) |
| plain Markdown files you own | proprietary format |
| quiet, calm, focused | powerful, magic, supercharge |
| works offline, local-first | cloud-native synergy |
| "Here is what changed" | "Here's what's new! 🎉" |

---

## 3. The product surface

Three packages around one engine. The app and the CLI are both clients of
`@monet/core`; the renderer never touches the disk directly.

| Package | Path | Role |
|---|---|---|
| `@monet/core` | `packages/core` | Pure TypeScript engine: vault scanning, frontmatter, wikilinks, index, backlinks, search, graph, safe writes. Node and browser entry points. |
| `@monet/cli` | `packages/cli` | The `monet` CLI, the MCP server (`monet --mcp`), and `monet skills add` (generated by Incur from command declarations). |
| `@monet/app` | `packages/app` | Electron desktop app: main process, preload bridge, React 19 renderer with CodeMirror 6. |

Shared surfaces that changes must respect:

- **The vault format** — plain `.md` + YAML frontmatter, `[[wikilinks]]`,
  `![[embeds]]`, `#tags`, aliases. Link resolution follows Obsidian rules
  (case-insensitive, optional `.md`, aliases, closest-folder tie breaking).
  Never break Obsidian compatibility.
- **The output formats** — every CLI command accepts
  `--format toon|json|yaml|md|jsonl`. Default TOON (compact, for agents);
  `--format json` is the programmatic contract. Both are public API.
- **The three locales** — `en`, `pt-BR`, `es`. Strings live in
  `packages/app/src/shared/i18n.ts` (app) and `packages/cli/src/lib/i18n.ts`
  (CLI). A string added in English must be added in all locales in the same
  change.
- **The shared config** — `~/.config/monet/config.json` is written by the CLI
  and read by the app. One vault, chosen once, used everywhere.

---

## 4. Skills: the standing decision

**There is no authored skill in this repository, and none should be added.**

The former `MonetSkill/` folder was removed deliberately:

- Skills for agents are **generated from the command declarations** by Incur
  (`monet skills add`). One declaration → commands, schemas, completions,
  MCP tools and skill material.
- A separate authored skill would drift from the CLI on every change — the
  exact class of bug this project avoids (two sources of truth).
- If a command changes how agents work, update the **command declaration and
  its descriptions** in `packages/cli/src/commands/` — the skill follows.

Do not reintroduce `MonetSkill/`, skill template manifests, or copy scripts.
If a proposal needs hand-written agent guidance, it belongs in docs.

---

## 5. Distribution channels

Keep these names exact. They appear in docs, release notes and formulas.

| Channel | Identifier | Notes |
|---|---|---|
| npm | `@monet-ai/cli` | Scoped org `monet-ai`. Unscoped `monet-cli` is permanently unavailable (typosquat protection vs. existing `monetcli`); the `@monet` scope is impossible (dormant npm user "monet" occupies it). Publish with `npm publish <tarball>` from `packages/npm` — see docs/RELEASING.md. |
| Homebrew | `felipebarcelospro/tap/monet` | Formula (CLI) and cask (app) in the `homebrew-tap` repo. Fully-qualified names only (`brew install felipebarcelospro/tap/monet`). |
| GitHub Releases | `v*` tags | One-line installers (`install.sh` / `install.ps1`), macOS DMG/ZIP (x64 + arm64), Windows and Linux installers, SHA-256 checksums. |
| Install one-liners | `curl … install.sh \| sh`, `irm … install.ps1 \| iex` | First block of the README. Pick the right build, verify SHA-256, install to `~/.local/bin`, `MONET_INSTALL_DIR` to override. |

Release process lives in [docs/RELEASING.md](docs/RELEASING.md). Versions are
synced across the five manifests by `scripts/version.mjs` — never bump a
single `package.json` by hand.

---

## 6. Engineering rules

- **Node.js ≥ 22, pnpm ≥ 11.** Bun is only for building standalone CLI
  binaries. `corepack enable` is enough for pnpm.
- **Validate before you claim done:**

  ```sh
  pnpm check        # lint, format, typecheck, tests
  ```

  No delivery with failing checks, `#REF!`-style errors, or truncated UI text.
- **Serialize write operations.** Never run multiple write tool calls in
  parallel against the same files or data. One at a time, verify, then the
  next.
- **List before you create.** Always list existing records/files/branches
  before creating anything new. Duplicates are unacceptable.
- **Never overwrite user data.** The vault belongs to the user. Never
  rewrite a file the change did not have to touch. `monet backup` exists for
  a reason; destructive operations require `--yes` and say so in help text.
- **Conventional Commits** (`feat(editor): …`, `fix(cli): …`, `docs: …`).
  Scopes: `app`, `editor`, `cli`, `core`, `docs`, `i18n`, `deps`, `release`.
- **Keep changes focused.** One concern per pull request. Cross-package
  changes must explain why.
- **Tests travel with features.** Parser contracts are verified against
  `Fixtures/vault/`. A bug fix ships with the test that failed before it.
- **Docs travel with behaviour.** If a user-visible command, format or
  setting changes, update `README.md`, `ARCHITECTURE.md` (for contracts) and
  the CLI help in the same change.

---

## 7. Where things live

```
packages/core/        engine: no Electron, no React, no disk UI
packages/cli/         command declarations, MCP server, skills generation
packages/app/         Electron main, preload, React renderer
packages/npm/         npm packaging shell for @monet-ai/cli
Fixtures/vault/       shared CLI/app test vault
ExampleVault/         generated demo vault (gitignored)
docs/                 RELEASING.md, screenshots, social preview
scripts/              version sync and repo tooling
```

Further reading: [ARCHITECTURE.md](ARCHITECTURE.md) (data flow, IPC
contract, `monet://` protocol, save model), [CONTRIBUTING.md](CONTRIBUTING.md)
(workflow, review checklist), [SECURITY.md](SECURITY.md) (trust model).

---

> Last updated: 2026-10-28
