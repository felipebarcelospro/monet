# @monet-ai/cli

The CLI and MCP server for [Monet](https://github.com/felipebarcelospro/monet)
— one brain for you and your agents.

Monet is a local-first Markdown vault. Your notes stay as plain `.md` files
in a folder you own; this package gives your agents access to the same brain
the Monet desktop app uses.

```sh
npm install -g @monet-ai/cli
monet vault use ~/Documents/Vault
monet note list
```

## What it does

- **Notes** — create, read, edit, move and link notes with `monet note` and
  `monet link`.
- **Search and structure** — search the vault, list backlinks and tags, and
  export the link graph with `monet search`, `monet backlinks`, `monet tags`
  and `monet graph`.
- **MCP server** — `monet --mcp` exposes the vault to Claude Code, Cursor,
  Windsurf, Codex and any MCP client, so agents can search, read, create and
  link notes.
- **Agent skills** — `monet skills add` installs skills generated from the
  same command declarations that power the CLI.
- **Safety** — the vault is never rewritten without cause; `monet backup`
  writes a local snapshot before you experiment.

Every command accepts `--format toon|json|yaml|md|jsonl`. The default is
TOON, compact for agents; use `--format json` for programs.

A self-contained bundle that runs on Node ≥ 22 — no other dependencies.
