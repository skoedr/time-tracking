// Shared types between main process and renderer

export interface Client {
  id: number
  name: string
  color: string
  active: number
  rate_cent: number
  created_at: string
}

export interface Entry {
  id: number
  client_id: number
  description: string
  started_at: string
  stopped_at: string | null
  heartbeat_at: string | null
  rounded_min: number | null
  deleted_at: string | null
  created_at: string
  /**
   * v1.3 PR B: when an entry crosses local midnight, it's stored as
   * multiple rows that share the same UUID. NULL for plain single-day
   * entries. The Drawer offers a "auch zweite Hälfte löschen?" prompt
   * when the user deletes a row with a non-null link_id.
   */
  link_id: string | null
  /**
   * v1.4 PR C: comma-delimited serialized tags, e.g. `,bug,ux,`.
   * Empty string means untagged. Use `deserializeTags` from shared/tags.ts
   * to convert to an array for UI consumption.
   */
  tags: string
  /**
   * v1.8 #70: optional free-text reference (Jira ticket, GitHub issue, …).
   * Empty string means no reference. Never null — the DB column has
   * NOT NULL DEFAULT ''.
   */
  reference: string
  /**
   * v1.8 #71: 1 = billable (default), 0 = non-billable.
   * Non-billable entries are counted in total duration but excluded from
   * invoice exports (CSV, PDF) and the billable-hours summary.
   */
  billable: number
  /**
   * v1.8 #72: optional internal-only note, never written to any export.
   * Empty string means no note set.
   */
  private_note: string
  /**
   * v1.9 #75: optional project association. NULL means "no project / general".
   */
  project_id?: number | null
}

// ── Projects (v1.9 #75) ───────────────────────────────────────────────────

export interface Project {
  id: number
  /** NULL = orphaned / no client (E4 escape hatch). */
  client_id: number | null
  name: string
  /** '' = inherit client color. */
  color: string
  /** null = inherit client rate. */
  rate_cent: number | null
  /** 1 = active, 0 = archived. */
  active: number
  created_at: string
  /**
   * Only present in `projects:getAll` responses. Counts non-deleted entries.
   */
  entry_count?: number
  /**
   * Only present in `projects:getAll` responses. ISO timestamp of the most
   * recent entry's started_at, or null when no entries exist.
   */
  last_used_at?: string | null
}

/** Project guaranteed to include entry_count (returned by projects:getAll). */
export type ProjectWithCount = Required<Pick<Project, 'entry_count'>> & Omit<Project, 'entry_count'>

export interface CreateProjectInput {
  client_id: number | null
  name: string
  color: string
  rate_cent?: number | null
}

export interface UpdateProjectInput {
  id: number
  client_id: number | null
  name: string
  color: string
  rate_cent?: number | null
  active: number
}

export interface Settings {
  rounding_mode: 'none' | 'ceil' | 'floor' | 'round'
  rounding_minutes: '5' | '10' | '15' | '30'
  company_name: string
  backup_path: string
  // v1.1
  idle_threshold_minutes: string
  language: string
  auto_start: string
  hotkey_toggle: string
  // v1.3 PR A — PDF template settings (seeded by migration 004).
  // All stored as strings in the key-value `settings` table; the renderer
  // parses pdf_round_minutes back to a number when needed.
  pdf_logo_path: string
  pdf_sender_address: string
  pdf_tax_id: string
  pdf_accent_color: string
  pdf_footer_text: string
  pdf_round_minutes: string
  // v1.4 — Mini-Widget (always-on-top 200x40 overlay).
  // Stored as strings; renderer parses '0'/'1' booleans and integer
  // positions. mini_x/mini_y of -1 means "never positioned, use default".
  mini_enabled: string
  mini_hotkey: string
  mini_x: string
  mini_y: string
  // v1.5 PR E — Onboarding wizard.
  // '0' = not yet completed, '1' = done (or existing user after upgrade).
  onboarding_completed: string
  // v1.8 #76 — Theme mode: 'light' | 'dark' | 'system'.
  theme_mode: string
}

export interface CreateClientInput {
  name: string
  color: string
  /**
   * Hourly rate in cents. 0 = "no rate set" (PDF export omits the fee
   * column). Integer arithmetic prevents float drift on totals.
   */
  rate_cent?: number
}

export interface UpdateClientInput {
  id: number
  name: string
  color: string
  active: number
  rate_cent?: number
}

export interface CreateEntryInput {
  client_id: number
  description: string
  started_at: string
  /** v1.9 #75: optional project association. */
  project_id?: number | null
}

/**
 * Manual-entry creation (Today "+ Eintrag nachtragen" / Calendar drawer
 * "+ Eintrag hinzufügen"). Distinct from CreateEntryInput because manual
 * entries always carry a stopped_at; running entries are created via
 * `entries:start` only.
 */
export interface CreateManualEntryInput {
  client_id: number
  description: string
  started_at: string
  stopped_at: string
  /** Serialized tags string (e.g. `,bug,ux,`). Optional — defaults to '' */
  tags?: string
  /** Free-text ticket/reference (e.g. 'JIRA-123'). Optional — defaults to '' */
  reference?: string
  /** 1 = billable (default), 0 = non-billable. Optional — defaults to 1 */
  billable?: number
  /** Internal-only note, never exported. Optional — defaults to '' */
  private_note?: string
  /** v1.9 #75: optional project association. */
  project_id?: number | null
}

export interface UpdateEntryInput {
  id: number
  client_id: number
  description: string
  started_at: string
  stopped_at: string
  /** Serialized tags string (e.g. `,bug,ux,`). Optional — defaults to '' */
  tags?: string
  /** Free-text ticket/reference (e.g. 'JIRA-123'). Optional — defaults to '' */
  reference?: string
  /** 1 = billable (default), 0 = non-billable. Optional — defaults to 1 */
  billable?: number
  /** Internal-only note, never exported. Optional — defaults to '' */
  private_note?: string
  /** v1.9 #75: optional project association. */
  project_id?: number | null
}

export interface MonthQuery {
  year: number
  month: number // 1-12
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type BackupReason = 'daily' | 'manual' | 'pre-migration'

export interface BackupInfo {
  filename: string
  fullPath: string
  reason: BackupReason
  createdAt: string
  sizeBytes: number
}

/**
 * v1.5 PR B — auto-update lifecycle status broadcast over `update:status` IPC.
 */
export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; progress: number }
  | { status: 'ready'; version: string }
  | { status: 'not-available'; checkedAt: string }
  | { status: 'error'; message: string }

/** Aggregated dashboard view returned by `dashboard:summary`. */
export interface DashboardSummary {
  todaySeconds: number
  weekSeconds: number
  recentEntries: Entry[]
  topClients30d: Array<{ client_id: number; name: string; color: string; seconds: number }>
}

/**
 * v1.5 PR F — one entry in resources/licenses.json, generated by
 * scripts/generate-licenses.mjs from the production dependency tree.
 */
export interface LicenseEntry {
  name: string
  version: string
  license: string
  repository?: string
  licenseText?: string | null
}
