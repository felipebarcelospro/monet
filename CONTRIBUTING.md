# Contributing to Monet

Thanks for taking the time to contribute. Monet is a small, local-first
project and every bug report, translation, screenshot and pull request helps.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). For
security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public
issue.

---

## Before you start

- **Bug or small fix** — open an issue or send a pull request directly.
- **New feature or a change to the vault format** — open an issue first so we
  can agree on the shape before you write code.
- **Translations** — the app and CLI ship English, Brazilian Portuguese and
  Spanish. Missing strings and awkward wording are valid pull requests.

Good first issues are labelled
[`good first issue`](https://github.com/monet-app/monet/labels/good%20first%20issue).

---

## Requirements

- Node.js 22 or later
- pnpm 11 or later
- Git

Bun is only needed to build the standalone CLI binaries
(`pnpm --filter @monet/cli build:binary`). Normal development and tests use
Node and pnpm.

`corepack enable` is enough if you do not have pnpm installed.

---

## Setup

```sh
git clone https://github.com/monet-app/monet.git
cd monet
pnpm install
pnpm seed                     # creates ExampleVault/
pnpm dev -- --vault ExampleVault
```

`pnpm dev` starts Vite and Electron with hot reload. Closing the Electron
window stops the dev server.

### The CLI

```sh
pnpm --filter @monet/cli build
cd packages/cli && pnpm link --global
monet vault current
```

`monet vault use <path>` writes the shared configuration in
`~/.config/monet/config.json`. Point it at `ExampleVault/` while developing.

### The MCP server

```sh
monet --mcp                  # stdio server
monet mcp add                # register with detected clients
monet mcp doctor             # check startup and the tool list
```

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Desktop app with hot reload |
| `pnpm dev:cli` | CLI from source |
| `pnpm build` | Build all packages |
| `pnpm package` | Package the desktop app |
| `pnpm test` | Vitest across all packages |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm lint` | Biome lint |
| `pnpm lint:fix` | Biome lint with fixes written |
| `pnpm format` | Biome formatting, written |
| `pnpm format:check` | Formatting check, no writes |
| `pnpm check` | Lint, format, typecheck and tests |
| `pnpm seed` | Recreate `ExampleVault/` |
| `pnpm screenshots` | Refresh `docs/screenshots/` |

Run `pnpm check` before opening a pull request. CI runs the same commands.

---

## Project layout

```
packages/core/        engine: no Electron, no React, no disk UI
packages/cli/         command declarations, MCP server, skill template
packages/app/         Electron main, preload, React renderer
Fixtures/vault/       shared CLI/app test vault
ExampleVault/         generated demo vault, ignored by git
MonetSkill/           authored agent skill (en, pt-BR, es)
docs/screenshots/     images used by the README
```

`ARCHITECTURE.md` explains the data flow, the IPC contract, the Markdown
pipeline and the save model. Read it before changing the renderer or the
vault service.

---

## Making a change

1. Create a branch from `main`:

   ```sh
   git switch -c feat/table-of-contents
   ```

2. Keep the change focused. If it touches more than one package, explain why
   in the pull request.

3. Add or update tests. A bug fix should come with a test that fails before the
   fix.

4. Update the documentation if behaviour changes:

   - `README.md` for user-facing features and commands.
   - `ARCHITECTURE.md` for data flow or contracts.
   - `MonetSkill/SKILL.md` (and the `pt-BR` / `es` versions) when an agent
     workflow changes.

5. Run `pnpm check`.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(editor): render task list checkboxes in place
fix(cli): keep the configured vault when the cwd is a vault
docs: explain the asset protocol
chore(deps): update Electron
```

The scope is the package or area: `app`, `editor`, `cli`, `core`, `docs`,
`i18n`, `deps`, `release`.

---

## Common changes

### A new Markdown feature

- The renderer lives in `packages/app/src/markdown/`.
- A live editor block is a `StateField` in
  `packages/app/src/editor/liveBlocks.tsx`. Block decorations must come from
  state, not a view plugin.
- Add styles to `packages/app/src/styles/markdown.css`.
- Add an example to `ExampleVault/Guides/Markdown.md` and capture the result.
- Add a test if the feature has a resolver or a parser.

### A new CLI command

- Declare it in `packages/cli/src/commands/` and register the group in
  `packages/cli/src/index.ts`.
- Add output schemas and a test in `packages/cli/test/cli.test.ts`.
- Run the CLI with `--format json` and `--help`; both are part of the public
  contract.
- If the command changes how agents should work, update `MonetSkill/` in all
  three languages.

### A new string

- Add the key to `packages/app/src/shared/i18n.ts` (app) or
  `packages/cli/src/lib/i18n.ts` (CLI) in **all** locales.
- Portuguese is `pt-BR`; Spanish is `es`.
- Keep the English string as the source of truth.

### Screenshots

```sh
pnpm screenshots
```

The script builds the app, uses an isolated profile (it never changes your
configured vault) and writes into `docs/screenshots/`. Review the images before
committing them.

---

## Pull requests

A good pull request includes:

- **What** changed and **why**, in a sentence or two.
- **How it was tested** — commands run, screenshots for UI changes.
- A linked issue (`Closes #123`) when there is one.
- No unrelated formatting or dependency changes.

The pull request template repeats this checklist. A maintainer reviews for
correctness first, then for fit with the design language and the public
contract.

### Review checklist

- [ ] `pnpm check` passes.
- [ ] New behaviour is covered by a test, or the reason it cannot be is clear.
- [ ] The change works in reading view **and** in the editor when it affects
      Markdown.
- [ ] Strings exist in English, Portuguese and Spanish.
- [ ] No vault, profile or generated file is committed.
- [ ] Screenshots are updated when the interface changes.

---

## Releases

Releases use semantic versioning and a `v*` tag. The process is documented in
[docs/RELEASING.md](docs/RELEASING.md). Contributors do not need to bump
versions or create tags; maintainers do that when merging a release.

---

## Questions

Open an issue with the `question` label or start a discussion. Please do not
send private messages asking for help with an unrelated project; keep the
conversation in the open so the next person can find it.
