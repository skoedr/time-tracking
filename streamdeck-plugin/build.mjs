/**
 * Bundles the plugin backend into the .sdPlugin directory.
 *
 * Output is ESM (the SDK is ESM-only); the emitted bin/package.json marks the
 * directory as module scope so the bundled Node runtime loads plugin.js as ESM.
 * ws's optional native accelerators are externalized — they are never installed
 * and ws falls back to its JS implementation at runtime.
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'fs'

const outDir = 'com.timetrack.streamdeck.sdPlugin/bin'

await build({
  entryPoints: ['src/plugin.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: `${outDir}/plugin.js`,
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    // esbuild's ESM output can't synthesize require() for ws's conditional
    // native-addon probing; provide one backed by createRequire.
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
  },
  logLevel: 'info'
})

mkdirSync(outDir, { recursive: true })
writeFileSync(`${outDir}/package.json`, JSON.stringify({ type: 'module' }, null, 2) + '\n')
