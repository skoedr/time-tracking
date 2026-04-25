# TimeTrack Roadmap

> Ziel: das beste lokale Solo-Freelancer-Zeiterfassungstool für Windows. Kein Cloud,
> kein Account, keine Abos. Erstellt am 23.04.2026, post-v1.0.0.

## Nordstern

Ein Tool, dem du beim Rechnungsschreiben **vollständig vertraust**. Nie vergessen,
nie verloren, nie umständlich. Vom Hotkey bis zum PDF-Stundennachweis in einer
geschlossenen Schleife. Keine Tabs, keine Browser, kein zweites Programm nötig.

---

## v1.1 — Daily Trust (Schmerzstellen lösen) ✅ ausgeliefert v1.1.0–v1.1.2 (2026-04-24)

**Thema:** Was den Freelancer Geld kostet, wenn die App es nicht macht.

- ✅ **Idle Detection** — PC >5 Min inaktiv? Modal "Timer noch laufen lassen, bei XY:XX
  stoppen, oder als Pause markieren?". Verhindert die größte Datenverluststelle:
  Mittagspause vergessen.
- ✅ **Tray Quick-Start** — aktive Kunden direkt im Tray-Kontextmenü als Buttons. 1 Klick
  → Timer läuft. Heute braucht es: Tray → Fenster anzeigen → Kunde wählen → Start. 4 Klicks.
- ✅ **Settings-View** — Hotkey ändern, DB-Pfad anzeigen + öffnen, Idle-Schwelle einstellen,
  Sprache (DE/EN — i18n-Strings folgen in v1.2), "Beim Windows-Start automatisch starten" Toggle.
- ✅ **Auto-Backup** — rollierend 7 Tage SQLite-Snapshots in `%AppData%\TimeTrack\backups\`.
  Wiederherstellung über Settings.
- ✅ **DB-Migrationen** — `migrations/`-Ordner mit TypeScript-Migration-Modulen, ausgeführt
  beim App-Start nach Schema-Version. Pflicht bevor v1.2 neue Spalten hinzufügt.
- ✅ **Bonus:** Vitest-Setup mit ersten Tests + automatisierter Windows-Release-Workflow.

**Ship-Kriterium:** Du kannst dem Tool über einen ganzen Arbeitstag ohne Babysitting trauen. ✅

---

## v1.2 — Calendar & Edit ✅ ausgeliefert v1.2.0 (2026-04-24)

📂 [Issues mit Label `v1.2`](https://github.com/skoedr/time-tracking/labels/v1.2)

**Thema:** Was war, wann war es, und kann ich es korrigieren?

- ✅ **Kalender-Modus** — 7×N-Monatsraster, KW-Spalte, Tagessumme, bis zu 5 Mini-Bars
  pro Tag (mit `+N`-Überlauf), Tastatur-Navigation, heutige Zelle hervorgehoben.
- ✅ **Eintrag bearbeiten** — Start/Stop, Beschreibung, Kunde nachträglich änderbar.
  Rundung pro Eintrag optional (5/10/15/30 Minuten).
- ✅ **Eintrag löschen** — Soft-Delete mit 5 s Undo-Toast (`deleted_at`-Spalte).
- ✅ **Manueller Eintrag** — "Eintrag nachtragen"-Dialog mit Server-seitiger Validierung.
- ✅ **Heute-Übersicht** — Default-Tab: aktiver Timer als Pille, Tages-/Wochensumme,
  Top-3-Kunden-Quick-Start, letzte 5 Einträge.
- ✅ **Tray-Tooltip-Erweiterung** — `● Mustermann · 02:14 · Heute 06:42`.

**Ship-Kriterium:** Du kannst eine Woche Daten visuell prüfen und Fehler korrigieren ohne SQL. ✅

---

## v1.3 — PDF Export & Reporting ✅ ausgeliefert v1.3.0 (2026-04-25)

📂 [Issues mit Label `v1.3`](https://github.com/skoedr/time-tracking/labels/v1.3)

**Thema:** Daten → fertige Rechnungs-Anlage in 30 Sekunden.

- ✅ **PDF-Stundennachweis** — Kunde + Zeitraum wählen → A4-PDF (Datum / Von / Bis /
  Tätigkeit / Dauer, optional Honorar). Hidden-`BrowserWindow` + `printToPDF` statt
  puppeteer (kein zusätzlicher Renderer-Entry).
- ✅ **JSON-Vollexport** — Kunden + Einträge (inkl. soft-gelöschter und verlinkter
  Hälften) + Settings als lesbare JSON-Datei. Trust-Artefakt.
- ✅ **Konfigurierbares PDF-Template** — Logo, Absenderadresse, Steuernummer,
  Akzentfarbe, Footer, optionale Stunden-Rundung in Einstellungen → PDF-Vorlage.
- ✅ **Stundensatz pro Kunde** — Integer-Cents in `clients.rate_cent`, fließt als
  €-Spalte ins PDF.
- ✅ **Quick-Filter im Kalender** — Vier Pillen + Hero-Button "📄 Letzter Monat als PDF".
- ✅ **Cross-Midnight Auto-Split** — Einträge über Mitternacht werden im IPC automatisch
  in zwei verlinkte Hälften gesplittet (Migration 005, `entries.link_id`).
- ✅ **App- + Tray-Icons** — Glass-Style aus `timetrack_icon_glass_desktop.svg`,
  manueller Sync-Workflow via `scripts/sync-icon.mjs` + `prebuild`-Hook.
- ✅ **CI PDF-Smoke-Test** — Release-Workflow rendert ein Mini-PDF aus der gepackten
  `.exe` und prüft `pdfBytes >= 1000` bevor das Release publiziert wird.

**Ship-Kriterium:** Du erstellst Rechnungs-Anlagen schneller als je zuvor und ohne Excel. ✅

---

## v1.4 — Flow & Less Friction ✅ ausgeliefert v1.4.0–v1.4.1 (2026-04-25)

📂 [Issues mit Label `v1.4`](https://github.com/skoedr/time-tracking/labels/v1.4)
📋 [Plan & Multi-Angle Review](.github/plan-v1.4.md)

**Thema:** App soll im Workflow verschwinden, nicht stören. Plus die CI-Hausaufgabe
(Node 20 → 24), bevor sie blocking wird.

- ✅ **CI Node 24 Bump** (#41) — `pnpm/action-setup@v4` → `@v5` in beiden Workflows.
  Vor Juni-Deadline für Node-20-Action-Deprecation.
- ✅ **Mini-Widget** (#22) — Always-on-top, **200×40px horizontal** (Toggl-Style),
  zeigt Zeit + Kunde + Stop-Button nebeneinander. Toggle per Hotkey `Alt+Shift+M`.
  Hero-Feature von v1.4.
- ✅ **Tags pro Eintrag** (#24) — `#feature`, `#bugfix`, `#meeting` o.ä. Hash-basierte
  Chip-Farben aus 8er-Palette. Im PDF gruppierbar.
- ✅ **Schnell-Notiz nach Stop** (#25) — wenn Beschreibung leer war, Toast "Was war das?"
  mit 30s-Eingabefenster + Progress-Bar.
- **Fenster-Größe & Layout-Density** — Mindestgröße, letzte Position/Größe persistieren,
  Container-Width-Audit (TodayView/CalendarView atmen lassen).

**Ship-Kriterium:** Wochenlang täglich nutzen ohne dass es nervt. Niemand öffnet das
Hauptfenster, um zu sehen "läuft mein Timer?". ✅

---

## v1.5 — Trust at Scale & Data Portability ✅ ausgeliefert v1.5.0–v1.5.2 (2026-04-25)

📂 [Issues mit Label `v1.5`](https://github.com/skoedr/time-tracking/labels/v1.5)
📋 [Plan & Multi-Angle Review](.github/plan-v1.5.md)

**Thema:** Wenn jemand außer dir das Tool nutzt, soll es nicht peinlich sein.

- ✅ **Crash-Logging** (#34) — `electron-log` schreibt Errors in `%AppData%\TimeTrack\logs\`.
  Settings-Button "Log-Datei öffnen" für Debugging. Foundation für alle anderen v1.5-PRs.
- ✅ **Auto-Update** (#33) — `electron-updater` gegen GitHub Releases. Update-Banner statt
  silent failure. Update wird beim nächsten Restart angewendet.
- ✅ **CSV-Export** (#18) — für Steuerberater oder externe Tools (DATEV-kompatibel).
  Verschoben aus v1.4, da JSON-Vollexport die Daten-Portabilität bereits abdeckt
  und v1.4 auf Friction-Removal fokussiert.
- ✅ **i18n-Foundation** — kleine eigene Implementation (kein i18next-Heavyweight).
  DE als Source-of-Truth, EN-Stub für migrierte Bereiche. Nicht-migrierte Strings
  bleiben hardcoded; volle App-Übersetzung kommt in v1.6.
- ✅ **Onboarding-Wizard** (#32) — beim ersten Start: 3 Schritte (Willkommen+Sprache →
  ersten Kunden anlegen → Hotkey-Hinweis). Ein-mal gezeigt. Bestandsuser bekommen
  Flag automatisch gesetzt.
- ✅ **Lizenz-Hinweise** (#35) — About-Dialog mit MIT-Lizenz und automatisch generierten
  Drittanbieter-Lizenzen.
- ✅ **Security Patches (v1.5.2)** — Supply-Chain-Härtung (Action-SHA-Pinning),
  Backup-Restore Path-Traversal-Fix, URL-Links via `shell.openExternal` statt
  `openPath`, CI-Permissions auf Least-Privilege eingeschränkt.

> **Gestrichen aus v1.5:** Pomodoro-Modus (#23). Maintainer nutzt es nicht selbst;
> Daily-Trust wird durch Mini-Widget + Quicknote bereits abgedeckt.
>
> **Bewusst nicht in v1.5:** Code-Signing. SmartScreen-Warnung bei Installation
> wird in Kauf genommen. Bricht keine Funktion, nur einmaliger "Trotzdem ausführen"-Klick.

**Ship-Kriterium:** Du kannst die App einem zweiten Freelancer ohne Anleitung geben. ✅

---

## Backlog (unscheduled)

Kleinere Edge-Cases / Polish-Ideen, die irgendwann reinrutschen, aber noch keiner
konkreten Version zugeordnet sind.

- **Pomodoro-Modus** (#23) — 25/5 opt-in Timer pro Eintrag. Nach 25 min Modal
  „5 min Pause? · Weiter ohne Pause · Stoppen“. Pause als separater Eintrag mit
  `kind='break'` (neue Spalte), nicht dem Kunden zugeordnet. Verschoben aus v1.5,
  weil Maintainer es selbst nicht nutzt und Mini-Widget + Quicknote den Daily-Trust
  bereits abdecken.

- **PDF: überlappende Einträge desselben Kunden zusammenfassen.** Wenn zwei (oder mehr)
  Einträge für den gleichen Kunden zeitlich knapp aufeinander folgen oder sich
  überschneiden (z. B. zwei kurze Test-Toggles innerhalb von wenigen Minuten), sollten
  sie im PDF zu einer Zeile zusammengeführt werden — Von = frühestes Start, Bis =
  spätestes Stop, Beschreibungen mit `; ` verkettet (Duplikate raus). Offene Fragen:
  Toleranz-Fenster konfigurierbar? Nur bei aktivierter Rundung? Gilt auch für die
  Kalender-Anzeige oder rein PDF?

---

# Multi-Angle Review

## CEO-Sicht (Strategie & Fokus)

**Premise check:** Der User ist du selbst (skoedr). Job-to-be-done: Stunden für Rechnungen
zuverlässig erfassen. Größter aktueller Schmerz: Hotkey vergessen → kein Eintrag, oder
Mittagspause vergessen → falscher Eintrag. Daher Idle-Detection als v1.1-Top-Priorität,
nicht erst v1.4. ✅ Roadmap stimmt.

**6-Monats-Regret-Test:** Was würde dich in 6 Monaten am meisten ärgern, nicht gemacht zu
haben?
1. Wenn Idle-Detection fehlt → du traust deinen eigenen Daten nicht → Rückkehr zu Excel
2. Wenn DB-Migrationen fehlen → v1.2-Update bricht v1.0-Installs → Datenverlust
3. Wenn Auto-Backup fehlt → ein Festplattencrash macht Monate Arbeit zunichte

Alle drei sind in v1.1 abgedeckt. ✅

**Was NICHT in der Roadmap ist (bewusst):**
- Cloud-Sync, Multi-Device → User-Direktive: schlank bleiben
- Multi-User / Team-Features → nicht der Anwendungsfall
- Mobile App → kein Mehrwert für Desktop-Workflow
- Stripe / Bezahlung → keine Monetarisierung geplant
- Kollaboration / Sharing → Solo-Tool

**Was fehlt aber sollte rein?**
- ⚠️ **Datenexport / Daten-Portabilität** als explizites Feature. Aktuell: SQLite-Datei
  kopieren funktioniert, aber kein dokumentierter "Alle Daten als JSON exportieren"-Knopf.
  Vertrauen-stiftend wenn man später wechseln will. Schlage vor: zu v1.3 hinzufügen.

## Design-Sicht (UX & Hierarchie)

**Information-Hierarchie:** Korrekt geordnet. Tray-Quick-Start (häufigster Use-Case) kommt
in v1.1, Mini-Widget (zweithäufigster) in v1.4. Idle-Detection (kritischster) in v1.1.
Kalender (selten genutzt aber wichtig wenn) in v1.2. ✅

**Fehlende UI-States in der Roadmap:**
- Kalender ohne Daten: leerer Monat, was sieht User?
- Settings: ohne Backups noch keine "Wiederherstellen"-Option
- Update-Verfügbar: Banner-Position, Dismiss-Verhalten?
- Pomodoro-Pause-Modal: was wenn User Pause ignoriert?

→ alle in der jeweiligen Stufe definieren, nicht erst beim Implementieren.

**Mini-Widget-Format:** Roadmap sagt 200×40. Alternative: 80×80 quadratisch (passt besser
in Bildschirmecke). **Taste-Entscheidung — siehe unten.**

**Onboarding in v1.5 ist zu spät.** Wenn du heute jemandem v1.1 zeigst, gibt es schon nichts.
**Empfehlung:** Onboarding-Wizard auf v1.2 vorziehen, wenn die App das erste mal "rund" wirkt.

## Eng-Sicht (Architektur & Risiken)

**Architektur-Risiken:**

1. **DB-Migrationen sind v1.1-Pflicht, nicht "schön zu haben".** Sobald v1.2 die
   `entries`-Tabelle erweitert (z.B. `tags`-Spalte oder neue `type`-Spalte für
   Pomodoro-Pausen), bricht es v1.0-Installs. Empfehlung: Migration-Mechanismus
   ist erste Story in v1.1.

2. **Auto-Update-Server-Wahl.** electron-updater unterstützt:
   - GitHub Releases — gratis, dein PAT als Token, latest.yml ist schon da
   - Generic HTTP — eigener Server nötig, du willst keinen
   - S3 — kostenlos im Free-Tier, aber AWS-Account-Kram
   → GitHub Releases ist die einzige sinnvolle Wahl. Schon vorbereitet, da
   `dist/latest.yml` schon im Release liegt.

3. **PDF-Library-Wahl.**
   - `pdfkit` — pure JS, ~5MB, programmatisch, gute Tabellen, langweiliges Default-Layout
   - `pdf-lib` — pure JS, ~2MB, low-level, du baust alles selbst
   - `puppeteer` — Chrome-headless via HTML/CSS, schöne Layouts, +200MB Installer
   **Taste-Entscheidung — siehe unten.**

4. **Idle-Detection-Library.**
   - `desktop-idle` — natives N-API Modul, gibt Sekunden seit letzter Eingabe. Klein, einfach.
   - `electron`-eigenes `powerMonitor.getSystemIdleTime()` — schon eingebaut. ✅ Kein Extra-Dep.
   → powerMonitor nutzen. Auto-decided (P4 DRY: schon im Stack).

5. **Tags-Schema.**
   - JSON-Spalte `tags TEXT` mit `["a","b"]` — einfach, keine Joins
   - Separate `tags` + `entry_tags` Tabellen — normalisiert, langsamere Queries für Solo-Use
   → JSON-Spalte. Auto-decided (P5 explicit: 5 Zeilen vs 50, Solo-Skala).

6. **Code-Signing für Windows.** Ohne Signing zeigt Windows SmartScreen "Unbekannter
   Herausgeber" beim Installer. Kostet:
   - **OV-Zertifikat:** ~70€/Jahr (z.B. Sectigo via SSLs.com)
   - **EV-Zertifikat:** ~250€/Jahr, aber sofortige SmartScreen-Reputation
   - **Ohne Signing:** Warnung bei jeder Installation, User muss "Trotzdem ausführen"
   **Taste-Entscheidung — siehe unten.**

**Test-Lücken in der Roadmap:**
- Aktuell: 0 automatisierte Tests im Repo. Bei v1.2 (Edit-Logik mit Datum-Parsing)
  und v1.3 (PDF-Generation) wird das schmerzhaft. **Empfehlung:** Vitest in v1.1
  einführen, primär für `src/main/db.ts` (Migrationen, IPC-Handler) und Datums-Utils.

**Failure-Modes-Registry:**

| Wo | Was bricht | Wann | Mitigation |
|----|------------|------|------------|
| Auto-Update | GitHub-API down | bei jedem Update-Check | Silent fail + Log, retry next day |
| Idle-Detection | User klickt "Pause", App crasht vorher | selten | Auto-Backup (v1.1) deckt ab |
| PDF-Export | Pfad nicht beschreibbar | OneDrive-Sync-Konflikt | Fallback auf `Documents`, Toast |
| Migration | SQL-Fehler in Migration | Schema-Bug | Backup vor Migration, Rollback wenn fail |
| Tray | Icon nicht ladbar | User löscht resources/ | Fallback ohne Tray, Console-Warnung |

## DX-Sicht

Übersprungen — kein developer-facing scope (Solo-Tool, keine API/CLI/SDK für andere Devs).

---

# Decision Audit Trail

| # | Phase | Entscheidung | Klassifikation | Prinzip | Begründung |
|---|-------|--------------|----------------|---------|------------|
| 1 | CEO  | Cloud/Multi-User aus Roadmap raus | Mechanical | P6 | User-Direktive "schlank bleiben" |
| 2 | CEO  | Idle-Detection in v1.1 (statt später) | Mechanical | P1 | Größte Vertrauens-Schmerzstelle, Boil the lake |
| 3 | CEO  | Daten-Export-Knopf in v1.3 ergänzen | Mechanical | P1 | Daten-Portabilität = Vertrauen |
| 4 | Eng  | DB-Migrationen v1.1-Pflicht | Mechanical | P2 | Verhindert v1.0→v1.2 Datenverlust |
| 5 | Eng  | Auto-Update via GitHub Releases | Mechanical | P3 | Einzige sinnvolle Wahl, schon vorbereitet |
| 6 | Eng  | Idle-Detection via powerMonitor | Mechanical | P4 | DRY, schon im electron-Stack |
| 7 | Eng  | Tags als JSON-Spalte | Mechanical | P5 | Solo-Skala, 5 Zeilen statt 50 |
| 8 | Eng  | Vitest in v1.1 einführen | Mechanical | P1 | Vor v1.2-Edit-Logik kritisch |
| 9 | Design| Onboarding auf v1.2 vorziehen | Mechanical | P5 | v1.5 zu spät |
| 10| Design| PDF-Library: **puppeteer** | User Taste | — | Schöneres Layout wichtiger als Installer-Größe. Folge: ~290MB statt 96MB |
| 11| Design| Mini-Widget: **200×40 horizontal** | User Taste | — | Toggl-Style, passt in Bildschirm-Kanten |
| 12| Eng  | Code-Signing: **nie** | User Taste | — | SmartScreen-Warnung wird akzeptiert, Geld gespart |
