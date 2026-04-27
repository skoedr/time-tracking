import type { Migration } from './index'

/**
 * v1.8 #71 / #72 — Non-billable flag and private note per entry.
 *
 * `billable INTEGER NOT NULL DEFAULT 1`
 *   0 = non-billable: the entry is counted in total duration but excluded
 *   from invoice exports (CSV, PDF) and the billable-hours summary.
 *   1 = billable (default, backwards-compatible).
 *
 * `private_note TEXT NOT NULL DEFAULT ''`
 *   Free-text internal annotation visible only inside the app.
 *   Never written to any export (CSV, PDF, JSON backup omits it intentionally).
 *   Empty string means no note set.
 */
export const migration010: Migration = {
  version: 10,
  name: 'v1.8-billable-private-note',
  up: `
    ALTER TABLE entries ADD COLUMN billable    INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE entries ADD COLUMN private_note TEXT    NOT NULL DEFAULT '';
  `
}
