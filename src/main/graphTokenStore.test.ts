import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { StoredTokens } from '../shared/graphAuth'
import {
  TOKEN_FILENAME,
  TokenStoreError,
  clearTokens,
  hasStoredTokens,
  isStorageAvailable,
  loadTokens,
  saveTokens,
  tokenDirForDbPath,
  type SecretBox
} from './graphTokenStore'

/**
 * A stand-in for `safeStorage`. The "encryption" is a reversible scramble — the
 * point is not to test crypto (that is the OS's job) but to prove that what
 * lands on disk is not the plaintext, and that an unreadable file is handled
 * rather than thrown.
 */
function fakeBox(available = true): SecretBox & { calls: { encrypt: number } } {
  const calls = { encrypt: 0 }
  return {
    calls,
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => {
      calls.encrypt++
      return Buffer.from(`enc:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8')
    },
    decryptString: (cipher: Buffer) => {
      const s = cipher.toString('utf8')
      if (!s.startsWith('enc:')) throw new Error('bad ciphertext')
      return Buffer.from(s.slice(4), 'base64').toString('utf8')
    }
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tt-graph-store-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const TOKENS: StoredTokens = {
  accessToken: 'access-secret-1',
  refreshToken: 'refresh-secret-1',
  expiresAtMs: 1_800_000_000_000,
  grantedScopes: ['Calendars.Read', 'offline_access'],
  account: { username: 'r@wald-it.com', displayName: 'Robin', tenantId: 'tid-1' }
}

function filePath(): string {
  return join(dir, TOKEN_FILENAME)
}

describe('saveTokens / loadTokens', () => {
  it('round-trips the full token object', () => {
    const box = fakeBox()
    saveTokens(TOKENS, { dir, secretBox: box })
    expect(loadTokens({ dir, secretBox: box })).toEqual(TOKENS)
  })

  it('writes ciphertext — the refresh token must not be readable on disk', () => {
    const box = fakeBox()
    saveTokens(TOKENS, { dir, secretBox: box })
    const raw = readFileSync(filePath(), 'utf8')
    expect(raw).not.toContain('refresh-secret-1')
    expect(raw).not.toContain('access-secret-1')
    expect(box.calls.encrypt).toBe(1)
  })

  it('stores nothing in the database directory beyond its own file', () => {
    saveTokens(TOKENS, { dir, secretBox: fakeBox() })
    // Only the token file; in particular no leftover .tmp from the atomic write.
    expect(existsSync(`${filePath()}.tmp`)).toBe(false)
  })

  it('replaces a previous connection instead of appending', () => {
    const box = fakeBox()
    saveTokens(TOKENS, { dir, secretBox: box })
    saveTokens({ ...TOKENS, refreshToken: 'refresh-secret-2' }, { dir, secretBox: box })
    expect(loadTokens({ dir, secretBox: box })?.refreshToken).toBe('refresh-secret-2')
  })

  it('refuses to store anything when the OS keychain is unavailable', () => {
    // The alternative would be writing a refresh token to disk in the clear.
    const box = fakeBox(false)
    const err = (() => {
      try {
        saveTokens(TOKENS, { dir, secretBox: box })
        return null
      } catch (e) {
        return e as TokenStoreError
      }
    })()
    expect(err).toBeInstanceOf(TokenStoreError)
    expect(err?.code).toBe('encryption_unavailable')
    expect(existsSync(filePath())).toBe(false)
    expect(box.calls.encrypt).toBe(0)
  })

  it('never puts token material into the log', () => {
    const lines: string[] = []
    saveTokens(TOKENS, { dir, secretBox: fakeBox(), log: (m) => lines.push(m) })
    loadTokens({ dir, secretBox: fakeBox(), log: (m) => lines.push(m) })
    const all = lines.join('\n')
    expect(all).not.toContain('refresh-secret-1')
    expect(all).not.toContain('access-secret-1')
  })
})

describe('loadTokens — the ways a stored connection goes bad', () => {
  it('returns null when nothing was ever stored', () => {
    expect(loadTokens({ dir, secretBox: fakeBox() })).toBeNull()
  })

  it('returns null instead of throwing when the blob cannot be decrypted', () => {
    // The realistic case: the file came from another machine, or the OS key
    // changed. Throwing here would crash the app on startup.
    writeFileSync(filePath(), Buffer.from('not-encrypted-by-us', 'utf8'))
    const lines: string[] = []
    expect(loadTokens({ dir, secretBox: fakeBox(), log: (m) => lines.push(m) })).toBeNull()
    expect(lines.join('\n')).toMatch(/unreadable/)
  })

  it('returns null when the decrypted content is not JSON', () => {
    const box = fakeBox()
    writeFileSync(filePath(), box.encryptString('this is not json'))
    expect(loadTokens({ dir, secretBox: box })).toBeNull()
  })

  it.each([
    ['missing refreshToken', { accessToken: 'a', expiresAtMs: 1 }],
    ['empty refreshToken', { accessToken: 'a', refreshToken: '', expiresAtMs: 1 }],
    ['missing accessToken', { refreshToken: 'r', expiresAtMs: 1 }],
    ['expiresAtMs as a string', { accessToken: 'a', refreshToken: 'r', expiresAtMs: '1' }],
    ['not an object', 'nope'],
    ['null', null]
  ])('returns null for a malformed blob (%s)', (_label, payload) => {
    const box = fakeBox()
    writeFileSync(filePath(), box.encryptString(JSON.stringify(payload)))
    expect(loadTokens({ dir, secretBox: box })).toBeNull()
  })

  it('does not delete the file it could not read', () => {
    // Silent deletion of something we merely failed to understand would be rude
    // and unrecoverable; the next successful connect overwrites it anyway.
    writeFileSync(filePath(), Buffer.from('garbage', 'utf8'))
    loadTokens({ dir, secretBox: fakeBox() })
    expect(existsSync(filePath())).toBe(true)
  })
})

describe('hasStoredTokens', () => {
  it('is false before anything is stored and true afterwards', () => {
    const box = fakeBox()
    expect(hasStoredTokens({ dir, secretBox: box })).toBe(false)
    saveTokens(TOKENS, { dir, secretBox: box })
    expect(hasStoredTokens({ dir, secretBox: box })).toBe(true)
  })

  it('is false for a stored-but-unusable blob, not merely for a missing file', () => {
    writeFileSync(filePath(), Buffer.from('garbage', 'utf8'))
    expect(hasStoredTokens({ dir, secretBox: fakeBox() })).toBe(false)
  })
})

describe('clearTokens', () => {
  it('removes the stored connection', () => {
    const box = fakeBox()
    saveTokens(TOKENS, { dir, secretBox: box })
    clearTokens({ dir, secretBox: box })
    expect(existsSync(filePath())).toBe(false)
    expect(loadTokens({ dir, secretBox: box })).toBeNull()
  })

  it('is idempotent — disconnecting when nothing is connected must not throw', () => {
    expect(() => {
      clearTokens({ dir, secretBox: fakeBox() })
      clearTokens({ dir, secretBox: fakeBox() })
    }).not.toThrow()
  })
})

describe('tokenDirForDbPath — where the file belongs when no dir is injected', () => {
  /**
   * Regression guard for a bug found in the first real handtest (#130).
   *
   * The default location used to come from `mcp/socketPath.ts`'s `userDataDir()`,
   * which RECONSTRUCTS `%APPDATA%\time-tracking` without Electron so the
   * standalone MCP server can find the DB. That resolver cannot know about an
   * overridden userData location, while `main/db.ts` uses
   * `app.getPath('userData')`, which does. Running the app with
   * `--user-data-dir` therefore wrote the token next to a database the app was
   * not using — in the production directory, during a supposedly isolated test.
   *
   * Every other test in this file injects `dir`, so none of them could see it.
   * This one pins the rule itself: the token sits beside the DB that is open.
   */
  it('puts the token next to the database the app actually opened', () => {
    expect(tokenDirForDbPath(join('X', 'custom-profile', 'timetrack.sqlite'))).toBe(
      join('X', 'custom-profile')
    )
  })

  it('follows an overridden location instead of a reconstructed default', () => {
    const overridden = tokenDirForDbPath(join('D:', 'portable', 'tt', 'timetrack.sqlite'))
    expect(overridden).toBe(join('D:', 'portable', 'tt'))
    expect(overridden).not.toContain('AppData')
  })
})

describe('isStorageAvailable', () => {
  it('mirrors the keychain state', () => {
    expect(isStorageAvailable({ dir, secretBox: fakeBox(true) })).toBe(true)
    expect(isStorageAvailable({ dir, secretBox: fakeBox(false) })).toBe(false)
  })

  it('reports false rather than throwing when safeStorage itself blows up', () => {
    const hostile: SecretBox = {
      isEncryptionAvailable: () => {
        throw new Error('no keyring')
      },
      encryptString: () => Buffer.alloc(0),
      decryptString: () => ''
    }
    expect(isStorageAvailable({ dir, secretBox: hostile })).toBe(false)
  })
})
