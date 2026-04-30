import type { Migration } from './index'

/**
 * v1.11 #94 — Stammdaten-Erweiterung Kunden + Projekte.
 *
 * Clients: adds billing address (4 lines), VAT ID, contact person,
 * contact email. All nullable — existing clients are unaffected.
 *
 * Projects: adds external project number, start/end dates, budget
 * (in minutes, integer arithmetic), and a `status` column that
 * supersedes the binary `active` flag.
 *
 * active → status migration:
 *   The old `active` column is kept for backward compatibility but is
 *   now kept in sync by all writers. The partial unique index
 *   `idx_projects_unique_active_name` is replaced by
 *   `idx_projects_unique_status_name` (WHERE status = 'active').
 *   `idx_projects_client_active` is replaced by
 *   `idx_projects_client_status`.
 *   Both old indexes are dropped here.
 *   `active` will be dropped in a future migration (v1.12+).
 */
export const migration013: Migration = {
  version: 13,
  name: 'v1.11-stammdaten',
  up: `
    -- ── Clients: new optional master-data columns ──────────────────────
    ALTER TABLE clients ADD COLUMN billing_address_line1 TEXT;
    ALTER TABLE clients ADD COLUMN billing_address_line2 TEXT;
    ALTER TABLE clients ADD COLUMN billing_address_line3 TEXT;
    ALTER TABLE clients ADD COLUMN billing_address_line4 TEXT;
    ALTER TABLE clients ADD COLUMN vat_id               TEXT;
    ALTER TABLE clients ADD COLUMN contact_person       TEXT;
    ALTER TABLE clients ADD COLUMN contact_email        TEXT;

    -- ── Projects: new optional master-data columns ─────────────────────
    ALTER TABLE projects ADD COLUMN external_project_number TEXT;
    ALTER TABLE projects ADD COLUMN start_date              TEXT;
    ALTER TABLE projects ADD COLUMN end_date                TEXT;
    ALTER TABLE projects ADD COLUMN budget_minutes          INTEGER;
    ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'paused', 'archived'));

    -- Sync status from the existing active flag for all current rows.
    UPDATE projects SET status = CASE WHEN active = 1 THEN 'active' ELSE 'archived' END;

    -- Replace old active-based indexes with status-based equivalents.
    DROP INDEX IF EXISTS idx_projects_unique_active_name;
    DROP INDEX IF EXISTS idx_projects_client_active;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_unique_status_name
      ON projects(client_id, name) WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS idx_projects_client_status
      ON projects(client_id, status);
  `
}
