/**
 * Domain → client mapping for the calendar import (#130b).
 *
 * One row per attendee domain (`kunde-x.de` → client X), stored lowercase, with
 * a real foreign key so a deleted client takes its domains with it (see
 * migration 021). `learnDomain` is an upsert on purpose: the confirm dialog's
 * "assign this domain to this client from now on" checkbox (#130c) must be able
 * to move a domain to a different client, not fail on the existing row.
 *
 * Pure database functions — IPC registration lives in `graphHandlers.ts`.
 */
import type Database from 'better-sqlite3'
import type { IpcResult } from '../shared/types'

export interface ClientDomain {
  id: number
  domain: string
  clientId: number
  createdAt: string
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

/**
 * Normalize what a user (or the import dialog) hands us into a comparable
 * domain: lowercase, no surrounding whitespace, a leading `@` stripped because
 * "@kunde.de" is how people naturally type it. Returns `null` for anything that
 * does not look like a hostname — the mapping must never contain values that
 * `domainOf()` could not produce, or lookups would silently miss.
 */
export function normalizeDomain(raw: string): string | null {
  let domain = raw.trim().toLowerCase()
  if (domain.startsWith('@')) domain = domain.slice(1)
  if (domain.length === 0 || domain.length > 253) return null
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null
  return domain
}

export function listClientDomains(db: Database.Database): IpcResult<ClientDomain[]> {
  try {
    const rows = db
      .prepare(
        `SELECT id, domain, client_id AS clientId, created_at AS createdAt
         FROM client_domains ORDER BY domain ASC`
      )
      .all() as ClientDomain[]
    return ok(rows)
  } catch (e) {
    return fail(e)
  }
}

/** The lookup table `resolveClient()` consumes. Internal — not an IPC payload. */
export function domainMapping(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare(`SELECT domain, client_id AS clientId FROM client_domains`)
    .all() as Array<{
    domain: string
    clientId: number
  }>
  return new Map(rows.map((r) => [r.domain, r.clientId]))
}

/**
 * Remember a domain for a client. Upsert: an existing row moves to the new
 * client instead of erroring, because that is what correcting a wrong mapping
 * looks like from the dialog.
 */
export function learnDomain(
  db: Database.Database,
  rawDomain: string,
  clientId: number
): IpcResult<ClientDomain> {
  const domain = normalizeDomain(rawDomain)
  if (!domain) return fail(`'${rawDomain.trim()}' ist keine gültige Domain.`)

  try {
    const client = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(clientId)
    if (!client) return fail(`Kunde ${clientId} existiert nicht.`)
    db.prepare(
      `INSERT INTO client_domains (domain, client_id) VALUES (?, ?)
       ON CONFLICT(domain) DO UPDATE SET client_id = excluded.client_id`
    ).run(domain, clientId)
    const row = db
      .prepare(
        `SELECT id, domain, client_id AS clientId, created_at AS createdAt
         FROM client_domains WHERE domain = ?`
      )
      .get(domain) as ClientDomain
    return ok(row)
  } catch (e) {
    return fail(e)
  }
}

/** Forget a mapping. Removing a non-existent domain is a no-op, not an error. */
export function forgetDomain(db: Database.Database, rawDomain: string): IpcResult<void> {
  const domain = normalizeDomain(rawDomain)
  if (!domain) return fail(`'${rawDomain.trim()}' ist keine gültige Domain.`)
  try {
    db.prepare(`DELETE FROM client_domains WHERE domain = ?`).run(domain)
    return ok(undefined)
  } catch (e) {
    return fail(e)
  }
}
