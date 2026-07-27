/**
 * Integration tests against the real listener — no mocking.
 *
 * A loopback HTTP server is cheap enough to start for real, and mocking it away
 * would skip exactly the parts that can break: which interfaces it binds, what
 * it does with requests that are not the callback, and whether it actually
 * releases the port again.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { connect } from 'node:net'
import { REDIRECT_PATH } from '../shared/graphAuth'
import { LoopbackError, startLoopback, type LoopbackHandle } from './graphLoopback'

const open: LoopbackHandle[] = []

afterEach(() => {
  for (const h of open.splice(0)) h.close()
})

async function start(...args: Parameters<typeof startLoopback>): Promise<LoopbackHandle> {
  const h = await startLoopback(...args)
  open.push(h)
  return h
}

/** Is there a usable IPv6 loopback on this machine? */
function hasIpv6Loopback(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ host: '::1', port }, () => {
      sock.destroy()
      resolve(true)
    })
    sock.on('error', () => {
      sock.destroy()
      resolve(false)
    })
  })
}

function callbackUrl(host: string, port: number, query: string): string {
  return `http://${host}:${port}${REDIRECT_PATH}${query}`
}

describe('startLoopback', () => {
  it('reports a redirect uri that matches its own port and the registered path', async () => {
    const h = await start()
    expect(h.redirectUri).toBe(`http://localhost:${h.port}${REDIRECT_PATH}`)
    expect(h.port).toBeGreaterThan(0)
  })

  it('resolves with the code and state from a successful callback', async () => {
    const h = await start()
    const res = await fetch(callbackUrl('127.0.0.1', h.port, '?code=abc&state=xyz'))
    expect(res.status).toBe(200)
    await expect(h.result).resolves.toEqual({ kind: 'code', code: 'abc', state: 'xyz' })
  })

  it('resolves with the error when the user declines', async () => {
    const h = await start()
    await fetch(
      callbackUrl('127.0.0.1', h.port, '?error=access_denied&error_description=nope&state=xyz')
    )
    await expect(h.result).resolves.toEqual({
      kind: 'error',
      error: 'access_denied',
      description: 'nope',
      state: 'xyz'
    })
  })

  it('never puts the authorization code into the page it serves', async () => {
    // The page ends up in browser history and on screen; the code must not.
    const h = await start()
    const res = await fetch(callbackUrl('127.0.0.1', h.port, '?code=SECRET-CODE&state=xyz'))
    expect(await res.text()).not.toContain('SECRET-CODE')
    await h.result
  })

  it('answers 404 for other paths without ending the wait', async () => {
    const h = await start()
    const res = await fetch(`http://127.0.0.1:${h.port}/favicon.ico`)
    expect(res.status).toBe(404)

    // Still waiting: the real callback can arrive afterwards.
    const settled = await Promise.race([
      h.result.then(() => 'settled'),
      new Promise((r) => setTimeout(() => r('pending'), 50))
    ])
    expect(settled).toBe('pending')

    await fetch(callbackUrl('127.0.0.1', h.port, '?code=abc&state=xyz'))
    await expect(h.result).resolves.toMatchObject({ kind: 'code' })
  })

  it('answers 400 for a code without state and keeps waiting', async () => {
    const h = await start()
    const res = await fetch(callbackUrl('127.0.0.1', h.port, '?code=abc'))
    expect(res.status).toBe(400)

    const settled = await Promise.race([
      h.result.then(() => 'settled'),
      new Promise((r) => setTimeout(() => r('pending'), 50))
    ])
    expect(settled).toBe('pending')
  })

  it('listens on the IPv6 loopback too — localhost resolves to ::1 first on Windows', async () => {
    const h = await start()
    if (!(await hasIpv6Loopback(h.port))) {
      // No IPv6 stack here; the v4-only fallback is the documented behaviour.
      expect(h.port).toBeGreaterThan(0)
      return
    }
    const res = await fetch(callbackUrl('[::1]', h.port, '?code=v6&state=xyz'))
    expect(res.status).toBe(200)
    await expect(h.result).resolves.toMatchObject({ kind: 'code', code: 'v6' })
  })

  it('rejects on timeout instead of waiting forever', async () => {
    const h = await start({ timeoutMs: 30 })
    const err = await h.result.catch((e) => e)
    expect(err).toBeInstanceOf(LoopbackError)
    expect(err.code).toBe('timeout')
  })

  it('rejects when the user cancels while waiting', async () => {
    const ctrl = new AbortController()
    const h = await start({}, ctrl.signal)
    ctrl.abort()
    const err = await h.result.catch((e) => e)
    expect(err).toBeInstanceOf(LoopbackError)
    expect(err.code).toBe('cancelled')
  })

  it('refuses to start at all when already aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(startLoopback({}, ctrl.signal)).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('releases the port after a callback, so a second sign-in can bind again', async () => {
    const h = await start()
    const port = h.port
    await fetch(callbackUrl('127.0.0.1', port, '?code=abc&state=xyz'))
    await h.result

    // The listener closes itself on success; the socket must really be gone.
    await expect(fetch(callbackUrl('127.0.0.1', port, '?code=second&state=xyz'))).rejects.toThrow()
  })

  it('survives close() being called more than once', async () => {
    const h = await start()
    expect(() => {
      h.close()
      h.close()
    }).not.toThrow()
  })

  it('hands out a different port per run, so two attempts cannot collide', async () => {
    const a = await start()
    const b = await start()
    expect(a.port).not.toBe(b.port)
  })
})
