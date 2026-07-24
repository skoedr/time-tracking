/**
 * Tests for the guarded MCP write-bridge core. In-memory migrated DB; stubs
 * for confirm/backup/audit/onChange. Skips when better-sqlite3 can't load.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { migrations } from './migrations'
import { handleRequest, type BridgeCtx, type BridgeRequest } from './mcpBridgeCore'

type DatabaseCtor = new (path: string) => Database.Database
let DatabaseImpl: DatabaseCtor | null = null

beforeAll(async () => {
  try {
    const mod = await import('better-sqlite3')
    const Ctor = mod.default as unknown as DatabaseCtor
    const probe = new Ctor(':memory:')
    probe.close()
    DatabaseImpl = Ctor
  } catch {
    DatabaseImpl = null
  }
})

function seed(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  db.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`
  )
  for (const m of migrations) {
    db.transaction(() => {
      db.exec(m.up)
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name)
    })()
  }
  db.prepare(
    `INSERT INTO clients (id, name, color, active, rate_cent) VALUES (1,'Acme','#111',1,0)`
  ).run()
}

interface Spies {
  confirmCalls: number
  backupCalls: number
  auditCalls: number
  changeCalls: number
}

function makeCtx(
  db: Database.Database,
  o: Partial<{
    token: string | null
    incomingWriteEnabled: boolean
    approve: boolean
  }> = {}
): { ctx: BridgeCtx; spies: Spies } {
  const spies: Spies = { confirmCalls: 0, backupCalls: 0, auditCalls: 0, changeCalls: 0 }
  const ctx: BridgeCtx = {
    db,
    token: o.token === undefined ? 'secret' : o.token,
    isWriteEnabled: () => o.incomingWriteEnabled !== false,
    confirm: async () => {
      spies.confirmCalls++
      return o.approve !== false
    },
    ensureBackup: async () => {
      spies.backupCalls++
    },
    audit: () => {
      spies.auditCalls++
    },
    onChange: () => {
      spies.changeCalls++
    }
  }
  return { ctx, spies }
}

const CREATE: BridgeRequest = {
  v: 1,
  token: 'secret',
  op: 'create_manual_entry',
  args: {
    client_id: 1,
    description: 'Feature',
    started_at: '2026-06-10T09:00:00.000Z',
    stopped_at: '2026-06-10T10:00:00.000Z'
  }
}

function countEntries(db: Database.Database): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM entries`).get() as { n: number }).n
}

describe('handleRequest', () => {
  let db: Database.Database
  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    db = new DatabaseImpl(':memory:')
    seed(db)
  })

  it('rejects a bad token', async () => {
    const { ctx } = makeCtx(db)
    const res = await handleRequest(ctx, { ...CREATE, token: 'wrong' })
    expect(res).toMatchObject({ ok: false, code: 'bad_token' })
    expect(countEntries(db)).toBe(0)
  })

  it('rejects when write is disabled', async () => {
    const { ctx } = makeCtx(db, { incomingWriteEnabled: false })
    const res = await handleRequest(ctx, CREATE)
    expect(res).toMatchObject({ ok: false, code: 'write_disabled' })
  })

  it('rejects an op outside the allowlist', async () => {
    const { ctx } = makeCtx(db)
    const res = await handleRequest(ctx, {
      v: 1,
      token: 'secret',
      op: 'delete_client',
      args: { id: 1 }
    })
    expect(res).toMatchObject({ ok: false, code: 'not_allowed' })
  })

  it('rejects a malformed request', async () => {
    const { ctx } = makeCtx(db)
    const res = await handleRequest(ctx, {
      token: 'secret',
      op: 'create_manual_entry'
    } as BridgeRequest)
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('preview does not mutate, confirm, back up, or audit', async () => {
    const { ctx, spies } = makeCtx(db)
    const res = await handleRequest(ctx, { ...CREATE, preview: true })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toMatchObject({ preview: true, action: 'create_manual_entry' })
    expect(countEntries(db)).toBe(0)
    expect(spies).toMatchObject({ confirmCalls: 0, backupCalls: 0, auditCalls: 0, changeCalls: 0 })
  })

  it('commits a create: confirm + backup + change + audit fire once', async () => {
    const { ctx, spies } = makeCtx(db)
    const res = await handleRequest(ctx, CREATE)
    expect(res.ok).toBe(true)
    expect(countEntries(db)).toBe(1)
    expect(spies).toEqual({ confirmCalls: 1, backupCalls: 1, auditCalls: 1, changeCalls: 1 })
  })

  it('declined confirm blocks the mutation', async () => {
    const { ctx, spies } = makeCtx(db, { approve: false })
    const res = await handleRequest(ctx, CREATE)
    expect(res).toMatchObject({ ok: false, code: 'confirm_declined' })
    expect(countEntries(db)).toBe(0)
    expect(spies).toMatchObject({ backupCalls: 0, auditCalls: 0, changeCalls: 0 })
  })

  it('surfaces a validation error as invalid without mutating', async () => {
    const { ctx } = makeCtx(db)
    const res = await handleRequest(ctx, {
      ...CREATE,
      args: { ...CREATE.args, client_id: 999 }
    })
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
    expect(countEntries(db)).toBe(0)
  })

  it('update_entry_fields patches only provided fields', async () => {
    const { ctx } = makeCtx(db)
    await handleRequest(ctx, CREATE)
    const id = (db.prepare(`SELECT id FROM entries LIMIT 1`).get() as { id: number }).id
    const res = await handleRequest(ctx, {
      v: 1,
      token: 'secret',
      op: 'update_entry_fields',
      args: { id, description: 'Renamed', tags: ',x,' }
    })
    expect(res.ok).toBe(true)
    // update deletes + reinserts, yielding a new row id — read it back from the result.
    const newId = res.ok ? (res.data as { id: number }).id : id
    const row = db
      .prepare(`SELECT description, tags, started_at FROM entries WHERE id = ?`)
      .get(newId) as {
      description: string
      tags: string
      started_at: string
    }
    expect(row.description).toBe('Renamed')
    expect(row.tags).toBe(',x,')
    expect(row.started_at).toBe('2026-06-10T09:00:00.000Z') // untouched
  })

  it('update_entry_fields refuses a running entry even if stopped_at is supplied', async () => {
    const { ctx } = makeCtx(db)
    await handleRequest(ctx, {
      v: 1,
      token: 'secret',
      op: 'start_timer',
      args: { client_id: 1, description: 'run', started_at: '2026-06-10T09:00:00.000Z' }
    })
    const id = (
      db.prepare(`SELECT id FROM entries WHERE stopped_at IS NULL`).get() as { id: number }
    ).id
    const res = await handleRequest(ctx, {
      v: 1,
      token: 'secret',
      op: 'update_entry_fields',
      args: { id, stopped_at: '2026-06-10T10:00:00.000Z', description: 'x' }
    })
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
    // Still running — untouched.
    const row = db.prepare(`SELECT stopped_at FROM entries WHERE id = ?`).get(id) as {
      stopped_at: string | null
    }
    expect(row.stopped_at).toBeNull()
  })

  it('start_timer then stop_running_timer', async () => {
    const { ctx } = makeCtx(db)
    const start = await handleRequest(ctx, {
      v: 1,
      token: 'secret',
      op: 'start_timer',
      args: { client_id: 1, description: 'run', started_at: '2026-06-10T09:00:00.000Z' }
    })
    expect(start.ok).toBe(true)
    expect(
      (
        db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE stopped_at IS NULL`).get() as {
          n: number
        }
      ).n
    ).toBe(1)
    const stop = await handleRequest(ctx, { v: 1, token: 'secret', op: 'stop_running_timer' })
    expect(stop.ok).toBe(true)
    expect(
      (
        db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE stopped_at IS NULL`).get() as {
          n: number
        }
      ).n
    ).toBe(0)
  })
})
