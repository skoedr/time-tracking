# v1.12 — Konsistenz-Release: Rundung, Stammdaten-Abschluss, Tag-Management

> **Nordstern:** „Ein Tool, dem du beim Rechnungsschreiben vollständig vertraust."

## Theme

Drei Reibungspunkte, die bei jeder Rechnungsstellung auffallen:

1. **Die App zeigt andere Werte als das PDF.** Rundung ist in den Einstellungen aktiv,
   aber der Kalender und die Tageswerte zeigen exakte Minuten. Das PDF verwendet
   gerundete Werte. Das fühlt sich falsch an — „Welche Zahl ist jetzt richtig?"

2. **Der Empfängerblock im PDF ist unvollständig.** Seit v1.11 gibt es
   Firmenname, Adresse und USt-IdNr. — aber kein Ansprechpartner. Briefe an
   Firmen ohne Namen wirken unprofessionell.

3. **Tags wachsen unkontrolliert.** Einträge haben Tags, aber es gibt keine Stelle
   um veraltete Tags zu bereinigen, umzubenennen oder zusammenzuführen. Nach
   12 Monaten Nutzung entstehen Duplikate wie `consulting`, `Consulting`, `beratung`.

v1.12 löst alle drei — ohne neue Konzepte einzuführen. Nur die vorhandenen
Strukturen zu Ende gebaut.

**Ship-Kriterium:** Du exportierst eine Rechnung für einen echten Kunden. Die
Werte im Kalender sind dieselben, die im PDF stehen. Der Name des Ansprechpartners
erscheint im Adressblock. Du öffnest Tags in den Einstellungen und räumst in zwei
Minuten fünf veraltete Tags auf. Du schließt die App und weißt: die Datenbasis
stimmt.

---

## Pre-Release: Housekeeping-PR (vor v1.12 mergen)

Ein eigenständiger PR, der technische Schulden abbaut. Kein Feature-Freeze, keine
Migration nötig — rein strukturell.

### Scope Housekeeping-PR

1. **Handler-Extraktion `pdf:merge-export`** — Die Merge-Logik liegt heute in
   `ipc.ts` direkt. Auslagern in `src/main/pdfMergeHandlers.ts` (analog zu
   `budgetHandlers.ts`, `analyticsHandlers.ts`). `ipc.ts` registriert nur noch:
   `ipcMain.handle('pdf:merge-export', pdfMergeHandlers.mergeExport)`.

2. **DB-Cleanup toter Settings** — Die Felder `rounding_mode` und
   `rounding_minutes` existieren in der `settings`-Tabelle, werden aber nirgends
   mehr gelesen (seit Rundung über eigenen Mechanismus läuft). Migration 014
   löscht diese Zeilen via `DELETE FROM settings WHERE key IN ('rounding_mode',
'rounding_minutes')`. Keine Auswirkung auf bestehende Nutzer.

3. **Tests** — Bestehende Handler-Tests in `pdfMergeHandlers.test.ts` (bereits
   vorhanden, ggf. Pfad-Anpassung). Neue Regression-Tests für den DB-Cleanup.

---

## Issue #105 — Projektspezifischer Ansprechpartner

**Ziel:** Ein Projekt kann einen eigenen Ansprechpartner haben — unabhängig vom
Kunden-Ansprechpartner. Wenn das Projekt keinen eigenen Ansprechpartner hat,
greift der Kunden-Ansprechpartner als Fallback.

**Kontext:** `clients.contact_person` existiert bereits (Migration 013, v1.11).
#105 ergänzt dasselbe Konzept auf Projektebene mit Fallback-Logik.

### Scope #105

1. **Migration 015** — Neue Spalte `projects.contact_person TEXT DEFAULT NULL`.
   Pre-migration Backup. Rückwärtskompatibel: bestehende Projekte bekommen `NULL`,
   keine Pflicht.

2. **`shared/types.ts`** — Feld `contact_person?: string` zu `Project`-Typ hinzufügen.

3. **IPC** — `projects:update` empfängt und speichert das neue Feld.
   `projects:get-by-client` liefert es zurück. Kein neuer Handler nötig.

4. **`ProjectFormModal.tsx`** — Neues optionales Eingabefeld „Ansprechpartner
   (überschreibt Kunden-AP)" unter dem Projektnamen. Kein Pflichtfeld. Placeholder:
   „Max Mustermann (überschreibt: {client.contact_person})".

5. **`pdf.ts` — Fallback-Logik** — Der Empfängerblock liest den Ansprechpartner
   nach Priorität:

   ```
   effective_contact = project.contact_person ?? client.contact_person
   ```

   Wenn `effective_contact` gesetzt: `z. Hd. {name}` im Adressblock.
   Keine sichtbare Änderung wenn weder Projekt noch Kunde einen AP haben.

6. **Tests** — Unit-Test `pdf.test.ts`: Projekt-AP überschreibt Kunden-AP;
   Fallback auf Kunden-AP wenn Projekt keinen hat; kein AP-Block wenn beide NULL.
   IPC-Test: `projects:update` persistiert `contact_person`.

### Nicht in #105

- Mehrere Ansprechpartner pro Projekt oder Kunde — späteres Issue
- Ansprechpartner im CSV-Export
- E-Mail / Telefon am Projekt-AP (nur Name in v1.12)

---

## Issue #106 — Rundung in der UI

**Ziel:** Wenn Rundung aktiv ist, zeigen alle Zeitwerte in der App dieselben
Werte wie das spätere PDF. Die DB-Daten bleiben exakt — nur die Darstellung
ändert sich.

### Prämisse

Rundung ist eine **Darstellungs-Entscheidung**, keine Daten-Entscheidung.
Exakte Zeiten werden in der DB gespeichert, on-the-fly gerundet angezeigt.
Kein neuer DB-Speicher für gerundete Werte. Kein neues Settings-Feld.

### Stufe 1 — Kalender- und TodayView-Konsistenz (MVP)

4. **`SettingsContext.tsx` (neu)** — Allgemeiner React Context Provider der
   **einmalig** beim App-Start `window.api.settings.getAll()` aufruft und alle
   Settings getypt zugänglich macht. Ersetzt die drei unabhängigen
   `getAll()`-Calls aus `I18nContext`, `ThemeContext` und `App.tsx`. Ist
   outermost Provider in `App.tsx`. Exportiert `useSettings()` Hook.
   `I18nContext` und `ThemeContext` werden refactored um ihre Initial-Werte aus
   `SettingsContext` zu lesen statt eigene IPC-Calls zu machen.

5. **`RoundingContext.tsx` (neu)** — Liest `pdf_round_minutes` aus
   `SettingsContext` (keine eigene IPC-Call). Exportiert `useRounding()` Hook:
   `{ roundMinutes: number, setRoundMinutes: (n: number) => void }`.
   `setRoundMinutes` updated lokalen State + ruft `window.api.settings.set()`
   auf (analog zu `setLocale` in I18nContext und `setThemeMode` in ThemeContext).
   SettingsView verwendet `setRoundMinutes` beim Picker-Change statt `update()`,
   damit der Kalender die Werte sofort nach Settings-Änderung aktualisiert.
   Standardwert: `roundMinutes = 0` wenn Settings noch lädt oder Wert 0
   (= kein Runden, pass-through).

6. **`duration.ts`** — Neue Export-Funktion `roundDuration(seconds: number,
roundMinutes: number): number`. Rundet Sekunden via **Ceiling** auf das
   nächste Intervall (Einheit: Minuten). Wenn `roundMinutes <= 0`: unverändert
   zurück. Signatur konsistent mit `formatDuration(seconds)`. Pure function,
   testbar.

7. **Kalender (`CalendarView.tsx`)** — Tageswerte und Eintrags-Dauern werden
   via `useRounding()` + `roundDuration()` angezeigt wenn Rundung aktiv. Exakter
   Wert bleibt als `title`-Tooltip erhalten.

8. **TodayView** — Analoges Update für Tageswerte und die Summen-Zeile.

9. **Analytics-Tab** — Stunden-Summen in der Auswertung beachten Rundung
   (sonst weicht die Auswertung vom PDF ab).

### Stufe 2 — Timer- und Eintrags-Vorschau (Optional, gleicher PR)

10. **Timer-Floating-Button** — Neben der laufenden Zeit eine kleine gerundete
    Vorschau: `1:23 → 1:30` (grau/dezent). Nur wenn Rundung aktiv.

11. **Eintrag-Bearbeitungs-Form** — Beim manuellen Eingeben einer Dauer zeigt
    ein Hint: „Gerundet: 1:30". Kein Blocker, kein Override.

### Nicht in #106

- Gerundete Werte in der DB speichern
- Rundung während der Timer läuft (anwenden in Echtzeit)
- „Rundungs-Differenz" / Kalkül-Anzeige (bewusst weggelassen)
- Widget zeigt gerundete Werte (→ v1.13 / Widget-Overhaul)

### Tests

- `duration.test.ts`: `roundDuration(seconds, roundMinutes)` — Ceiling für alle
  Intervalle (5, 10, 15, 30 min), `roundMinutes=0` → pass-through (exakte Sek.),
  negatives Input → 0, exakte Vielfache → keine Änderung (z.B. 900s + 15min → 900s)
- `migrations.test.ts`: Migration 015 erstellt `projects.contact_person`-Spalte
  (nullable, bestehende Projekte = NULL)
- Integration: Kalender-Rendering mit aktivierter Rundung zeigt gerundete Werte

---

## Issue #107 — Zentrales Tag-Management

**Ziel:** Tags wachsen unkontrolliert. Eine neue Sektion in den Einstellungen
erlaubt: umbenennen, zusammenführen, löschen (wenn ungenutzt oder force).

### Scope #107

1. **Settings-Navigation** — Neuer Unterbereich „Tags" in der Settings-Sidebar
   (neben Allgemein, Export, Sicherung, Über).

2. **`TagManagementView.tsx` (neu)** — Zeigt alle Tags alphabetisch mit Anzahl
   der verknüpften Einträge. Jede Zeile hat:
   - **Umbenennen** — Inline-Edit, Enter zum Bestätigen
   - **Zusammenführen** — Dropdown: „Zusammenführen mit →" wählt Ziel-Tag.
     Alle Einträge des Quell-Tags bekommen das Ziel-Tag. Quell-Tag wird gelöscht.
   - **Löschen** — Nur möglich wenn 0 Einträge verknüpft. Button ist disabled
     solange Einträge vorhanden (kein Force-Delete in v1.12).
   - **Neu anlegen** — Eingabefeld + „Tag hinzufügen"-Button oben in der Liste.
     Tags existieren ab jetzt nur noch wenn explizit angelegt.

3. **IPC-Handler (neu)**:
   - `tags:get-all-with-count` — Gibt `{ name: string, count: number }[]` zurück.
     **Implementierung: Single Scan** (1 SQL-Query alle entry-Tags lesen, in JS
     aggregieren — analog zu bestehendem `tags:recent`-Muster). Vermeidet O(n×m)
     naive Sub-Query-Implementierung.
   - `tags:create` — Legt neuen Tag in `tags`-Tabelle an. Validierung:
     Name nicht leer, max. 50 Zeichen, kein Komma. Gibt `fail()` bei Duplikat.
   - `tags:rename` — Atomare DB-Transaktion: (1) Prüfen ob `newName` bereits
     existiert → `fail('Ein Tag mit diesem Namen existiert bereits')`, (2) UPDATE
     `tags.name`, (3) `UPDATE entries SET tags = REPLACE(tags, ...)` für alle
     betroffenen Einträge. Logging via `electron-log`.
   - `tags:merge` — Prüfen ob source ≠ target, dann Transaktion:
     `REPLACE`-Update aller Einträge + DELETE source tag. Logging.
   - `tags:delete` — Nur wenn `count = 0`, sonst `fail('Tag hat Einträge')`.

4. **Geschlossenes Tag-System** — `TagInput.tsx` wechselt von `tags:recent`
   (Freitext-Autocomplete aus Eintrags-History) zu `tags:get-all-with-count`
   als Source (Master-Registry). Die bestehende Autocomplete-Infrastruktur
   (Keyboard-Navigation, ArrowUp/Down, Enter, Tab) bleibt erhalten — nur der
   Free-Text-Commit-Path wird modifiziert:
   - Wenn Eingabe einem bestehenden Tag matcht → Tag hinzufügen ✅
   - Wenn Eingabe KEINEM bekannten Tag entspricht → Dropdown-Option
     **„+ 'foo' erstellen"** erscheint als letzter Eintrag. Auswahl legt
     Tag in der `tags`-Tabelle an (`tags:create` IPC) und fügt ihn sofort
     zum Eintrag hinzu. Kein extra Dialog, kein Navigations-Bruch.
     Link „Tag verwalten →" erscheint wenn Tag-Liste leer oder zur Verwaltung.

   **Merge Confirmation:** Das Zusammenführen-Dropdown in `TagManagementView`
   öffnet nach Tag-Auswahl den bestehenden `ConfirmDialog` mit Zähler:
   „23 Einträge von 'Consulting' werden in 'consulting' umgeschrieben.
   Diese Aktion kann nicht rückabgewickelt werden."

5. **`preload/index.d.ts`** — Extend `window.api` mit den neuen Tag-Handlern.

6. **Tests** — Unit-Tests für alle vier Handler:
   - `tags:get-all-with-count` happy path + leere DB
   - `tags:rename` happy path (entries CSV aktualisiert), Kollision (error),
     Rename auf gleichen Namen = no-op
   - `tags:merge` happy path (source gelöscht, entries übertragen), source=target
     (error)
   - `tags:delete` count=0 (ok), count>0 (error)
   - `migrations.test.ts`: Migration 016 erstellt `tags`-Tabelle; bestehende
     entries-Tags werden korrekt extrahiert und pre-populiert; leere entries
     ergeben keine Fehler; idempotent (INSERT OR IGNORE).

### Nicht in #107

- Bulk-Tagging: mehrere Einträge gleichzeitig taggen
- Tag-Farben
- Tag-Hierarchien / Gruppen
- Force-Delete (Tag löschen auch wenn Einträge vorhanden) — v1.13
- Klick auf Anzahl → gefilterte Eintrags-Liste — v1.13

---

## Deferred: Issue #108 — Widget-Overhaul (→ v1.13)

XL-Scope. Verzögert v1.12 ohne die Kern-Story zu stärken. Wandert als erster
Kandidat in v1.13.

Bewusst nicht in v1.12 abgebildet — wird als eigenständige Planung gestartet.

---

## Deferred: Kandidaten für v1.13 (TODOS)

Folgendes kommt nicht in v1.12, soll aber nicht verloren gehen:

- **#108** Widget-Overhaul (XL)
- **Rundung am laufenden Timer** — gerundeter Wert in Echtzeit sichtbar
- **Bulk-Tag-Operationen** — mehrere Einträge gleichzeitig taggen
- **Tag-Aufschlüsselung in Analytics** — Top-5-Tags-Breakdown in Auswertungs-View
  (deferred: erst wenn Tags im Live-Einsatz sind, lohnt sich der Analytics-Ausbau)
- **Widget zeigt gerundete Werte** — nach Widget-Overhaul
- **Stammdaten-Import aus CSV** — für Großkunden mit vielen Projekten

---

## Reihenfolge & PR-Strategie

```
Housekeeping-PR  (Handler-Extraktion + DB-Cleanup)
    ↓
PR 1/3  #105 Ansprechpartner  (S, ~1 Tag)
    ↓
PR 2/3  #106 Rundung UI       (M, ~3 Tage)
    ↓
PR 3/3  #107 Tag-Management   (L, ~4 Tage)
    ↓
v1.12.0 Release
```

Jeder PR ist selbstständig mergebar. Kein gegenseitiger Hardblock.
Reihenfolge nach Risiko: kleinste Änderung zuerst, unabhängigste zuletzt.

**Scope-Hinweis PR 2/3 (#106):** `SettingsContext.tsx` ist die Grundlage für
`RoundingContext.tsx`. Das Refactoring von `I18nContext`, `ThemeContext` und
`App.tsx` auf SettingsContext ist Teil von PR 2/3 — konsolidiert 4+
unabhängige `settings.getAll()`-Calls zu einem einzigen IPC-Call beim App-Start.
Geschätzter Mehraufwand: +0,5 Tage (M → M+).

---

## Migration-Plan

| Migration | Inhalt                                                                                                              | Timing          |
| --------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| 014       | DELETE toter `rounding_mode`/`rounding_minutes` Settings                                                            | Housekeeping-PR |
| 015       | `projects.contact_person TEXT DEFAULT NULL`                                                                         | PR 1/3 (#105)   |
| 016       | CREATE TABLE `tags` (id, name UNIQUE, created_at) + INSERT OR IGNORE alle einzigartigen Tags aus `entries.tags` CSV | PR 3/3 (#107)   |

Keine Migration für #106 (reine Darstellungsebene).

**Dual-Storage-Rationale (Migration 016):** `entries.tags` bleibt als CSV-Spalte
für die per-Eintrag-Zuordnung. Die neue `tags`-Tabelle ist der **Master-Registry**
der erlaubten Tags. Diese Trennung erlaubt atomare Renames/Merges ohne alle
Einträge zu restrukturieren, während die bewährte CSV-Speicherung der Einträge
erhalten bleibt. In v2.0 kann die Normalisierung in eine Junction-Tabelle erfolgen.

---

## Was dieses Release NICHT tut

- Keine neue Tab-Navigation auf oberster Ebene
- Keine gerundeten Werte in der DB
- Kein Force-Delete für Tags mit Einträgen (→ v1.13)
- Mehrere Ansprechpartner pro Projekt (nur jeweils einer in v1.12)
- Kein Widget-Redesign (→ v1.13, #108)
- Kein Outlook-Import (→ v2.0)
- Keine Tag-Aufschlüsselung in Analytics (→ v1.13)
- Keine Echtzeit-Rundung am laufenden Timer (→ v1.13)

---

## GSTACK REVIEW REPORT

| Run                        | Verdict                                         | Findings                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plan-ceo-review 2026-05-04 | SELECTIVE EXPANSION — 10 findings, all approved | Migration 016 added; SettingsContext + Tag-Autocomplete added to scope; roundDuration API corrected (pdf_round_minutes/ceiling); tags:rename collision check; Migration 015+016 tests; get-all-with-count single-scan; ConfirmDialog for merge; Tag-Analytics deferred to v1.13; tags:create + Inline-Create in TagInput (außenstimme); setRoundMinutes setter in RoundingContext (außenstimme) |
| —                          | —                                               | —                                                                                                                                                                                                                                                                                                                                                                                               |
| —                          | —                                               | —                                                                                                                                                                                                                                                                                                                                                                                               |
| —                          | —                                               | —                                                                                                                                                                                                                                                                                                                                                                                               |
