/**
 * MCP write bridge (Electron side).
 *
 * Hosts a local IPC endpoint (named pipe on Windows, unix socket elsewhere)
 * that the standalone MCP server connects to for WRITE operations. Every
 * request is authenticated by a token and runs through the guarded
 * `handleRequest` core, which executes mutations via the shared entry-mutation
 * functions against the live main-process DB handle. Reads never touch this —
 * they go directly against the read-only SQLite connection in the MCP process.
 *
 * Lifecycle: started in `whenReady` (and on the write-enable toggle) only on
 * the primary instance; torn down on `will-quit` / disable. See index.ts.
 */
import net from 'net'
import { existsSync, unlinkSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { randomBytes } from 'crypto'
import { app, dialog, type BrowserWindow } from 'electron'
import log from 'electron-log/main'
import type Database from 'better-sqlite3'
import { createBackup } from './backup'
import { auditWrite } from './mcpAudit'
import { handleRequest, type BridgeCtx, type BridgeRequest } from './mcpBridgeCore'
import { socketPathForDir, tokenPathForDir } from '../mcp/socketPath'

export interface BridgeDeps {
  getDb: () => Database.Database
  refreshTray: () => void
  broadcast: (channel: string, payload?: unknown) => void
  getMainWindow: () => BrowserWindow | null
  getSetting: (key: string) => string | undefined
}

let server: net.Server | null = null
let deps: BridgeDeps | null = null
let sessionApproved = false
let backupDone = false

function tokenPath(): string {
  return tokenPathForDir(app.getPath('userData'))
}
function sockPath(): string {
  return socketPathForDir(app.getPath('userData'))
}

/** Generate + persist a fresh write token (mode 0600). Returns it. */
export function generateWriteToken(): string {
  const token = randomBytes(32).toString('hex')
  writeFileSync(tokenPath(), token, { mode: 0o600 })
  try {
    chmodSync(tokenPath(), 0o600)
  } catch {
    // chmod is a no-op / unsupported on Windows — the token still isn't shared.
  }
  return token
}

/** Ensure a token exists (used on startup when write mode is already on). */
export function ensureWriteToken(): void {
  if (!existsSync(tokenPath())) generateWriteToken()
}

/** Delete the token file (on disable). */
export function clearWriteToken(): void {
  try {
    if (existsSync(tokenPath())) unlinkSync(tokenPath())
  } catch {
    // ignore
  }
}

function readToken(): string | null {
  try {
    return existsSync(tokenPath()) ? readFileSync(tokenPath(), 'utf8').trim() : null
  } catch {
    return null
  }
}

function confirmMode(): 'per-write' | 'session' | 'silent' {
  const v = deps?.getSetting('mcp_write_confirm_mode')
  return v === 'silent' || v === 'session' ? v : 'per-write'
}

/** Native confirm honouring per-write / session / silent + "remember". */
async function confirm(summary: string): Promise<boolean> {
  const mode = confirmMode()
  if (mode === 'silent') return true
  if (mode === 'session' && sessionApproved) return true

  const win = deps?.getMainWindow() ?? null
  if (win) {
    if (!win.isVisible()) win.show()
    win.focus()
  }
  const opts: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: ['Ablehnen', 'Erlauben'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
    title: 'TimeTrack — MCP-Schreibzugriff',
    message: 'Claude möchte eine Änderung in TimeTrack vornehmen:',
    detail: summary,
    checkboxLabel: 'Für diese Session merken (nicht mehr fragen)',
    checkboxChecked: false
  }
  const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  const approved = res.response === 1
  if (approved && (mode === 'session' || res.checkboxChecked)) sessionApproved = true
  return approved
}

async function ensureBackup(): Promise<void> {
  if (backupDone) return
  backupDone = true // set first so concurrent requests don't double-snapshot
  try {
    await createBackup(deps!.getDb(), 'mcp')
  } catch (e) {
    log.warn('[mcp-bridge] pre-write backup failed', e)
  }
}

function buildCtx(): BridgeCtx {
  return {
    db: deps!.getDb(),
    token: readToken(),
    isWriteEnabled: () => deps!.getSetting('mcp_write_enabled') === '1',
    confirm,
    ensureBackup,
    audit: auditWrite,
    onChange: () => {
      deps!.broadcast('data:changed')
      deps!.refreshTray()
    }
  }
}

function onConnection(conn: net.Socket): void {
  let buf = ''
  // Serialise requests on a connection so modal confirm dialogs don't stack.
  let chain: Promise<void> = Promise.resolve()

  conn.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      chain = chain.then(() => processLine(line, conn))
    }
  })
  conn.on('error', () => {
    /* client went away — nothing to do */
  })
}

async function processLine(line: string, conn: net.Socket): Promise<void> {
  let req: BridgeRequest
  try {
    req = JSON.parse(line)
  } catch {
    writeLine(conn, { ok: false, error: 'Ungültiges JSON', code: 'invalid' })
    return
  }
  try {
    const res = await handleRequest(buildCtx(), req)
    writeLine(conn, res)
  } catch (e) {
    log.error('[mcp-bridge] request failed', e)
    writeLine(conn, { ok: false, error: String(e), code: 'invalid' })
  }
}

function writeLine(conn: net.Socket, obj: unknown): void {
  try {
    conn.write(JSON.stringify(obj) + '\n')
  } catch {
    // socket closed mid-flight
  }
}

/** Start the bridge. Idempotent. Call only on the primary instance. */
export function startMcpBridge(d: BridgeDeps): void {
  if (server) return
  deps = d
  sessionApproved = false
  backupDone = false
  ensureWriteToken()

  const p = sockPath()
  if (process.platform !== 'win32' && existsSync(p)) {
    try {
      unlinkSync(p)
    } catch {
      // stale socket removal best-effort
    }
  }
  const srv = net.createServer(onConnection)
  srv.on('error', (e) => {
    log.error('[mcp-bridge] server error', e)
    server = null
  })
  srv.listen(p, () => log.info('[mcp-bridge] write bridge listening on', p))
  server = srv
}

/** Stop the bridge and clean up the socket file. Idempotent. */
export function stopMcpBridge(): void {
  if (server) {
    try {
      server.close()
    } catch {
      // ignore
    }
    server = null
  }
  if (process.platform !== 'win32') {
    const p = sockPath()
    if (existsSync(p)) {
      try {
        unlinkSync(p)
      } catch {
        // ignore
      }
    }
  }
}
