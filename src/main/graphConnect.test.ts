import { describe, it, expect, vi } from 'vitest'
import { GraphAuthError, type CallbackResult } from '../shared/graphAuth'
import { connectAccount } from './graphConnect'
import type { LoopbackHandle } from './graphLoopback'

const CFG = { clientId: 'client-1' }

const OK_TOKEN_BODY = {
  access_token: 'at-1',
  refresh_token: 'rt-1',
  expires_in: 3600,
  scope: 'Calendars.Read offline_access'
}

/**
 * A fake listener whose callback is decided by the test. `deriveResult` gets
 * the authorize URL, so a test can echo back the real `state` (the honest
 * case) or a wrong one (the attack case).
 */
interface FakeLoopback {
  startLoopbackFn: () => Promise<LoopbackHandle>
  /** Call from `openExternal` — mirrors the real ordering: browser, then callback. */
  deliver: (authorizeUrl: string) => void
  closed: () => number
  redirectUri: string
}

function fakeLoopback(deriveResult: (authorizeUrl: string) => CallbackResult): FakeLoopback {
  const redirectUri = 'http://localhost:51234/timetrack'
  let closes = 0
  let resolveResult: ((r: CallbackResult) => void) | null = null
  const result = new Promise<CallbackResult>((r) => {
    resolveResult = r
  })
  const handle: LoopbackHandle = {
    port: 51234,
    redirectUri,
    result,
    close: () => {
      closes++
    }
  }
  return {
    startLoopbackFn: async () => handle,
    deliver: (url) => resolveResult?.(deriveResult(url)),
    closed: () => closes,
    redirectUri
  }
}

function okFetch(): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => OK_TOKEN_BODY
    }) as unknown as Response) as unknown as typeof fetch
}

function stateFrom(url: string): string {
  return new URL(url).searchParams.get('state') ?? ''
}

describe('connectAccount', () => {
  it('opens the browser and returns tokens for a matching callback', async () => {
    const opened: string[] = []
    const lb = fakeLoopback((url) => ({ kind: 'code', code: 'the-code', state: stateFrom(url) }))
    const tokens = await connectAccount(CFG, {
      openExternal: (url) => {
        opened.push(url)
        lb.deliver(url)
      },
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: okFetch()
    })

    expect(tokens.accessToken).toBe('at-1')
    expect(opened).toHaveLength(1)
    const q = new URL(opened[0]).searchParams
    expect(q.get('redirect_uri')).toBe(lb.redirectUri)
    expect(q.get('code_challenge_method')).toBe('S256')
  })

  it('REJECTS a callback whose state does not match — the CSRF guard', async () => {
    const lb = fakeLoopback(() => ({ kind: 'code', code: 'foreign-code', state: 'not-ours' }))
    const exchange = vi.fn()
    const err = await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: (async () => {
        exchange()
        throw new Error('must not reach the token endpoint')
      }) as unknown as typeof fetch
    }).catch((e) => e)

    expect(err).toBeInstanceOf(GraphAuthError)
    expect(err.code).toBe('state_mismatch')
    // The point: a foreign code is never redeemed.
    expect(exchange).not.toHaveBeenCalled()
  })

  it('generates a fresh state per attempt, so a replayed callback fails', async () => {
    const seen: string[] = []
    const run = async (): Promise<unknown> => {
      const lb = fakeLoopback((url) => ({ kind: 'code', code: 'c', state: stateFrom(url) }))
      return connectAccount(CFG, {
        openExternal: (url) => {
          seen.push(stateFrom(url))
          lb.deliver(url)
        },
        startLoopbackFn: lb.startLoopbackFn,
        fetchFn: okFetch()
      })
    }
    await run()
    await run()
    expect(seen[0]).not.toBe(seen[1])
  })

  it('generates a fresh PKCE challenge per attempt', async () => {
    const seen: string[] = []
    const run = async (): Promise<unknown> => {
      const lb = fakeLoopback((url) => ({ kind: 'code', code: 'c', state: stateFrom(url) }))
      return connectAccount(CFG, {
        openExternal: (url) => {
          seen.push(new URL(url).searchParams.get('code_challenge') ?? '')
          lb.deliver(url)
        },
        startLoopbackFn: lb.startLoopbackFn,
        fetchFn: okFetch()
      })
    }
    await run()
    await run()
    expect(seen[0]).not.toBe(seen[1])
  })

  it('translates a declined sign-in into a cancellation, not a failure', async () => {
    const lb = fakeLoopback(() => ({
      kind: 'error',
      error: 'access_denied',
      description: null,
      state: null
    }))
    const err = await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: okFetch()
    }).catch((e) => e)
    expect(err.code).toBe('access_denied')
    expect(err.message).toMatch(/abgebrochen/)
  })

  it('explains the admin-approval case instead of leaving a dead end', async () => {
    const lb = fakeLoopback(() => ({
      kind: 'error',
      error: 'consent_required',
      description: null,
      state: null
    }))
    const err = await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: okFetch()
    }).catch((e) => e)
    expect(err.message).toMatch(/Administrator/)
  })

  it('closes the listener on success', async () => {
    const lb = fakeLoopback((url) => ({ kind: 'code', code: 'c', state: stateFrom(url) }))
    await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: okFetch()
    })
    expect(lb.closed()).toBe(1)
  })

  it('closes the listener even when the exchange fails', async () => {
    const lb = fakeLoopback((url) => ({ kind: 'code', code: 'c', state: stateFrom(url) }))
    await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: (async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_grant' })
        }) as unknown as Response) as unknown as typeof fetch
    }).catch(() => {})
    expect(lb.closed()).toBe(1)
  })

  it('closes the listener when the state check rejects', async () => {
    const lb = fakeLoopback(() => ({ kind: 'code', code: 'c', state: 'wrong' }))
    await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: okFetch()
    }).catch(() => {})
    expect(lb.closed()).toBe(1)
  })

  it('never logs the code or the verifier', async () => {
    const lines: string[] = []
    const lb = fakeLoopback((url) => ({
      kind: 'code',
      code: 'SECRET-CODE',
      state: stateFrom(url)
    }))
    await connectAccount(CFG, {
      openExternal: (url) => lb.deliver(url),
      startLoopbackFn: lb.startLoopbackFn,
      fetchFn: okFetch(),
      log: (m) => lines.push(m)
    })
    const all = lines.join('\n')
    expect(all).not.toContain('SECRET-CODE')
    expect(all).not.toContain('code_verifier')
  })
})
