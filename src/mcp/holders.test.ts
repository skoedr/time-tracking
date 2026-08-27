/**
 * #198/#201 — holder registry and cooperative shutdown.
 *
 * The behaviour that matters is the refusal: releaseHolders() must report
 * failure while anything still holds the install directory, because the caller
 * hands over to an installer that would otherwise fail with a message telling
 * the user to close a window that does not exist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  readFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  HOLDER_DIRNAME,
  SHUTDOWN_FILENAME,
  holderDirForDir,
  shutdownPathForDir,
  isAlive,
  registerHolder,
  unregisterHolder,
  parseShutdownRequest,
  pendingShutdownRequest,
  watchForShutdown,
  readHolders,
  pruneDeadHolders,
  requestShutdown,
  clearShutdown,
  releaseHolders,
  sameExecutable,
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
    expect(pendingShutdownRequest(dir)).toBeNull()
    const nonce = requestShutdown(dir, 5000)
    expect(pendingShutdownRequest(dir)).toEqual({ nonce })
    clearShutdown(dir)
    expect(pendingShutdownRequest(dir)).toBeNull()
  })

  it('every request carries a fresh nonce — that change is what servers gate on', () => {
    const first = requestShutdown(dir, 5000)
    const second = requestShutdown(dir, 5000)
    expect(first).not.toBe(second)
    expect(pendingShutdownRequest(dir)).toEqual({ nonce: second })
  })

  it('still writes requestedAt — servers of v1.18 and earlier gate on it', () => {
    requestShutdown(dir, 5000)
    const raw = JSON.parse(readFileSync(shutdownPathForDir(dir), 'utf8')) as {
      requestedAt: number
    }
    expect(raw.requestedAt).toBe(5000)
  })

  it('reads a request written with a UTF-8 BOM — the installer writes one', () => {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(shutdownPathForDir(dir), '\uFEFF{"requestedAt":7000,"nonce":"abc"}', 'utf8')
    expect(pendingShutdownRequest(dir)).toEqual({ nonce: 'abc' })
  })

  it('ignores a request that is not JSON at all', () => {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(shutdownPathForDir(dir), 'garbage', 'utf8')
    expect(pendingShutdownRequest(dir)).toBeNull()
  })

  it('ignores valid JSON without a usable nonce or requestedAt', () => {
    // The last four look numeric to Number(...) — null, false, "" and [5]
    // all coerce to finite numbers, but the legacy writer only ever emitted a
    // JSON number, and anything else must not read as a request.
    for (const raw of [
      '{}',
      '{"requestedAt":"soon"}',
      '{"nonce":42}',
      '{"nonce":""}',
      '{"requestedAt":null}',
      '{"requestedAt":false}',
      '{"requestedAt":""}',
      '{"requestedAt":[5]}'
    ]) {
      expect(parseShutdownRequest(raw)).toBeNull()
    }
  })

  it('accepts a legacy request without a nonce — the raw content is its identity', () => {
    // A ≤ v1.18 writer (e.g. an old installer run over a newer install) only
    // writes requestedAt. Each write still has to read as a distinct request.
    const a = parseShutdownRequest('{"requestedAt":7000}')
    const b = parseShutdownRequest('{"requestedAt":7001}')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.nonce).not.toBe(b!.nonce)
  })
})

describe('watchForShutdown', () => {
  it('fires on a nonce change, not on the request already present at startup', async () => {
    const fired: string[] = []
    // started before any request — baseline null, must react to the first one
    const stopOld = watchForShutdown(dir, null, () => fired.push('old'), 5)
    const nonce1 = requestShutdown(dir, 5000)
    await vi.waitFor(() => expect(fired).toEqual(['old']))

    // started while nonce1 lies on disk — nonce1 is its baseline. A watcher
    // with a null baseline started right after acts as the sentinel: once it
    // has fired on nonce1, 'new' has been polling nonce1 too and stayed quiet.
    const stopNew = watchForShutdown(dir, nonce1, () => fired.push('new'), 5)
    const stopSentinel = watchForShutdown(dir, null, () => fired.push('sentinel'), 5)
    await vi.waitFor(() => expect(fired).toContain('sentinel'))
    expect(fired).not.toContain('new')

    // a re-issued request (fresh nonce) is a change — now 'new' must exit too
    requestShutdown(dir, 6000)
    await vi.waitFor(() => expect(fired).toContain('new'))
    stopOld()
    stopNew()
    stopSentinel()
  })

  it('stops watching once it has fired', async () => {
    requestShutdown(dir, 5000)
    let n = 0
    const stop = watchForShutdown(dir, null, () => n++, 5)
    await vi.waitFor(() => expect(n).toBe(1))
    // a second request must not re-fire a watcher that already shut down
    requestShutdown(dir, 6000)
    await new Promise((r) => setTimeout(r, 40))
    stop()
    expect(n).toBe(1)
  })

  it('a stopped watcher never fires', async () => {
    let n = 0
    const stop = watchForShutdown(dir, null, () => n++, 5)
    stop()
    requestShutdown(dir, 5000)
    await new Promise((r) => setTimeout(r, 30))
    expect(n).toBe(0)
  })
})

describe('releaseHolders', () => {
  const noSleep = (): Promise<void> => Promise.resolve()
  // The pids below are fictional, so liveness has to be supplied — otherwise
  // every holder reads as dead and the refusal we care about never happens.
  const allAlive = (): boolean => true
  // Fictional pids have no real process image either; null means "no way to
  // ask on this platform", which keeps the pre-#201 liveness-only behaviour.
  const noImages = async (): Promise<null> => null

  it('does nothing and costs nothing when no MCP server is registered', async () => {
    const r = await releaseHolders(dir, { sleep: noSleep, alive: allAlive, queryImages: noImages })
    expect(r).toEqual({ ok: true, before: [], remaining: [], stale: [], requestedAt: null })
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
      queryImages: noImages,
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
      queryImages: noImages,
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
      queryImages: noImages,
      now: () => (t += 20)
    })
    expect(pendingShutdownRequest(dir)).toBeNull()
  })

  it('leaves the request in place on success — the servers are on their way out', async () => {
    registerHolder(dir, holder(11))
    await releaseHolders(dir, {
      pollMs: 1,
      alive: allAlive,
      queryImages: noImages,
      sleep: async () => unregisterHolder(dir, 11)
    })
    expect(pendingShutdownRequest(dir)).not.toBeNull()
  })

  it('re-issues the request when a new pid appears mid-poll (#201)', async () => {
    // A client may respawn its server the moment the first one exits. The
    // respawn read the current nonce at startup — only a FRESH nonce reaches it.
    registerHolder(dir, holder(11))
    const nonces: string[] = []
    let ticks = 0
    const r = await releaseHolders(dir, {
      pollMs: 1,
      alive: allAlive,
      queryImages: noImages,
      sleep: async () => {
        ticks++
        if (ticks === 1) {
          nonces.push(pendingShutdownRequest(dir)!.nonce)
          registerHolder(dir, holder(22)) // the respawned server registers
        }
        if (ticks === 2) {
          nonces.push(pendingShutdownRequest(dir)!.nonce)
          unregisterHolder(dir, 11)
          unregisterHolder(dir, 22)
        }
      }
    })
    expect(r.ok).toBe(true)
    expect(nonces).toHaveLength(2)
    expect(nonces[0]).not.toBe(nonces[1])
  })

  it('extends the deadline for a respawn seen near it — its request must be readable (#201)', async () => {
    // Without the grace period, a nonce written on the final poll is cleared
    // on the very next loop check, before the newcomer's 400 ms watcher can
    // ever read it — and the newcomer is blamed for not reacting.
    registerHolder(dir, holder(11))
    let t = 0
    const r = await releaseHolders(dir, {
      timeoutMs: 50,
      pollMs: 10,
      reissueGraceMs: 100,
      alive: allAlive,
      queryImages: noImages,
      now: () => t,
      sleep: async () => {
        if (t === 0) {
          // final poll: the old server exits, its respawn registers past the deadline
          t = 55
          unregisterHolder(dir, 11)
          registerHolder(dir, holder(22))
        } else {
          // within the grace period the respawn reacts to the fresh nonce
          t += 10
          unregisterHolder(dir, 22)
        }
      }
    })
    expect(r.ok).toBe(true)
    expect(r.remaining).toEqual([])
  })

  it('caps the grace extension — an endlessly respawning client cannot pin the updater', async () => {
    registerHolder(dir, holder(11))
    let t = 0
    let next = 100
    const r = await releaseHolders(dir, {
      timeoutMs: 50,
      pollMs: 10,
      reissueGraceMs: 100,
      alive: allAlive,
      queryImages: noImages,
      now: () => t,
      sleep: async () => {
        t += 30
        registerHolder(dir, holder(++next)) // a fresh pid on every poll
      }
    })
    expect(r.ok).toBe(false)
    expect(r.remaining.map((h) => h.pid)).toContain(11)
    // the loop ended at the hard cap (2 × timeoutMs), not with the respawns
    expect(t).toBeLessThanOrEqual(50 * 2 + 30)
  })
})

describe('holder identity (#201)', () => {
  const noSleep = (): Promise<void> => Promise.resolve()
  const allAlive = (): boolean => true

  it('prunes a registration whose pid was reused by another binary', async () => {
    // Client hard-killed its server → no 'exit' event → the file stayed. The
    // OS reused the pid for an unrelated long-lived process; liveness alone
    // would let that process block every update for as long as it runs.
    registerHolder(dir, holder(11))
    registerHolder(dir, holder(12))
    const r = await releaseHolders(dir, {
      pollMs: 1,
      alive: allAlive,
      queryImages: async () =>
        new Map<number, string | null>([
          [11, 'C:\\Windows\\System32\\svchost.exe'],
          [12, 'C:\\App\\TimeTrack.exe']
        ]),
      sleep: async () => unregisterHolder(dir, 12)
    })
    expect(r.ok).toBe(true)
    expect(r.stale.map((h) => h.pid)).toEqual([11])
    expect(r.before.map((h) => h.pid)).toEqual([12])
    // the stale registration is pruned from disk, not just skipped
    expect(existsSync(join(holderDirForDir(dir), '11.json'))).toBe(false)
  })

  it('an unreadable image is not our server — same-user processes are readable', async () => {
    // EPERM-alive plus unreadable image is the reused-into-elevated case that
    // used to be a permanent holder.
    registerHolder(dir, holder(11))
    const r = await releaseHolders(dir, {
      sleep: noSleep,
      alive: allAlive,
      queryImages: async () => new Map<number, string | null>([[11, null]])
    })
    expect(r.ok).toBe(true)
    expect(r.stale.map((h) => h.pid)).toEqual([11])
    // nothing real was asked to shut down, so no request was written
    expect(r.requestedAt).toBeNull()
    expect(existsSync(shutdownPathForDir(dir))).toBe(false)
  })

  it('a pid missing from the image query is dead, not stale', async () => {
    registerHolder(dir, holder(11))
    const r = await releaseHolders(dir, {
      sleep: noSleep,
      alive: allAlive,
      queryImages: async () => new Map<number, string | null>()
    })
    expect(r).toEqual({ ok: true, before: [], remaining: [], stale: [], requestedAt: null })
    expect(existsSync(join(holderDirForDir(dir), '11.json'))).toBe(false)
  })

  it('falls back to liveness alone when images cannot be queried', async () => {
    registerHolder(dir, holder(11))
    let t = 0
    const r = await releaseHolders(dir, {
      timeoutMs: 50,
      pollMs: 10,
      sleep: noSleep,
      alive: allAlive,
      queryImages: async () => null,
      now: () => (t += 20)
    })
    // blocking on an unverifiable holder is the safe direction: better a
    // refused update than a binary yanked from under a live server
    expect(r.ok).toBe(false)
    expect(r.remaining.map((h) => h.pid)).toEqual([11])
  })

  it('sameExecutable compares Windows paths case-insensitively', () => {
    if (process.platform === 'win32') {
      expect(sameExecutable('C:\\App\\TimeTrack.exe', 'c:\\app\\timetrack.EXE')).toBe(true)
      expect(sameExecutable('C:/App/TimeTrack.exe', 'C:\\App\\TimeTrack.exe')).toBe(true)
      expect(sameExecutable('C:\\App\\TimeTrack.exe', 'C:\\Other\\TimeTrack.exe')).toBe(false)
    } else {
      expect(sameExecutable('/opt/app/timetrack', '/opt/app/timetrack')).toBe(true)
      expect(sameExecutable('/opt/app/timetrack', '/opt/app/TimeTrack')).toBe(false)
    }
  })
})

describe('hostile or damaged registry input', () => {
  it('skips holder files whose pid could probe a process group', () => {
    // pid 0 and negative pids make kill(pid, 0) probe process GROUPS, which
    // always answers "alive" — such a file would block every future update.
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(join(holderDirForDir(dir), 'zero.json'), '{"pid":0}', 'utf8')
    writeFileSync(join(holderDirForDir(dir), 'neg.json'), '{"pid":-5}', 'utf8')
    writeFileSync(join(holderDirForDir(dir), 'frac.json'), '{"pid":1.5}', 'utf8')
    writeFileSync(join(holderDirForDir(dir), 'str.json'), '{"pid":"7"}', 'utf8')
    expect(readHolders(dir, () => true)).toEqual([])
  })

  it('registerHolder reports failure instead of throwing', () => {
    // a file sits where the holder directory should be — mkdir cannot win
    writeFileSync(holderDirForDir(dir), 'in the way', 'utf8')
    expect(registerHolder(dir, holder(1))).toBe(false)
  })

  it('normalizes damaged holder fields to their declared types', () => {
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(
      join(holderDirForDir(dir), '9.json'),
      '{"pid":9,"exe":42,"startedAt":"soon"}',
      'utf8'
    )
    expect(readHolders(dir, () => true)).toEqual([{ pid: 9, exe: '', entry: '', startedAt: 0 }])
  })

  it('a damaged holder file without exe demotes to stale instead of crashing the release', async () => {
    // Before normalization, sameExecutable received undefined and threw a
    // TypeError that aborted the whole update (reproduced live).
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(join(holderDirForDir(dir), '11.json'), '{"pid":11}', 'utf8')
    const r = await releaseHolders(dir, {
      sleep: () => Promise.resolve(),
      alive: () => true,
      queryImages: async () => new Map<number, string | null>([[11, 'C:\\Somewhere\\other.exe']])
    })
    expect(r.ok).toBe(true)
    expect(r.stale.map((h) => h.pid)).toEqual([11])
  })
})

describe('pruning stale registrations (#209)', () => {
  it('removes registrations whose process is gone and reports how many', () => {
    registerHolder(dir, holder(1))
    registerHolder(dir, holder(2))
    registerHolder(dir, holder(3))
    expect(pruneDeadHolders(dir, (pid) => pid === 2)).toBe(2)
    expect(readdirSync(holderDirForDir(dir)).filter((n) => n.endsWith('.json'))).toEqual(['2.json'])
  })

  it('leaves a live registry untouched', () => {
    registerHolder(dir, holder(1))
    registerHolder(dir, holder(2))
    expect(pruneDeadHolders(dir, () => true)).toBe(0)
    expect(readHolders(dir, () => true).map((h) => h.pid)).toEqual([1, 2])
  })

  it('does not delete files it cannot read as a holder', () => {
    // A corrupt file is not proof that its process is gone, and the name is
    // not proof either. Deleting it would be guessing; leave it and let the
    // reader keep skipping it.
    mkdirSync(holderDirForDir(dir), { recursive: true })
    writeFileSync(join(holderDirForDir(dir), '7.json'), 'not json at all', 'utf8')
    registerHolder(dir, holder(8))
    expect(pruneDeadHolders(dir, () => false)).toBe(1)
    expect(readdirSync(holderDirForDir(dir)).filter((n) => n.endsWith('.json'))).toEqual(['7.json'])
  })

  it('is a no-op when the directory was never created', () => {
    expect(pruneDeadHolders(join(dir, 'nope'), () => false)).toBe(0)
  })

  it('agrees with readHolders about what counts as a holder', () => {
    // Both go through readHolderFile. If they ever disagreed, the pruner could
    // delete a registration the reader still honours — a live server silently
    // dropped from the blocker list, which is the failure #201 spent its whole
    // review budget on.
    mkdirSync(holderDirForDir(dir), { recursive: true })
    for (const [name, body] of [
      ['0.json', JSON.stringify({ pid: 0 })],
      ['-1.json', JSON.stringify({ pid: -1 })],
      ['bad.json', 'not json'],
      ['9.json', JSON.stringify({ pid: 9 })]
    ] as const) {
      writeFileSync(join(holderDirForDir(dir), name), body, 'utf8')
    }
    // Nothing is alive, so every file the pruner recognises must go — and what
    // survives must be exactly what the reader also refuses to recognise.
    pruneDeadHolders(dir, () => false)
    const left = readdirSync(holderDirForDir(dir))
      .filter((n) => n.endsWith('.json'))
      .sort()
    expect(left).toEqual(['-1.json', '0.json', 'bad.json'])
    expect(readHolders(dir, () => true)).toEqual([])
  })
})

describe('pruning is wired into both startup paths (#209)', () => {
  // Source assertions, on purpose. The pruning itself is covered above; what
  // these two pin is the WIRING, and neither call site is reachable from a
  // test: joinUpdateHandshake is private to server.ts and starts a watcher
  // plus process-exit handlers, and index.ts is the Electron entry point.
  //
  // Without them the fix is deletable with every test still green — the
  // registry would quietly go back to growing forever and the only symptom
  // would be an installer that waits out a deadline nobody watches. Same
  // reasoning as the installer.nsh guard below: assert the thing you cannot
  // import, and be honest that it is a text match. It catches removal and
  // rename; it does not prove the call runs.
  it('the MCP server prunes predecessors when it registers', () => {
    const src = readFileSync(join(__dirname, 'server.ts'), 'utf8')
    expect(src).toContain('pruneDeadHolders')
    const handshake = src.slice(src.indexOf('function joinUpdateHandshake'))
    expect(handshake.slice(0, handshake.indexOf('registerHolder('))).toContain('pruneDeadHolders(')
  })

  it('the app prunes on start', () => {
    const src = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
    expect(src).toContain('pruneDeadHolders(')
  })
})

describe('installer script stays in sync', () => {
  it('build/installer.nsh uses the same names and keys as this module', () => {
    // The NSIS side cannot import these constants; a rename here would turn
    // the installer handshake into a silent no-op that just waits out its
    // deadline. This assertion makes the rename break the build instead.
    const nsh = readFileSync(join(__dirname, '..', '..', 'build', 'installer.nsh'), 'utf8')
    expect(nsh).toContain(HOLDER_DIRNAME)
    expect(nsh).toContain(SHUTDOWN_FILENAME)
    expect(nsh).toContain('requestedAt')
    // #201 — the request the installer writes must carry the nonce gate too
    expect(nsh).toContain('nonce')
    // the userData dirname follows package.json "name", not productName
    expect(nsh).toContain('time-tracking')
  })
})
