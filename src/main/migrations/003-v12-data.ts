import type { Migration } from './index'

/**
 * v1.2 data layer:
 * - clients.rate_cent: hourly rate in cents (preparation for v1.3 PDF export
 *   billing). Default 0 = "no rate set", treated as informational only.
 * - entries.deleted_at: soft-delete column. NULL = visible. UI flips it via
 *   entries:delete and reverts via entries:undelete (Toast undo).
 *   Soft-delete preserves the row + ID so future PDF FKs stay stable (E10).
 * - idx_entries_started_at: speeds up dashboard:summary + getByMonth queries
 *   that filter on started_at without a client_id prefix (E12).
 * - Backfill rounded_min for finished entries that never received it (older
 *   v1.0 rows). Skips running entries (stopped_at IS NULL) and clock-skew
 *   rows (stopped_at < started_at). The runner's post-apply assertion will
 *   abort if any negative duration sneaks through.
 */
export const migration003: Migration = {
  version: 3,
  name: 'v1.2-data',
  up: `
    ALTER TABLE clients ADD COLUMN rate_cent INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE entries ADD COLUMN deleted_at TEXT;

    CREATE INDEX IF NOT EXISTS idx_entries_started_at
      ON entries(started_at);

    UPDATE entries
       SET rounded_min = CAST(
         ROUND((julianday(stopped_at) - julianday(started_at)) * 1440) AS INTEGER
       )
     WHERE rounded_min IS NULL
       AND stopped_at IS NOT NULL
       AND stopped_at >= started_at;
  `
}
