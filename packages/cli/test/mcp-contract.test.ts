import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** The sample vault used by the MCP contract test. */
const VAULT = fileURLToPath(new URL('../../../Fixtures/vault', import.meta.url))

/** A single JSON-RPC request. */
interface Request {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

/** A single JSON-RPC response. */
interface Response {
  jsonrpc: '2.0'
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

/**
 * A tiny MCP client that talks to the CLI over stdio.
 *
 * The point of the test is the contract: the server has to answer
 * `initialize`, expose its tools through `tools/list`, and run a real tool
 * against the sample vault.
 */
class McpStdioClient {
  private readonly child
  private readonly pending = new Map<number, (response: Response) => void>()
  private buffer = ''
  private nextId = 1

  constructor(command: string, args: string[]) {
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.consume(chunk))
  }

  private consume(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as Response
          const resolver = this.pending.get(parsed.id)
          if (resolver) {
            this.pending.delete(parsed.id)
            resolver(parsed)
          }
        } catch {
          // Not a JSON-RPC frame; ignore it.
        }
      }
      newline = this.buffer.indexOf('\n')
    }
  }

  /** Sends a request and waits for the matching response. */
  request(method: string, params?: Record<string, unknown>): Promise<Response> {
    const id = this.nextId++
    const payload: Request = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out waiting for ${method}`))
      }, 15_000)
      this.pending.set(id, (response) => {
        clearTimeout(timer)
        resolve(response)
      })
      this.child.stdin.write(`${JSON.stringify(payload)}\n`)
    })
  }

  /** Sends a notification, which has no response. */
  notify(method: string, params?: Record<string, unknown>): void {
    const payload = { jsonrpc: '2.0', method, ...(params ? { params } : {}) }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  close(): void {
    this.child.kill()
  }
}

/** Starts the CLI as an MCP server over stdio. */
function startServer(): McpStdioClient {
  const entry = fileURLToPath(new URL('../src/bin.ts', import.meta.url))
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url))
  return new McpStdioClient(process.execPath, [tsx, entry, '--mcp'])
}

describe('MCP contract', () => {
  it('preserves frontmatter while editing and rejects paths outside the vault', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'monet-mcp-'))
    const file = join(directory, 'Note.md')
    writeFileSync(
      file,
      `---
title: Note
tags: [one]
description: |
  First line.
  Second line.
---
Body.
`,
      'utf8',
    )

    const server = startServer()
    try {
      const initialize = await server.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'monet-test', version: '0.0.0' },
      })
      expect(initialize.error).toBeUndefined()
      server.notify('notifications/initialized')

      const edit = await server.request('tools/call', {
        name: 'note_edit',
        arguments: {
          title: 'Note',
          tag: ['two'],
          append: 'More.',
          vault: directory,
          format: 'json',
        },
      })
      expect(edit.error).toBeUndefined()
      expect((edit.result as { isError?: boolean }).isError).not.toBe(true)

      const contents = readFileSync(file, 'utf8')
      expect(contents).toContain('description: |')
      expect(contents).toContain('  First line.\n  Second line.')
      expect(contents).toContain('  - one')
      expect(contents).toContain('  - two')
      expect(contents).toContain('More.')

      const escape = await server.request('tools/call', {
        name: 'note_new',
        arguments: {
          title: 'Escape',
          folder: '../monet-mcp-outside',
          vault: directory,
          format: 'json',
        },
      })
      expect((escape.result as { isError?: boolean }).isError).toBe(true)
      expect(existsSync(join(dirname(directory), 'monet-mcp-outside', 'Escape.md'))).toBe(false)
    } finally {
      server.close()
      rmSync(directory, { recursive: true, force: true })
      rmSync(join(dirname(directory), 'monet-mcp-outside'), { recursive: true, force: true })
    }
  })

  it('answers initialize, lists the tools and runs a real tool', async () => {
    const server = startServer()
    try {
      const initialize = await server.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'monet-test', version: '0.0.0' },
      })
      expect(initialize.error).toBeUndefined()
      expect(initialize.result).toBeDefined()

      server.notify('notifications/initialized')

      const listed = await server.request('tools/list')
      expect(listed.error).toBeUndefined()
      const tools = (listed.result?.['tools'] ?? []) as { name: string; description?: string }[]
      expect(tools.length).toBeGreaterThan(0)

      const names = tools.map((tool) => tool.name)
      expect(names).toContain('search')
      expect(names).toContain('backlinks')
      expect(names).toContain('graph')
      expect(names.some((name) => name.startsWith('note_'))).toBe(true)

      // Run a real tool against the sample vault.
      const called = await server.request('tools/call', {
        name: 'search',
        arguments: { query: 'release', vault: VAULT, format: 'json' },
      })
      expect(called.error).toBeUndefined()
      const content = (called.result?.['content'] ?? []) as {
        type: string
        text?: string
      }[]
      expect(content.length).toBeGreaterThan(0)
      const text = content.map((entry) => entry.text ?? '').join('\n')
      expect(text).toContain('Release Plan')
    } finally {
      server.close()
    }
  }, 40_000)
})
