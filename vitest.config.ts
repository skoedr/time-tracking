import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    // CI Windows runners spend several seconds on the first better-sqlite3
    // call (cold cache + native module). 60s provides headroom for the
    // migration-backfill tests that need ~36s on slow CI runners.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts']
        }
      }
    ]
  }
})
