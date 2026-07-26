import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import { getAllTagsWithCount, createTag, renameTag, mergeTag, deleteTag } from './tagHandlers'
import { applyMigrations, loadSqlite, type DatabaseCtor } from '../test/sqlite'

let DatabaseImpl: DatabaseCtor

beforeAll(async () => {
  DatabaseImpl = await loadSqlite()
})

describe('tagHandlers', () => {
  let tmpDir: string
  let db: Database.Database

  beforeEach(() => {
    tmpDir = join(tmpdir(), `tag-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
    db = new DatabaseImpl(join(tmpDir, 'test.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    applyMigrations(db)
    db.prepare(`INSERT INTO clients (id, name) VALUES (1, 'Test Client')`).run()
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── getAllTagsWithCount ─────────────────────────────────────────────────

  describe('getAllTagsWithCount', () => {
    it('returns empty array for empty DB', () => {
      const result = getAllTagsWithCount(db)
      expect(result).toEqual({ ok: true, data: [] })
    })

    it('returns tags from master registry with count=0 when no entries', () => {
      db.prepare(`INSERT INTO tags (name) VALUES ('design')`).run()
      db.prepare(`INSERT INTO tags (name) VALUES ('bug')`).run()
      const result = getAllTagsWithCount(db)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toEqual([
          { name: 'bug', count: 0 },
          { name: 'design', count: 0 }
        ])
      }
    })

    it('counts entries that use each tag', () => {
      db.prepare(`INSERT INTO tags (name) VALUES ('bug')`).run()
      db.prepare(`INSERT INTO tags (name) VALUES ('ux')`).run()
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags) VALUES (1, '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', ',bug,ux,')`
      ).run()
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags) VALUES (1, '2026-01-02T09:00:00Z', '2026-01-02T10:00:00Z', ',bug,')`
      ).run()
      const result = getAllTagsWithCount(db)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toEqual([
          { name: 'bug', count: 2 },
          { name: 'ux', count: 1 }
        ])
      }
    })

    it('excludes deleted entries from count', () => {
      db.prepare(`INSERT INTO tags (name) VALUES ('bug')`).run()
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags, deleted_at) VALUES (1, '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', ',bug,', '2026-01-02T00:00:00Z')`
      ).run()
      const result = getAllTagsWithCount(db)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data[0]).toEqual({ name: 'bug', count: 0 })
      }
    })
  })

  // ── createTag ──────────────────────────────────────────────────────────

  describe('createTag', () => {
    it('creates a new tag', () => {
      const result = createTag(db, 'newtag')
      expect(result).toEqual({ ok: true, data: undefined })
      const row = db.prepare('SELECT name FROM tags WHERE name = ?').get('newtag')
      expect(row).toEqual({ name: 'newtag' })
    })

    it('normalizes name to lowercase and trims whitespace', () => {
      createTag(db, '  BugFix  ')
      const row = db.prepare('SELECT name FROM tags WHERE name = ?').get('bugfix')
      expect(row).toBeTruthy()
    })

    it('fails on duplicate name', () => {
      createTag(db, 'dup')
      const result = createTag(db, 'dup')
      expect(result.ok).toBe(false)
    })

    it('fails on empty name', () => {
      expect(createTag(db, '').ok).toBe(false)
      expect(createTag(db, '  ').ok).toBe(false)
    })

    it('fails when name contains a comma', () => {
      expect(createTag(db, 'a,b').ok).toBe(false)
    })

    it('fails when name exceeds 50 characters', () => {
      expect(createTag(db, 'a'.repeat(51)).ok).toBe(false)
    })

    it('fails when name contains a space', () => {
      const result = createTag(db, 'ticket 12345')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/Leerzeichen/)
    })

    it('fails when name contains a tab', () => {
      expect(createTag(db, 'foo\tbar').ok).toBe(false)
    })

    it('fails when name contains invalid characters', () => {
      expect(createTag(db, 'tag!').ok).toBe(false)
      expect(createTag(db, 'umlautä').ok).toBe(false)
    })

    it('accepts up to 50 characters', () => {
      expect(createTag(db, 'a'.repeat(50)).ok).toBe(true)
    })
  })

  // ── renameTag ──────────────────────────────────────────────────────────

  describe('renameTag', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO tags (name) VALUES ('bug')`).run()
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags) VALUES (1, '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', ',bug,ux,')`
      ).run()
    })

    it('renames tag and updates all affected entries', () => {
      const result = renameTag(db, 'bug', 'defect')
      expect(result).toEqual({ ok: true, data: undefined })
      const tag = db.prepare('SELECT name FROM tags WHERE name = ?').get('defect')
      expect(tag).toBeTruthy()
      const old = db.prepare('SELECT name FROM tags WHERE name = ?').get('bug')
      expect(old).toBeUndefined()
      const entry = db.prepare('SELECT tags FROM entries LIMIT 1').get() as { tags: string }
      expect(entry.tags).toContain(',defect,')
      expect(entry.tags).not.toContain(',bug,')
    })

    it('is a no-op when old and new name are the same', () => {
      const result = renameTag(db, 'bug', 'bug')
      expect(result).toEqual({ ok: true, data: undefined })
    })

    it('fails when new name already exists', () => {
      db.prepare(`INSERT INTO tags (name) VALUES ('known')`).run()
      const result = renameTag(db, 'bug', 'known')
      expect(result.ok).toBe(false)
    })

    it('does not affect entries that do not use the tag', () => {
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags) VALUES (1, '2026-01-02T09:00:00Z', '2026-01-02T10:00:00Z', ',ux,')`
      ).run()
      renameTag(db, 'bug', 'defect')
      const rows = db.prepare('SELECT tags FROM entries WHERE tags LIKE ?').all('%,ux,%') as Array<{
        tags: string
      }>
      expect(rows.some((r) => r.tags === ',ux,')).toBe(true)
    })
  })

  // ── mergeTag ───────────────────────────────────────────────────────────

  describe('mergeTag', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO tags (name) VALUES ('consulting')`).run()
      db.prepare(`INSERT INTO tags (name) VALUES ('consulting-alt')`).run()
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags) VALUES (1, '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', ',consulting-alt,ux,')`
      ).run()
    })

    it('moves all entries from source to target and deletes source', () => {
      const result = mergeTag(db, 'consulting-alt', 'consulting')
      expect(result).toEqual({ ok: true, data: undefined })
      const source = db.prepare('SELECT name FROM tags WHERE name = ?').get('consulting-alt')
      expect(source).toBeUndefined()
      const entry = db.prepare('SELECT tags FROM entries LIMIT 1').get() as { tags: string }
      expect(entry.tags).toContain(',consulting,')
      expect(entry.tags).not.toContain(',consulting-alt,')
    })

    it('fails when source and target are the same', () => {
      const result = mergeTag(db, 'consulting', 'consulting')
      expect(result.ok).toBe(false)
    })
  })

  // ── deleteTag ──────────────────────────────────────────────────────────

  describe('deleteTag', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO tags (name) VALUES ('unused')`).run()
      db.prepare(`INSERT INTO tags (name) VALUES ('used')`).run()
      db.prepare(
        `INSERT INTO entries (client_id, started_at, stopped_at, tags) VALUES (1, '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', ',used,')`
      ).run()
    })

    it('deletes a tag when no entries use it', () => {
      const result = deleteTag(db, 'unused')
      expect(result).toEqual({ ok: true, data: undefined })
      const row = db.prepare('SELECT name FROM tags WHERE name = ?').get('unused')
      expect(row).toBeUndefined()
    })

    it('fails when entries still use the tag', () => {
      const result = deleteTag(db, 'used')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('1')
      }
    })

    it('count=0 for deleted entries does not block delete', () => {
      // Mark the entry as deleted
      db.prepare(`UPDATE entries SET deleted_at = '2026-01-02T00:00:00Z'`).run()
      const result = deleteTag(db, 'used')
      expect(result).toEqual({ ok: true, data: undefined })
    })
  })
})
