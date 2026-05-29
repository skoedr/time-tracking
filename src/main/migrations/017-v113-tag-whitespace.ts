import type { Migration } from './index'

/**
 * v1.13 #121 — Disallow whitespace in tag names.
 *
 * Historic validation in `tagHandlers.ts` only rejected commas, so master
 * tags containing spaces (e.g. `ticket 12345`) could be created via
 * `tags:create`. When such a tag was later re-typed at an entry, the
 * shared `parseTagInput()` split it on whitespace, producing two tags
 * (`ticket`, `12345`) — silently breaking the tag.
 *
 * This migration normalises legacy data by replacing every space (0x20)
 * and tab (0x09) inside tag names with `_`. Multi-whitespace runs become
 * multi-underscore runs — still valid under the new regex.
 *
 * Collision handling: if the cleaned name already exists in the master
 * registry, `INSERT OR IGNORE` keeps the existing row and the dirty one
 * is dropped — effectively a merge.
 *
 * `entries.tags` uses the serialized form `,tag1,tag2,`. Tag names never
 * contain commas, so a blunt `REPLACE` of space/tab with underscore on
 * the whole column is safe.
 */
export const migration017: Migration = {
  version: 17,
  name: 'v1.13-tag-whitespace',
  up: `
    -- 1) Rewrite entries.tags: replace literal space / tab with underscore.
    UPDATE entries
    SET tags = REPLACE(REPLACE(tags, CHAR(9), '_'), ' ', '_')
    WHERE tags GLOB '*[ ${'\t'}]*';

    -- 2) Insert cleaned names into the master registry first
    --    (OR IGNORE merges into any pre-existing cleaned name).
    INSERT OR IGNORE INTO tags (name)
    SELECT REPLACE(REPLACE(name, CHAR(9), '_'), ' ', '_')
    FROM tags
    WHERE name GLOB '*[ ${'\t'}]*';

    -- 3) Drop the original whitespace-containing rows.
    DELETE FROM tags WHERE name GLOB '*[ ${'\t'}]*';
  `
}
