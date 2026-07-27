/**
 * At-rest storage for the Microsoft Graph tokens (#130).
 *
 * A refresh token is a bearer credential for someone's mailbox and calendar in
 * a foreign tenant. That is a different class of secret from what this repo
 * stored before — the webhook secrets sit in the `settings` table in plain text
 * (`webhooks.ts`), and the MCP write token is a locally generated value that is
 * worthless elsewhere. So this one is encrypted with Electron's `safeStorage`
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux) and kept in its own
 * file rather than in the database.
 *
 * **Why not the `settings` table.** Backups copy the `.sqlite` file
 * (`backup.ts`), so a token in there would travel into every backup and, on
 * restore, onto other machines — where `safeStorage` cannot decrypt it anyway
 * (DPAPI is user- and machine-bound). Keeping it beside the DB means a restore
 * simply does not touch the connection, which is the honest behaviour: the
 * connection belongs to this machine, not to the data.
 *
 * **No plaintext fallback.** If `safeStorage` reports that encryption is not
 * available — the realistic case is a Linux session with no keyring — saving
 * fails with an explanation instead of silently writing the refresh token to
 * disk in the clear. A feature that quietly downgrades its own protection is
 * worse than one that says it cannot run here.
 */
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { StoredTokens } from '../shared/graphAuth'

export const TOKEN_FILENAME = 'graph-account.enc'

/** The slice of Electron's `safeStorage` this module needs. Injectable for tests. */
export interface SecretBox {
  isEncryptionAvailable: () => boolean
  encryptString: (plain: string) => Buffer
  decryptString: (cipher: Buffer) => string
}

export interface TokenStoreDeps {
  /**
   * Directory to keep the file in — **required, deliberately with no default**.
   *
   * There used to be one, and it caused two bugs in a row. First it came from
   * `mcp/socketPath.ts`'s `userDataDir()`, which reconstructs `%APPDATA%` for
   * the Electron-free MCP server and therefore cannot see an overridden
   * userData location: the token landed next to a database the app was not
   * using. The obvious repair — lazily `require('./db')` — was worse, because
   * electron-vite bundles main into a single file where `require('./db')` has
   * nothing to resolve at runtime; the whole feature reported "keychain
   * unavailable" in every build.
   *
   * Neither was visible to the unit tests, which always inject `dir`. So the
   * default is gone and the caller has to say where it goes; `graphHandlers.ts`
   * takes it from the database the app actually opened.
   */
  dir: string
  secretBox?: SecretBox
  log?: (message: string) => void
}

export class TokenStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'encryption_unavailable' | 'write_failed'
  ) {
    super(message)
    this.name = 'TokenStoreError'
  }
}

/**
 * Electron's real `safeStorage`, resolved lazily.
 *
 * Imported through a function rather than at module load so the module can be
 * unit-tested under `ELECTRON_RUN_AS_NODE`, where `require('electron')` yields
 * a path string instead of the API.
 */
function electronSecretBox(): SecretBox {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- #130: lazy, see above
  const { safeStorage } = require('electron') as { safeStorage: SecretBox }
  return safeStorage
}

/**
 * Where the token belongs, given the path of the database the app opened.
 *
 * Same anchor as `mcpBridge.ts` (`dirname(getDbPath())`), and the reason it is
 * a named function is so the rule can be tested without an Electron app.
 */
export function tokenDirForDbPath(dbPath: string): string {
  return dirname(dbPath)
}

function resolve(deps: TokenStoreDeps): {
  box: SecretBox
  file: string
  log: (m: string) => void
} {
  return {
    box: deps.secretBox ?? electronSecretBox(),
    file: join(deps.dir, TOKEN_FILENAME),
    log: deps.log ?? ((): void => {})
  }
}

/** Whether tokens can be stored at all on this machine. */
export function isStorageAvailable(deps: TokenStoreDeps): boolean {
  try {
    return resolve(deps).box.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * Persist tokens, replacing anything already stored.
 *
 * Written to a temporary file and renamed into place: a crash midway must not
 * leave a half-written blob that decrypts to garbage and silently drops the
 * connection.
 */
export function saveTokens(tokens: StoredTokens, deps: TokenStoreDeps): void {
  const { box, file, log } = resolve(deps)
  if (!box.isEncryptionAvailable()) {
    throw new TokenStoreError(
      'Die sichere Ablage des Systems ist nicht verfügbar, deshalb wird die Verbindung nicht ' +
        'gespeichert. Unter Linux fehlt dafür meist ein Schlüsselbund (z. B. gnome-keyring).',
      'encryption_unavailable'
    )
  }
  const cipher = box.encryptString(JSON.stringify(tokens))
  const tmp = `${file}.tmp`
  try {
    writeFileSync(tmp, cipher, { mode: 0o600 })
    try {
      chmodSync(tmp, 0o600)
    } catch {
      // chmod is a no-op / unsupported on Windows — the file still isn't shared.
    }
    renameSync(tmp, file)
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      /* best effort */
    }
    throw new TokenStoreError(
      `Die Verbindung konnte nicht gespeichert werden: ${(err as Error).message}`,
      'write_failed'
    )
  }
  log('graph token store: tokens saved')
}

/** Shape check — a decrypted blob from an older or corrupted file may be anything. */
function isStoredTokens(v: unknown): v is StoredTokens {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.accessToken === 'string' &&
    o.accessToken.length > 0 &&
    typeof o.refreshToken === 'string' &&
    o.refreshToken.length > 0 &&
    typeof o.expiresAtMs === 'number' &&
    Number.isFinite(o.expiresAtMs)
  )
}

/**
 * Read the stored tokens, or `null` when there is no usable connection.
 *
 * Never throws for a missing, unreadable, undecryptable or malformed file. All
 * of those mean the same thing to the rest of the app — "not connected" — and
 * the recovery is identical: the user connects again, which overwrites the
 * file. Throwing here would turn a restored backup on a new machine into a
 * crash on startup.
 */
export function loadTokens(deps: TokenStoreDeps): StoredTokens | null {
  const { box, file, log } = resolve(deps)
  if (!existsSync(file)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(box.decryptString(readFileSync(file)))
  } catch (err) {
    // Typically: the file was copied from another machine, or the OS key
    // changed. Deliberately no token material in the message.
    log(`graph token store: stored connection unreadable (${(err as Error).name})`)
    return null
  }
  if (!isStoredTokens(parsed)) {
    log('graph token store: stored connection has an unexpected shape, ignoring')
    return null
  }
  return parsed
}

/** True when a connection is stored and usable. */
export function hasStoredTokens(deps: TokenStoreDeps): boolean {
  return loadTokens(deps) !== null
}

/** Remove the stored connection. Idempotent — "disconnect" when nothing is stored is fine. */
export function clearTokens(deps: TokenStoreDeps): void {
  const { file, log } = resolve(deps)
  try {
    if (existsSync(file)) {
      unlinkSync(file)
      log('graph token store: tokens cleared')
    }
  } catch (err) {
    log(`graph token store: could not remove the stored connection (${(err as Error).message})`)
  }
}
