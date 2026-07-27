import type { Migration } from './index'

/**
 * v1.16 #130 — Kalender-Import: Dedupe-Anker und Domain→Kunde-Zuordnung.
 *
 * `entries.graph_event_id` merkt sich, aus welchem Termin ein Eintrag entstanden
 * ist, damit derselbe Termin nicht zweimal angeboten wird. Bewusst auf dem
 * Eintrag statt in einer eigenen "schon gesehen"-Tabelle: Wird der Eintrag
 * gelöscht, darf der Termin wieder auftauchen — man hat ihn ja verworfen, nicht
 * für immer abgelehnt.
 *
 * Der Index ist PARTIELL (`WHERE graph_event_id IS NOT NULL`). Ohne die Klausel
 * würde SQLite zwar mehrere NULLs zulassen, aber der Index wüchse um jeden
 * manuell erfassten Eintrag mit — und das sind fast alle.
 *
 * `client_domains` bildet die Teilnehmer-Domain auf einen Kunden ab
 * (`alice@kunde-x.de` → Kunde X). Eigene Tabelle statt JSON-Blob in `settings`,
 * weil hier ein echter Fremdschlüssel auf `clients` hängt: Wird ein Kunde
 * gelöscht, müssen seine Domains mitgehen, sonst zeigt die Zuordnung ins Leere.
 * `ON DELETE CASCADE` erledigt das; ein Blob in `settings` könnte es nicht.
 *
 * Domains werden kleingeschrieben gespeichert — DNS ist nicht case-sensitive,
 * und `UNIQUE` wäre sonst wirkungslos gegen `Kunde-X.de` neben `kunde-x.de`.
 */
export const migration021: Migration = {
  version: 21,
  name: 'v1.16-graph-import',
  up: `
    ALTER TABLE entries ADD COLUMN graph_event_id TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_graph_event_id
      ON entries(graph_event_id)
      WHERE graph_event_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS client_domains (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      domain     TEXT    NOT NULL UNIQUE,
      client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_client_domains_client
      ON client_domains(client_id);
  `
}
