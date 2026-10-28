# Positioning

What Monet is, who it is for, and why it exists. This is the reference for
anyone writing about the product — README, release notes, store listings,
screenshot captions. For the operational rules agents follow, read
[AGENTS.md](../AGENTS.md).

---

## The thesis

**Monet is one brain for you and your agents.**

People who think in writing keep their notes in files. Agents that help them
need access to those same notes. Today the two worlds are separate: notes
apps are built for people and give agents, at best, a prompt pack; AI
notebooks are built for models and ask the person to live in someone else's
cloud. Monet refuses that split.

One vault. One engine. One folder of plain Markdown. A quiet desktop app for
the person, a CLI and MCP server for the agents. Nothing in between.

- **Tagline (EN):** One brain for you and your agents.
- **Tagline (pt-BR):** Um segundo cérebro — seu e dos seus agentes.
- **Tagline (es):** Un segundo cerebro: tuyo y de tus agentes.
- **Category:** the shared second brain.

## The four pillars

1. **Your files.** Plain Markdown in a folder you own, compatible with
   Obsidian and every other tool that reads `.md`. Leaving costs nothing —
   nothing is trapped. The index is derived state, never a second source of
   truth.
2. **Complete for you.** A real app for real thinking: rich Markdown editor
   with live blocks, interactive graph, backlinks, search, command palette,
   reading view, three languages. Not a demo and not an SDK.
3. **Native for agents.** The CLI and MCP server are first-class clients of
   the same engine the app uses. Commands, schemas, completions, MCP tools
   and agent skills all come from one declaration (Incur) — so agents and
   people never drift apart.
4. **Trustworthy.** Quiet software. Local snapshots, deterministic
   behaviour, no telemetry, no network calls in the search path, honest docs
   about unsigned builds. The vault belongs to the user; we are guests in it.

## The landscape

Monet sits between three familiar answers, none of which gives the person
and the agent the same brain:

- **A notes app with agents bolted on.** Built for people. Agents get a pack
  of prompts or a plugin that drives the app's UI. The agent never touches
  the engine: no schemas, no structured output, no guarantee of what it may
  write.
- **A cloud AI notebook.** Built for models. The brain lives on someone
  else's servers, the person reads it through someone else's app, and the
  notes are hostage to a subscription.
- **Prompt and skill packs.** Instructions without an engine. They teach an
  agent to wish for search, backlinks and safe writes; Monet ships those
  underneath.

Monet's answer is unglamorous on purpose: a folder of `.md` files, a fast
local engine, an app that feels calm, and a command line that agents can
drive with schemas and trust. One brain, two ways in.

## Voice

- **Quiet, precise, human.** Monet competes on calm. Copy should feel like a
  well-set page, not a landing page.
- Write for the person taking notes: "your notes", "your vault", "your
  folder".
- Plain sentences, active voice, no exclamation marks, no hype words.
- State limitations plainly. Honesty is part of the brand.
- English is the source of truth; Portuguese and Spanish follow naturally.
- Never disparage a competitor by name. Describe trade-offs, let the reader
  decide.

## What this rules out

- No authored agent skill in the repository — skills are generated from the
  command declarations.
- No proprietary database, format or sync lock-in.
- No telemetry, no accounts, no required network.
- No feature that only the app can see, or only the CLI can reach: if one
  side can do it, the engine can, so both can.
