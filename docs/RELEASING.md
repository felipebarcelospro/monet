# Releasing Monet

Monet follows [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
Before 1.0, a minor release may contain breaking changes to the CLI, the MCP
tool names or the vault format; those are called out in the changelog.

## What ships

| Artifact | Where it comes from |
|---|---|
| CLI binaries (macOS, Linux, Windows, arm64 + x64) | `Binary Release` workflow on a `v*` tag |
| Desktop installers (DMG + ZIP for both macOS archs; NSIS, AppImage and deb once CI is unlocked) | `Desktop Release` workflow on a `v*` tag; the first macOS upload can be built locally with `pnpm --filter @monet/app package:mac` |
| `monet-cli` on npm | Manual publish from `packages/npm` (step 7) |
| Homebrew formula and cask | Manual update in the `homebrew-tap` repository (step 8) |

The desktop installers are not signed or notarised. `@monet/core` and
`@monet/cli` are not published to npm — the npm package is a self-contained
bundle of the CLI built in `packages/npm`.

## Checklist

1. **Start from a clean `main`.**

   ```sh
   git switch main
   git pull
   git status        # must be clean
   ```

2. **Run the full check.**

   ```sh
   pnpm install
   pnpm check
   pnpm build
   ```

3. **Bump every package that ships.** The three packages move together while
   they are pre-1.0, so a release is one version everywhere:

   ```sh
   pnpm release:version 0.2.0
   ```

   The script edits the root, core, CLI, app and npm-shell manifests; it does
   not commit, tag or publish.

4. **Update `CHANGELOG.md`.** Move `[Unreleased]` items into a new section with
   today's date and add the compare links at the bottom.

5. **Commit and tag.**

   ```sh
   git add -A
   git commit -m "chore(release): v0.2.0"
   git tag v0.2.0
   git push origin main
   git push origin v0.2.0
   ```

6. **Watch the `Binary Release` workflow.** It runs the checks, builds the CLI
   binaries and publishes a GitHub release with the files. If it fails, fix
   the cause and move the tag:

   ```sh
   git tag -d v0.2.0
   git push origin :refs/tags/v0.2.0
   git tag v0.2.0
   git push origin v0.2.0
   ```

7. **Publish the npm package.** From `packages/npm`:

   ```sh
   npm run pack:tarball
   npm publish monet-ai-cli-<version>.tgz
   ```

   Never run `npm pack` or `npm publish` from the folder itself: npm applies
   the repository's `.gitignore` rules over the `files` whitelist and would
   silently drop the generated bundle from the tarball. `pack:tarball` stages
   the package in a temporary directory outside the repository and prints the
   tarball path. A `prepack` guard script blocks an accidental direct pack
   with the same explanation.

8. **Update the Homebrew tap.** In the tap source repository
   (`~/Documents/Fractal/homebrew-tap`), bump the `version` in
   `Formula/monet.rb` and `Casks/monet.rb` and replace the `sha256` values
   with the new release checksums (`SHA256SUMS` for the CLI binaries,
   `shasum -a 256` for the DMGs). Push, then refresh the local clone and
   re-audit:

   ```sh
   git -C /usr/local/Homebrew/Library/Taps/felipebarcelospro/homebrew-tap pull
   brew audit --formula felipebarcelospro/tap/monet
   brew audit --cask felipebarcelospro/tap/monet
   ```

9. **Announce the release.** Summarise the user-facing changes, link the
   release and note any migration steps for the vault, CLI or MCP tools.

## Versioning rules of thumb

- **Patch** — a bug fix, a translation fix, a documentation-only release.
- **Minor** — a new command, a new Markdown capability, a new MCP tool.
- **Major** — a vault-format change that needs migration, or removal of a
  public CLI command or MCP tool. Before 1.0 this may happen in a minor release,
  with a migration note.

## Release notes

Release notes are for users, not for git history. Include:

- what is new, in one sentence per item;
- the upgrade steps, if any;
- a link to the full changelog;
- known limitations.

## After the release

- Close the milestone.
- Move remaining `[Unreleased]` items to the next milestone.
- If the CLI changed, run `monet skills add` so installed agent skills match
  the new command list (the skills are generated from the command
  declarations; there is nothing else to update by hand).
