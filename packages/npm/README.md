# monet-cli

Command line access to a local [Monet](https://github.com/felipebarcelospro/monet) Markdown vault.

```sh
npm install -g monet-cli
monet vault use ~/Documents/Vault
monet note list
```

A self-contained bundle that runs on Node ≥ 22 — no other dependencies.
Notes stay as plain `.md` files in a folder you own; the same folder works in
the Monet desktop app and with AI agents through the MCP server
(`monet --mcp`).
