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
 *
 * Request semantics (#201): every request carries a fresh `nonce`. A server
 * records the nonce present at startup (usually none) and exits when the nonce
 * it sees CHANGES. This replaces the #198 wall-clock gate (`requestedAt >=
 * startedAt`), which had two failure modes of its own: a backward NTP step
 * between server start and update made running servers ignore the request, and
 * a forward-dated stale file needed a skew clamp to not become a standing kill
 * switch. Under nonce gating a stale file is simply the baseline. `requestedAt`
 * is still written for servers of v1.18 and earlier, which gate on it.
 */
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

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

/** A pending shutdown request, reduced to what gates the decision. */
export interface ShutdownRequest {
  /**
   * Identity of this request — a fresh value on every write. For legacy files
   * without a `nonce` field the raw file content stands in: `requestedAt`
   * changes with every write, so the content still identifies the request.
   */
  nonce: string
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
 * someone else — still alive, so still a holder until identity says otherwise
 * (see releaseHolders).
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
 * Turn the raw `.shutdown` content into a request, or null when it is not one.
 * Strips a UTF-8 BOM before parsing: the installer writes this file with
 * Windows PowerShell's Set-Content -Encoding utf8, which emits one, and
 * JSON.parse throws on a leading U+FEFF — silently turning every request into
 * "no request" (measured 2026-08-03).
 */
export function parseShutdownRequest(raw: string): ShutdownRequest | null {
  const text = raw.replace(/^\uFEFF/, '')
  let parsed: { nonce?: unknown; requestedAt?: unknown }
  try {
    parsed = JSON.parse(text) as { nonce?: unknown; requestedAt?: unknown }
  } catch {
    return null
  }
  if (typeof parsed?.nonce === 'string' && parsed.nonce !== '') {
    return { nonce: parsed.nonce }
  }
  // Legacy writer (≤ v1.18): no nonce field. Only accept what that writer
  // actually produced — a JSON number — so garbage stays "no request".
  // Number(...) would be too lax here: it turns null, false, "" and arrays
  // into finite numbers, and a malformed file appearing after startup would
  // then read as a fresh request and shut servers down.
  if (typeof parsed?.requestedAt === 'number' && Number.isFinite(parsed.requestedAt)) {
    return { nonce: text }
  }
  return null
}

/** Read the pending shutdown request, or null. */
export function pendingShutdownRequest(dir: string): ShutdownRequest | null {
  try {
    return parseShutdownRequest(readFileSync(shutdownPathForDir(dir), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Watch for a shutdown request whose nonce differs from `baselineNonce` — the
 * request that was already on disk when this server started, or null. A stale
 * request never fires (it IS the baseline); any fresh request does, including
 * a re-issued one aimed at servers that respawned mid-update (#201).
 *
 * Polling rather than fs.watch: the request is a single tiny file read every
 * few hundred ms, while fs.watch on Windows needs the directory to exist up
 * front and reports inconsistently across network and virtualised paths. The
 * read is async and never overlaps itself, so a stalling filesystem (userData
 * on a dead SMB share via TIMETRACK_DB_PATH) leaves the event loop — and the
 * MCP protocol on stdio — responsive instead of wedging it every interval.
 * The timer is unref'd, so it never keeps the process alive by itself.
 */
export function watchForShutdown(
  dir: string,
  baselineNonce: string | null,
  onShutdown: () => void,
  intervalMs = 400
): () => void {
  let inFlight = false
  let stopped = false
  const timer = setInterval(() => {
    if (inFlight) return
    inFlight = true
    void readFile(shutdownPathForDir(dir), 'utf8')
      .then((raw) => parseShutdownRequest(raw))
      .catch(() => null)
      .then((req) => {
        inFlight = false
        if (stopped || req === null || req.nonce === baselineNonce) return
        stopped = true
        clearInterval(timer)
        onShutdown()
      })
  }, intervalMs)
  timer.unref?.()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

// ── App side ──────────────────────────────────────────────────────────────

/**
 * One registration file, or null when it is not a usable holder.
 *
 * Shared by readHolders() and pruneDeadHolders() so the two can never disagree
 * about what counts as a holder — a file the reader rejects but the pruner
 * deletes (or vice versa) would be a quiet way to lose a live registration.
 */
function readHolderFile(dir: string, name: string): Holder | null {
  if (!name.endsWith('.json')) return null
  let h: Holder
  try {
    h = JSON.parse(readFileSync(join(holderDirForDir(dir), name), 'utf8')) as Holder
  } catch {
    return null
  }
  // Holder files are plain JSON anyone running as the user can write. A pid
  // of 0 probes the whole process group (always "alive"), negative pids
  // probe process groups too — either would be an immortal holder that
  // blocks every future update. Only accept real, positive pids.
  if (!Number.isInteger(h?.pid) || h.pid <= 0) return null
  // The remaining fields are consumed downstream (sameExecutable, the
  // blocked-message) under their declared types; a damaged file must not
  // turn into a TypeError that aborts the whole release. Normalize instead
  // of rejecting: an empty exe simply never matches an image, so identity
  // verification demotes the entry rather than the update crashing.
  if (typeof h.exe !== 'string') h.exe = ''
  if (typeof h.entry !== 'string') h.entry = ''
  if (typeof h.startedAt !== 'number' || !Number.isFinite(h.startedAt)) h.startedAt = 0
  return h
}

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
    const h = readHolderFile(dir, name)
    if (!h) continue
    if (alive(h.pid)) {
      out.push(h)
    } else {
      unregisterHolder(dir, h.pid)
    }
  }
  return out
}

/**
 * Drop registrations whose process is gone. Returns how many were removed.
 *
 * readHolders() has always pruned as it reads, and unregisterHolder() leans on
 * that ("a stale file is harmless"). The gap #209 closed is that readHolders()
 * is only reached from the update path, and updates are rare next to server
 * starts — so every server that was killed rather than asked to exit (client
 * restart, hard kill, crash) left its file lying there until the next update.
 * Measured before the fix: 65 registrations, 56 of them dead, the oldest three
 * weeks old.
 *
 * Why that is more than untidiness: build/installer.nsh decides whether to run
 * the shutdown handshake at all by COUNTING *.json in this directory, with no
 * liveness check of its own — it runs before the app, so it has none to use.
 * Once a machine had ever run a server that count was permanently non-zero, so
 * the guard that exists to skip the handshake on installs with no MCP
 * integration never fired again, and the wait loop that follows polled for a
 * count of zero it could never reach — burning its full 8-second deadline on
 * every install.
 *
 * Best-effort by contract: callers are startup paths that must not fail
 * because a directory was unreadable.
 */
export function pruneDeadHolders(dir: string, alive: (pid: number) => boolean = isAlive): number {
  let names: string[]
  try {
    names = readdirSync(holderDirForDir(dir))
  } catch {
    return 0
  }
  let removed = 0
  for (const name of names) {
    const h = readHolderFile(dir, name)
    if (!h) continue
    if (!alive(h.pid)) {
      unregisterHolder(dir, h.pid)
      removed++
    }
  }
  return removed
}

/**
 * Ask every running MCP server to exit. Returns the nonce written, so a caller
 * can tell its own request apart from anyone else's.
 */
export function requestShutdown(dir: string, now: number = Date.now()): string {
  const nonce = randomUUID()
  mkdirSync(holderDirForDir(dir), { recursive: true })
  // requestedAt is not read by current servers — it is what servers of v1.18
  // and earlier gate on, and those are exactly the servers a fresh installer
  // has to coordinate with during the first update after this change.
  writeFileSync(shutdownPathForDir(dir), JSON.stringify({ requestedAt: now, nonce }), 'utf8')
  return nonce
}

/**
 * Withdraw a shutdown request. Must run whenever the update does NOT go ahead.
 * Under nonce gating a leftover file no longer kills late-started servers (it
 * becomes their baseline), but leaving it around would still make the NEXT
 * legitimate request look like a re-issue to servers that saw this one.
 */
export function clearShutdown(dir: string): void {
  try {
    rmSync(shutdownPathForDir(dir), { force: true })
  } catch {
    // best effort
  }
}

/**
 * Image paths of the given live processes, or null when the platform offers no
 * way to ask (then the caller must fall back to liveness alone).
 *
 * Map semantics: a pid missing from the map does not exist (anymore); a pid
 * mapped to null exists but its image is unreadable. Registered holders are
 * same-user processes spawned by the user's AI client, and every mechanism
 * below can read those — so "unreadable" means a protected or foreign process
 * that cannot be our server.
 *
 * Windows goes through WMI (one query for all pids) rather than a process
 * handle: WMI answers for elevated processes too, which is exactly the case
 * where `kill(pid, 0)` degrades to EPERM = "alive" and a reused pid would
 * otherwise become a permanent holder (#201).
 */
export async function queryProcessImagePaths(
  pids: number[]
): Promise<Map<number, string | null> | null> {
  if (pids.length === 0) return new Map()
  try {
    if (process.platform === 'win32') return await queryImagesWindows(pids)
    if (process.platform === 'linux') return queryImagesLinux(pids)
    return await queryImagesPosix(pids)
  } catch {
    return null
  }
}

async function queryImagesWindows(pids: number[]): Promise<Map<number, string | null>> {
  // pids come from readHolders, which only accepts positive integers — safe to
  // splice into the WQL filter.
  const filter = pids.map((p) => `ProcessId=${p}`).join(' OR ')
  const script =
    `try { Get-CimInstance Win32_Process -Filter '${filter}' -ErrorAction Stop | ` +
    `ForEach-Object { Write-Output ($_.ProcessId.ToString() + '|' + $_.ExecutablePath) } } ` +
    `catch { exit 1 }`
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 15_000, windowsHide: true }
  )
  const out = new Map<number, string | null>()
  for (const line of stdout.split(/\r?\n/)) {
    const sep = line.indexOf('|')
    if (sep <= 0) continue
    const pid = Number(line.slice(0, sep))
    if (!Number.isInteger(pid) || pid <= 0) continue
    const image = line.slice(sep + 1).trim()
    out.set(pid, image === '' ? null : image)
  }
  return out
}

function queryImagesLinux(pids: number[]): Map<number, string | null> {
  const out = new Map<number, string | null>()
  for (const pid of pids) {
    try {
      out.set(pid, readlinkSync(`/proc/${pid}/exe`))
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      // EACCES/EPERM: exists, but not ours to read → unreadable. Anything
      // else (ENOENT, ESRCH): gone → leave absent.
      if (code === 'EACCES' || code === 'EPERM') out.set(pid, null)
    }
  }
  return out
}

async function queryImagesPosix(pids: number[]): Promise<Map<number, string | null>> {
  // macOS: `comm` is the executable path. `ps -p` exits non-zero when none of
  // the pids exist — execFile throws, the caller falls back to liveness alone.
  const { stdout } = await execFileAsync('ps', ['-p', pids.join(','), '-o', 'pid=,comm='], {
    timeout: 15_000
  })
  const out = new Map<number, string | null>()
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    out.set(Number(m[1]), m[2].trim() || null)
  }
  return out
}

/** Same binary? Windows paths compare case-insensitively. */
export function sameExecutable(a: string, b: string): boolean {
  if (process.platform !== 'win32') return a === b
  const norm = (p: string): string => p.replace(/\//g, '\\').toLowerCase()
  return norm(a) === norm(b)
}

export interface ReleaseOutcome {
  /** True when no holder is left — the installer can replace the binary. */
  ok: boolean
  /** Verified holders present when we started. */
  before: Holder[]
  /** Holders that did not exit within the deadline. */
  remaining: Holder[]
  /**
   * Registrations whose pid is alive but demonstrably not our server — the
   * pid was reused by an unrelated process after a hard kill left the file
   * behind (#201). Pruned from disk; they never block the update.
   */
  stale: Holder[]
  /** Epoch ms the first shutdown request was written, null when none was needed. */
  requestedAt: number | null
}

/**
 * Ask all MCP servers to exit and wait for them, up to `timeoutMs`.
 *
 * Returns without waiting when nothing is registered, so the ordinary update
 * (no MCP integration set up) pays nothing. Liveness of a pid is not identity:
 * before counting anyone, the live process image is compared against the
 * registered `exe`, and mismatches are pruned as stale (#201). While waiting,
 * a client may respawn its server; the respawn read the current nonce at
 * startup and is exempt by design, so the request is re-issued with a fresh
 * nonce whenever a new pid appears — that newcomer gets asked too.
 *
 * The caller decides what to do with a non-empty `remaining` — this function
 * never kills and never proceeds silently, because a half-released install
 * directory is exactly the state that produces "TimeTrack cannot be closed"
 * with no window to close.
 */
export async function releaseHolders(
  dir: string,
  opts: {
    timeoutMs?: number
    pollMs?: number
    /** Minimum time a mid-update newcomer gets to react to its re-issued request. */
    reissueGraceMs?: number
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    alive?: (pid: number) => boolean
    queryImages?: (pids: number[]) => Promise<Map<number, string | null> | null>
  } = {}
): Promise<ReleaseOutcome> {
  const timeoutMs = opts.timeoutMs ?? 5000
  const pollMs = opts.pollMs ?? 200
  const reissueGraceMs = opts.reissueGraceMs ?? 2000
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const alive = opts.alive ?? isAlive
  const queryImages = opts.queryImages ?? queryProcessImagePaths

  const found = readHolders(dir, alive)
  if (found.length === 0)
    return { ok: true, before: [], remaining: [], stale: [], requestedAt: null }

  const images = await queryImages(found.map((h) => h.pid))
  const before: Holder[] = []
  const stale: Holder[] = []
  for (const h of found) {
    if (images === null) {
      // No way to verify on this platform/run — count it, as before #201.
      before.push(h)
      continue
    }
    const image = images.get(h.pid)
    if (image === undefined) {
      // Gone between the liveness probe and the image query — just dead.
      unregisterHolder(dir, h.pid)
      continue
    }
    if (image === null || !sameExecutable(image, h.exe)) {
      stale.push(h)
      unregisterHolder(dir, h.pid)
      continue
    }
    before.push(h)
  }
  if (before.length === 0) return { ok: true, before, remaining: [], stale, requestedAt: null }

  const requestedAt = now()
  requestShutdown(dir, requestedAt)
  const asked = new Set(before.map((h) => h.pid))
  // A newcomer observed near the deadline still deserves a chance to see its
  // re-issued nonce — its watcher polls every 400 ms, and a request written on
  // the final poll would otherwise be cleared before anyone could read it.
  // Each re-issue therefore guarantees reissueGraceMs of runway, under a hard
  // cap so an endlessly respawning client cannot pin the updater forever.
  const hardCap = requestedAt + timeoutMs * 2
  let deadline = requestedAt + timeoutMs
  let remaining = readHolders(dir, alive)
  while (remaining.length > 0 && now() < deadline) {
    await sleep(pollMs)
    remaining = readHolders(dir, alive)
    const fresh = remaining.filter((h) => !asked.has(h.pid))
    if (fresh.length > 0) {
      requestShutdown(dir, now())
      for (const h of fresh) asked.add(h.pid)
      deadline = Math.min(Math.max(deadline, now() + reissueGraceMs), hardCap)
    }
  }
  if (remaining.length > 0) clearShutdown(dir)
  return { ok: remaining.length === 0, before, remaining, stale, requestedAt }
}
