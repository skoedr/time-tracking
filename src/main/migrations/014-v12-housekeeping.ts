import type { Migration } from './index'

/**
 * v1.12 Housekeeping — removes dead settings rows.
 *
 * `rounding_mode` and `rounding_minutes` were seeded by Migration 001 but
 * have never been read since the per-entry rounding UI was replaced by the
 * `pdf_round_minutes` setting (Migration 004). They sit in the settings table
 * as dead weight. This migration removes them cleanly.
 *
 * Safe for all users: the keys are not referenced anywhere in the codebase.
 * If the rows are already absent (e.g. manual cleanup), DELETE is a no-op.
 */
export const migration014: Migration = {
  version: 14,
  name: 'v1.12-housekeeping',
  up: `
    DELETE FROM settings WHERE key IN ('rounding_mode', 'rounding_minutes');
  `
}
