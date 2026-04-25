#!/usr/bin/env node
/**
 * v1.5 PR B — local update server for testing electron-updater in dev.
 *
 * Usage:
 *   1. Build a real installer with a higher version, e.g. 1.99.0:
 *        # bump package.json to 1.99.0
 *        pnpm build:win
 *   2. Copy `dist/TimeTrack-Setup-1.99.0.exe` and `dist/latest.yml`
 *      into `scripts/.update-fixtures/`.
 *   3. Run this script:
 *        node scripts/test-updater.mjs
 *   4. Create `build/dev-app-update.yml` (gitignored) with:
 *        provider: generic
 *        url: http://localhost:8788
 *   5. Start the app in dev (`pnpm dev`) — it should detect the update.
 *
 * The server logs every request so you can verify the updater client is
 * polling the expected paths (`latest.yml`, `*.exe`, `*.blockmap`).
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '.update-fixtures')
const PORT = Number(process.env.UPDATE_PORT ?? 8788)

const MIME = {
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream'
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    const safe = basename(url.pathname) // strip path traversal
    const file = join(ROOT, safe)
    const info = await stat(file)
    const ext = safe.slice(safe.lastIndexOf('.'))
    const data = await readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store'
    })
    res.end(data)
    console.log(`[200] ${req.method} ${url.pathname} (${info.size} bytes)`)
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
    console.log(`[404] ${req.method} ${req.url} — ${err instanceof Error ? err.message : err}`)
  }
})

server.listen(PORT, () => {
  console.log(`Update fixtures server listening on http://localhost:${PORT}`)
  console.log(`Serving from: ${ROOT}`)
})
