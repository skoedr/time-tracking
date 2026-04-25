import type { Migration } from './index'

/**
 * v1.4 PR C — Tags per entry.
 *
 * Adds a `tags` column to `entries`. Format: comma-separated lowercase
 * tokens with leading and trailing commas when non-empty, e.g. `,bug,ux,`
 * so that LIKE `%,bug,%` gives an exact substring match without false
 * positives for prefixes/suffixes (e.g. `bugfix` won't match `bug`).
 *
 * Empty string (NOT NULL) is the default so existing rows behave as
 * "untagged" without any backfill.
 */
export const migration007: Migration = {
  version: 7,
  name: 'v1.4-tags',
  up: `ALTER TABLE entries ADD COLUMN tags TEXT NOT NULL DEFAULT ''`
}
