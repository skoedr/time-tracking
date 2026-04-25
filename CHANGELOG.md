# Changelog

All notable changes to TimeTrack are documented here.

## [Unreleased] — v1.5

### Added

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
