import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@monet/core/browser': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
      '@monet/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5178,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome130',
  },
})
