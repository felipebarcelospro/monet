import { spawn } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import * as esbuild from 'esbuild'
import { createServer } from 'vite'

/**
 * The development loop.
 *
 * Vite serves the window with hot reload; esbuild bundles the two Electron
 * entry points; Electron is restarted whenever one of those entry points
 * changes. No plugin sits between the parts, which makes a failure easy to
 * see and easy to fix.
 */

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = fileURLToPath(new URL('..', import.meta.url))
const repo = fileURLToPath(new URL('../../..', import.meta.url))
const outdir = fileURLToPath(new URL('../dist-electron', import.meta.url))

/**
 * The dev script runs with cwd inside the app package. A vault passed as
 * `--vault ExampleVault` is relative to the repository, which is what a
 * contributor means, so make it absolute before Electron sees it.
 */
function forwardedArgs() {
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--vault' && args[index + 1] && !isAbsolute(args[index + 1])) {
      args[index + 1] = resolve(repo, args[index + 1])
    } else if (arg?.startsWith('--vault=') && !isAbsolute(arg.slice('--vault='.length))) {
      args[index] = `--vault=${resolve(repo, arg.slice('--vault='.length))}`
    }
  }
  return args
}

let child = null
let restartTimer = null
let shuttingDown = false
let started = false

/** The esbuild configuration for the main process and the preload. */
function electronOptions(watch) {
  return {
    entryPoints: [
      fileURLToPath(new URL('../electron/main.ts', import.meta.url)),
      fileURLToPath(new URL('../electron/preload.ts', import.meta.url)),
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outdir,
    outExtension: { '.js': '.cjs' },
    external: ['electron'],
    alias: {
      '@monet/core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
    },
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
    metafile: false,
    ...(watch
      ? {
          plugins: [
            {
              name: 'restart-electron',
              setup(build) {
                build.onEnd((result) => {
                  if (result.errors.length > 0) return
                  if (!started) {
                    started = true
                    startElectron()
                    return
                  }
                  if (restartTimer) clearTimeout(restartTimer)
                  restartTimer = setTimeout(() => {
                    if (child) {
                      child.removeAllListeners('exit')
                      child.kill('SIGTERM')
                      child = null
                    }
                    startElectron()
                  }, 300)
                })
              },
            },
          ],
        }
      : {}),
  }
}

let devURL = ''

function startElectron() {
  if (shuttingDown) return
  child = spawn(electronPath, ['.', ...forwardedArgs()], {
    cwd: root,
    env: { ...process.env, VITE_DEV_SERVER_URL: devURL, NODE_ENV: 'development' },
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    child = null
    if (shuttingDown) return
    if (code === 0) {
      // The user quit the app: stop the dev server with it.
      void shutdown(0)
    }
  })
}

const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) })
await server.listen()
devURL = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5178/'

await esbuild.context(electronOptions(true)).then((context) => context.watch())

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  if (child) {
    child.removeAllListeners('exit')
    child.kill('SIGTERM')
  }
  await server.close()
  process.exit(code)
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
