/**
 * Runs the MCP server from a dev checkout.
 *
 * `better-sqlite3` here is compiled against the Electron ABI (postinstall runs
 * `electron-builder install-app-deps`), so a system Node cannot load it. We
 * therefore run the server on Electron's own binary in Node mode — the same
 * thing a packaged install does with `TimeTrack.exe`, so dev and production
 * exercise the identical launch path.
 *
 * Setting `ELECTRON_RUN_AS_NODE` inline is not portable across cmd.exe and
 * POSIX shells, hence this wrapper instead of a shell one-liner.
 */
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = join(repoRoot, 'out', 'mcp', 'mcp', 'server.js')

if (!existsSync(serverEntry)) {
  console.error(`MCP server not built: ${serverEntry}\nRun "pnpm build:mcp" first.`)
  process.exit(1)
}

// Outside an Electron runtime the `electron` package exports the path to its
// binary as a string.
const electronBinary = require('electron')
if (typeof electronBinary !== 'string') {
  console.error('Could not resolve the Electron binary from the "electron" package.')
  process.exit(1)
}

const child = spawn(electronBinary, [serverEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
