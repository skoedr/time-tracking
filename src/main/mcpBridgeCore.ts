/**
 * Electron-free core of the MCP write bridge.
 *
 * `handleRequest` is the single guarded entry point that both the socket
 * server (mcpBridge.ts) and the unit tests drive. It contains no `net`, no
 * `electron`, and no I/O beyond the injected DB + callbacks — so the whole
 * guard chain (token, opt-in, allowlist, preview, confirm, backup, audit) is
 * testable with stubs.
 */
import type Database from 'better-sqlite3'
import {
  createManualEntry,
  updateManualEntry,
  startTimer,
  stopRunningTimer,
  validateManualEntry
} from './entryMutations'
import type {
  Entry,
  CreateManualEntryInput,
  UpdateEntryInput,
  CreateEntryInput
} from '../shared/types'
import type { McpAuditEntry } from './mcpAudit'

type Db = Database.Database

export const WRITE_OPS = [
  'create_manual_entry',
  'update_entry_fields',
  'stop_running_timer',
  'start_timer'
] as const
export type WriteOp = (typeof WRITE_OPS)[number]

export interface BridgeRequest {
  v?: number
  token?: string
  op?: string
  args?: Record<string, unknown>
  preview?: boolean
}

export type BridgeResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code: BridgeErrorCode }

export type BridgeErrorCode =
  | 'invalid'
  | 'bad_token'
  | 'write_disabled'
  | 'not_allowed'
  | 'confirm_declined'

export interface BridgeCtx {
  db: Db
  /** Expected token; null/empty ⇒ treat as write-disabled. */
  token: string | null
  /** Re-checked per request from the settings table. */
  isWriteEnabled: () => boolean
  /** Ask the user; encapsulates per-write/session/silent. Resolves to approval. */
  confirm: (summary: string) => Promise<boolean>
  /** Make the one-per-session pre-write backup (idempotent). */
  ensureBackup: () => Promise<void>
  audit: (entry: McpAuditEntry) => void
  /** Broadcast + tray refresh after a committed change. */
  onChange: () => void
}

function err(code: BridgeErrorCode, error: string): BridgeResponse {
  return { ok: false, error, code }
}

// ── arg coercion ───────────────────────────────────────────────────────────

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function asBillable(v: unknown, fallback: number): number {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return v === 0 ? 0 : 1
  return fallback
}
function asProjectId(v: unknown, fallback: number | null): number | null {
  if (v === null) return null
  if (typeof v === 'number') return v
  return fallback
}
function durationMin(started_at: string, stopped_at: string): number {
  return Math.round((Date.parse(stopped_at) - Date.parse(started_at)) / 60000)
}

// ── op planning ──────────────────────────────────────────────────────────

interface Plan {
  summary: string
  preview: Record<string, unknown>
  run: () => { ok: true; data: Entry | null } | { ok: false; error: string }
  audit: (result: Entry | null) => McpAuditEntry
}

/** Build an executable plan for an op, or return an error string. */
function planOp(db: Db, op: WriteOp, args: Record<string, unknown>): Plan | { error: string } {
  switch (op) {
    case 'create_manual_entry': {
      const input: CreateManualEntryInput = {
        client_id: Number(args.client_id),
        description: asString(args.description),
        started_at: asString(args.started_at),
        stopped_at: asString(args.stopped_at),
        tags: asString(args.tags),
        reference: asString(args.reference),
        billable: asBillable(args.billable, 1),
        private_note: asString(args.private_note),
        project_id: asProjectId(args.project_id, null)
      }
      const vErr = validateManualEntry(db, input)
      if (vErr) return { error: vErr }
      return {
        summary: `Eintrag nachtragen — Kunde ${input.client_id}, ${input.started_at} → ${input.stopped_at} (${durationMin(input.started_at, input.stopped_at)} min): "${input.description}"`,
        preview: {
          action: 'create_manual_entry',
          client_id: input.client_id,
          started_at: input.started_at,
          stopped_at: input.stopped_at,
          duration_min: durationMin(input.started_at, input.stopped_at),
          project_id: input.project_id
        },
        run: () => createManualEntry(db, input),
        audit: (r) => ({
          op,
          id: r?.id ?? null,
          client_id: input.client_id,
          started_at: input.started_at,
          stopped_at: input.stopped_at,
          hasPrivateNote: (input.private_note ?? '') !== ''
        })
      }
    }
    case 'update_entry_fields': {
      const id = Number(args.id)
      const existing = db
        .prepare(`SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL`)
        .get(id) as Entry | undefined
      if (!existing) return { error: 'Eintrag existiert nicht' }
      // Running timers are excluded from update_entry_fields entirely (matches
      // the tool description). Stop the timer via stop_running_timer first.
      if (existing.stopped_at === null) {
        return {
          error:
            'Laufende Einträge können nicht über update_entry_fields bearbeitet werden — erst stop_running_timer nutzen'
        }
      }
      const input: UpdateEntryInput = {
        id,
        client_id: args.client_id === undefined ? existing.client_id : Number(args.client_id),
        description:
          args.description === undefined ? existing.description : asString(args.description),
        started_at: args.started_at === undefined ? existing.started_at : asString(args.started_at),
        stopped_at:
          args.stopped_at === undefined ? (existing.stopped_at ?? '') : asString(args.stopped_at),
        tags: args.tags === undefined ? existing.tags : asString(args.tags),
        reference: args.reference === undefined ? existing.reference : asString(args.reference),
        billable:
          args.billable === undefined
            ? existing.billable
            : asBillable(args.billable, existing.billable),
        private_note:
          args.private_note === undefined ? existing.private_note : asString(args.private_note),
        project_id:
          'project_id' in args
            ? asProjectId(args.project_id, existing.project_id ?? null)
            : (existing.project_id ?? null)
      }
      const vErr = validateManualEntry(db, input, id, existing.link_id ?? undefined)
      if (vErr) return { error: vErr }
      return {
        summary: `Eintrag #${id} ändern — ${input.started_at} → ${input.stopped_at}: "${input.description}"`,
        preview: {
          action: 'update_entry_fields',
          id,
          before: {
            description: existing.description,
            started_at: existing.started_at,
            stopped_at: existing.stopped_at,
            tags: existing.tags,
            reference: existing.reference,
            billable: existing.billable,
            project_id: existing.project_id ?? null
          },
          after: {
            description: input.description,
            started_at: input.started_at,
            stopped_at: input.stopped_at,
            tags: input.tags,
            reference: input.reference,
            billable: input.billable,
            project_id: input.project_id
          }
        },
        run: () => updateManualEntry(db, input),
        audit: (r) => ({
          op,
          id: r?.id ?? id,
          client_id: input.client_id,
          started_at: input.started_at,
          stopped_at: input.stopped_at,
          hasPrivateNote: (input.private_note ?? '') !== ''
        })
      }
    }
    case 'start_timer': {
      const input: CreateEntryInput = {
        client_id: Number(args.client_id),
        description: asString(args.description),
        started_at: asString(args.started_at) || new Date().toISOString(),
        project_id: asProjectId(args.project_id, null)
      }
      const client = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(input.client_id) as
        | { id: number }
        | undefined
      if (!client) return { error: 'Kunde existiert nicht' }
      return {
        summary: `Timer starten — Kunde ${input.client_id}: "${input.description}"`,
        preview: {
          action: 'start_timer',
          client_id: input.client_id,
          started_at: input.started_at,
          project_id: input.project_id
        },
        run: () => startTimer(db, input),
        audit: (r) => ({
          op,
          id: r?.id ?? null,
          client_id: input.client_id,
          started_at: input.started_at
        })
      }
    }
    case 'stop_running_timer': {
      const running = db
        .prepare(
          `SELECT id, client_id FROM entries WHERE stopped_at IS NULL AND deleted_at IS NULL
           ORDER BY started_at DESC LIMIT 1`
        )
        .get() as { id: number; client_id: number } | undefined
      return {
        summary: running
          ? `Laufenden Timer stoppen (Eintrag #${running.id})`
          : 'Laufenden Timer stoppen (keiner aktiv)',
        preview: { action: 'stop_running_timer', running: running ?? null },
        run: () => stopRunningTimer(db),
        audit: (r) => ({ op, id: r?.id ?? null, client_id: r?.client_id ?? null })
      }
    }
  }
}

/**
 * Guarded request handler. Order: shape → token → opt-in → allowlist → plan →
 * (preview short-circuits here) → confirm → backup → execute → broadcast + audit.
 */
export async function handleRequest(ctx: BridgeCtx, req: BridgeRequest): Promise<BridgeResponse> {
  if (!req || req.v !== 1 || typeof req.op !== 'string') {
    return err('invalid', 'Ungültige Anfrage')
  }
  if (!ctx.token || req.token !== ctx.token) {
    return err('bad_token', 'Ungültiges oder fehlendes Token')
  }
  if (!ctx.isWriteEnabled()) {
    return err('write_disabled', 'Schreibzugriff ist deaktiviert (Einstellungen → Integrationen)')
  }
  if (!(WRITE_OPS as readonly string[]).includes(req.op)) {
    return err('not_allowed', `Operation nicht erlaubt: ${req.op}`)
  }

  const plan = planOp(ctx.db, req.op as WriteOp, req.args ?? {})
  if ('error' in plan) return err('invalid', plan.error)

  if (req.preview) {
    return { ok: true, data: { preview: true, ...plan.preview } }
  }

  const approved = await ctx.confirm(plan.summary)
  if (!approved) return err('confirm_declined', 'Änderung wurde in TimeTrack abgelehnt')

  await ctx.ensureBackup()

  const result = plan.run()
  if (!result.ok) return err('invalid', result.error)

  ctx.onChange()
  ctx.audit(plan.audit(result.data))
  return { ok: true, data: result.data }
}
