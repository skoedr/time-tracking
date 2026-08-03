/**
 * Holder registry and cooperative shutdown for the bundled MCP server (#198).
 *
 * A running MCP server executes the *installed app binary* in Node mode, so it
 * holds `TimeTrack.exe` (and the asar next to it) open for as long as its AI
 * client keeps it alive. While that is true the Windows installer cannot
 * replace those files. The app therefore has to get them out of the way before
 * it hands over to the installer — but it has no handle on processes it never
 * spawned (the client owns them, see mcpLaunch.ts).
 *
 * This module is that handle. It is deliberately built on plain files rather
 * than the write bridge: the bridge only listens while write access is enabled
 * (mcpBridge.ts → startMcpBridge), which is opt-in and off by default, so a
 * read-only user — the common case — would have no channel at all.
 *
 *   <userData>/mcp-holders/<pid>.json   one file per live server, self-removed
 *   <userData>/mcp-holders/.shutdown    request written by the app
 *
 * Both sides anchor on the same userData directory the DB lives in, exactly as
 * socketPath.ts does, so a custom TIMETRACK_DB_PATH keeps them together.
 *
 * Why cooperative and not a kill: whoever kills a client-owned process is in a
 * race with the client that may restart it, and the killed server looks like a
 * crash. Asking it to exit cleanly costs nothing and loses no data — reads are
 * a read-only SQLite connection, writes are already forwarded to the app.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Directory holding one file per live MCP server, plus the shutdown request. */
export const HOLDER_DIRNAME = 'mcp-holders'
/** Shutdown request file, inside the holder directory. */
export const SHUTDOWN_FILENAME = '.shutdown'

/** A registered MCP server process. */
export interface Holder {
  /** OS process id. */
  pid: number
  /** Binary the server runs — the installed app binary in a packaged install. */
  exe: string
  /** Server entry point it was started with. */
  entry: string
  /** Epoch ms the server registered itself. */
  startedAt: number
}

export function holderDirForDir(dir: string): string {
  return join(dir, HOLDER_DIRNAME)
}

export function shutdownPathForDir(dir: string): string {
  return join(holderDirForDir(dir), SHUTDOWN_FILENAME)
}

function holderFile(dir: string, pid: number): string {
  return join(holderDirForDir(dir), `${pid}.json`)
}

/**
 * Is this pid still alive? `kill(pid, 0)` only probes, it signals nothing, and
 * it works on Windows too. EPERM means the process exists but belongs to
 * someone else — still alive, so still a holder.
 */
export function isAlive(pid: number, kill: (p: number, s: number) => void = process.kill): boolean {
  try {
    kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// ── MCP-server side ───────────────────────────────────────────────────────

/** Announce this process as a holder. Best-effort: never fail the server. */
export function registerHolder(dir: string, holder: Holder): boolean {
  try {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(holderFile(dir, holder.pid), JSON.stringify(holder), 'utf8')
    return true
  } catch {
    return false
  }
}

/** Withdraw this process. Best-effort — a leftover file is filtered by liveness. */
export function unregisterHolder(dir: string, pid: number): void {
  try {
    rmSync(holderFile(dir, pid), { force: true })
  } catch {
    // a stale file is harmless: readHolders() drops dead pids
  }
}

/**
 * Read a pending shutdown request, or null. A request only applies to servers
 * that were already running when it was written — otherwise a server started
 * while the file still lies around would exit immediately.
 */
export function pendingShutdownAt(dir: string): number | null {
  try {
    // Strip a UTF-8 BOM before parsing. The installer writes this file with
    // Windows PowerShell's Set-Content -Encoding utf8, which emits one, and
    // JSON.parse throws on a leading U+FEFF — silently turning every request
    // into "no request" (measured 2026-08-03).
    const raw = readFileSync(shutdownPathForDir(dir), 'utf8').replace(/^\uFEFF/, '')
    const at = Number(JSON.parse(raw).requestedAt)
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

/**
 * Watch for a shutdown request and invoke `onShutdown` once one applies to a
 * server that started at `startedAt`.
 *
 * Polling rather than fs.watch: the request is a single tiny file read every
 * few hundred ms, while fs.watch on Windows needs the directory to exist up
 * front and reports inconsistently across network and virtualised paths. The
 * timer is unref'd, so it never keeps the process alive by itself.
 */
export function watchForShutdown(
  dir: string,
  startedAt: number,
  onShutdown: () => void,
  intervalMs = 400
): () => void {
  const timer = setInterval(() => {
    const at = pendingShutdownAt(dir)
    if (at !== null && at >= startedAt) {
      clearInterval(timer)
      onShutdown()
    }
  }, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

// ── App side ──────────────────────────────────────────────────────────────

/** Live holders, dead registrations pruned from disk as we go. */
export function readHolders(dir: string, alive: (pid: number) => boolean = isAlive): Holder[] {
  let names: string[]
  try {
    names = readdirSync(holderDirForDir(dir))
  } catch {
    return []
  }
  const out: Holder[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    let h: Holder
    try {
      h = JSON.parse(readFileSync(join(holderDirForDir(dir), name), 'utf8')) as Holder
    } catch {
      continue
    }
    if (typeof h?.pid !== 'number') continue
    if (alive(h.pid)) {
      out.push(h)
    } else {
      unregisterHolder(dir, h.pid)
    }
  }
  return out
}

/** Ask every running MCP server to exit. */
export function requestShutdown(dir: string, now = Date.now()): void {
  mkdirSync(holderDirForDir(dir), { recursive: true })
  writeFileSync(shutdownPathForDir(dir), JSON.stringify({ requestedAt: now }), 'utf8')
}

/**
 * Withdraw a shutdown request. Must run whenever the update does NOT go ahead,
 * otherwise every MCP server started afterwards would exit on sight.
 */
export function clearShutdown(dir: string): void {
  try {
    rmSync(shutdownPathForDir(dir), { force: true })
  } catch {
    // best effort
  }
}

export interface ReleaseOutcome {
  /** True when no holder is left — the installer can replace the binary. */
  ok: boolean
  /** Holders present when we started. */
  before: Holder[]
  /** Holders that did not exit within the deadline. */
  remaining: Holder[]
}

/**
 * Ask all MCP servers to exit and wait for them, up to `timeoutMs`.
 *
 * Returns without waiting when nothing is registered, so the ordinary update
 * (no MCP integration set up) pays nothing. The caller decides what to do with
 * a non-empty `remaining` — this function never kills and never proceeds
 * silently, because a half-released install directory is exactly the state
 * that produces "TimeTrack cannot be closed" with no window to close.
 */
export async function releaseHolders(
  dir: string,
  opts: {
    timeoutMs?: number
    pollMs?: number
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    alive?: (pid: number) => boolean
  } = {}
): Promise<ReleaseOutcome> {
  const timeoutMs = opts.timeoutMs ?? 5000
  const pollMs = opts.pollMs ?? 200
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const alive = opts.alive ?? isAlive

  const before = readHolders(dir, alive)
  if (before.length === 0) return { ok: true, before, remaining: [] }

  requestShutdown(dir, now())
  const deadline = now() + timeoutMs
  let remaining = readHolders(dir, alive)
  while (remaining.length > 0 && now() < deadline) {
    await sleep(pollMs)
    remaining = readHolders(dir, alive)
  }
  if (remaining.length > 0) clearShutdown(dir)
  return { ok: remaining.length === 0, before, remaining }
}
