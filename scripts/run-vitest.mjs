/**
 * Runs Vitest on the Electron binary in Node mode (`ELECTRON_RUN_AS_NODE=1`).
 *
 * Why this exists (#151): `better-sqlite3` is compiled against the **Electron**
 * ABI by the `postinstall` hook (`electron-builder install-app-deps`), because
 * that is the ABI the app needs at runtime. A system Node cannot load that
 * binary, so every DB-backed suite used to skip itself — locally that meant
 * `334 passed | 201 skipped` next to a green summary, and two bugs reached CI
 * in the v1.15.0 release that a truthful local run would have caught.
 *
 * The repo already answers this conflict once, for the MCP server (see
 * `src/main/mcpLaunch.ts`): don't keep a second Node-ABI copy of the binary —
 * run the consumer on Electron instead. Same V8, same module ABI, no extra
 * artifact, and no rebuild round-trip that would leave `pnpm dev` broken.
 * This script applies the same answer to the test runner.
 *
 * Vitest spawns its workers with `process.execPath` and inherits this
 * environment, so the flag reaches them too. Verified on 2026-07-26:
 * `595 passed | 1 skipped`, identical to CI, with the Electron-ABI binary in
 * place and `pnpm dev` still functional.
 *
 * Depends on Electron's **RunAsNode** fuse staying enabled — the same caveat
 * `src/main/mcpLaunch.ts` documents. The project sets no fuses today.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** Print an actionable error and stop; never fall back to a runtime that lies. */
function fail(lines) {
  console.error(`\n  ${lines.join('\n  ')}\n`)
  process.exit(1)
}

let electronPath
try {
  electronPath = require('electron')
} catch (cause) {
  fail([
    'Cannot run the test suite: the Electron binary is missing.',
    '',
    'Tests run on Electron so that they load the same better-sqlite3 build the',
    'app uses. Reinstall dependencies first:',
    '',
    '    pnpm install',
    '',
    `Underlying error: ${cause?.message ?? cause}`
  ])
}

if (typeof electronPath !== 'string') {
  fail([
    'Cannot run the test suite: `require("electron")` did not return a path.',
    'This script must run under plain Node, not under Electron itself.'
  ])
}

const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

const child = spawn(electronPath, [vitestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

child.on('error', (err) => {
  fail([`Failed to start Electron at ${electronPath}:`, String(err)])
})

child.on('exit', (code, signal) => {
  // A signalled child has no exit code; report failure rather than a silent 0.
  process.exit(signal ? 1 : (code ?? 1))
})
