/**
 * Client for the TimeTrack write bridge (MCP-server side).
 *
 * Connects to the local socket / named pipe hosted by the running Electron
 * app, authenticates with the token file, sends one line-delimited JSON
 * request and resolves the single JSON response. The MCP process never writes
 * to the DB itself — all mutations go through the app's validated handlers.
 */
import net from 'net'
import { existsSync, readFileSync } from 'fs'
import { resolveSocketPath, resolveTokenPath } from './socketPath'

export interface WriteResult {
  ok: boolean
  data?: unknown
  error?: string
  code?: string
}

const UNAVAILABLE =
  'TimeTrack läuft nicht oder der Schreibzugriff ist deaktiviert (Einstellungen → Integrationen).'

// Generous ceiling: a "per-write" confirmation waits on the user in the app.
const RESPONSE_DEADLINE_MS = 5 * 60 * 1000

export function sendWrite(
  op: string,
  args: Record<string, unknown>,
  preview: boolean
): Promise<WriteResult> {
  return new Promise((resolve) => {
    const tokenFile = resolveTokenPath()
    if (!existsSync(tokenFile)) {
      resolve({ ok: false, error: UNAVAILABLE, code: 'unavailable' })
      return
    }
    let token: string
    try {
      token = readFileSync(tokenFile, 'utf8').trim()
    } catch {
      resolve({ ok: false, error: UNAVAILABLE, code: 'unavailable' })
      return
    }

    let buf = ''
    let done = false
    const conn = net.createConnection(resolveSocketPath())
    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: 'Zeitüberschreitung bei der Verbindung zu TimeTrack.',
        code: 'timeout'
      })
    }, RESPONSE_DEADLINE_MS)

    function finish(r: WriteResult): void {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        conn.destroy()
      } catch {
        // ignore
      }
      resolve(r)
    }

    conn.on('connect', () => {
      conn.write(JSON.stringify({ v: 1, token, op, args, preview }) + '\n')
    })
    conn.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const idx = buf.indexOf('\n')
      if (idx >= 0) {
        try {
          finish(JSON.parse(buf.slice(0, idx)) as WriteResult)
        } catch {
          finish({ ok: false, error: 'Ungültige Antwort von TimeTrack.' })
        }
      }
    })
    conn.on('error', () => finish({ ok: false, error: UNAVAILABLE, code: 'unavailable' }))
  })
}
