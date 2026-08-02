import type { Migration } from './index'

/**
 * v1.18 #188 — configurable week start.
 *
 * One default for every installation: `monday`. The week card and the MCP
 * dashboard counted from Sunday before this, while the export quick filters
 * and the calendar grid already counted from Monday — so this migration does
 * not preserve the old behaviour, it ends the disagreement. Existing
 * installations see the week total move once; the setting puts it back.
 *
 * `INSERT OR IGNORE` keeps it idempotent and never overwrites a user choice.
 */
export const migration026: Migration = {
  version: 26,
  name: 'v1.18-week-start',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('week_start', 'monday');
  `
}
