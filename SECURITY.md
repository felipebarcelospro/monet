# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` | ✅ |

Pre-1.0 releases receive fixes on `main`; there are no long-term support
branches yet.

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private vulnerability reporting:

1. Open **Security** → **Advisories** in the repository.
2. Click **Report a vulnerability**.
3. Include the version, the platform, the steps to reproduce, and the impact.

Direct link:
[https://github.com/felipebarcelospro/monet/security/advisories/new](https://github.com/felipebarcelospro/monet/security/advisories/new)

You can expect an acknowledgement within a few days. If the report is valid, a
fix and an advisory will be prepared; credit is given unless you ask to remain
anonymous.

## Scope

Monet is a local application. The security boundary that matters most is the
desktop window:

- **Electron renderer** — `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`. The renderer never gets `fs`, `child_process` or
  arbitrary IPC.
- **Preload bridge** — exposes a narrow, typed API (`window.monet`) for vault
  operations. A bug that lets remote content call it without user intent is in
  scope.
- **Asset protocol** — `monet://asset/<path>` serves files from the open vault
  only. Path traversal outside the vault is in scope.
- **Vault writes** — note creation, editing, moving and deletion must stay
  inside the open vault. A path escape is in scope.
- **CLI** — commands accept paths from the user; a path traversal that writes
  outside the vault is in scope.
- **MCP server** — the server exposes the same vault operations to an agent
  over stdio. A tool that bypasses validation is in scope.

Out of scope:

- Vulnerabilities in Electron, Chromium, Node.js or a dependency that is
  already fixed upstream (report them upstream; we will update).
- Attacks that require the user to open a vault they do not trust.
- Missing hardening with no demonstrated impact.

## Trust model

A vault is **trusted input**, by design. Notes can contain raw HTML, images,
video, links and Mermaid diagrams. Opening a vault written by someone else is
similar to opening an HTML document they wrote: only do it if you trust the
source.

The renderer has no Node.js access and no direct filesystem access, but a
malicious note could still try to trick the user into actions through the
narrow vault API (creating, editing or deleting notes). Treat vaults like
documents, not like sandboxed plugins.

Remote images and links can make network requests through Chromium. The app
does not send telemetry and does not call a Monet server.

## Good practices for users

- Keep Monet and Electron up to date.
- Download builds and CLI binaries from the official releases page.
- Do not open a vault from an untrusted source.
- Back up important vaults. They are plain folders, so any backup tool works.

## Good practices for contributors

- Never log vault contents, tokens or personal paths in error messages.
- Keep new IPC handlers narrow and validate every path against the vault root.
- Prefer the existing `Vault` helpers over ad-hoc filesystem calls.
- Do not add a remote service without a design discussion.
- Run `pnpm check` and keep dependencies current.
