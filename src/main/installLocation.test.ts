/**
 * #200 — the installer reads one value to tell an upgrade from a fresh
 * install. When it is empty the directory page appears, and a different
 * directory typed there uninstalls the existing installation.
 *
 * What matters in these tests is not that a repair happens, but that it is
 * refused wherever the app cannot be sure: a fabricated record is worse than a
 * missing one, because the installer acts on it.
 */
import { describe, it, expect } from 'vitest'
import {
  appGuid,
  installRegistryKey,
  decideInstallLocation,
  parseRegQueryValue,
  type InstallLocationProbe
} from './installLocation'

const APP_ID = 'com.timetrack.app'
const PER_USER = 'C:\\Users\\robin\\AppData\\Local\\Programs\\TimeTrack'

function probe(p: Partial<InstallLocationProbe> = {}): InstallLocationProbe {
  return { perMachine: null, perUser: null, ...p }
}

describe('the key the installer actually reads', () => {
  it('derives the GUID observed in the registry for this appId', () => {
    // Pinned against the key the running installer used, read off the machine
    // during the #200 investigation. Deriving it rather than pasting it means
    // a change of appId moves the app to the new key; pinning it here means
    // an accidental change to the derivation cannot go unnoticed.
    expect(appGuid(APP_ID)).toBe('a9df9696-6d53-5fe4-ba88-bc4c7ce60e9b')
    expect(installRegistryKey(APP_ID)).toBe('Software\\a9df9696-6d53-5fe4-ba88-bc4c7ce60e9b')
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

describe('deciding whether to repair', () => {
  it('does nothing when the per-user record already matches', () => {
    expect(decideInstallLocation(PER_USER, probe({ perUser: PER_USER }))).toEqual({
      action: 'ok',
      hive: 'HKCU'
    })
  })

  it('does nothing when the per-machine record already matches', () => {
    const dir = 'C:\\Program Files\\TimeTrack'
    expect(decideInstallLocation(dir, probe({ perMachine: dir }))).toEqual({
      action: 'ok',
      hive: 'HKLM'
    })
  })

  it('repairs an absent per-user record — the state that springs the trap', () => {
    expect(decideInstallLocation(PER_USER, probe())).toEqual({
      action: 'repair',
      value: PER_USER
    })
  })

  it('repairs a per-user record left pointing at a previous location', () => {
    // What a relocation leaves behind: the installer rewrote the value to the
    // new place, but a later move or restore put the app back.
    expect(decideInstallLocation(PER_USER, probe({ perUser: 'D:\\Elsewhere\\TimeTrack' }))).toEqual(
      { action: 'repair', value: PER_USER }
    )
  })

  it('treats case, separators and a trailing slash as the same path', () => {
    for (const claim of [
      PER_USER.toUpperCase(),
      PER_USER + '\\',
      PER_USER.replace(/\\/g, '/'),
      `  ${PER_USER}  `
    ]) {
      expect(decideInstallLocation(PER_USER, probe({ perUser: claim })).action).toBe('ok')
    }
  })

  it('refuses when a per-machine record disagrees — it cannot be corrected unelevated', () => {
    // Writing HKCU here would leave the installer reading two records that
    // contradict each other, and it consults both.
    const v = decideInstallLocation(PER_USER, probe({ perMachine: 'C:\\Program Files\\TimeTrack' }))
    expect(v.action).toBe('skip')
    expect(v).toHaveProperty('reason', expect.stringContaining('elevated'))
  })

  it('refuses to invent a per-user record for a per-machine location', () => {
    // Running from Program Files with an empty HKLM value. A per-user record
    // pointing there would misdescribe the installation type to the installer.
    const dir = `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\TimeTrack`
    const v = decideInstallLocation(dir, probe())
    expect(v.action).toBe('skip')
    expect(v).toHaveProperty('reason', expect.stringContaining('per-machine'))
  })

  it('still repairs a per-user location whose name merely resembles one', () => {
    // "…\Programs\…" under LocalAppData is the default per-user target and
    // must not be mistaken for "…\Program Files\…".
    expect(decideInstallLocation(PER_USER, probe()).action).toBe('repair')
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
    const empty = '    InstallLocation    REG_SZ    \r\n'
    expect(parseRegQueryValue(empty, 'InstallLocation')).toBeNull()
  })

  it('does not confuse a different value whose name starts the same', () => {
    const other = '    InstallLocationOld    REG_SZ    D:\\Old\r\n'
    expect(parseRegQueryValue(other, 'InstallLocation')).toBeNull()
  })

  it('reads REG_EXPAND_SZ too', () => {
    const exp = '    InstallLocation    REG_EXPAND_SZ    C:\\Apps\\TimeTrack\r\n'
    expect(parseRegQueryValue(exp, 'InstallLocation')).toBe('C:\\Apps\\TimeTrack')
  })
})

describe('the repair is wired into app start (#200)', () => {
  // Source assertion, same reasoning as the #209 wiring guards: index.ts is
  // the Electron entry point and is not reachable from a test. Without this
  // the whole module is dead code with every test still green.
  it('index.ts calls repairInstallLocation', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8')
    expect(src).toContain('repairInstallLocation(')
    // guarded to packaged Windows builds — in dev the exe is electron.exe in
    // node_modules and there is no installation to describe
    expect(src).toMatch(/isPackaged/)
  })
})
