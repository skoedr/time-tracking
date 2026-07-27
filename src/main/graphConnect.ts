/**
 * "Connect a Microsoft account", end to end (#130).
 *
 * Ties together the three pieces that must not be used separately: the loopback
 * listener, the PKCE pair, and the token exchange. It exists mainly so the two
 * checks that are easy to forget cannot be forgotten:
 *
 * 1. **The `state` comparison.** `parseCallbackQuery` deliberately refuses a
 *    code without a state, but only the side that GENERATED the state can tell
 *    whether it is the right one. Leaving that to the caller means it is a
 *    comment in a doc block instead of a guard in the code path — so it lives
 *    here, and there is no exported path that skips it.
 * 2. **Closing the listener.** A thrown exchange error must not leave a socket
 *    bound, hence the `finally`.
 *
 * `openExternal` is injected: in the app it is Electron's shell, in tests a
 * function that captures the URL. That makes the whole flow testable without
 * Electron and without a browser.
 */
import { GraphAuthError, buildAuthorizeUrl, describeAuthorizeError } from '../shared/graphAuth'
import type { GraphTenant, StoredTokens } from '../shared/graphAuth'
import { CALENDAR_SCOPES, DEFAULT_TENANT } from '../shared/graphAuth'
import { createPkcePair, createState, exchangeCode } from './graphAuth'
import type { GraphAuthConfig, GraphAuthDeps } from './graphAuth'
import { startLoopback } from './graphLoopback'
import type { LoopbackDeps, LoopbackHandle } from './graphLoopback'

export interface ConnectDeps extends GraphAuthDeps {
  /** Opens the system browser. Electron: `shell.openExternal`. */
  openExternal: (url: string) => Promise<void> | void
  /** Injectable for tests; defaults to the real listener. */
  startLoopbackFn?: (deps?: LoopbackDeps, signal?: AbortSignal) => Promise<LoopbackHandle>
  /** How long the user has to finish signing in. */
  timeoutMs?: number
}

/**
 * Run the full connect flow and return tokens the caller should persist.
 *
 * Throws `GraphAuthError` for every user-visible failure, so the settings UI
 * has one error type to render.
 */
export async function connectAccount(
  cfg: GraphAuthConfig,
  deps: ConnectDeps,
  signal?: AbortSignal
): Promise<StoredTokens> {
  const log = deps.log ?? ((): void => {})
  const startFn = deps.startLoopbackFn ?? startLoopback
  const tenant: GraphTenant = cfg.tenant ?? DEFAULT_TENANT
  const scopes = cfg.scopes ?? CALENDAR_SCOPES

  const handle = await startFn({ timeoutMs: deps.timeoutMs, log: deps.log }, signal)
  try {
    const pkce = createPkcePair()
    const state = createState()

    const url = buildAuthorizeUrl({
      clientId: cfg.clientId,
      tenant,
      scopes,
      redirectUri: handle.redirectUri,
      state,
      codeChallenge: pkce.challenge
    })

    await deps.openExternal(url)
    log('graph connect: browser opened, awaiting callback')

    const callback = await handle.result

    if (callback.kind === 'error') {
      throw describeAuthorizeError(callback.error, callback.description)
    }

    // The CSRF guard. A callback carrying a code we did not ask for must be
    // discarded — redeeming it would bind this app to someone else's sign-in.
    if (callback.state !== state) {
      log('graph connect: state mismatch, callback discarded')
      throw new GraphAuthError(
        'Die Antwort der Anmeldung gehört nicht zu dieser Anfrage. Bitte erneut versuchen.',
        'state_mismatch'
      )
    }

    return await exchangeCode(
      cfg,
      {
        code: callback.code,
        codeVerifier: pkce.verifier,
        // Byte-identical to the authorize request — Entra compares them.
        redirectUri: handle.redirectUri
      },
      deps
    )
  } finally {
    handle.close()
  }
}
