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

# Phase 2 — Open Source Release (v1.6 → v2.0)

> **Strategie-Wechsel post-v1.5.2:** Das Tool ist Solo-tauglich „fertig". Nordstern
> Phase 1 erreicht. Phase 2 öffnet das Repo bewusst für die Freelancer-Community
> (MIT-Lizenz, freiwillige Nutzung, Support best-effort über GitHub Issues / Discussions).
> Direktiven bleiben: kein Cloud, kein Server, kein SaaS-Abo, Solo-Maintainer.
>
> **Approach B („Distribution + PDF-Merge als Hero, Outlook später")** — siehe
> Office-Hours-Design-Doc für die Alternativen-Diskussion (A/B/C). Begründung
> der Wahl in einem Satz: PDF-Merge ist der einzige Ein-Satz-OSS-Pitch, der
> jeden DE-Freelancer mit Lexware/sevDesk/Billomat sofort packt — und ist
> gleichzeitig der reale Schmerz des Maintainers.

## Pre-Roadmap-Block (Lizenz-Hygiene) ✅ ausgeliefert (2026-04-26)

Vor dem ersten v1.6-PR war der Repo rechtlich **nicht** open-source, obwohl der
About-Dialog „MIT" anzeigte. Repariert in einem Commit + History-Rewrite:

- ✅ **`LICENSE`-File** mit kanonischem MIT-Text, Copyright Robin Wald.
- ✅ **`"license": "MIT"`** in `package.json` + `repository`/`bugs` Felder.
- ✅ **README License-Sektion** umgeschrieben („Private — not for distribution"
  → MIT + Verweis auf bundled third-party licenses).
- ✅ **Git History gepurged** via `git filter-repo`: drei PII-Files (Rechnung mit
  IBAN/Steuernummer, Logo, ein Lingua-Masters-Stundennachweis) aus jedem Commit
  rückwirkend entfernt. Backup-Mirror unter `..\time-tracking-backup-*.git`.
- ✅ **13 obsolete Stage-Branches** auf origin gelöscht (alle Squash-merged in main,
  enthielten Original-Commit `5c78d91` mit den PII-Blobs). Remote zeigt nur noch `main`.

---

## v1.6 — OSS-Readiness  🎯 nächste Stufe

**Thema:** Aus „mein Repo zufällig auf GitHub" wird „Repo das ein anderer
Freelancer clonen, verstehen und beitragen kann".

- **`CONTRIBUTING.md`** — knapp: PR-Format (kleine PRs, ein Thema), `pnpm install` /
  `pnpm dev` / `pnpm test` / `pnpm typecheck`-Workflow, Branch-Naming, Commit-Style
  (`feat:`/`fix:`/`chore:` wie im CHANGELOG bereits gelebt). Code-of-Conduct-Link
  (Contributor Covenant 2.1, ein File mehr).
- **README zweisprachig** — Englische Sektion oben (kurz, „what + why"), DE
  detailliert darunter. Oder als zweite Datei `README.en.md` mit Cross-Link.
  Entscheidung: zwei Files, weil DE bereits 158 Zeilen hat und Inline-Mix
  unleserlich wird.
- **GitHub Issue-Templates** unter `.github/ISSUE_TEMPLATE/` — Bug-Report,
  Feature-Request, Question. Mit Repro-Schritten + OS/Version-Felder.
- **GitHub Discussions** aktivieren (manueller UI-Schritt im Repo-Settings).
  Categories: Q&A, Ideas, Show & Tell, General.
- **macOS-Build im Release-Workflow** — `pnpm build:mac` existiert schon im
  package.json, in `.github/workflows/release.yml` als zweiter Job ergänzen.
  electron-builder erzeugt `.dmg`. Kein Apple-Code-Signing (analog Windows-
  SmartScreen-Direktive: User klickt einmal „Trotzdem öffnen"). Notarization
  bewusst out-of-scope.
- **Privacy-Statement** als `PRIVACY.md` (1-Pager): Alle Daten lokal in
  `%AppData%\TimeTrack\`. Einziger Outbound-Call = Auto-Update gegen
  `api.github.com/repos/skoedr/time-tracking/releases`. Kein Telemetry,
  kein Analytics, kein Crash-Reporter zu Dritten. Logs bleiben lokal.
- **`SECURITY.md`** — wie Security-Issues gemeldet werden (Private GitHub
  Security Advisory bevorzugt, Email als Fallback).

**Ship-Kriterium:** Ein fremder Freelancer findet auf GitHub das Repo, versteht
in 60 Sekunden ob es für ihn taugt, lädt den Installer, und startet die App
ohne Hilfe.

**Bewusst NICHT in v1.6:** Code-Signing (ROADMAP-Direktive bleibt), Marketing-
Push (HN/Reddit-Posts), englische CHANGELOG-Übersetzung, Crowdin-Integration.

---

## v1.7 — PDF-Merge (Hero-Feature) ✅ ausgeliefert (2026-04-26)

📂 [Plan](.github/plan-v1.7.md)

**Thema:** Der einzige OSS-Pitch-Satz, den die App tragen muss: „TimeTrack
erstellt deinen Stundennachweis und heftet ihn an deine Lexware-/sevDesk-/
Billomat-Rechnung — in einem Klick."

- ✅ **`pdf-lib` Dependency** (~150 KB, pure JS, MIT) — kein Puppeteer, keine nativen Module, kein Rebuild-Schritt.
- ✅ **Checkbox „An Rechnung anhängen"** immer sichtbar im Export-Modal (kein Settings-Toggle — direkt auffindbar wie die Unterschriftsfelder-Checkbox).
- ✅ **File-Picker** für die Rechnungs-PDF über natives `<input type="file">` + Electron `File.path`.
- ✅ **`pdf:merge-export` IPC-Handler** mit Path-Traversal-Guard, 50-MB-Cap, EBUSY/EPERM-Handling, EPERM-Fallback auf Save-Dialog.
- ✅ **Output:** `<Rechnungsname>_inkl_Stundennachweis.pdf` neben der Original-Datei. Original bleibt unverändert.
- ✅ **18 neue Tests** (pdfMerge.test.ts + ipc.test.ts). Kein Schema-Change.

**Ship-Kriterium:** Maintainer hat seinen manuellen Smallpdf-Workflow für gut
abgehakt. Ein Test-Freelancer mit Lexware-PDF kann es in unter 30 s nachvollziehen.

---

## v1.8 — Daily-Use Polish

**Thema:** Was nach 4–6 Wochen Eigenbetrieb + erstem OSS-Feedback weh tut.
Die genaue Reihenfolge wird durch Issues bestimmt — diese Liste ist die
Ausgangsbasis, kein Dogma.

📂 [Milestone v1.8](https://github.com/skoedr/time-tracking/milestone/2)

- **Vollständige i18n DE/EN** *(erstes Item — alle nachfolgenden Features direkt zweisprachig)* — `scripts/find-untranslated.mjs` bis zur Null ausschöpfen. Aktuell sind nur `UpdateBanner` + `SettingsView` migriert (v1.5). v1.8 macht TodayView, TimerView, CalendarView, ClientsView + alle Modals. Pflicht für ernsthafte EN-Adoption.
- **PDF: überlappende Einträge desselben Kunden zusammenfassen** — Toleranz-Fenster konfigurierbar (Default 5 min), nur bei aktivierter Rundung, rein PDF-Output (Kalender bleibt granular).
- **CSV-Export nach Tags gruppieren** (#68) — Export-Konfiguration: Option „Gruppierung: nach Tags". Feature-Anfrage.
- **Ticket-Nummer / Referenz-Feld** (#70) — optionales Freitextfeld pro Eintrag für Jira-Ticket, GitHub Issue etc. Fließt in CSV/PDF.
- **Nicht-abrechenbares Flag** (#71) — Einträge als „nicht abrechenbar" markieren; in Rechnungs-Exporten herausgefiltert.
- **Private Notiz an Eintrag** (#72) — internes Notizfeld, nicht im Export sichtbar.
- **Archivierte Kunden einklappbar** (#73) — standardmäßig eingeklappt, per Klick aufklappbar.
- **Einstellungen-Navigation / Untermenüs** (#74) — logische Unterbereiche (Allgemein, Export, Sicherung, Über).
- **Light-Mode / Theming** (#76) — Tailwind `dark:` class-Strategie. Hell / Dunkel / System-Follow. Größtes Item (~2–3 Wochen).
- ✅ **Fresh-Install-Test** — beim Kollegen ohne Probleme durchgeführt. Keine kritischen Findings.

**Bewusst gestrichen:** Pomodoro (#23) — kein Eigenbedarf, kein OSS-User hat explizit danach gefragt. Wandert in den Backlog.

**Ship-Kriterium:** Vollständig EN-übersetzt, alle Nutzer-Feature-Anfragen bewertet und entweder gebaut oder begründet zurückgestellt. Keine offenen „nervt mich täglich"-Items im Maintainer-Tagebuch.

---

## v1.9 — Projekte & Datenportabilität

**Thema:** Die zwei größten Architektur-Entscheidungen vor v2.0: echte Projekthierarchie
und saubere Maschinenmigration.

📂 [Milestone v1.9](https://github.com/skoedr/time-tracking/milestone/3)

- **Projekte pro Kunde** (#75) — echte Hierarchie `Kunde → Projekt → Einträge`.
  Projekt = eigenes DB-Entity mit eigenem Stundensatz, optionaler Laufzeit.
  Timer, Kalender, Export kennen Projekte. Bestehende Einträge bekommen
  `project_id = NULL` (rückwärtskompatibel). **Eng-Review vor Implementierung.**
- **JSON-Import für Maschinenmigration** (#78) — Import des bestehenden JSON-Exports.
  Schema-Validierung, Dry-Run-Vorschau, automatisches Backup vor Import,
  konfigurierbare Merge-Strategie (überschreiben vs. nur neue Einträge).
- **Konfigurierbarer Backup-Pfad** (#79) — Zielordner in den Einstellungen wählbar
  (OneDrive, Dropbox, NAS). Simpler Path-Picker, keine Cloud-API.
- **Migration 010: `entries.source`-Spalte** (`'manual' | 'timer' | 'outlook'`).
  Foundation für v2.0 Outlook-Imports.
- **Settings → Integrations** — Stub-Card „Outlook (kommt in v2.0)".
  Macht den Roadmap-Plan für User sichtbar.

**Ship-Kriterium:** Du kannst deine gesamte Datenhistorie auf eine neue Maschine
umziehen ohne Datenverlust. Projekte pro Kunde sind buchbar.

---

## v1.10 — Reporting & Outlook-Vorbereitung

**Thema:** Mehr Einsicht in die eigenen Daten + Architektur-Skizze für v2.0.

- **Wochen- und Monats-Charts** in TodayView — Sparkline-Widget, SVG handgemalt
  (keine externe Chart-Lib). Stunden pro Tag als Bar-Chart, Top 3 Kunden als Donut.
  Reuse: `entriesStore` + `dateRanges.ts`, kein Schema-Change.
- **„Top 5 Tätigkeiten dieses Monat"** — GROUP BY auf `description`, Mini-View.
- **Vergleich „diesen Monat vs letzter Monat"** — Stunden, Top-Kunde, Top-Tätigkeit.
- **Conflict-Resolution-UX-Skizze** als Markdown im Repo (kein Code) — Vorlage
  für Outlook-Import-Dialog, Duplikat- und Überlappungsbehandlung.

**Ship-Kriterium:** Du öffnest die App und siehst auf einen Blick, wie diese Woche
im Vergleich zum letzten Monat lief — ohne Excel-Export.

---

## v2.0 — Outlook-Integration  🎯 echte Story-Stufe

**Thema:** Das eine Feature, das TimeTrack vom „lokalen Toggl-Klon" zum
„meinem Kalender ist die Quelle der Wahrheit"-Tool macht.

- **Microsoft Graph API + MSAL Node** — Device-Code-Flow für die Auth, weil
  damit kein Server nötig ist (kompatibel mit ROADMAP-Direktive „kein Cloud").
  Einmalige Anmeldung pro Microsoft-Konto, Token im Electron `safeStorage` (DPAPI
  unter Windows, Keychain unter macOS).
- **Scope:** Nur `Calendars.Read` (delegated). Kein Write, kein Mail, nichts
  Schreibendes. Office E1 / personal Microsoft Account beide unterstützt.
- **Import-Flow:** Settings → Integrations → „Mit Outlook verbinden" → Auth-Browser-
  Tab → zurück zur App. Dann: „Outlook importieren"-Button öffnet Modal:
  Range wählen → Vorschau-Liste der Events → Mapping-Spalten (Subject → Kunde,
  Body → Beschreibung) → bestätigen → import.
- **Mapping-Regeln** persistiert: „Subject matched `^ACME` → Kunde ACME".
  Settings → Integrations → Mapping-Regeln verwalten. Erste Regel kann beim
  Import per „Diese Regel speichern"-Checkbox angelegt werden.
- **Duplikat-Erkennung** via Graph-Event-`id` (in neue Spalte `entries.outlook_event_id`,
  Migration 011). Re-Import desselben Range erkennt schon importierte Events.
- **Recurring Events:** jede Instanz als eigener Eintrag. Gecancelte Instanzen
  werden bei Re-Sync soft-gelöscht (`deleted_at` gesetzt).
- **Token-Refresh** automatisch im Hintergrund. Bei Auth-Fehler: Banner „Outlook-
  Verbindung abgelaufen — neu anmelden", Import-Funktion bis dahin disabled.
- **Offline-Tolerant:** Kein Internet → klare Fehlermeldung, App-Hauptfunktion
  unbeeinträchtigt.

**Ship-Kriterium:** Maintainer importiert einen kompletten Monat aus Outlook,
mappt auf seine Kunden, exportiert das resultierende PDF, und die Stunden
stimmen mit Outlook überein. Ein OSS-Tester wiederholt das mit seinem eigenen
Konto.

**Bewusst NICHT in v2.0:** Google Calendar (separate API, separate v2.x),
iCal-Import (anders gelagert, evtl. v2.1), bidirektionaler Sync (komplex,
Risiko Daten zu überschreiben — vorerst Read-Only), Multi-Account (erst
wenn jemand danach fragt).

**Aufwand-Schätzung:** L–XL (~6–8 Wochen, vermutlich 3 PRs: Auth → Read-only-Import → Mapping/Recurring/Refresh).

---

## Backlog (unscheduled)

Kleinere Edge-Cases / Polish-Ideen ohne konkrete Version. PDF-Eintrags-Merge (überlappende
Einträge zusammenfassen) ist in v1.8. PDF-Merge im Sinne von „an Rechnungs-PDF anhängen"
ist v1.7-Hero — nicht verwechseln.

- **Pomodoro-Modus** (#23) — 25/5 opt-in. Kein Eigenbedarf, kein OSS-User hat explizit danach gefragt. Bleibt hier bis jemand es wirklich braucht.

- **Google Calendar Import** — analog Outlook, eigene API. Erst nach v2.0,
  wenn der Outlook-Flow stabil ist und die Mapping-UX validiert wurde.
- **iCal-Import** (`.ics`-Datei) — für Apple Calendar, Thunderbird, andere.
  Einfacher als OAuth-Flows, ggf. v2.1.
- **Code-Signing** für Windows — bleibt bewusst draußen (Direktive aus v1.5).
  Wenn ein OSS-User Sponsoring anbietet (~250€/Jahr EV-Cert), wird neu evaluiert.
- **Plugin-Architektur** — explizit ABGELEHNT. Komplexitäts-Sprung der die
  Solo-Maintenance-Direktive bricht. Wer ein Custom-Feature braucht, forked.

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
