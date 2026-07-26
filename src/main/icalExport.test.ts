/**
 * Integrationstest für handleIcalExport (#135, Stufe 1).
 *
 * Geht — anders als ical.test.ts (reiner Formatter) — durch den echten
 * DB-Query-Pfad: In-Memory-SQLite + Migrations-Loop wie in entryMutations.test.ts.
 * Der Electron-Save-Dialog wird gemockt und in eine echte Temp-Datei
 * geschrieben, die danach zurückgelesen und geprüft wird.
 *
 * Beweist:
 *  - laufende (stopped_at NULL) und gelöschte (deleted_at) Einträge fliegen raus
 *  - Datums-/Kunden-/Projektfilter greifen
 *  - Cross-Midnight-Zeilen ergeben zwei VEVENTs
 *  - weder private_note noch Honorar landen in der Datei — auch wenn in der DB gesetzt
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { migrations } from './migrations'

// Save-Dialog mocken: liefert einen Pfad in einem Temp-Verzeichnis.
let saveTargetPath: string
vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: saveTargetPath }))
  }
}))

type DatabaseCtor = new (path: string) => Database.Database
let DatabaseImpl: DatabaseCtor | null = null

beforeAll(async () => {
  try {
    const mod = await import('better-sqlite3')
    const Ctor = mod.default as unknown as DatabaseCtor
    const probe = new Ctor(':memory:')
    probe.close()
    DatabaseImpl = Ctor
  } catch {
    DatabaseImpl = null
  }
})

let tmpDir: string
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tt-ical-'))
  saveTargetPath = join(tmpDir, 'out.ics')
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function seed(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  db.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`
  )
  for (const m of migrations) {
    db.transaction(() => {
      db.exec(m.up)
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.version, m.name)
    })()
  }
  // Kunde mit Honorar (darf NIE in den Feed) + zweiter Kunde für den Filtertest.
  db.prepare(
    `INSERT INTO clients (id, name, color, active, rate_cent) VALUES (1,'Acme','#111',1,7500)`
  ).run()
  db.prepare(
    `INSERT INTO clients (id, name, color, active, rate_cent) VALUES (2,'Bosch','#222',1,0)`
  ).run()
  db.prepare(`INSERT INTO projects (id, client_id, name, color) VALUES (5,1,'Portal','')`).run()

  const ins = db.prepare(
    `INSERT INTO entries
       (id, client_id, description, started_at, stopped_at, tags, reference, billable, private_note, project_id, deleted_at, link_id)
     VALUES (@id,@client_id,@description,@started_at,@stopped_at,@tags,@reference,@billable,@private_note,@project_id,@deleted_at,@link_id)`
  )
  const base = {
    tags: '',
    reference: '',
    billable: 1,
    private_note: '',
    project_id: null as number | null,
    deleted_at: null as string | null,
    link_id: null as string | null
  }
  // 1: normaler Eintrag, im Zeitraum, mit private_note + Projekt + Tags
  ins.run({
    ...base,
    id: 1,
    client_id: 1,
    description: 'Arbeit',
    started_at: '2026-04-10T09:00:00.000Z',
    stopped_at: '2026-04-10T10:00:00.000Z',
    tags: ',dev,',
    private_note: 'GEHEIM-NOTIZ',
    project_id: 5
  })
  // 2: laufender Timer → raus
  ins.run({
    ...base,
    id: 2,
    client_id: 1,
    description: 'Läuft',
    started_at: '2026-04-11T09:00:00.000Z',
    stopped_at: null
  })
  // 3: gelöscht → raus
  ins.run({
    ...base,
    id: 3,
    client_id: 1,
    description: 'Gelöscht',
    started_at: '2026-04-12T09:00:00.000Z',
    stopped_at: '2026-04-12T10:00:00.000Z',
    deleted_at: '2026-04-13T00:00:00.000Z'
  })
  // 4/5: Cross-Midnight-Paar, gemeinsame link_id
  ins.run({
    ...base,
    id: 4,
    client_id: 1,
    description: 'Nacht A',
    started_at: '2026-04-14T22:00:00.000Z',
    stopped_at: '2026-04-14T23:59:59.000Z',
    link_id: 'uuid-x'
  })
  ins.run({
    ...base,
    id: 5,
    client_id: 1,
    description: 'Nacht B',
    started_at: '2026-04-15T00:00:00.000Z',
    stopped_at: '2026-04-15T01:00:00.000Z',
    link_id: 'uuid-x'
  })
  // 6: außerhalb des Zeitraums → raus
  ins.run({
    ...base,
    id: 6,
    client_id: 1,
    description: 'Alt',
    started_at: '2026-03-01T09:00:00.000Z',
    stopped_at: '2026-03-01T10:00:00.000Z'
  })
  // 7: anderer Kunde → raus
  ins.run({
    ...base,
    id: 7,
    client_id: 2,
    description: 'Fremdkunde',
    started_at: '2026-04-10T09:00:00.000Z',
    stopped_at: '2026-04-10T10:00:00.000Z'
  })
}

async function run(db: Database.Database, showClientName = true): Promise<string> {
  const { handleIcalExport } = await import('./icalExport')
  const res = await handleIcalExport(db, {
    clientId: 1,
    fromIso: '2026-04-01',
    toIso: '2026-04-30',
    showClientName
  })
  expect(res.ok).toBe(true)
  return readFileSync(saveTargetPath, 'utf8')
}

describe('handleIcalExport', () => {
  let db: Database.Database
  beforeEach((ctx) => {
    if (!DatabaseImpl) {
      ctx.skip()
      return
    }
    db = new DatabaseImpl(':memory:')
    seed(db)
  })

  it('exportiert nur abgeschlossene, nicht gelöschte Einträge im Zeitraum + Kunde', async () => {
    const ics = await run(db)
    const events = ics.match(/BEGIN:VEVENT/g) ?? []
    // id 1 + Cross-Midnight-Paar (4,5) = 3; laufend/gelöscht/außerhalb/fremd raus.
    expect(events).toHaveLength(3)
    expect(ics).toContain('UID:timetrack-entry-1@wald-it.com')
    expect(ics).toContain('UID:timetrack-entry-4@wald-it.com')
    expect(ics).toContain('UID:timetrack-entry-5@wald-it.com')
    expect(ics).not.toContain('Läuft')
    expect(ics).not.toContain('Gelöscht')
    expect(ics).not.toContain('Fremdkunde')
    expect(ics).not.toContain('Alt')
  })

  it('zieht den Projektnamen aus der DB in den Titel', async () => {
    const ics = await run(db)
    expect(ics.replace(/\r\n /g, '')).toContain('Acme / Portal — Arbeit')
  })

  it('lässt private_note und Honorar niemals in die Datei — auch bei DB-Werten', async () => {
    const ics = await run(db)
    expect(ics).not.toContain('GEHEIM-NOTIZ')
    expect(ics).not.toContain('7500')
    expect(ics).not.toContain('75,00')
  })

  it('schreibt DTSTART/DTEND als UTC', async () => {
    const ics = await run(db)
    expect(ics).toContain('DTSTART:20260410T090000Z')
    expect(ics).toContain('DTEND:20260410T100000Z')
  })

  it('Privacy-Modus versteckt Kunde, Beschreibung und Tags', async () => {
    const ics = await run(db, false)
    expect(ics).toContain('SUMMARY:Fokus')
    expect(ics).not.toContain('Acme')
    expect(ics).not.toContain('Arbeit')
    expect(ics).not.toContain('CATEGORIES')
  })
})
