/**
 * Loopback listener for the OAuth redirect (#130).
 *
 * After the user signs in, Microsoft sends the browser to
 * `http://localhost:<port>/timetrack?code=…&state=…`. This module is what
 * catches that request: a short-lived HTTP server bound to the loopback
 * interface only, alive for exactly one callback.
 *
 * Two things here are less obvious than they look:
 *
 * **Dual stack.** The redirect URI has to say `localhost` (Entra's portal will
 * not accept an `http://127.0.0.1` redirect URI at all), but on Windows
 * `localhost` usually resolves to `::1` first. A server bound only to
 * `127.0.0.1` therefore gets a refused connection from the browser, which
 * surfaces as "the sign-in did nothing". So we bind BOTH stacks on the same
 * port and let whichever one the browser picks win.
 *
 * **It stays on the machine.** Binding is explicitly to the loopback addresses,
 * never `0.0.0.0`/`::`, so the authorization code never crosses the network
 * interface. That is also what makes plain `http` acceptable here — RFC 8252
 * §8.3 allows it precisely because the redirect never leaves the device.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { REDIRECT_PATH, parseCallbackQuery, redirectUriForPort } from '../shared/graphAuth'
import type { CallbackResult } from '../shared/graphAuth'

/** How long the user gets to complete the sign-in before we give up. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000

export class LoopbackError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'cancelled' | 'listen_failed'
  ) {
    super(message)
    this.name = 'LoopbackError'
  }
}

export interface LoopbackDeps {
  timeoutMs?: number
  log?: (message: string) => void
}

export interface LoopbackHandle {
  /** The port both stacks are bound to. */
  port: number
  /** Exactly the value that must go into the authorize request. */
  redirectUri: string
  /** Resolves on the first valid callback; rejects on timeout or cancel. */
  result: Promise<CallbackResult>
  /** Idempotent. Safe to call from a `finally`. */
  close: () => void
}

/** Minimal self-contained page; no external assets, works offline. */
function resultPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#111827;color:#e5e7eb;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  main{max-width:28rem;padding:2rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{color:#9ca3af;line-height:1.5;margin:0}
</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`
}

const PAGE_OK = resultPage(
  'Verbunden',
  'Du kannst dieses Fenster schließen und zu TimeTrack zurückkehren.'
)
const PAGE_FAILED = resultPage(
  'Nicht verbunden',
  'Die Anmeldung wurde nicht abgeschlossen. Zurück in TimeTrack kannst du es erneut versuchen.'
)

function listenOn(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => reject(err)
    server.once('error', onError)
    server.listen(port, host, () => {
      server.removeListener('error', onError)
      resolve()
    })
  })
}

/** Node 18+ — without this a keep-alive browser connection can hold `close()` open. */
function hardClose(server: Server): void {
  const withAll = server as Server & { closeAllConnections?: () => void }
  try {
    withAll.closeAllConnections?.()
  } catch {
    /* best effort */
  }
  server.close(() => {})
}

/**
 * Start listening. The caller must `close()` when done — a `finally` block, so
 * a thrown exchange error cannot leave a socket open.
 *
 * `signal` lets the UI cancel (dialog closed, user clicked abort).
 */
export async function startLoopback(
  deps: LoopbackDeps = {},
  signal?: AbortSignal
): Promise<LoopbackHandle> {
  const log = deps.log ?? ((): void => {})
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let settle: ((r: CallbackResult) => void) | null = null
  let fail: ((e: Error) => void) | null = null
  const result = new Promise<CallbackResult>((resolve, reject) => {
    settle = resolve
    fail = reject
  })

  const servers: Server[] = []
  let closed = false
  let timer: NodeJS.Timeout | null = null

  const close = (): void => {
    if (closed) return
    closed = true
    if (timer) clearTimeout(timer)
    for (const s of servers) hardClose(s)
    signal?.removeEventListener('abort', onAbort)
  }

  function onAbort(): void {
    fail?.(new LoopbackError('Anmeldung abgebrochen.', 'cancelled'))
    close()
  }

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    // `req.url` is path + query only; the Host header is irrelevant to us.
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== REDIRECT_PATH) {
      // Browsers cheerfully ask for /favicon.ico and sometimes prefetch. Those
      // must not be mistaken for a callback, nor end the wait.
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }

    const parsed = parseCallbackQuery(url.search)
    if (!parsed) {
      // Right path, unusable query — e.g. a code without state. Answer, but do
      // not resolve: the real callback may still be on its way.
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(PAGE_FAILED)
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(parsed.kind === 'code' ? PAGE_OK : PAGE_FAILED)
    log(`graph loopback: callback received (${parsed.kind})`)
    settle?.(parsed)
    // Closing here — not in the caller — keeps the window in which a second
    // request could arrive as small as possible.
    close()
  }

  // Bind IPv4 first with port 0 to let the OS choose, then reuse that port for
  // IPv6. If the v6 bind fails (no IPv6 stack, port taken on that stack only),
  // carry on with v4: the browser falls back.
  const v4 = createServer(handler)
  servers.push(v4)
  try {
    await listenOn(v4, '127.0.0.1', 0)
  } catch (err) {
    close()
    throw new LoopbackError(
      `Lokaler Empfangs-Port konnte nicht geöffnet werden: ${(err as Error).message}`,
      'listen_failed'
    )
  }
  const address = v4.address()
  if (address === null || typeof address === 'string') {
    close()
    throw new LoopbackError('Lokaler Empfangs-Port lieferte keine Adresse.', 'listen_failed')
  }
  const port = address.port

  const v6 = createServer(handler)
  try {
    await listenOn(v6, '::1', port)
    servers.push(v6)
  } catch {
    log('graph loopback: no IPv6 loopback, IPv4 only')
    hardClose(v6)
  }

  if (signal?.aborted) {
    close()
    throw new LoopbackError('Anmeldung abgebrochen.', 'cancelled')
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  timer = setTimeout(() => {
    fail?.(new LoopbackError('Zeitüberschreitung bei der Anmeldung.', 'timeout'))
    close()
  }, timeoutMs)
  // Do not keep the process alive just for this.
  timer.unref?.()

  log(`graph loopback: listening on ${port} (${servers.length} stack(s))`)
  return { port, redirectUri: redirectUriForPort(port), result, close }
}
