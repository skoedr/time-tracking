/**
 * #200 — the installer reads two values to decide whether a run is an upgrade
 * and which directory it targets. When they are empty the directory page
 * appears, and a different directory typed there uninstalls what is there.
 *
 * What matters in these tests is not that a repair happens, but that it is
 * refused wherever the app cannot be sure: a fabricated or wrongly-deleted
 * record is worse than a missing one, because the installer acts on it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  APP_ID,
  appGuid,
  installRegistryKey,
  installerWouldTarget,
  decideInstallLocation,
  parseRegQueryValue,
  isAbsentError,
  type InstallLocationProbe,
  type RegValue
} from './installLocation'

const PER_USER = 'C:\\Users\\robin\\AppData\\Local\\Programs\\TimeTrack'
const PROGRAM_FILES = 'C:\\Program Files\\TimeTrack'

// looksPerMachine() reads the Windows per-machine roots out of the
// environment. On macOS and Linux those variables simply do not exist, so
// without pinning them the per-machine guard can never fire and the test that
// asserts a refusal quietly asserts nothing — it returns 'repair' instead.
//
// Found the expensive way: the PR gate runs on windows-latest only, so this
// stayed green through review and first failed in the release workflow's macOS
// job, after the tag had been pushed (#217).
beforeEach(() => {
  vi.stubEnv('ProgramFiles', 'C:\\Program Files')
  vi.stubEnv('ProgramFiles(x86)', 'C:\\Program Files (x86)')
  vi.stubEnv('ProgramW6432', 'C:\\Program Files')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

const set = (value: string): RegValue => ({ state: 'set', value })
const absent: RegValue = { state: 'absent' }
const unknown: RegValue = { state: 'unknown' }

function probe(p: Partial<InstallLocationProbe> = {}): InstallLocationProbe {
  return { perMachine: absent, perUser: absent, perUserTargetExists: false, ...p }
}

describe('the key the installer actually reads', () => {
  it('derives the GUID observed in the registry for this appId', () => {
    // Pinned against the key the running installer used, read off the machine
    // during the #200 investigation.
    expect(appGuid(APP_ID)).toBe('a9df9696-6d53-5fe4-ba88-bc4c7ce60e9b')
    expect(installRegistryKey(APP_ID)).toBe('Software\\a9df9696-6d53-5fe4-ba88-bc4c7ce60e9b')
  })

  it('uses the same appId the installer is built with', () => {
    // Deriving the GUID only follows a change of appId if the appId itself is
    // not a second, independent copy. Without this the build config could move
    // and every test would stay green while the app repaired a dead key.
    const yml = readFileSync(join(__dirname, '..', '..', 'electron-builder.yml'), 'utf8')
    const m = /^appId:\s*(\S+)\s*$/m.exec(yml)
    expect(m).not.toBeNull()
    expect(m![1]).toBe(APP_ID)
  })

  it('follows the appId rather than staying on the old key', () => {
    expect(appGuid('com.example.other')).not.toBe(appGuid(APP_ID))
  })

  it('is NOT the uninstall key', () => {
    // electron-builder never writes InstallLocation under
    // …\CurrentVersion\Uninstall\<guid>. Reading there finds an empty value
    // and concludes "no installation" — the wrong turn the original
    // investigation took.
    expect(installRegistryKey(APP_ID)).not.toContain('Uninstall')
    expect(installRegistryKey(APP_ID)).not.toContain('CurrentVersion')
  })
})

describe('what the installer would target', () => {
  it('per-user record alone', () => {
    expect(installerWouldTarget(probe({ perUser: set(PER_USER) }))).toEqual({
      mode: 'per-user',
      dir: PER_USER
    })
  })

  it('per-machine record alone', () => {
    expect(installerWouldTarget(probe({ perMachine: set(PROGRAM_FILES) }))).toEqual({
      mode: 'per-machine',
      dir: PROGRAM_FILES
    })
  })

  it('BOTH set: per-user wins — the case that makes a stale HKCU dangerous', () => {
    // assistedInstaller.nsh:140-151 — with both records set the installer does
    // not prefer the per-machine one, it falls through to the default, and
    // perMachine:false leaves that default per-user.
    expect(
      installerWouldTarget(
        probe({ perMachine: set(PROGRAM_FILES), perUser: set('D:\\Stale\\TimeTrack') })
      )
    ).toEqual({ mode: 'per-user', dir: 'D:\\Stale\\TimeTrack' })
  })

  it('neither set: a fresh install, which is what shows the directory page', () => {
    expect(installerWouldTarget(probe())).toEqual({ mode: 'fresh', dir: null })
  })

  it('an empty string counts as no record — that is how NSIS reads it', () => {
    expect(installerWouldTarget(probe({ perUser: set('') })).mode).toBe('fresh')
  })
})

describe('deciding whether to repair', () => {
  it('does nothing when the per-user record already matches', () => {
    expect(decideInstallLocation(PER_USER, probe({ perUser: set(PER_USER) }))).toEqual({
      action: 'ok',
      via: 'per-user'
    })
  })

  it('does nothing when the per-machine record already matches', () => {
    expect(decideInstallLocation(PROGRAM_FILES, probe({ perMachine: set(PROGRAM_FILES) }))).toEqual(
      { action: 'ok', via: 'per-machine' }
    )
  })

  it('repairs an absent record — the state that springs the trap', () => {
    expect(decideInstallLocation(PER_USER, probe())).toEqual({
      action: 'repair',
      value: PER_USER
    })
  })

  it('repairs a per-user record left pointing at a previous location', () => {
    expect(
      decideInstallLocation(PER_USER, probe({ perUser: set('D:\\Elsewhere\\TimeTrack') }))
    ).toEqual({ action: 'repair', value: PER_USER })
  })

  it('treats case, separators and a trailing slash as the same path', () => {
    for (const claim of [
      PER_USER.toUpperCase(),
      PER_USER + '\\',
      PER_USER.replace(/\\/g, '/'),
      `  ${PER_USER}  `
    ]) {
      expect(decideInstallLocation(PER_USER, probe({ perUser: set(claim) })).action).toBe('ok')
    }
  })

  it('removes a stale per-user record that overrides a correct per-machine one', () => {
    // The dual-record case. HKLM is right, but the installer would still take
    // the per-user path — and that directory is gone, so the record is litter.
    expect(
      decideInstallLocation(
        'D:\\Apps\\TimeTrack',
        probe({
          perMachine: set('D:\\Apps\\TimeTrack'),
          perUser: set('D:\\Gone\\TimeTrack'),
          perUserTargetExists: false
        })
      )
    ).toEqual({ action: 'clear-per-user', stale: 'D:\\Gone\\TimeTrack' })
  })

  it('leaves a stale-looking per-user record alone while its directory exists', () => {
    // It may be a second, genuine installation. Not ours to erase.
    const v = decideInstallLocation(
      'D:\\Apps\\TimeTrack',
      probe({
        perMachine: set('D:\\Apps\\TimeTrack'),
        perUser: set('D:\\Other\\TimeTrack'),
        perUserTargetExists: true
      })
    )
    expect(v.action).toBe('skip')
    expect(v).toHaveProperty('reason', expect.stringContaining('second installation'))
  })

  it('refuses to invent a per-user record for a per-machine location', () => {
    const v = decideInstallLocation(PROGRAM_FILES, probe())
    expect(v.action).toBe('skip')
    expect(v).toHaveProperty('reason', expect.stringContaining('per-machine location'))
  })

  it('still repairs a per-user location whose name merely resembles one', () => {
    // "…\Programs\…" under LocalAppData is the default per-user target and
    // must not be mistaken for "…\Program Files\…".
    expect(decideInstallLocation(PER_USER, probe()).action).toBe('repair')
  })

  it('repairs past an unrelated leftover per-machine record', () => {
    // Per-user wins when both are set, so writing HKCU does make the installer
    // target the right place — no elevation needed.
    expect(
      decideInstallLocation(PER_USER, probe({ perMachine: set('D:\\Old\\TimeTrack') }))
    ).toEqual({ action: 'repair', value: PER_USER })
  })

  it('writes nothing while either probe is unreadable', () => {
    // A query that timed out or could not run says nothing. Treating it as
    // "absent" is how a conservative repair turns into a careless one.
    for (const p of [probe({ perMachine: unknown }), probe({ perUser: unknown })]) {
      const v = decideInstallLocation(PER_USER, p)
      expect(v.action).toBe('skip')
      expect(v).toHaveProperty('reason', expect.stringContaining('unknown'))
    }
  })
})

describe('telling an absent value from an unanswered question', () => {
  it('exit code 1 is absence — reg.exe says that for a missing key or value', () => {
    expect(isAbsentError({ code: 1 })).toBe(true)
  })

  it('a timeout is not absence', () => {
    expect(isAbsentError({ killed: true, signal: 'SIGTERM', code: 1 })).toBe(false)
  })

  it('a missing binary is not absence', () => {
    expect(isAbsentError({ code: 'ENOENT' })).toBe(false)
  })

  it('any other exit code is not absence', () => {
    expect(isAbsentError({ code: 5 })).toBe(false)
  })
})

describe('reading the value back out of reg.exe', () => {
  const out = [
    '',
    'HKEY_CURRENT_USER\\Software\\a9df9696-6d53-5fe4-ba88-bc4c7ce60e9b',
    '    InstallLocation    REG_SZ    C:\\Program Files\\TimeTrack',
    ''
  ].join('\r\n')

  it('reads a path, spaces and all', () => {
    expect(parseRegQueryValue(out, 'InstallLocation')).toBe('C:\\Program Files\\TimeTrack')
  })

  it('returns null when the value is not in the output', () => {
    expect(parseRegQueryValue(out, 'KeepShortcuts')).toBeNull()
  })

  it('treats an empty value as absent — it is what the trap looks like', () => {
    expect(
      parseRegQueryValue('    InstallLocation    REG_SZ    \r\n', 'InstallLocation')
    ).toBeNull()
  })

  it('does not confuse a different value whose name starts the same', () => {
    expect(
      parseRegQueryValue('    InstallLocationOld    REG_SZ    D:\\Old\r\n', 'InstallLocation')
    ).toBeNull()
  })

  it('reads REG_EXPAND_SZ too', () => {
    expect(
      parseRegQueryValue(
        '    InstallLocation    REG_EXPAND_SZ    C:\\Apps\\TT\r\n',
        'InstallLocation'
      )
    ).toBe('C:\\Apps\\TT')
  })
})

describe('the repair is wired into app start (#200)', () => {
  // Source assertion, same reasoning as the #209 wiring guards: index.ts is
  // the Electron entry point and is not reachable from a test. Without it the
  // whole module is dead code with every test still green.
  it('index.ts calls repairInstallLocation behind the packaged-Windows guard', () => {
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8')
    // Guard and call matched TOGETHER on purpose: `isPackaged` appears
    // elsewhere in this file, so asserting it separately would still pass with
    // the safety condition removed from around this call.
    expect(src).toMatch(
      /process\.platform === 'win32' && app\.isPackaged[\s\S]{0,400}?repairInstallLocation\(/
    )
  })

  it('index.ts passes the shared APP_ID rather than a second copy', () => {
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8')
    expect(src).toMatch(/repairInstallLocation\([\s\S]{0,200}?APP_ID/)
  })
})
