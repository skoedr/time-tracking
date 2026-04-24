import type { Client, Entry } from '../shared/types'
import type Database from 'better-sqlite3'

export interface JsonExportPayload {
  meta: { schemaVersion: number; exportedAt: string; appVersion: string }
  clients: Client[]
  entries: Entry[]
  settings: Array<{ key: string; value: string }>
}

/**
 * Build the JSON export payload from a live DB handle. Pure function —
 * extracted from ipc.ts so unit tests can call it without booting Electron.
 *
 * Output is a verbatim dump (no field renames, no PII filtering, soft-deleted
 * rows included) so users can verify their data byte-for-byte and future
 * CSV/PDF tooling can build on top of the snapshot.
 */
export function buildJsonExportPayload(
  db: Database.Database,
  appVersion: string
): JsonExportPayload {
  const schemaVersion =
    (db.prepare(`SELECT MAX(version) AS v FROM schema_version`).get() as { v: number | null }).v ??
    0
  const clients = db.prepare(`SELECT * FROM clients ORDER BY id ASC`).all() as Client[]
  const entries = db
    .prepare(`SELECT * FROM entries ORDER BY started_at ASC, id ASC`)
    .all() as Entry[]
  const settings = db.prepare(`SELECT key, value FROM settings ORDER BY key ASC`).all() as Array<{
    key: string
    value: string
  }>
  return {
    meta: {
      schemaVersion,
      exportedAt: new Date().toISOString(),
      appVersion
    },
    clients,
    entries,
    settings
  }
}
