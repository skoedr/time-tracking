import type { Migration } from './index'

/**
 * v1.12 #107 — Centralized tag management.
 *
 * Creates a `tags` master registry table (name TEXT PRIMARY KEY).
 * Tags now have an authoritative list — `TagInput` autocomplete and the
 * new `TagManagementView` operate against this table.
 *
 * Pre-populates from existing `entries.tags` values via a recursive CTE
 * that parses the `,tag1,tag2,` format used since migration 007.
 * Uses INSERT OR IGNORE so the statement is safe to re-run (idempotent).
 *
 * Only tags with name length ≤ 50 are imported (matches `tags:create`
 * validation), preventing garbage data from corrupting the registry.
 */
export const migration016: Migration = {
  version: 16,
  name: 'v1.12-tags',
  up: `
    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY
    );

    WITH RECURSIVE
      raw(tag_str) AS (
        SELECT tags FROM entries
        WHERE tags != ''
          AND deleted_at IS NULL
          AND INSTR(tags, ',') > 0
      ),
      split(tag, rest) AS (
        SELECT
          SUBSTR(tag_str, 2, INSTR(SUBSTR(tag_str, 2), ',') - 1),
          SUBSTR(tag_str, 2 + INSTR(SUBSTR(tag_str, 2), ','))
        FROM raw
        UNION ALL
        SELECT
          SUBSTR(rest, 1, INSTR(rest, ',') - 1),
          SUBSTR(rest, INSTR(rest, ',') + 1)
        FROM split
        WHERE rest != '' AND INSTR(rest, ',') > 0
      )
    INSERT OR IGNORE INTO tags (name)
    SELECT DISTINCT tag FROM split
    WHERE tag != '' AND LENGTH(tag) <= 50;
  `
}
