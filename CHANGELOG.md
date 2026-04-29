# Changelog

All notable changes to TimeTrack are documented here.

## [1.9.6] — unreleased

### Added

- **Auto-Projektfarbe aus Kundenfarbe (E1)** — Neue Projekte erhalten automatisch eine etwas hellere Variante der Kundenfarbe als Standard-Vorschlag (HSL-Helligkeitsverschiebung +18 %), statt keine Farbe vorzuschlagen. Der Farb-Picker bleibt unverändert — der Nutzer kann die Farbe weiterhin frei wählen oder auf „Kundenfarbe übernehmen" zurücksetzen. ([#75](https://github.com/skoedr/time-tracking/issues/75))
- **Projekt-Quick-Stats in der Kundenliste (E5)** — Unter jedem Projektnamen wird jetzt eine kompakte Statistikzeile angezeigt: Anzahl Zeiteinträge + relativer Zeitstempel des letzten Eintrags (z.B. „12 Einträge · vor 3 Tagen"). Projekte ohne Einträge zeigen keine Statistik. ([#75](https://github.com/skoedr/time-tracking/issues/75))

## [1.9.5] — unreleased

### Added

- **Konfigurierbarer Backup-Pfad** — Neuer Einstellungs-Tab-Bereich „Backup-Pfad" in der Settings-Datei-Tab. Per Dialog wählbarer Ordner (z.B. OneDrive, NAS) wird als `backup_path` in der Settings-Tabelle gespeichert. Alle Backup-Operationen (erstellen, rotieren, auflisten) nutzen den konfigurierten Pfad; `createBackupSync` im Migrations-Runner nutzt weiterhin den Standard-Pfad (Henne-Ei-Problem beim ersten Start). ([#79](https://github.com/skoedr/time-tracking/issues/79))
- **Backup-Restore-UI in Settings** — Dropdown mit allen vorhandenen Backups (Datum + Dateigröße), „Wiederherstellen…"-Button mit Bestätigungs-Dialog (`variant="danger"`) und automatischem App-Neustart nach Wiederherstellung. ([#79](https://github.com/skoedr/time-tracking/issues/79))
- **Offline-Pfad-Warnung** — Gelbes Warn-Banner wenn der konfigurierte Backup-Pfad nicht erreichbar ist (z.B. NAS offline, USB nicht eingesteckt). Backups fallen in diesem Fall nicht automatisch auf den Standard-Pfad zurück — der Nutzer wird informiert. ([#79](https://github.com/skoedr/time-tracking/issues/79))
- **Onboarding Step 4 — Backup-Wiederherstellung** — Wenn beim Erststart vorhandene Backups gefunden werden, erscheint ein optionaler vierter Onboarding-Schritt: Neuestes Backup anzeigen, zweistufige Bestätigung (erster Klick → Bestätigen, zweiter Klick → Wiederherstellen + Neustart), Skip-Option. ([#79](https://github.com/skoedr/time-tracking/issues/79))

### Security

- **`backup:restore` Path-Guard erweitert** — Der Pfad-Sicherheitscheck für `backup:restore` erlaubt jetzt sowohl den Standard-Backup-Ordner als auch den konfigurierten benutzerdefinierten Pfad. Der konfigurierte Pfad stammt aus der Settings-DB (nicht aus dem Request-Payload), sodass die Sicherheits-Invariante erhalten bleibt.

### Changed

- **`getDefaultBackupsDir()` als separate Funktion** — Extrahiert aus `getBackupsDir()` für sichere Verwendung im Migrations-Runner (`createBackupSync`) ohne DB-Zugriff.

## [1.9.0] — 2026-04-29

### Added

- **Projekte pro Kunde — Export projektgefiltert (PR 4/4, schließt #75)** — PDF- und CSV-Export können optional auf ein einzelnes Projekt eines Kunden gefiltert werden. `ExportModal` zeigt nach Kunden-Wahl einen Projekt-Picker (nur aktive Projekte des Kunden; „Alle Projekte" als Standard). `PdfRequest` und `CsvRequest` akzeptieren `projectId?`; der SQL-Filter `AND (? IS NULL OR project_id = ?)` greift nur, wenn ein Projekt gesetzt ist. PDF-Header zeigt „Projekt: …" wenn gefiltert. CSV- und PDF-Dateiname erhält den Projektnamen als Suffix (z.B. `Zeiterfassung-Musterkunde-Webprojekt-2026-04.csv`). i18n-Keys `export.project.label` und `export.project.placeholder` für DE/EN ergänzt. ([#75](https://github.com/skoedr/time-tracking/issues/75))
- **Projekte pro Kunde — Timer/Today/Calendar/EntryEdit projektbewusst (PR 3/4)** — Timer-View zeigt nach Kunden-Auswahl einen kaskadierten Projekt-Picker (gefiltert auf aktive Projekte des Kunden; Auto-Select bei genau einem Projekt; effektiver Stundensatz-Hinweis wenn Projekt-Satz den Kunden-Satz überschreibt). Recent-Liste in TodayView zeigt `Kundenname · Projektname`. CalendarDrawer zeigt Projektname in Entry-Zeilen. EntryEditForm hat neuen Projekt-Picker zwischen Kunde und Beschreibung, lädt Projekte bei Kunden-Wechsel nach. Neues `selectedProjectId` in `timerStore` und `useTimer`. i18n-Keys für DE/EN ergänzt. ([#75](https://github.com/skoedr/time-tracking/issues/75))
- **Projekte pro Kunde — Projektverwaltung in ClientsView (PR 2/4)** — Renderer-seitige Projektverwaltung für Issue #75. Jeder Kunde kann per Chevron aufgeklappt werden und zeigt eine Sub-Liste seiner Projekte. CRUD-Aktionen (Erstellen, Bearbeiten, Archivieren, Löschen) via `ProjectFormModal` inline in `ClientsView`. Farbauswahl mit „Kundenfarbe übernehmen"-Option (`color = ''`), optionaler Stundensatz-Override. Archivierte Projekte in eigener Collapsible-Sektion. Neuer `projectsStore` (Zustand Version-Bump nach Mutationen). Vollständige i18n-Keys für DE/EN. ([#75](https://github.com/skoedr/time-tracking/issues/75))
- **Projekte pro Kunde — DB, Types, IPC (PR 1/4)** — Foundation für Issue #75. Neue `projects`-Tabelle (client-scoped via FK, Soft-Delete via `active = 0`), `project_id`-Spalte auf `entries` (nullable, ON DELETE SET NULL), vollständige IPC-Handler (`projects:getAll`, `projects:create`, `projects:update`, `projects:archive`, `projects:delete`), TypeScript-Typen (`Project`, `CreateProjectInput`, `UpdateProjectInput`, `ProjectWithCount`) und Preload-Exposition (`window.api.projects.*`). ([#75](https://github.com/skoedr/time-tracking/issues/75))

### Fixed

- **ConfirmDialog statt browser-nativem `confirm()`** — Löschen von Einträgen, Projekten und Kunden öffnet jetzt einen AppDialog statt des nativen `window.confirm()`. Visuell konsistent mit dem restlichen App-Design.
- **Projektfarbe in allen Ansichten** — CalendarView, CalendarDrawer, TodayView und TimerView zeigen die Farbe des aktiven Projekts einheitlich als Akzentfarbe; kein Grau-Fallback mehr wenn ein Projekt gesetzt ist.
- **`+`-Button im Kunden-Header** — Die Schaltfläche zum Anlegen eines neuen Projekts fehlte in der Kunden-Kopfzeile zwischen Archivieren- und Bearbeiten-Icon.
- **Doppeltes `+` im Projektbutton-Label** — i18n-Schlüssel für „+ Projekt hinzufügen" enthielt fälschlicherweise zwei Plus-Zeichen; jetzt korrekt ein `+`.
- **Projektzuweisung beim Anlegen/Bearbeiten nicht gespeichert** — Der 11-Spalten-INSERT in `insertEntrySegments` übergab `project_id` nicht; der 4-Spalten-INSERT beim Timer-Start setzte sie implizit auf NULL. Beide Pfade übergeben jetzt korrekt `input.project_id ?? null`.

### Security

- **Gitleaks-Konfiguration** — `.gitleaks.toml` mit `useDefault`-Ruleset verhindert versehentlich committete Credentials. Allowlist für Tailwind-Hexfarben und SHA-gepinnte Actions.
- **CODEOWNERS für Workflows** — `.github/CODEOWNERS` erfordert explizites Review von `@skoedr` bei Änderungen an den GitHub-Actions-Workflows.

### Migration Note

Migration 012 (`v1.9-projects`) fügt einen Index `idx_entries_project_started` auf der `entries`-Tabelle hinzu. Bei sehr großen Datenbanken (50.000+ Einträge) kann der erste App-Start nach dem Update 2–5 Sekunden länger dauern, während der Index aufgebaut wird.

## [1.8.1] — 2026-04-28


### Fixed

- **SettingsView-Zentrierung** — Äußerer Wrapper bekommt `mx-auto max-w-4xl`, sodass die Sidebar-Navigation bei 900 px Fensterbreite mittig ausgerichtet ist. ([#87](https://github.com/skoedr/time-tracking/issues/87))
- **Doppelter CSS-Reset entfernt** — `*, *::before, *::after { box-sizing: border-box; margin: 0 }` stand in `main.css` und `base.css` gleichzeitig; Duplikat aus `main.css` entfernt.

## [1.8.0] — 2026-04-27

### Added

- **Glass Design System (Light & Dark)** — Komplett neues visuelles Fundament. Alle Farben, Schatten und Hintergruende laufen ueber CSS Custom Properties (--page-bg, --card-bg, --shadow, --accent, --green, --danger, …). Ambient-Glow-Blobs geben dem Seitenhintergrund Tiefe. ([#76](https://github.com/skoedr/time-tracking/issues/76))
- **Inter Variable + JetBrains Mono** — Inter Variable als App-Schrift, JetBrains Mono fuer alle Timer- und Zahlenanzeigen. Beide Fonts lokal gebundelt.
- **SVG-Icon-Bibliothek** (Icons.tsx) — Edit, Trash, Archive, Unarchive, Plus, X, ChevronLeft/Right/Down, Play, Stop, Clock, Check, Dot. Ersetzt Text-Pluszeichen in Buttons.
- **Shared Toggle-Komponente** — Pill-Toggle (40x22 px) fuer Billable-Flag, Signatur-Checkbox und CSV-Gruppe-nach-Tag.
- **TodayView Redesign** — Stat-Cards mit 40 px JetBrains-Mono-Zahl, ActiveTimerPill mit Stop-Button, Quick-Start-Zeile mit Play-Icons, Recent-List als CSS-Grid.
- **Vollstaendige i18n DE/EN** — Alle Views, Components und das Mini-Widget zweisprachig. Sprachwechsel live ohne Neustart.
- **Nicht-Abrechenbar-Flag + Private Notiz** — Eintrag als nicht abrechenbar markierbar; optionale interne Notiz wird nicht in Exporte uebernommen. ([#71](https://github.com/skoedr/time-tracking/issues/71), [#72](https://github.com/skoedr/time-tracking/issues/72))
- **Ticket-/Referenzfeld** — Optionales Ticket- oder Issue-Feld pro Eintrag, erscheint im PDF-Stundennachweis. ([#70](https://github.com/skoedr/time-tracking/issues/70))
- **CSV: Gruppe nach Tag mit Zwischensummen** — CSV-Export gruppiert nach Tag und zeigt Zwischen- und Gesamtsumme. ([#68](https://github.com/skoedr/time-tracking/issues/68))
- **Settings: Sidebar-Navigation mit 5 Tabs** — Allgemein, Timer, Datenschutz, Backup, Ueber. ([#74](https://github.com/skoedr/time-tracking/issues/74))
- **Archivierte Kunden eingeklappt** — Archivierte Kunden in ausklappbarer Sektion. ([#73](https://github.com/skoedr/time-tracking/issues/73))

### Fixed

- **Modal-Backdrop-Clipping** — `transform` aus der `fadeIn`-Animation entfernt. Chromium erzeugte durch `transform` + `fill-mode: both` einen neuen Containing Block, wodurch `position: fixed`-Overlays relativ zum View statt zum Viewport positioniert wurden — der sichtbare Rahmen um Modals.
- **TodayView-Zentrierung** — `w-full` auf dem `max-w-3xl`-Wrapper nötig, da flex-col-Kinder sich nicht automatisch strecken.
- **TimerView-Zentrierung** — `flex-1 flex flex-col` auf dem View-Container, `justify-center` in TimerView.
- **Dialog-Overflow** — Tall-Modals scrollen korrekt statt außerhalb des Viewports zu enden.
- **Light-Mode-Farben** — Alle `text-green-400` / `text-slate-*` Klassen durch CSS-Vars ersetzt.
- **font-mono Tailwind ersetzt** — Explizit `fontFamily: "'JetBrains Mono', monospace"` statt `font-mono` (würde auf System-Monospace mappen).
- **Ambient Blobs kein harter Schnitt** — Blobs direkt `position: fixed` ohne `overflow-hidden`-Wrapper, `--accent-bg` / `--green-bg` statt voller Farbe, 80 px Blur.

## [1.7.2] — 2026-04-27

### Fixed

- **Tagesübersicht zeigt 59 Min statt 1 Stunde** — `julianday()`-Arithmetik in SQLite nutzt IEEE-754 Gleitkomma; ein exakt 1-stündiger Eintrag lieferte `3599.9999...` statt `3600`, was nach `Math.floor()` als `00:59` angezeigt wurde. Fix: alle vier Dashboard-SQL-Ausdrücke auf `CAST(strftime('%s', col) AS INTEGER)` umgestellt (Unix-Epoch-Ganzzahlen, kein Gleitkomma). Regressionstest in `ipc.test.ts` hinzugefügt.

## [1.7.1] — 2026-04-27

### Fixed

- **Kunden-Refresh ohne App-Neustart** — Nach dem Anlegen, Archivieren oder Reaktivieren eines Kunden wurde `timerStore.clients` nicht aktualisiert. TodayView und CalendarView zeigten daher veraltete Daten, bis die App neu gestartet wurde. Fix: neuer `clientsStore` (Version-Counter-Pattern, analog `entriesStore`). `useTimer` re-fetcht die Kundenliste bei jeder Version-Erhöhung; `ClientsView` bumpt die Version nach jedem Mutations-IPC-Call. ([#66](https://github.com/skoedr/time-tracking/issues/66))

## [1.7.0] — 2026-04-26

### Added

- **PDF-Merge — An Rechnung anhängen** — Stundennachweis direkt an eine bestehende Rechnungs-PDF anhängen (Lexware, sevDesk, Billomat). Checkbox „An Rechnung anhängen" im Export-Modal aktivieren, Rechnungs-PDF wählen, fertig. Der Stundennachweis wird am Ende der Rechnung angefügt; die Original-Datei bleibt unverändert. Output: `<Rechnungsname>_inkl_Stundennachweis.pdf` im selben Verzeichnis. Bei bereits existierender Ausgabedatei wird ein Zeitstempel-Suffix ergänzt (kein stilles Überschreiben). Bei schreibgeschützten Verzeichnissen öffnet sich automatisch ein Speichern-Dialog.
- **`pdf-lib`** als neue Dependency (~150 KB, pure JS, MIT) — kein natives Modul, kein Rebuild-Schritt.

## [1.6.1] — 2026-04-26

### Fixed

- **Scrollbar-Styling** — Nativer Windows-Scrollbalken durch passenden Dark-Theme-Scrollbar ersetzt (Track: `slate-800`, Thumb: `slate-600`, Hover: `slate-500`, 8 px, border-radius 4 px). Gilt global für alle scrollbaren Bereiche. ([#64](https://github.com/skoedr/time-tracking/pull/64), closes [#63](https://github.com/skoedr/time-tracking/issues/63))

## [1.6.0] — 2026-04-26

### Added

- **CONTRIBUTING.md** — Dev-Setup (`pnpm install/dev/test/typecheck`), Branch-Konvention, Conventional Commits, PR-Regeln, i18n-Hinweis.
- **CODE_OF_CONDUCT.md** — Contributor Covenant 2.1.
- **SECURITY.md** — GitHub Private Security Advisory (bevorzugt) + E-Mail-Fallback, Scope (SQLite, Auto-Update, PDF, IPC).
- **PRIVACY.md** — Datenschutz-1-Pager: Alle Daten lokal, einziger Outbound-Call = Auto-Update gegen `api.github.com`, kein Telemetry.
- **Issue Templates** — `bug_report.yml`, `feature_request.yml`, `config.yml` (Blank Issues deaktiviert, Links zu Discussions + Security Advisory).
- **README.en.md** — Vollständige englische Übersetzung der README.
- **macOS-Build** — `build-macos`-Job in `release.yml`: arm64 DMG + ZIP, Smoke-Test, unsigned. `publish-release` wartet auf beide Plattformen.

### Changed

- `README.md` — Sprachbanner (Link zu README.en.md), neue Abschnitte Contributing, Privacy, Security.
- `electron-builder.yml` — `mac:`-Sektion ergänzt: `hardenedRuntime`, Entitlements, Targets `dmg`+`zip` für `arm64`.
- `package.json` — `"license": "MIT"`, `"repository"`, `"bugs"` ergänzt.

## [1.5.2] — 2026-04-25

### Security

- **Supply-Chain-Härtung** — `pnpm/action-setup` in beiden CI-Workflows auf einen
  festen Commit-SHA gepinnt (`fc06bc1...`), statt auf den mutablen `@v5`-Tag zu
  zeigen. Verhindert, dass ein kompromittierter Tag transparente Code-Ausführung im
  Release-Build-Runner ermöglicht.
- **Backup-Restore Path-Traversal behoben** — `backup:restore`-IPC-Handler prüft
  jetzt per `path.resolve`, dass der übergebene Dateipfad tatsächlich im Backups-
  Verzeichnis liegt. Pfade außerhalb werden mit einem Fehler abgelehnt.
- **URL-Öffner: `shell.openExternal` statt `shell.openPath`** — Links im About-Dialog
  (GitHub-Repository sowie Drittanbieter-Paket-Repositories) nutzen jetzt den dafür
  vorgesehenen `shell.openExternal`-IPC-Handler mit HTTP/HTTPS-Whitelist. Der neue
  Handler lehnt Nicht-HTTP-URLs ab.
- **CI-Permissions auf Least-Privilege** — `permissions: contents: write` aus dem
  Workflow-Scope von `release.yml` entfernt und auf den `publish-release`-Job
  beschränkt. Der `build-windows`-Job läuft nun mit `contents: read`.

## [1.5.1] — 2026-04-25

### Changed

- **Dokumentation** — README und ROADMAP auf v1.5.0-Stand gebracht: alle neuen
  Features (Auto-Update, Crash-Logging, Onboarding, CSV, i18n, Lizenz-Dialog) in
  der Feature-Liste, Project-Structure aktualisiert (schema v8, neue Dateien),
  Release-Anleitung korrigiert. ROADMAP markiert v1.5 als shipped.

## [1.5.0] — 2026-04-25

### Added

- **Lizenz-Hinweise** (#35, PR F) — Unter Einstellungen → Über findet sich ein
  neuer "Lizenzen & Über"-Button, der einen About-Dialog öffnet. Der Dialog zeigt
  App-Version, den MIT-Lizenztext von TimeTrack sowie eine durchsuchbare, aufklapp-
  bare Liste aller 95 gebündelten Drittanbieter-Pakete (Name, Version, SPDX-Bezeichner,
  Repository-Link und Lizenztext). Die Lizenzliste wird zur Build-Zeit automatisch von
  `scripts/generate-licenses.mjs` aus dem Produktions-Abhängigkeitsbaum generiert
  und als `resources/licenses.json` abgelegt. Der `prebuild`-Hook führt das Script
  bei jedem `pnpm build` automatisch aus.
- **Onboarding-Wizard** (#32, PR E) — Neuen Installationen wird beim ersten
  Start automatisch ein 3-stufiger Assistent angezeigt. **Schritt 1** wählt
  die Sprache (DE/EN, Umschalter wirkt live). **Schritt 2** legt optional den
  ersten Kunden an (Name, Stundensatz, Farbe). **Schritt 3** erklärt die
  globalen Hotkeys (Standard-Fenster `Alt+Shift+S`, Mini-Widget `Alt+Shift+M`)
  und bestätigt ggf. den erstellten Kunden. Der Assistent kann per "Überspringen"
  jederzeit abgebrochen werden. Bereits bestehende Installs (Upgrade von v1.4)
  zeigen den Wizard nicht — das Flag `onboarding_completed` wird via
  Migration 008 automatisch auf `1` gesetzt, wenn Einträge vorhanden sind.
  Unter Einstellungen → Allgemein → Onboarding kann der Wizard erneut ausgelöst
  werden (setzt das Flag zurück und zeigt den Wizard beim nächsten Start).
- **i18n-Foundation** (neu, PR D) — Mini-Übersetzungs-Infrastruktur ohne externe
  Abhängigkeiten. Locale-Dateien sind typsichere TypeScript-Objekte
  (`src/shared/locales/de.ts`, `en.ts`); TypeScript stellt sicher, dass EN
  alle DE-Keys enthält. React-Context `I18nProvider` + `useT()`-Hook stellen
  die `t()`-Funktion komponenten-übergreifend bereit. Locale wird in der
  bestehenden `language`-Einstellung persistiert und bei App-Start geladen.
  Migriert in v1.5: **UpdateBanner** (alle Update-Meldungen), **SettingsView**
  (Diagnose-Abschnitt, Updates-Abschnitt, Sprach-Auswahl). Restliche Views
  bleiben hardcoded auf DE und werden im v1.6-Backlog durch
  `scripts/find-untranslated.mjs` erfasst. Sprach-Umschalter unter
  Einstellungen → Sprache; Wechsel wirkt sofort auf migrierte Bereiche.
- **CSV-Export** (#18, PR C) — Das PDF-Export-Dialog ist jetzt ein
  einheitliches "Export"-Modal mit zwei Tabs: **PDF** (Stundennachweis,
  unverändert) und **CSV** (Tabelle für Excel / DATEV). Der CSV-Export enthält
  alle abgeschlossenen Einträge des gewählten Zeitraums mit den Spalten Datum,
  Start, Ende, Dauer, Kunde, Beschreibung, Tags, Stundensatz und Betrag.
  Zwei Formate wählbar: **DE** (Semikolon als Feldtrenner, Komma als
  Dezimalzeichen — passt direkt in Excel DE) und **US** (Komma / Punkt —
  für DATEV-Importe). Datei enthält UTF-8 BOM, damit Excel ohne Encoding-
  Abfrage öffnet. Tags werden `|`-getrennt ausgegeben (kein Konflikt mit
  dem Feldtrenner).
- **Auto-Update** (#28, PR B) — `electron-updater` prüft beim App-Start auf
  GitHub-Releases, lädt neue Versionen automatisch im Hintergrund und zeigt
  ein dezentes Indigo-Banner an, sobald die Installation bereit ist. Der
  User entscheidet, wann neu gestartet wird — kein Force-Restart, kein
  Datenverlust bei laufendem Timer. Settings → "Updates" zeigt aktuelle
  Version, Status und letzte Prüfung; manueller "Jetzt nach Updates suchen"-
  Button für ungeduldige User. Offline-Toleranz: stiller Fallback ohne rote
  Fehlerbanner beim ersten Start ohne Internet. Alle Updater-Events fließen
  in dieselbe Log-Datei wie PR A. Lokales Test-Setup via
  `scripts/test-updater.mjs` + `build/dev-app-update.yml`.
- **Crash-Logging** (#34, PR A) — `electron-log` schreibt App-Ereignisse und
  Fehler nach `%AppData%\TimeTrack\logs\main.log` (Windows; analoge Pfade auf
  macOS/Linux). Renderer-`console.*`-Aufrufe werden via IPC in dieselbe Datei
  gespiegelt, sodass Bug-Reports ein vollständiges Bild liefern. Globale
  Handler für `uncaughtException` und `unhandledRejection` erfassen Crashes,
  die sonst silent verschwinden würden. Log-Datei rotiert automatisch bei 5 MB.
  Settings → "Diagnose" zeigt den Pfad und bietet Buttons "Im Explorer zeigen"
  + "Ordner öffnen" zum schnellen Anhängen an Issue-Reports.

## [1.3.0] — 2026-04-25

### Added

- **Stundensatz pro Kunde** (#20) — Optionales Honorar-Feld in der Kunden­maske,
  gespeichert als Integer-Cents in `clients.rate_cent` (0 = kein Satz hinterlegt).
  Eingabe als deutsche Dezimalzahl (`85,00`); wird in PR C als €-Spalte im PDF
  ausgegeben. Reuse der bereits in v1.2-Migration 003 angelegten Spalte — keine
  zusätzliche Migration nötig.
- **Quick-Filter-Pillen im Kalender** (#21) — Vier Buttons („Diese Woche",
  „Letzte Woche", „Diesen Monat", „Letzter Monat") plus farbiger
  Hero-Button „📄 Letzter Monat als PDF" über dem Kalender. PR A liefert die
  Buttons + DST-sichere Range-Berechnung (`getQuickRange`); das eigentliche
  PDF-Modal landet in PR C.
- **Migration 004** — Seedet Settings-Schlüssel für die kommende
  PDF-Pipeline (`pdf_logo_path`, `pdf_sender_address`, `pdf_tax_id`,
  `pdf_accent_color` mit Default `#4f46e5`, `pdf_footer_text`,
  `pdf_round_minutes` mit Default `0`). Idempotent via `INSERT OR IGNORE`,
  überschreibt also keine vom User gesetzten Werte beim Replay.
- **Cross-Midnight Auto-Split** — Einträge, die lokale Mitternacht überqueren,
  werden im IPC-Layer automatisch in zwei (oder mehr) verlinkte Hälften
  aufgeteilt. Beide Hälften teilen sich eine UUID in der neuen Spalte
  `entries.link_id` (Migration 005, partieller Index `idx_entries_link_id`).
  Tagessummen, KW-Aggregate und PDF-Reports rechnen damit automatisch korrekt
  pro Tag. Der „nicht über Mitternacht möglich"-Hinweis im Eintrag-Dialog
  ist entfernt; DST-sicher (Frühling/Herbst getestet via `date-fns`).
  Löschen kaskadiert optional auf die Geschwister-Hälfte (`cascadeLinked`-Flag
  in `entries:delete`).
- **JSON-Vollexport** (#17) — Neuer Button „Export speichern …" in
  Einstellungen → Daten. Schreibt eine lesbare JSON-Datei mit `meta`
  (Schema-Version, Zeitstempel, App-Version), allen Kunden, allen Einträgen
  (inkl. soft-gelöschter und verlinkter Hälften) und allen Settings.
  Trust-Artefakt: User können ihre Daten byte-genau verifizieren; CSV/PDF
  bauen in PR C/D darauf auf.
- **PDF-Stundennachweis** (#16, #19) — Hero-Path: 1-Klick aus dem Kalender
  („📄 Letzter Monat als PDF" oder eine Quick-Filter-Pille) öffnet ein
  Modal, in dem Kunde + Zeitraum vorbelegt sind, und schreibt nach
  Bestätigung ein druckbares A4-PDF im deutschen Stundennachweis-Layout
  (Datum / Von / Bis / Tätigkeit / Dauer, optional Honorar wenn der Kunde
  einen Stundensatz hat). Logo, Absenderadresse, Steuernummer,
  Akzentfarbe, Footer-Text und optionale Stunden-Rundung
  (5/10/15/30 min) konfigurierbar in **Einstellungen → PDF-Vorlage**.
  Implementierung: Hidden `BrowserWindow` + `printToPDF`; das HTML-Template
  ist eine String-Render-Funktion mit base64-eingebettetem Logo und CSP
  `default-src 'none'; img-src data:; style-src 'unsafe-inline'` —
  kein `webSecurity:false` nötig, kein dritter Vite-Renderer-Entry.
  Honorar-Berechnung integer-cent: `Math.round(min × rateCent / 60)`,
  Ausgabe als deutsches Format `1.234,56 €`. Bei aktiver Rundung werden
  auch die angezeigten Von/Bis-Zeiten an die gerundete Dauer angeglichen
  (Regel: `displayedStart = round(rawStart, step)`,
  `displayedStop = displayedStart + roundedMinutes`), damit die
  PDF-Empfänger:in nie eine Zeile wie „18:54 – 19:18 → 0:30" sieht.
  Die Rundung selbst wird im PDF nicht erwähnt — Datenbank speichert
  weiterhin die echten Start/Stopp-Zeitstempel.
- **Unterschriftsfelder optional im PDF-Export** — Neue Checkbox im
  „Stundennachweis als PDF"-Modal (Default: aus). Wenn aktiviert, werden
  am Ende des Dokuments zwei Linien für Auftragnehmer / Auftraggeber
  gerendert. Pro Export wählbar — kein Setting nötig.
- **App- + Tray-Icons** (#16) — Neue Glass-Style-Icons aus dem
  Master-SVG `timetrack_icon_glass_final.svg`. `build/icon.png` (1024×1024)
  - `build/icon.ico` (16/24/32/48/64/128/256) für electron-builder,
    `resources/tray-running.png` (grün, läuft) und
    `resources/tray-stopped.png` (grau, idle) für die System-Tray. Die Tray
    wechselt das Glyph je nach Timer-State. Generator-Skript:
    `node scripts/generate-icons.mjs` (deps: `sharp`, `png-to-ico`).
- **Manueller Icon-Workflow** — `resources/icon.png` ist jetzt die
  Source-of-Truth für das App-Icon. `scripts/sync-icon.mjs` synchronisiert
  es vor jedem Build automatisch nach `build/icon.png` (1024×1024) und
  `build/icon.ico` (multi-res). Wird über den `prebuild`-npm-Hook
  ausgelöst, sodass `pnpm build:win` immer das aktuelle Icon zieht.
- **CI PDF-Smoke-Test** — Der Release-Workflow rendert beim Smoke-Test der
  gepackten `.exe` jetzt zusätzlich ein Mini-PDF (1 Eintrag, 1 Kunde) und
  prüft, dass `printToPDF` gegen das gepackte Chromium funktioniert
  (`pdfBytes >= 1000`). Catches Regressions in der PDF-Pipeline bevor ein
  Release rausgeht — nicht nur in der DB/ABI-Schicht.
- **GitHub Actions auf v5** (#42) — `actions/checkout`, `actions/setup-node`,
  `actions/upload-artifact`, `actions/download-artifact` jeweils auf `@v5`
  in `release.yml` und `test.yml`. `pnpm/action-setup@v4` bleibt (kein v5
  veröffentlicht).

### Changed

- **PDF-Rundung jetzt aufrundend** — `roundMinutes` rundet nicht mehr halb-
  auf-half-down, sondern aufwärts (ceil): jede angefangene Stufe wird voll
  berechnet (Standard-Abrechnungslogik „angebrochene Viertelstunde voll").
  Auch die Roh-Minuten-Berechnung im PDF nutzt `Math.ceil(ms/60000)`, damit
  ein Sub-Minuten-Eintrag (z. B. ein Test-Toggle) als 1 Roh-Minute zählt
  und mit step=15 als 15 Minuten ausgewiesen wird statt zu verschwinden.
  `roundMinutes(0, step)` bleibt 0 — kein Phantom-Billing für leere Einträge.
- **Kalender-Tagesbalken in Kundenfarbe** — Die Mini-Linien in den
  Kalenderzellen nutzen jetzt `client.color` statt einer einheitlichen
  Indigo-Farbe; Tooltip enthält zusätzlich den Kundennamen. Indigo-Fallback
  bleibt für nicht-aufgelöste `client_id`s.

### Fixed

- **Globaler Hotkey `Alt+Shift+S` aus Heute/Kalender** — `start()` brach
  still ab, wenn kein Kunde im Timer-Tab vorausgewählt war (seit v1.2 ist
  „Heute" Default-View und hat keinen Selector). Fällt jetzt auf den ersten
  aktiven Kunden zurück, sodass der Hotkey aus jedem Tab funktioniert.
- **Fokus-Sprung im „Eintrag nachtragen"-Modal** — Der `Dialog`-Effect
  hatte `onClose` in den Dependencies; mit Inline-Arrow als `onClose`
  und einem sekündlich tickenden Timer im Hintergrund lief der Effect
  jedes Mal neu und stahl den Fokus auf den ×-Schließen-Button. Effect
  hängt jetzt nur noch an `open`, Fokus-Selector priorisiert
  Form-Inputs vor Buttons.

## [1.4.1] — 2026-04-25

### Fixed
- App-Fenster zeigte "Electron" statt "TimeTrack" als Titel

## [1.4.0] — 2026-04-25

### Added

- **Mini-Widget** (#22) — Always-on-top 200×40-Overlay, das den laufenden
  Timer jederzeit im Blick behält. Kein Hauptfenster nötig.
  - `● Kundenname HH:MM:SS ■` (running) / `Kein Timer ▶` (idle) —
    beide Buttons wired: ▶ startet via erstem aktiven Kunden,
    ■ stoppt den laufenden Eintrag.
  - Ganzes Widget drag-region; Stop/Play als `no-drag-region`-Insel.
  - Transparent, `alwaysOnTop:'screen-saver'` (sichtbar über Vollbild-Apps),
    `visibleOnAllWorkspaces`, `skipTaskbar`.
  - Position rechts-unten als Default; Drag → 250ms-debounced-Persist in
    `settings (mini_x / mini_y)`. Off-Screen-Clamp bei Neustart wenn
    Monitor abgekoppelt wurde.
  - **Hotkey `Alt+Shift+M`** toggelt Sichtbarkeit (konfigurierbar in
    Settings). Getrennte Slot-Verwaltung von `hotkey_toggle` — kein
    `globalShortcut.unregisterAll` mehr; Hotkeys können unabhängig
    geändert werden.
  - **Cross-Slot-Kollisionsschutz:** Versuch, denselben Combo für beide
    Hotkeys zu setzen, liefert sofort den Fehler
    „Hotkey konnte nicht registriert werden" (kein stilles Überschreiben).
  - Hotkey-Capture in Settings suspendiert alle GlobalShortcuts während
    der Eingabe, sodass die bestehende Tastenkombi nicht mehr den
    Handler auslöst.
  - Startup-Konflikt (Combo von anderer App belegt, wenn
    `mini_enabled=1`): nicht-blockierendes `dialog.showMessageBox`.
  - State-Push via `mini:state-changed` von Main an Mini-Renderer auf
    jedem `tray:update`; `startedAt` wird im Widget lokal getickert
    (kein IPC-Polling).
  - Migration 006: seedet `mini_enabled='0'`, `mini_hotkey='Alt+Shift+M'`,
    `mini_x='-1'`, `mini_y='-1'` via `INSERT OR IGNORE`.
- **Tags pro Eintrag** (#24) — Freitextlabels, die jedem Zeitblock zugeordnet
  werden können und für schnelles Filtern, Auswerten und PDF-Gruppierung dienen.
  - Tags werden als `,tag1,tag2,` in einer neuen `entries.tags`-Spalte
    (Migration 007, `NOT NULL DEFAULT ''`) gespeichert; exakte LIKE-Suche
    via `,tag,` verhindert Fehlpositive.
  - **`TagInput`-Komponente** — Chip-Liste + Texteingabe in einem Feld.
    Tab/Enter/Komma übernimmt den getippten Tag, Backspace entfernt den
    letzten Chip. Autocomplete-Dropdown mit Vorschlägen aus den letzten
    90 Tagen (freq-sortiert via `tags:recent` IPC). Deterministische
    8-Farben-Chip-Palette (Tag-Name → `charCode % 8`). Validierung:
    Regex `[a-z0-9._-]`, max. 32 Zeichen/Tag, max. 10 Tags/Eintrag.
  - **`EntryEditForm`** — `TagInput` integriert; `tags`-Feld wird beim
    Anlegen und Bearbeiten via `entries:create` / `entries:update` gespeichert.
  - **Kalender-Drawer-Filter** — Jeder Eintrag zeigt Farb-Chips für seine
    Tags. Über die Tag-Pille-Bar im Header lässt sich die Tagesansicht
    auf einen einzelnen Tag filtern (Toggle); Zähler wechselt zu
    „X von Y Einträge" und der Leer-State zeigt „Keine Einträge mit Tag #x".
  - **PDF-Gruppen-Export** — Neue Checkbox „Nach Tag gruppieren" im
    PDF-Export-Modal. Bei aktiver Gruppierung rendert das PDF Abschnitte
    pro Tag (alphabetisch sortiert), jeder mit eigenem Subtotal-Bereich;
    Einträge ohne Tag landen in der Gruppe „Ohne Tag" (immer am Ende).
    Silent Fallback auf Flat-Layout wenn kein Eintrag im Zeitraum Tags hat.
- **Schnell-Notiz nach Stop** (#25) — Wenn ein Timer mit leerer Beschreibung gestoppt
  wird, erscheint ein Modal „Was war das?" mit 30s-Countdown-Progressbar.
  Beschreibung eingeben und Enter drücken — der Eintrag wird sofort aktualisiert.
  Escape oder Ablauf des Countdowns überspringen das Modal lautlos.
  TodayView und CalendarDrawer refreshen automatisch nach dem Speichern.

## [1.2.0] — 2026-04-24

### Added

- **Heute-Ansicht** (neuer Default-Tab) — Aktiver-Timer-Pille mit Live-Counter,
  zwei Stat-Cards (Heute / Diese Woche), Quick-Start-Reihe für die Top-3-Kunden
  der letzten 30 Tage, Liste der letzten 5 Einträge mit Bearbeiten/Löschen
  und „+ Eintrag nachtragen"-Dialog.
- **Kalender-Ansicht** — 7×N-Monatsraster mit KW-Spalte, Tagessumme und bis zu
  5 Mini-Bars pro Tag (mit „+N" für Überlauf), Tastatur-Navigation
  (Pfeil/Enter/Esc), heutige Zelle hervorgehoben.
- **Tages-Drawer** — Klick auf einen Kalendertag öffnet eine seitliche Liste
  aller Einträge des Tages. Inline-Bearbeitung, Inline-Anlegen via Sticky-Footer,
  Löschen mit Bestätigungsdialog.
- **Manuelles Anlegen & Bearbeiten** von Einträgen mit Server-seitiger
  Validierung (Überschneidungen, Beschreibungs-Länge, max. 24 h, Kunden-
  Existenz).
- **Soft-Delete + Rückgängig** — Gelöschte Einträge werden 5 Sekunden lang per
  Toast wiederherstellbar; die Einträge werden nicht hart gelöscht (`deleted_at`-
  Spalte) sodass spätere PDF-Referenzen stabil bleiben.
- **Tray-Tooltip mit Heute-Total** (#31) — Format `● Kunde · HH:MM · Heute HH:MM`
  bzw. `TimeTrack — Heute HH:MM` im Idle, aktualisiert über den 30-s-Heartbeat.
- **DESIGN.md-Stub** — Tokens für Farben, Typografie und Spacing als
  Design-Source-of-Truth.
- **Migration 003** — Spalten `clients.rate_cent` (v1.3-PDF-Vorbereitung) und
  `entries.deleted_at`, Index `idx_entries_started_at`, Backfill für legacy
  `rounded_min`-Werte. Pre-/Post-Apply-Logging und Assertion (negative
  Dauern lösen automatischen Rollback aus).
- **`dashboard:summary`-IPC** — Heute, Woche, letzte 5 Einträge und Top-3-Kunden
  in einer einzelnen Lese-Transaktion.
- **CI Smoke-Test** — Die Release-Pipeline startet die gepackte `.exe` mit
  `--smoke-test=…`, prüft Exit-Code, Schema-Version und Electron-ABI bevor das
  Artefakt veröffentlicht wird. Schließt die Klasse von ABI-Crashes (v1.1.x)
  vor dem Tag.

### Notes

- **Einträge über Mitternacht** werden in v1.2 abgelehnt; die Edit-Maske zeigt
  einen permanenten Hinweis, eine Lösung folgt in v1.3.
- **User-facing Rounding-UI** wurde aus v1.2 ausgenommen und kommt in v1.3
  zusammen mit dem PDF-Export.

## [1.1.2] — 2026-04-24

### Fixed

- **Installer crash on first launch** — The Windows installer in v1.1.0 and v1.1.1
  shipped a `better-sqlite3` binary compiled for Node.js (ABI 127) instead of
  Electron (ABI 140). The app crashed at startup with a `NODE_MODULE_VERSION`
  mismatch. The release workflow now uses `@electron/rebuild`, which handles
  pnpm's symlinked `node_modules` correctly and rebuilds against the bundled
  Electron version before packaging.

## [1.1.1] — 2026-04-24

### Fixed

- Attempted fix for the v1.1.0 native-module mismatch using
  `electron-builder install-app-deps` — turned out not to work reliably with
  pnpm. Superseded by v1.1.2.

## [1.1.0] — 2026-04-24

### Added

- **Idle-Detection** — When the system is idle longer than the configured
  threshold (default 5 minutes), a modal asks what to do with the time:
  _Weiter laufen lassen_, _Bei Inaktivität stoppen_, or _Als Pause markieren_.
  Driven by `powerMonitor.getSystemIdleTime()` in the main process.
- **Tray Quick-Start** — Right-click the tray icon to start a timer for any
  client directly, without opening the window. The menu rebuilds dynamically
  from the active-clients list and shows a _Stop_ entry while a timer runs.
- **Settings-View** — New _Einstellungen_ tab with sections _Allgemein_,
  _Timer_, _Daten_ and _Über_. Configure language, auto-start, idle threshold,
  global hotkey (with capture UI), and inspect data paths and backups.
- **Auto-Backup** — A daily SQLite backup runs at app startup, kept rolling
  for the last 7 days under `%AppData%\TimeTrack\backups\`. Manual backups,
  pre-migration backups and restore are exposed in the Settings view. Manual
  and pre-migration backups are never auto-rotated.
- **DB Migrations** — Versioned migration system (`src/main/migrations/`) with
  a `schema_version` table, transactional apply, and an automatic
  pre-migration backup. v1.1 ships migration `002` which seeds the new
  settings keys (`idle_threshold_minutes`, `language`, `auto_start`,
  `hotkey_toggle`).
- **Vitest setup** — First automated tests: shared `duration` helpers,
  migration system (10 tests), and backup rotation/restore (8 tests). Two
  Vitest projects (`node`, `jsdom`) so renderer hooks can use the DOM.
- **Automated Windows Release** — `.github/workflows/release.yml` builds the
  NSIS installer on Windows, runs the test suite, rebuilds native modules
  for the Electron ABI, and publishes a GitHub Release with the installer
  attached when a `v*` tag is pushed.

### Changed

- Hotkey is now configurable via the Settings view; failed re-binds revert
  the change and surface an inline error.
- The tray tooltip and context menu update on every `tray:update` IPC so the
  Quick-Start menu always reflects the current client list.

### For contributors

- Native-module rebuild for tests: CI runs `pnpm rebuild better-sqlite3`
  against Node 22 before `pnpm test`, then `pnpm exec electron-rebuild` against
  Electron before `electron-builder`.
- Vitest `testTimeout` and `hookTimeout` raised to 30 s — the Windows runner
  needs the headroom for the first cold-start `better-sqlite3` call.

## [1.0.0] — 2026-04-23

First public release. Windows NSIS installer.

### Added

- **Timer** — Start/stop time entries with client + description. Running timer
  shows elapsed time in `HH:MM:SS` with a pulsing color dot and client name.
  Press Enter in the description field to start.
- **Heartbeat** — Active entries write a heartbeat every 30 seconds. On startup,
  entries with a stale heartbeat (>5 min) are automatically stopped (crash recovery).
- **Kunden-Verwaltung** — Full CRUD for clients: create with name + color picker
  (10 presets), edit inline, archive (soft-delete), and delete with confirmation.
  Archived clients are grouped separately and grayed out.
- **Global Hotkey** — `Alt+Shift+S` toggles the timer from anywhere on the system,
  even when the app window is minimized or hidden.
- **Tray Icon** — App lives in the system tray. Tooltip shows `● ClientName` while
  a timer is running, `— Kein Timer aktiv` otherwise. Right-click context menu shows
  status, "Fenster anzeigen", and "Beenden".
- **Minimize to Tray** — Closing the window hides it to tray instead of quitting.
  Quit via tray context menu or `app.quit()`.
- **SQLite database** — `better-sqlite3` with WAL mode and foreign-key enforcement.
  Stored at `%AppData%\TimeTrack\timetrack.db`.
- **Context Bridge** — Full typed `window.api` with `clients`, `entries`, and
  `settings` namespaces. `contextIsolation: true`, `nodeIntegration: false`.
- **Zustand store** — `useTimerStore` holds all timer UI state. `useTimer` hook
  manages DB interactions, tick interval, and heartbeat interval.
- **Tailwind CSS 4** — Via `@tailwindcss/vite` plugin. Dark slate theme throughout.
- **TypeScript** — Strict types shared across main + renderer via `src/shared/types.ts`.
- **Windows Installer** — NSIS installer (`time-tracking-1.0.0-setup.exe`),
  Desktop + Startmenu shortcuts, custom install directory.

### Fixed

- Stale hotkey hint in TimerView (was "F5", now correctly shows `Alt+Shift+S`).
- Archived clients: action buttons (archive/edit/delete) are now always
  fully visible — only the color dot and name dim.
- Nav tabs gained a visible `focus-visible` ring for keyboard users.
- Color-picker `aria-label`/`title` now uses German color names instead of hex.
- Placeholder views (Kalender, Einstellungen) now show proper empty states.
