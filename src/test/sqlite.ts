/**
 * Shared SQLite bootstrap for the DB-backed test suites (#151).
 *
 * Twelve test files used to carry their own copy of the same probe: try to
 * load `better-sqlite3`, and if the native binding does not fit the current
 * runtime's ABI, silently skip every test in the file. That turned a broken
 * environment into a green summary — `334 passed | 201 skipped` reads as
 * success, not as "a third of your coverage did not run".
 *
 * `pnpm test` now runs on the Electron binary in Node mode (see
 * `scripts/run-vitest.mjs`), so the ABI always matches and there is no longer
 * a legitimate reason for these suites to be unavailable. `loadSqlite()`
 * therefore **throws** instead of skipping: if the module cannot load, the run
 * is red and says exactly what to do about it.
 */
import type Database from 'better-sqlite3'
import { migrations } from '../main/migrations'

/** Constructor shape of `better-sqlite3`'s default export. */
export type DatabaseCtor = new (path: string) => Database.Database

const HINT = [
  'better-sqlite3 could not be loaded — the DB-backed tests cannot run.',
  '',
  'The binary is compiled against the Electron ABI (the app needs that at',
  'runtime), so the suite must run on Electron in Node mode. Use the package',
  'script, which does that for you:',
  '',
  '    pnpm test',
  '',
  'Running `vitest` directly under a system Node will always fail here.',
  '',
  'If `pnpm test` itself fails this way, the binary is stale — most likely',
  'because `pnpm rebuild better-sqlite3` replaced it with a Node-ABI build.',
  'Note that `pnpm install` does NOT repair this: electron-builder caches the',
  'ABI marker in node_modules/better-sqlite3/build/Release/.forge-meta and',
  'skips the rebuild. Force it:',
  '',
  '    pnpm exec electron-rebuild -f -w better-sqlite3'
].join('\n')

let cached: DatabaseCtor | null = null

/**
 * Load the `better-sqlite3` constructor, or throw with an actionable message.
 *
 * The import is dynamic and the constructor is exercised once, because the
 * native binding can fail either at load time or only on first instantiation
 * depending on how the bindings shim resolves.
 */
export async function loadSqlite(): Promise<DatabaseCtor> {
  if (cached) return cached
  try {
    const mod = await import('better-sqlite3')
    const Ctor = mod.default as unknown as DatabaseCtor
    const probe = new Ctor(':memory:')
    probe.close()
    cached = Ctor
    return Ctor
  } catch (cause) {
    throw new Error(`${HINT}\n\nUnderlying error: ${(cause as Error)?.message ?? cause}`, { cause })
  }
}

/**
 * Bring an empty database up to the current schema by running every migration
 * in order, exactly as `runMigrations` does in production.
 *
 * Deliberately does not touch `PRAGMA foreign_keys`: some suites enable it and
 * some rely on it being off, so that stays with the caller.
 */
export function applyMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  )
  for (const m of migrations) {
    db.transaction(() => {
      db.exec(m.up)
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name)
    })()
  }
}
