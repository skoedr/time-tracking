import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import { GraphAuthError, type StoredTokens } from '../shared/graphAuth'
import {
  createPkcePair,
  createState,
  exchangeCode,
  isGrantInvalid,
  refreshTokens
} from './graphAuth'

/**
 * A scripted `fetch`: each call shifts the next canned response off the queue.
 * Records the URLs and bodies so the tests can assert what went on the wire —
 * in particular that no client secret is ever sent and that tokens never reach
 * the log.
 */
interface Call {
  url: string
  body: string
}

interface Scripted {
  fetchFn: typeof fetch
  calls: Call[]
}

type Canned = { status: number; body: unknown } | { throws: Error }

function scriptedFetch(queue: Canned[]): Scripted {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    const next = queue.shift()
    if (!next) throw new Error(`scriptedFetch: no canned response left for ${String(url)}`)
    if ('throws' in next) throw next.throws
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => {
        if (next.body === '<<invalid json>>') throw new Error('not json')
        return next.body
      }
    } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

/** Deterministic clock. */
function fakeClock(startMs = 1_800_000_000_000): { now: () => number } {
  return { now: () => startMs }
}

const CFG = { clientId: 'client-1' }

const EXCHANGE = {
  code: 'auth-code-1',
  codeVerifier: 'verifier-1',
  redirectUri: 'http://localhost:51234/timetrack'
}

function tokens(over: Partial<StoredTokens> = {}): StoredTokens {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAtMs: 1_800_000_000_000,
    grantedScopes: ['Calendars.Read'],
    account: null,
    ...over
  }
}

const OK_TOKEN_BODY = {
  access_token: 'at-1',
  refresh_token: 'rt-1',
  expires_in: 3600,
  scope: 'Calendars.Read offline_access'
}

describe('createPkcePair', () => {
  it('derives the challenge as base64url(SHA-256(verifier)) — RFC 7636 S256', () => {
    const { verifier, challenge } = createPkcePair()
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(challenge).toBe(expected)
  })

  it('produces a verifier within the length the RFC allows', () => {
    const { verifier } = createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('emits only base64url characters — no padding, nothing needing escaping', () => {
    const { verifier, challenge } = createPkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('is different every time — a fixed verifier would defeat the whole mechanism', () => {
    const seen = new Set(Array.from({ length: 20 }, () => createPkcePair().verifier))
    expect(seen.size).toBe(20)
  })

  it('never equals its own challenge', () => {
    const { verifier, challenge } = createPkcePair()
    expect(challenge).not.toBe(verifier)
  })
})

describe('createState', () => {
  it('is unpredictable — it is the CSRF guard for the callback', () => {
    const seen = new Set(Array.from({ length: 20 }, () => createState()))
    expect(seen.size).toBe(20)
  })

  it('is url-safe, since it travels in a query string', () => {
    expect(createState()).toMatch(/^[A-Za-z0-9\-_]+$/)
  })
})

describe('exchangeCode', () => {
  it('posts the code, the verifier and the redirect uri', async () => {
    const c = fakeClock()
    const s = scriptedFetch([{ status: 200, body: OK_TOKEN_BODY }])
    const got = await exchangeCode(CFG, EXCHANGE, { fetchFn: s.fetchFn, now: c.now })
    expect(got.accessToken).toBe('at-1')
    expect(got.refreshToken).toBe('rt-1')
    expect(s.calls[0].url).toContain('/common/oauth2/v2.0/token')
    expect(s.calls[0].body).toContain('grant_type=authorization_code')
    expect(s.calls[0].body).toContain('code=auth-code-1')
    expect(s.calls[0].body).toContain('code_verifier=verifier-1')
  })

  it('refuses without a client id instead of calling out', async () => {
    const s = scriptedFetch([])
    await expect(exchangeCode({ clientId: '' }, EXCHANGE, { fetchFn: s.fetchFn })).rejects.toThrow(
      /Client-ID/
    )
    expect(s.calls).toHaveLength(0)
  })

  it('surfaces the server description on an error response', async () => {
    const s = scriptedFetch([
      {
        status: 400,
        body: { error: 'invalid_grant', error_description: 'Redirect-URI passt nicht' }
      }
    ])
    await expect(exchangeCode(CFG, EXCHANGE, { fetchFn: s.fetchFn })).rejects.toThrow(
      'Redirect-URI passt nicht'
    )
  })

  it('fails cleanly when the error body is not JSON (proxy/outage)', async () => {
    const s = scriptedFetch([{ status: 502, body: '<<invalid json>>' }])
    await expect(exchangeCode(CFG, EXCHANGE, { fetchFn: s.fetchFn })).rejects.toThrow(/HTTP 502/)
  })

  it('never logs the code, the verifier or the tokens', async () => {
    const lines: string[] = []
    const s = scriptedFetch([{ status: 200, body: OK_TOKEN_BODY }])
    await exchangeCode(
      CFG,
      { ...EXCHANGE, code: 'SECRET-CODE', codeVerifier: 'SECRET-VERIFIER' },
      { fetchFn: s.fetchFn, log: (m) => lines.push(m) }
    )
    const all = lines.join('\n')
    expect(all).not.toContain('SECRET-CODE')
    expect(all).not.toContain('SECRET-VERIFIER')
    expect(all).not.toContain('at-1')
    expect(all).not.toContain('rt-1')
  })
})

describe('refreshTokens', () => {
  it('sends the refresh grant and returns re-based tokens', async () => {
    const c = fakeClock()
    const s = scriptedFetch([
      { status: 200, body: { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 } }
    ])
    const got = await refreshTokens(CFG, tokens(), { fetchFn: s.fetchFn, now: c.now })
    expect(got.accessToken).toBe('at-2')
    expect(got.refreshToken).toBe('rt-2')
    expect(got.expiresAtMs).toBe(c.now() + 3600_000)
    expect(s.calls[0].body).toContain('grant_type=refresh_token')
  })

  it('keeps the old refresh token when the response rotates nothing', async () => {
    const s = scriptedFetch([{ status: 200, body: { access_token: 'at-2', expires_in: 3600 } }])
    const got = await refreshTokens(CFG, tokens({ refreshToken: 'keep-me' }), {
      fetchFn: s.fetchFn
    })
    expect(got.refreshToken).toBe('keep-me')
  })

  it('reports invalid_grant as a connection that must be re-established', async () => {
    const s = scriptedFetch([
      { status: 400, body: { error: 'invalid_grant', error_description: 'expired' } }
    ])
    const err = await refreshTokens(CFG, tokens(), { fetchFn: s.fetchFn }).catch((e) => e)
    expect(err).toBeInstanceOf(GraphAuthError)
    expect(isGrantInvalid(err)).toBe(true)
    expect(String(err.message)).toMatch(/erneut verbinden/)
  })

  it('does not treat an ordinary server error as an invalid grant', async () => {
    const s = scriptedFetch([{ status: 503, body: { error: 'temporarily_unavailable' } }])
    const err = await refreshTokens(CFG, tokens(), { fetchFn: s.fetchFn }).catch((e) => e)
    expect(isGrantInvalid(err)).toBe(false)
  })

  it('propagates a network failure rather than silently dropping the connection', async () => {
    const s = scriptedFetch([{ throws: new Error('getaddrinfo ENOTFOUND') }])
    await expect(refreshTokens(CFG, tokens(), { fetchFn: s.fetchFn })).rejects.toThrow(/ENOTFOUND/)
  })

  it('never logs the refresh token', async () => {
    const lines: string[] = []
    const s = scriptedFetch([{ status: 400, body: { error: 'invalid_grant' } }])
    await refreshTokens(CFG, tokens({ refreshToken: 'SECRET-REFRESH' }), {
      fetchFn: s.fetchFn,
      log: (m) => lines.push(m)
    }).catch(() => {})
    expect(lines.join('\n')).not.toContain('SECRET-REFRESH')
  })
})

describe('request hygiene', () => {
  it('bounds every request with a timeout signal', async () => {
    const seen: (AbortSignal | undefined)[] = []
    const fetchFn = (async (_u: unknown, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined)
      return {
        ok: true,
        status: 200,
        json: async () => OK_TOKEN_BODY
      } as unknown as Response
    }) as unknown as typeof fetch
    await refreshTokens(CFG, tokens(), { fetchFn })
    expect(seen[0]).toBeInstanceOf(AbortSignal)
  })

  it('form-encodes with the content type Entra requires', async () => {
    const headers: (HeadersInit | undefined)[] = []
    const fetchFn = (async (_u: unknown, init?: RequestInit) => {
      headers.push(init?.headers)
      return {
        ok: true,
        status: 200,
        json: async () => OK_TOKEN_BODY
      } as unknown as Response
    }) as unknown as typeof fetch
    await refreshTokens(CFG, tokens(), { fetchFn })
    expect(headers[0]).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })
  })

  it('resolves its defaults without a deps object at all', async () => {
    // Guards the resolve() defaults: a typo there (e.g. `deps.log ?? undefined`)
    // would throw "is not a function" only at runtime. The client-id guard runs
    // before any network call, so this exercises resolve() without hitting one.
    // Awaited on purpose — `expect(() => asyncFn()).not.toThrow()` would pass
    // for any rejection and leak an unhandled promise.
    await expect(refreshTokens({ clientId: '' }, tokens())).rejects.toThrow(GraphAuthError)
  })

  it('reaches the network when a client id is present and no deps are injected', async () => {
    // The complement of the case above: proves the guard was the only thing
    // stopping it, so the test above really did run through resolve().
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked-in-test'))
    try {
      await expect(refreshTokens(CFG, tokens())).rejects.toThrow('blocked-in-test')
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })
})
