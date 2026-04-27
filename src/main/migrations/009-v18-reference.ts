import type { Migration } from './index'

/**
 * v1.8 #70 — Optional ticket/reference field per entry.
 *
 * Adds `reference TEXT NOT NULL DEFAULT ''` to entries so users can
 * annotate entries with a Jira ticket, GitHub issue number, or any
 * other external identifier. Empty string means "no reference set".
 * The column flows into CSV export and PDF timesheet.
 */
export const migration009: Migration = {
  version: 9,
  name: 'v1.8-reference',
  up: `
    ALTER TABLE entries ADD COLUMN reference TEXT NOT NULL DEFAULT '';
  `
}
