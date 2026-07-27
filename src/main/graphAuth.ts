/**
 * Microsoft Graph authentication — the I/O half (#130).
 *
 * Authorization Code + PKCE. The protocol arithmetic lives in
 * `shared/graphAuth.ts`; this module generates the PKCE secret, talks to the
 * token endpoint, and nothing else. The loopback listener that catches the
 * browser redirect is `graphLoopback.ts`.
 *
 * `fetch` and `now` are injected so the token exchange is testable without a
 * network and without real time. House idiom, same as `main/webhooks.ts`:
 * built-in `fetch` with `AbortSignal.timeout`, no HTTP client dependency.
 *
 * Logging rule for this file: **never log a token, an authorization code, or a
 * code verifier.** Only error codes and counts. `electron-log` writes to a file
 * on disk that users attach to bug reports.
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  CALENDAR_SCOPES,
  DEFAULT_TENANT,
  GraphAuthError,
  applyRefresh,
  authCodeBody,
  parseErrorEnvelope,
  refreshBody,
  tokenUrl,
  tokensFromResponse,
  type GraphTenant,
  type StoredTokens
} from '../shared/graphAuth'

/** Per-request timeout. Generous: the token endpoint is occasionally slow. */
const REQUEST_TIMEOUT_MS = 20_000

export interface GraphAuthConfig {
  clientId: string
  tenant?: GraphTenant
  scopes?: readonly string[]
}

export interface GraphAuthDeps {
  fetchFn?: typeof fetch
  now?: () => number
  log?: (message: string) => void
}

interface Resolved {
  fetchFn: typeof fetch
  now: () => number
  log: (message: string) => void
}

function resolve(deps: GraphAuthDeps): Resolved {
  return {
    fetchFn: deps.fetchFn ?? fetch,
    now: deps.now ?? Date.now,
    log: deps.log ?? ((): void => {})
  }
}

function scopesOf(cfg: GraphAuthConfig): readonly string[] {
  return cfg.scopes ?? CALENDAR_SCOPES
}

function tenantOf(cfg: GraphAuthConfig): GraphTenant {
  return cfg.tenant ?? DEFAULT_TENANT
}

function assertClientId(cfg: GraphAuthConfig): void {
  if (!cfg.clientId || cfg.clientId.trim() === '') {
    throw new GraphAuthError(
      'Keine Client-ID konfiguriert. Ohne registrierte Anwendung ist keine Anmeldung möglich.'
    )
  }
}

// ── PKCE ───────────────────────────────────────────────────────────────────

export interface PkcePair {
  /** Stays on this machine. Sent only to the token endpoint, never to the browser. */
  verifier: string
  /** Its SHA-256, sent in the browser URL. Useless without the verifier. */
  challenge: string
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * RFC 7636: a 43–128 character verifier and its S256 challenge.
 *
 * 32 random bytes give a 43-character verifier — the minimum length, and
 * already 256 bits of entropy. This is what stops an authorization code that
 * leaked on the loopback hop from being redeemable by anyone else.
 */
export function createPkcePair(): PkcePair {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** CSRF guard: the callback must carry back exactly this value. */
export function createState(): string {
  return base64Url(randomBytes(16))
}

// ── Token endpoint ─────────────────────────────────────────────────────────

async function postForm(
  r: Resolved,
  url: string,
  body: string
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await r.fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  // The token endpoint answers JSON for both success and error. A proxy or an
  // outage can still hand back HTML, hence the guarded parse.
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json }
}

/**
 * Trade the authorization code for tokens.
 *
 * `redirectUri` must be byte-identical to the one used in the authorize
 * request — Entra compares them, and a mismatch fails with `invalid_grant`,
 * which reads confusingly like an expired session.
 */
export async function exchangeCode(
  cfg: GraphAuthConfig,
  params: { code: string; codeVerifier: string; redirectUri: string },
  deps: GraphAuthDeps = {}
): Promise<StoredTokens> {
  assertClientId(cfg)
  const r = resolve(deps)
  const res = await postForm(
    r,
    tokenUrl(tenantOf(cfg)),
    authCodeBody({
      clientId: cfg.clientId,
      code: params.code,
      codeVerifier: params.codeVerifier,
      redirectUri: params.redirectUri,
      scopes: scopesOf(cfg)
    })
  )
  if (!res.ok) {
    const { code, description } = parseErrorEnvelope(res.json)
    r.log(`graph auth: code exchange failed (status ${res.status}, code ${code ?? 'none'})`)
    throw new GraphAuthError(description || `Anmeldung fehlgeschlagen (HTTP ${res.status}).`, code)
  }
  r.log('graph auth: tokens acquired')
  return tokensFromResponse(res.json, r.now())
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * Returns a NEW token object; the caller must persist it, because Entra may
 * have rotated the refresh token (see `applyRefresh`). An `invalid_grant` here
 * means the grant is gone for good — revoked, password changed, or expired
 * through disuse — and the only honest response is to drop the connection and
 * ask the user to sign in again.
 */
export async function refreshTokens(
  cfg: GraphAuthConfig,
  previous: StoredTokens,
  deps: GraphAuthDeps = {}
): Promise<StoredTokens> {
  assertClientId(cfg)
  const r = resolve(deps)
  const res = await postForm(
    r,
    tokenUrl(tenantOf(cfg)),
    refreshBody(cfg.clientId, previous.refreshToken, scopesOf(cfg))
  )
  if (!res.ok) {
    const { code, description } = parseErrorEnvelope(res.json)
    r.log(`graph auth: refresh failed (status ${res.status}, code ${code ?? 'none'})`)
    if (code === 'invalid_grant') {
      throw new GraphAuthError(
        'Die Verbindung ist nicht mehr gültig. Bitte das Microsoft-Konto erneut verbinden.',
        code
      )
    }
    throw new GraphAuthError(description || `Erneuerung fehlgeschlagen (HTTP ${res.status}).`, code)
  }
  return applyRefresh(previous, res.json, r.now())
}

/** True when the grant is gone for good and the user must sign in again. */
export function isGrantInvalid(err: unknown): boolean {
  return err instanceof GraphAuthError && err.code === 'invalid_grant'
}
