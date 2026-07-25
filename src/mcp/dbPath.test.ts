/**
 * Unit tests for the Electron-free userData/DB path resolver.
 *
 * The regression these guard: the resolver used to hardcode `TimeTrack` (the
 * electron-builder `productName`), while Electron derives userData from
 * `app.getName()` → `package.json` → `name` = `time-tracking`. The MCP server
 * therefore looked for the DB — and, via socketPath.ts, for the write token —
 * in a directory that never existed on any install.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { appDataDir, resolveDbPath } from './dbPath'
import {
  resolveSocketPath,
  resolveTokenPath,
  SOCK_FILENAME,
  TOKEN_FILENAME,
  WIN_PIPE
} from './socketPath'

const HOME = join('/home', 'robin')

describe('appDataDir', () => {
  it('uses %APPDATA% on Windows', () => {
    expect(appDataDir('win32', { APPDATA: 'C:\\Users\\r\\AppData\\Roaming' }, HOME)).toBe(
      'C:\\Users\\r\\AppData\\Roaming'
    )
  })

  it('falls back to <home>/AppData/Roaming when %APPDATA% is unset', () => {
    expect(appDataDir('win32', {}, HOME)).toBe(join(HOME, 'AppData', 'Roaming'))
  })

  it('uses Application Support on macOS', () => {
    expect(appDataDir('darwin', {}, HOME)).toBe(join(HOME, 'Library', 'Application Support'))
  })

  it('respects XDG_CONFIG_HOME on Linux, else ~/.config', () => {
    expect(appDataDir('linux', { XDG_CONFIG_HOME: '/xdg' }, HOME)).toBe('/xdg')
    expect(appDataDir('linux', {}, HOME)).toBe(join(HOME, '.config'))
  })
})

describe('resolveDbPath', () => {
  it('points at the app-name directory, not the productName one', () => {
    const win = resolveDbPath('win32', { APPDATA: 'C:\\Roaming' }, HOME)
    expect(win).toBe(join('C:\\Roaming', 'time-tracking', 'timetrack.sqlite'))
    expect(win).not.toMatch(/TimeTrack/)
  })

  it('uses the same directory name on macOS and Linux', () => {
    expect(resolveDbPath('darwin', {}, HOME)).toBe(
      join(HOME, 'Library', 'Application Support', 'time-tracking', 'timetrack.sqlite')
    )
    expect(resolveDbPath('linux', {}, HOME)).toBe(
      join(HOME, '.config', 'time-tracking', 'timetrack.sqlite')
    )
  })

  it('matches package.json → name, which is what app.getName() returns', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    // If `productName` is ever added to package.json, Electron prefers it and
    // this resolver must follow — the assertion below fails loudly if so.
    expect(pkg.productName).toBeUndefined()
    expect(resolveDbPath('linux', {}, HOME)).toBe(
      join(HOME, '.config', pkg.name, 'timetrack.sqlite')
    )
  })

  it('honours TIMETRACK_DB_PATH, trimmed', () => {
    expect(resolveDbPath('win32', { TIMETRACK_DB_PATH: '  D:\\custom\\tt.sqlite  ' }, HOME)).toBe(
      'D:\\custom\\tt.sqlite'
    )
  })

  it('ignores a blank TIMETRACK_DB_PATH', () => {
    expect(resolveDbPath('linux', { TIMETRACK_DB_PATH: '   ' }, HOME)).toBe(
      join(HOME, '.config', 'time-tracking', 'timetrack.sqlite')
    )
  })
})

describe('token and socket paths (derived from the DB path)', () => {
  const original = process.env.TIMETRACK_DB_PATH

  afterEach(() => {
    if (original === undefined) delete process.env.TIMETRACK_DB_PATH
    else process.env.TIMETRACK_DB_PATH = original
  })

  it('token lands next to the DB when TIMETRACK_DB_PATH is set', () => {
    const db = join('D:', 'profile', 'timetrack.sqlite')
    process.env.TIMETRACK_DB_PATH = db
    expect(resolveTokenPath()).toBe(join(dirname(db), TOKEN_FILENAME))
  })

  it('token lands in the app-name directory by default', () => {
    delete process.env.TIMETRACK_DB_PATH
    expect(dirname(resolveTokenPath())).toMatch(/time-tracking$/)
  })

  // The socket was broken by the same wrong directory on posix. On Windows the
  // endpoint is a fixed named pipe, so only the posix branch depends on the fix.
  it('socket lands next to the DB on posix', () => {
    const db = join('D:', 'profile', 'timetrack.sqlite')
    process.env.TIMETRACK_DB_PATH = db
    expect(resolveSocketPath('linux')).toBe(join(dirname(db), SOCK_FILENAME))
  })

  it('socket lands in the app-name directory by default on posix', () => {
    delete process.env.TIMETRACK_DB_PATH
    expect(dirname(resolveSocketPath('linux'))).toMatch(/time-tracking$/)
  })

  it('socket is the fixed named pipe on Windows', () => {
    delete process.env.TIMETRACK_DB_PATH
    expect(resolveSocketPath('win32')).toBe(WIN_PIPE)
  })
})
