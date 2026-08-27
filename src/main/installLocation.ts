/**
 * #200 — keep the installer's record of where TimeTrack lives truthful.
 *
 * electron-builder's assisted installer decides whether a run is an upgrade or
 * a fresh install, and which directory it targets, from one value per hive
 * (`assistedInstaller.nsh:111-151`):
 *
 *   HKLM\Software\<APP_GUID>\InstallLocation   (per-machine)
 *   HKCU\Software\<APP_GUID>\InstallLocation   (per-user)
 *
 * If both are empty the run counts as a fresh install and the directory page
 * appears. That page is indistinguishable from an ordinary first-time install,
 * but choosing a different directory there runs the old uninstaller first — so
 * a user who types something else has silently ordered the removal of an
 * installation they never meant to touch. It happened once, on 2026-08-03,
 * during a routine v1.18.0 update.
 *
 * Why the value went missing is not recoverable: the prior state was
 * overwritten twice before anyone looked. This module therefore does not try
 * to address the cause. It makes the app repair the record on every start,
 * which closes the trap whatever emptied it — and, unlike the installer-side
 * options, can be tested without building and running setups.
 *
 * The mode-switch hypothesis (per-user ↔ all-users) stays open; see #200.
 *
 * NOT written here: the uninstall entry under
 * `…\CurrentVersion\Uninstall\<guid>`. electron-builder never puts
 * InstallLocation there, so looking there finds an empty value and draws the
 * wrong conclusion — the trap that cost the original investigation its first
 * hour.
 */
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * The appId the installer derives its registry key from. Must stay in step
 * with `electron-builder.yml` → `appId`; `installLocation.test.ts` reads that
 * file and fails if the two drift, because a mismatch would leave the app
 * diligently repairing a key nothing reads.
 */
export const APP_ID = 'com.timetrack.app'

/**
 * Namespace electron-builder derives APP_GUID with
 * (app-builder-lib/out/targets/nsis/NsisTarget.js:26).
 */
const ELECTRON_BUILDER_NS_UUID = '50e065bc-3134-11e6-9bab-38c9862bdaf3'

/**
 * The GUID electron-builder builds the install key from: a name-based UUID v5
 * over the appId. Derived rather than pasted so it follows a change of appId
 * instead of silently addressing the old key.
 */
export function appGuid(appId: string, namespace: string = ELECTRON_BUILDER_NS_UUID): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(Buffer.from(appId, 'utf8')).digest()
  const b = Buffer.from(hash.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50 // version 5
  b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** `Software\<APP_GUID>` — multiUser.nsh:8. */
export function installRegistryKey(appId: string): string {
  return `Software\\${appGuid(appId)}`
}

/**
 * One hive's answer. `unknown` is not the same as `absent`: a query that timed
 * out or could not run tells us nothing, and treating that as "no record" is
 * exactly how a conservative repair turns into a careless one.
 */
export type RegValue = { state: 'set'; value: string } | { state: 'absent' } | { state: 'unknown' }

export interface InstallLocationProbe {
  perMachine: RegValue
  perUser: RegValue
  /**
   * Does the directory the per-user record names still exist? Only consulted
   * when that record is the thing misdirecting the installer: a path that is
   * gone is litter, a path that still exists may be a second, real
   * installation and is not ours to erase.
   */
  perUserTargetExists: boolean
}

export type InstallLocationVerdict =
  | { action: 'ok'; via: 'per-user' | 'per-machine' }
  | { action: 'repair'; value: string }
  | { action: 'clear-per-user'; stale: string }
  | { action: 'skip'; reason: string }

/** Windows paths: case-insensitive, separator-agnostic, trailing slash is noise. */
function samePath(a: string | null, b: string): boolean {
  if (a === null) return false
  const norm = (p: string): string =>
    p.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

function valueOf(v: RegValue): string | null {
  return v.state === 'set' ? v.value : null
}

/**
 * Per-machine install roots. Compared against the *actual* directory, not
 * against a registry claim, so an empty registry cannot hide the answer.
 */
function looksPerMachine(dir: string): boolean {
  const d = dir.replace(/\//g, '\\').toLowerCase()
  for (const env of ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432']) {
    const root = process.env[env]
    if (root && d.startsWith(root.replace(/\//g, '\\').toLowerCase() + '\\')) return true
  }
  return false
}

/**
 * What the installer would do with this pair of records, modelling
 * `assistedInstaller.nsh:135-151`.
 *
 * The branch that matters is the last one. With **both** records set the
 * installer does not prefer the per-machine one — it falls through to the
 * default, and since `perMachine: false` in electron-builder.yml leaves both
 * `INSTALL_MODE_PER_ALL_USERS` and `INSTALL_MODE_PER_ALL_USERS_DEFAULT`
 * undefined, that default is `setInstallModePerUser`. So a stale per-user
 * record silently overrides a correct per-machine one and becomes the install
 * target. Checking one hive and stopping at the first match would miss that
 * entirely.
 */
export function installerWouldTarget(probe: InstallLocationProbe): {
  mode: 'per-user' | 'per-machine' | 'fresh'
  dir: string | null
} {
  const machine = valueOf(probe.perMachine)
  const user = valueOf(probe.perUser)
  const hasMachine = machine !== null && machine !== ''
  const hasUser = user !== null && user !== ''

  if (hasUser && !hasMachine) return { mode: 'per-user', dir: user }
  if (!hasUser && hasMachine) return { mode: 'per-machine', dir: machine }
  if (hasUser && hasMachine) return { mode: 'per-user', dir: user } // both set → per-user wins
  return { mode: 'fresh', dir: null }
}

/**
 * Pure decision: given where the app actually runs from and what the registry
 * claims, what should happen?
 *
 * Deliberately conservative in both directions where it cannot be sure. The
 * failure this guards against is an installer that deletes the wrong
 * directory, so a wrong repair is worse than no repair.
 */
export function decideInstallLocation(
  actualDir: string,
  probe: InstallLocationProbe
): InstallLocationVerdict {
  // A probe we could not read is not a probe that says "absent". Acting on it
  // would mean repairing while the per-machine state is unknown.
  if (probe.perMachine.state === 'unknown' || probe.perUser.state === 'unknown') {
    return { action: 'skip', reason: 'a registry probe could not be read — state unknown' }
  }

  const target = installerWouldTarget(probe)
  if (target.dir !== null && samePath(target.dir, actualDir)) {
    return { action: 'ok', via: target.mode === 'per-machine' ? 'per-machine' : 'per-user' }
  }

  // The per-machine record is already correct, so it is the per-user record
  // that misdirects the installer. HKCU is ours to remove even unelevated —
  // but only when nothing is there any more.
  const stale = valueOf(probe.perUser)
  if (samePath(valueOf(probe.perMachine), actualDir) && stale !== null) {
    if (probe.perUserTargetExists) {
      return {
        action: 'skip',
        reason: `a per-user record points at "${stale}", which still exists — it may be a second installation and is not ours to erase`
      }
    }
    return { action: 'clear-per-user', stale }
  }

  // Running from a per-machine location without a record that matches. Writing
  // a per-user record here would both misdescribe the installation type and
  // hand the installer a target it cannot write to unelevated.
  if (looksPerMachine(actualDir)) {
    return {
      action: 'skip',
      reason: `installed under a per-machine location ("${actualDir}") — only an elevated process can correct that record`
    }
  }

  // A per-user location. Writing HKCU makes the installer target it, whether
  // the previous per-user record was absent, stale, or overridden by an
  // unrelated leftover per-machine record — per-user wins when both are set.
  return { action: 'repair', value: actualDir }
}

/**
 * Pull one REG_SZ value out of `reg query` output.
 *
 * Values may contain spaces, so everything after the type token is the value.
 */
export function parseRegQueryValue(stdout: string, valueName: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const m = new RegExp(`^\\s*${valueName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.*)$`, 'i').exec(line)
    if (m) {
      const v = m[1].trim()
      return v === '' ? null : v
    }
  }
  return null
}

/**
 * Classify an execFile rejection: `reg query` exits 1 when the key or value is
 * simply not there, which is the state this module exists to repair. Anything
 * else — the binary missing, a timeout, a signal — means the question went
 * unanswered, and that must not be mistaken for an answer of "no".
 */
export function isAbsentError(e: unknown): boolean {
  const err = e as { code?: unknown; killed?: boolean; signal?: unknown }
  if (err?.killed === true || (err?.signal !== undefined && err.signal !== null)) return false
  return err?.code === 1
}

async function readValue(hive: 'HKLM' | 'HKCU', key: string): Promise<RegValue> {
  try {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['query', `${hive}\\${key}`, '/v', 'InstallLocation'],
      { timeout: 15_000, windowsHide: true }
    )
    const v = parseRegQueryValue(stdout, 'InstallLocation')
    return v === null ? { state: 'absent' } : { state: 'set', value: v }
  } catch (e) {
    return isAbsentError(e) ? { state: 'absent' } : { state: 'unknown' }
  }
}

/**
 * Read both hives, decide, and repair when that is safe.
 *
 * `reg.exe` rather than PowerShell on purpose. The registry needs no
 * scripting, and #199 documented a machine where the installer's own
 * PowerShell probe reported "unavailable" while PowerShell worked — execution
 * policy and AppLocker are variables this check does not need to depend on.
 *
 * Best-effort by contract: called from app start, must never keep the app from
 * starting. A verdict it cannot act on is logged rather than swallowed — the
 * whole point is that the silent version of this cost someone an installation.
 *
 * `logger` is required rather than defaulted to `console`. A default here would
 * be a code path no test ever runs, because every test passes a fake — the way
 * three defects once hid behind a fully green suite.
 */
export async function repairInstallLocation(
  actualDir: string,
  appId: string,
  logger: Pick<Console, 'info' | 'warn'>
): Promise<InstallLocationVerdict> {
  const key = installRegistryKey(appId)
  const perMachine = await readValue('HKLM', key)
  const perUser = await readValue('HKCU', key)
  const userTarget = valueOf(perUser)
  const probe: InstallLocationProbe = {
    perMachine,
    perUser,
    perUserTargetExists: userTarget !== null && existsSync(userTarget)
  }
  const verdict = decideInstallLocation(actualDir, probe)

  if (verdict.action === 'skip') {
    logger.warn(`[install-location] not repaired: ${verdict.reason} (#200)`)
    return verdict
  }
  if (verdict.action === 'ok') return verdict

  try {
    if (verdict.action === 'clear-per-user') {
      await execFileAsync('reg.exe', ['delete', `HKCU\\${key}`, '/v', 'InstallLocation', '/f'], {
        timeout: 15_000,
        windowsHide: true
      })
      logger.info(
        `[install-location] removed a stale per-user record ("${verdict.stale}") that would have ` +
          `overridden the correct per-machine one — #200`
      )
    } else {
      await execFileAsync(
        'reg.exe',
        ['add', `HKCU\\${key}`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', verdict.value, '/f'],
        { timeout: 15_000, windowsHide: true }
      )
      logger.info(
        `[install-location] repaired HKCU InstallLocation to "${verdict.value}" ` +
          `(was ${userTarget === null ? 'absent' : `"${userTarget}"`}) — #200`
      )
    }
  } catch (e) {
    logger.warn(`[install-location] could not write HKCU InstallLocation: ${String(e)} (#200)`)
  }
  return verdict
}
