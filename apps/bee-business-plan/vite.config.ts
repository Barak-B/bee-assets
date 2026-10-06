import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The canonical prompt lives in <repo>/prompts and is imported with `?raw`,
// so the dev server must be allowed to read two levels up.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
