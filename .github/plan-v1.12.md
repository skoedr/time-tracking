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

5. **`roundingContext.ts` (neu)** — React Context Provider der die aktiven
   Rundungs-Einstellungen (`rounding_interval`, `rounding_direction`) aus dem
   Settings-Store liest. Exportiert `useRounding()` Hook.

6. **`duration.ts`** — Neue Export-Funktion `roundDuration(minutes: number,
   settings: RoundingSettings): number`. Rundet auf das nächste Intervall
   entsprechend der Direction (nearest / up / down). Pure function, testbar.

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

- `duration.test.ts`: `roundDuration()` für alle Richtungen und Intervalle (5, 6, 10, 15, 30, 60 min)
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
   - `tags:get-all-with-count` — Gibt `{ name: string, count: number }[]` zurück
   - `tags:rename` — Atomare DB-Transaktion: UPDATE in `entry_tags`
   - `tags:merge` — Transaktion: alle Einträge von Quell-Tag auf Ziel-Tag
     umschreiben, Quell-Tag löschen
   - `tags:delete` — Nur wenn `count = 0`

4. **Geschlossenes Tag-System** — Tag-Eingabe in `EntryForm.tsx` / `EntryEditModal.tsx`
   wechselt von Freitext zu Dropdown/Autocomplete aus der zentralen Tag-Liste.
   Freitext-Eingabe neuer Tags direkt am Eintrag ist nicht mehr möglich.
   Stattdessen: Link „Tag verwalten →" öffnet Settings-Sektion.

5. **`preload/index.d.ts`** — Extend `window.api` mit den neuen Tag-Handlern.

6. **Tests** — Unit-Tests für alle vier Handler. Merge-Transaktion: Quell-Tag
   danach nicht mehr in DB. Test: Freitext-Tag-Eingabe am Eintrag nicht mehr möglich
   (nur bekannte Tags wählbar).

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

---

## Migration-Plan

| Migration | Inhalt                                          | Timing              |
|-----------|------------------------------------------------|---------------------|
| 014       | DELETE toter `rounding_mode`/`rounding_minutes` Settings | Housekeeping-PR |
| 015       | `projects.contact_person TEXT DEFAULT NULL`     | PR 1/3 (#105)       |

Keine Migration für #106 (reine Darstellungsebene) oder #107 (existierende `entry_tags`-Struktur genügt).

---

## Was dieses Release NICHT tut

- Keine neue Tab-Navigation auf oberster Ebene
- Keine gerundeten Werte in der DB
- Kein Force-Delete für Tags mit Einträgen
- Kein Ansprechpartner pro Projekt (nur pro Kunde)
- Kein Widget-Redesign
- Kein Outlook-Import (→ v2.0)

---

## GSTACK REVIEW REPORT

| Run | Verdict | Findings |
|-----|---------|----------|
| — | NO REVIEWS YET — run `/autoplan` | — |
| — | — | — |
| — | — | — |
| — | — | — |
| — | — | — |
