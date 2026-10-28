import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'
import { build } from 'vite'

/**
 * The production build: the window through Vite, the two Electron entry
 * points through esbuild. Everything the main process imports is bundled, so
 * the packaged application has no runtime node_modules.
 */

rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true })
rmSync(fileURLToPath(new URL('../dist-electron', import.meta.url)), { recursive: true, force: true })

await build({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) })

await esbuild.build({
  entryPoints: [
    fileURLToPath(new URL('../electron/main.ts', import.meta.url)),
    fileURLToPath(new URL('../electron/preload.ts', import.meta.url)),
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outdir: fileURLToPath(new URL('../dist-electron', import.meta.url)),
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  alias: {
    '@monet/core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
  },
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
})

process.stdout.write('built dist and dist-electron\n')
