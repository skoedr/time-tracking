/**
 * #200 — keep the installer's record of where TimeTrack lives truthful.
 *
 * electron-builder's assisted installer decides whether a run is an upgrade or
 * a fresh install by reading one value (assistedInstaller.nsh:111-119):
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
 * Why the value went missing in the first place is not recoverable: the prior
 * state was overwritten twice before anyone looked. This module therefore does
 * not try to address the cause. It makes the app repair the record on every
 * start, which closes the trap whatever emptied it — and, unlike the
 * installer-side options, can be tested without building and running setups.
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
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Namespace electron-builder derives APP_GUID with
 * (app-builder-lib/out/targets/nsis/NsisTarget.js:26).
 */
const ELECTRON_BUILDER_NS_UUID = '50e065bc-3134-11e6-9bab-38c9862bdaf3'

/**
 * The GUID electron-builder builds the install key from: a name-based UUID v5
 * over the appId. Derived rather than pasted so it follows a change of appId
 * instead of silently addressing the old key — `installLocation.test.ts` pins
 * the result for the current appId against the value observed in the registry.
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

/** What the two hives currently claim. `null` = no such value. */
export interface InstallLocationProbe {
  perMachine: string | null
  perUser: string | null
}

export type InstallLocationVerdict =
  | { action: 'ok'; hive: 'HKLM' | 'HKCU' }
  | { action: 'repair'; value: string }
  | { action: 'skip'; reason: string }

/** Windows paths: case-insensitive, separator-agnostic, trailing slash is noise. */
function samePath(a: string | null, b: string): boolean {
  if (a === null) return false
  const norm = (p: string): string =>
    p.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return norm(a) === norm(b)
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
 * Pure decision: given where the app actually runs from and what the registry
 * claims, what should happen?
 *
 * Deliberately conservative in both directions where it cannot be sure. The
 * failure this guards against is an installer that deletes the wrong directory,
 * so a wrong repair is worse than no repair: a fabricated per-user record
 * pointing at a per-machine path would tell the next installer that a per-user
 * installation exists where one does not.
 */
export function decideInstallLocation(
  actualDir: string,
  probe: InstallLocationProbe
): InstallLocationVerdict {
  if (samePath(probe.perMachine, actualDir)) return { action: 'ok', hive: 'HKLM' }
  if (samePath(probe.perUser, actualDir)) return { action: 'ok', hive: 'HKCU' }

  // A per-machine record exists and points somewhere else. Only an elevated
  // process may correct it, and adding a per-user record alongside would leave
  // the installer reading two records that disagree — it consults both.
  if (probe.perMachine !== null) {
    return {
      action: 'skip',
      reason: `per-machine record points at "${probe.perMachine}" — only an elevated process can correct it`
    }
  }

  // Running from a per-machine location with no per-machine record. Writing a
  // per-user record here would misdescribe the installation type.
  if (looksPerMachine(actualDir)) {
    return {
      action: 'skip',
      reason: `installed under a per-machine location ("${actualDir}") but no per-machine record exists — an elevated process has to write it`
    }
  }

  return { action: 'repair', value: actualDir }
}

/**
 * Pull one REG_SZ value out of `reg query` output.
 *
 * Values may contain spaces, so everything after the type token is the value.
 * `reg query` exits non-zero when the key or value is absent, which the caller
 * turns into `null`; this parser only ever sees a successful query.
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

async function readValue(hive: 'HKLM' | 'HKCU', key: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['query', `${hive}\\${key}`, '/v', 'InstallLocation'],
      { timeout: 15_000, windowsHide: true }
    )
    return parseRegQueryValue(stdout, 'InstallLocation')
  } catch {
    // Absent key or value — reg.exe exits 1. Not an error worth reporting:
    // "no record" is exactly the state this module exists to repair.
    return null
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
  const probe: InstallLocationProbe = {
    perMachine: await readValue('HKLM', key),
    perUser: await readValue('HKCU', key)
  }
  const verdict = decideInstallLocation(actualDir, probe)

  if (verdict.action === 'skip') {
    logger.warn(`[install-location] not repaired: ${verdict.reason} (#200)`)
    return verdict
  }
  if (verdict.action === 'ok') return verdict

  try {
    await execFileAsync(
      'reg.exe',
      ['add', `HKCU\\${key}`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', verdict.value, '/f'],
      { timeout: 15_000, windowsHide: true }
    )
    logger.info(
      `[install-location] repaired HKCU InstallLocation to "${verdict.value}" ` +
        `(was ${probe.perUser === null ? 'absent' : `"${probe.perUser}"`}) — #200`
    )
  } catch (e) {
    logger.warn(`[install-location] could not write HKCU InstallLocation: ${String(e)} (#200)`)
  }
  return verdict
}
