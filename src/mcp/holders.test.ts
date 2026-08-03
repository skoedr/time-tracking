/**
 * #198 — holder registry and cooperative shutdown.
 *
 * The behaviour that matters is the refusal: releaseHolders() must report
 * failure while anything still holds the install directory, because the caller
 * hands over to an installer that would otherwise fail with a message telling
 * the user to close a window that does not exist.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  holderDirForDir,
  shutdownPathForDir,
  isAlive,
  registerHolder,
  unregisterHolder,
  pendingShutdownAt,
  watchForShutdown,
  readHolders,
  requestShutdown,
  clearShutdown,
  releaseHolders,
  type Holder
} from './holders'

let dir: string

function holder(pid: number, startedAt = 1000): Holder {
  return { pid, exe: 'C:\\App\\TimeTrack.exe', entry: 'C:\\App\\server.js', startedAt }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tt-holders-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('registry', () => {
  it('registers and reads back a holder', () => {
    expect(registerHolder(dir, holder(4242))).toBe(true)
    const found = readHolders(dir, () => true)
    expect(found).toHaveLength(1)
    expect(found[0].pid).toBe(4242)
    expect(found[0].exe).toContain('TimeTrack.exe')
  })

  it('unregisters', () => {
    registerHolder(dir, holder(4242))
    unregisterHolder(dir, 4242)
    expect(readHolders(dir, () => true)).toHaveLength(0)
  })

  it('drops dead pids and prunes their files from disk', () => {
    registerHolder(dir, holder(1))
    registerHolder(dir, holder(2))
    const found = readHolders(dir, (pid) => pid === 2)
    expect(found.map((h) => h.pid)).toEqual([2])
    // the dead registration is gone, not just filtered out of the result
    expect(readdirSync(holderDirForDir(dir)).filter((n) => n.endsWith('.json'))).toEqual(['2.json'])
  })

  it('survives a corrupt registration file', () => {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(join(holderDirForDir(dir), '7.json'), 'not json at all', 'utf8')
    registerHolder(dir, holder(8))
    expect(readHolders(dir, () => true).map((h) => h.pid)).toEqual([8])
  })

  it('returns nothing when the directory was never created', () => {
    expect(readHolders(join(dir, 'nope'), () => true)).toEqual([])
  })

  it('isAlive treats EPERM as alive — a foreign-owned process still holds the file', () => {
    expect(
      isAlive(1, () => {
        const e = new Error('perm') as NodeJS.ErrnoException
        e.code = 'EPERM'
        throw e
      })
    ).toBe(true)
    expect(
      isAlive(1, () => {
        const e = new Error('gone') as NodeJS.ErrnoException
        e.code = 'ESRCH'
        throw e
      })
    ).toBe(false)
    expect(isAlive(1, () => undefined)).toBe(true)
  })

  it('isAlive against the real process.kill — the default every caller takes', () => {
    expect(isAlive(process.pid)).toBe(true)
    // above the pid ceiling on Windows and Linux, so it cannot be in use
    expect(isAlive(0x7ffffff0)).toBe(false)
  })
})

describe('shutdown request', () => {
  it('is readable once written and gone once cleared', () => {
    expect(pendingShutdownAt(dir)).toBeNull()
    requestShutdown(dir, 5000)
    expect(pendingShutdownAt(dir)).toBe(5000)
    clearShutdown(dir)
    expect(pendingShutdownAt(dir)).toBeNull()
  })

  it('reads a request written with a UTF-8 BOM — the installer writes one', () => {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(shutdownPathForDir(dir), '\uFEFF{"requestedAt":7000}', 'utf8')
    expect(pendingShutdownAt(dir)).toBe(7000)
  })

  it('ignores a request that is not JSON at all', () => {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(shutdownPathForDir(dir), 'garbage', 'utf8')
    expect(pendingShutdownAt(dir)).toBeNull()
  })

  it('only applies to servers that were already running', async () => {
    requestShutdown(dir, 5000)
    const fired: string[] = []
    // started before the request — must exit
    const stopOld = watchForShutdown(dir, 4000, () => fired.push('old'), 5)
    // started after the request — must NOT exit, or every server launched
    // during a cancelled update would die on sight
    const stopNew = watchForShutdown(dir, 6000, () => fired.push('new'), 5)
    await new Promise((r) => setTimeout(r, 60))
    stopOld()
    stopNew()
    expect(fired).toEqual(['old'])
  })

  it('stops watching once it has fired', async () => {
    requestShutdown(dir, 5000)
    let n = 0
    const stop = watchForShutdown(dir, 1000, () => n++, 5)
    await new Promise((r) => setTimeout(r, 60))
    stop()
    expect(n).toBe(1)
  })
})

describe('releaseHolders', () => {
  const noSleep = (): Promise<void> => Promise.resolve()
  // The pids below are fictional, so liveness has to be supplied — otherwise
  // every holder reads as dead and the refusal we care about never happens.
  const allAlive = (): boolean => true

  it('does nothing and costs nothing when no MCP server is registered', async () => {
    const r = await releaseHolders(dir, { sleep: noSleep, alive: allAlive })
    expect(r).toEqual({ ok: true, before: [], remaining: [] })
    // no request written — a later server must not find one lying around
    expect(existsSync(shutdownPathForDir(dir))).toBe(false)
  })

  it('reports success once every holder has withdrawn', async () => {
    registerHolder(dir, holder(11))
    registerHolder(dir, holder(12))
    let ticks = 0
    const r = await releaseHolders(dir, {
      pollMs: 1,
      alive: allAlive,
      sleep: async () => {
        // stand in for the servers reacting to the request
        if (++ticks === 1) unregisterHolder(dir, 11)
        if (ticks === 2) unregisterHolder(dir, 12)
      }
    })
    expect(r.ok).toBe(true)
    expect(r.before.map((h) => h.pid).sort()).toEqual([11, 12])
    expect(r.remaining).toEqual([])
  })

  it('refuses and names the survivors when a holder ignores the request', async () => {
    registerHolder(dir, holder(11))
    registerHolder(dir, holder(99))
    let t = 0
    const r = await releaseHolders(dir, {
      timeoutMs: 50,
      pollMs: 10,
      sleep: noSleep,
      alive: allAlive,
      now: () => (t += 20)
    })
    expect(r.ok).toBe(false)
    expect(r.remaining.map((h) => h.pid).sort()).toEqual([11, 99])
  })

  it('withdraws the request when it gives up, so later servers keep running', async () => {
    registerHolder(dir, holder(11))
    let t = 0
    await releaseHolders(dir, {
      timeoutMs: 50,
      pollMs: 10,
      sleep: noSleep,
      alive: allAlive,
      now: () => (t += 20)
    })
    expect(pendingShutdownAt(dir)).toBeNull()
  })

  it('leaves the request in place on success — the servers are on their way out', async () => {
    registerHolder(dir, holder(11))
    await releaseHolders(dir, {
      pollMs: 1,
      alive: allAlive,
      sleep: async () => unregisterHolder(dir, 11)
    })
    expect(pendingShutdownAt(dir)).not.toBeNull()
  })
})
