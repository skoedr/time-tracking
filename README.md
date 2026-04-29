# TimeTrack

> 🌐 [English version available → README.en.md](README.en.md)

A personal Windows desktop time-tracking app for freelancers. Lightweight Toggl alternative with a local SQLite database, calendar view, and PDF Stundennachweis export.

## Features

- **Heute-Ansicht** — Default-Tab mit aktivem Timer als Pille, Tages-/Wochensumme, Top-3-Kunden-Quick-Start und letzte 5 Einträge.
- **Timer** — Start/Stop mit Kunden-Auswahl und Beschreibung. Crash-safe via Heartbeat.
- **Kalender-Modus** — 7×N-Monatsraster mit KW-Spalte, Tagessumme, farbigen Mini-Bars pro Kunde, Tages-Drawer mit Inline-Edit.
- **Quick-Filter + 1-Klick-PDF** — "Diese Woche / Letzte Woche / Diesen Monat / Letzter Monat" plus Hero-Button "📄 Letzter Monat als PDF".
- **PDF-Stundennachweis** — Druckbares A4-PDF mit Datum / Von / Bis / Tätigkeit / Dauer (optional Honorar). Konfigurierbar in **Einstellungen → PDF-Vorlage**: Logo, Absender, Steuernummer, Akzentfarbe, Footer, Stunden-Rundung, optionale Unterschriftsfelder.
- **PDF-Merge — An Rechnung anhängen** — Stundennachweis direkt an eine bestehende Lexware-/sevDesk-/Billomat-Rechnungs-PDF anhängen. Checkbox im Export-Modal aktivieren, Rechnung wählen, fertig. Kein Smallpdf, kein Acrobat. Output: `<Rechnungsname>_inkl_Stundennachweis.pdf` neben der Original-Datei. Original bleibt unverändert.
- **Stundensatz pro Kunde** — Optionales Honorar-Feld, fließt als €-Spalte ins PDF.
- **JSON-Vollexport** — Kunden + Einträge + Settings als lesbare JSON-Datei (Daten-Portabilität).
- **Cross-Midnight Auto-Split** — Einträge über Mitternacht werden automatisch in zwei verlinkte Tageshalften gesplittet — DST-sicher.
- **Kunden- & Projektverwaltung** — Kunden anlegen, bearbeiten, archivieren, löschen (Farbcode + Stundensatz). Pro Kunde beliebig viele **Projekte** mit eigenem Farbcode und optionalem Stundensatz-Override. Timer, Heute-Ansicht, Kalender und Eintrag-Bearbeitung zeigen den Projektnamen; Export (PDF + CSV) nach Projekt filterbar.
- **Global Hotkey** — `Alt+Shift+S` (konfigurierbar) startet/stoppt den Timer aus jedem Tab.
- **Tray Icon + Quick-Start** — Rechtsklick auf die Tray öffnet aktive Kunden direkt als Buttons. Tray-Glyph wechselt je nach Timer-State.
- **Mini-Widget** — Always-on-top 200×40 Overlay (Hotkey `Alt+Shift+M`, konfigurierbar). Zeigt laufenden Timer + Kunde + Stop/Start-Buttons — kein Hauptfenster nötig. Draggable, sichtbar über Vollbild-Apps.
- **Tags pro Eintrag** — Farbige Chips je Zeitblock. Filter im Kalender-Drawer per Tag-Klick. PDF-Export nach Tag gruppierbar.
- **Schnell-Notiz nach Stop** — Kein Beschreibungsfeld ausgefüllt? 30s-Modal „Was war das?" erscheint nach dem Stoppen. Enter speichert, Escape überspringt.
- **Idle-Detection** — PC inaktiv über Schwelle? Modal fragt: behalten, stoppen oder als Pause markieren.
- **Auto-Backup** — Rollierende 7-Tage-SQLite-Snapshots unter `%AppData%\TimeTrack\backups\`. Manueller Backup + Restore aus Settings.
- **DB Migrations** — Versioniertes Schema mit Pre-Migration-Backup, sodass Updates nie Daten verlieren.
- **Auto-Update** — `electron-updater` prüft beim Start auf neue GitHub-Releases. UpdateBanner erscheint bei verfügbaren Updates; manueller Check + Installieren-Button in Einstellungen → Updates.
- **Crash-Logging** — `electron-log` schreibt rotierende Logs in `%AppData%\TimeTrack\logs\`. Catch-all für Main- und Renderer-Process-Fehler. Log-Datei direkt aus Einstellungen → Diagnose öffnen.
- **Onboarding-Wizard** — 3-stufiger Assistent beim ersten Start: Sprache wählen → ersten Kunden anlegen → Hotkey-Hinweis. Ein-mal gezeigt; Bestandsuser behalten das Flag automatisch.
- **CSV-Export** — Unified ExportModal mit Kunden-/Zeitraum-Filter. Produkt: flache CSV-Datei mit allen Einträgen (DATEV-kompatibles Format).
- **i18n DE/EN** — vollständige Übersetzung über typsichere Locale-Dateien. Sprache umschaltbar in Einstellungen → Allgemein (wirkt live ohne Neustart).
- **Lizenz-Hinweise** — About-Dialog unter Einstellungen → Über. Zeigt die MIT-Lizenz von TimeTrack + aufklappbare Liste aller 95 gebündelten Drittanbieter-Pakete mit SPDX-Bezeichner und Lizenztext.
- **Auto-Update Releases** — `v*`-Tag pushen baut den Windows-Installer und publishes ein GitHub Release automatisch (mit gepacktem Smoke-Test gegen DB **und** PDF-Pipeline).
- **Local SQLite** — Alle Daten bleiben auf deiner Maschine unter `%AppData%\TimeTrack\`.

### Coming soon

- **Outlook-Integration** (v2.0) — Read-only-Import via Microsoft Graph
  (Device-Code-Flow, kein Server, Office E1 + persönliche Konten).
- Pomodoro-Modus (#23) — bedingt auf User-Demand verschoben nach v1.8.

Vollständige Roadmap: [ROADMAP.md](ROADMAP.md) · Issues: [github.com/skoedr/time-tracking/issues](https://github.com/skoedr/time-tracking/issues)

## Tech Stack

| Layer | Library |
|---|---|
| Shell | Electron 39 |
| Build | electron-vite 5 |
| UI | React 19 + TypeScript 5 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Database | better-sqlite3 12 |
| Dates | date-fns 4 |

## Development

**Requirements:** Node.js 18+, pnpm 10+

```bash
# Install dependencies (also compiles native SQLite module)
pnpm install

# Start dev server with hot reload
pnpm dev

# Type check
pnpm typecheck

# Run tests
pnpm test

# Build Windows installer
pnpm build:win
```

## Releases

Releases are built automatically by `.github/workflows/release.yml` when a `v*` tag
is pushed to `main`. The workflow rebuilds `better-sqlite3` against the Electron
ABI via `@electron/rebuild`, packages an NSIS installer, and publishes a GitHub
Release with the `.exe`, `.blockmap`, and `latest.yml` attached.

- Download the latest installer:
  [github.com/skoedr/time-tracking/releases/latest](https://github.com/skoedr/time-tracking/releases/latest)
- Roadmap and per-version planning: see [ROADMAP.md](ROADMAP.md) and the
  [open issues](https://github.com/skoedr/time-tracking/issues) grouped by `v1.x` labels.

To cut a new release locally:

```bash
# 1. Bump version in package.json + add CHANGELOG entry
# 2. Commit, tag, and push
git add package.json CHANGELOG.md
git commit -m "chore(release): bump version to 1.x.y"
git tag v1.x.y
git push origin main v1.x.y
# 3. The Release workflow does the rest — runs tests, builds the NSIS installer,
#    and publishes the GitHub Release automatically.
```

## Project Structure

```
src/
  main/          # Electron main process
    index.ts     # App entry, tray (with Quick-Start), global hotkey, smoke-test mode
    db.ts        # SQLite open + WAL setup
    ipc.ts       # All IPC handlers (clients, projects, entries, settings, dashboard, exports)
    idle.ts      # powerMonitor-based idle watcher
    backup.ts    # Daily/manual/pre-migration backups + restore
    pdf.ts       # PDF payload builder + HTML template (Stundennachweis)
    pdfWindow.ts # Hidden BrowserWindow renderer (printToPDF pipeline)
    pdfMerge.ts  # PDF merge logic (mergePdfs via pdf-lib)
    jsonExport.ts# Full JSON export (clients + entries + settings)
    logo.ts      # Logo file -> base64 data URL for PDF embedding
    updater.ts   # electron-updater bridge + IPC handlers (auto-update)
    csvExport.ts # CSV export builder
    migrations/  # Versioned schema migrations + runner (001..012)
  preload/
    index.ts     # Context Bridge (window.api)
    index.d.ts   # TypeScript types for renderer
  renderer/src/
    views/       # TimerView, TodayView, CalendarView, ClientsView, SettingsView
    components/  # Dialog, IdleModal, PdfExportModal, CalendarDrawer, EntryEditForm, Toast,
                 # ConfirmDialog, ProjectFormModal, PdfMergeModal, UpdateBanner, OnboardingWizard, AboutDialog, ExportModal
    contexts/    # I18nContext (DE/EN translations, useT hook)
    hooks/       # useTimer logic hook
    store/       # Zustand stores (timer, entries, projects, clients, toast, updateStore)
  shared/
    types.ts     # Shared TypeScript interfaces
    duration.ts  # Time-formatting helpers
    currency.ts  # Cent-based money + minute rounding (ceil)
    date.ts      # Local-day helpers
    dateRanges.ts# Quick-filter range calculation (DST-safe)
    midnightSplit.ts # Cross-midnight entry split logic
    rate.ts      # German decimal <-> integer cent parsing
    locales/     # de.ts + en.ts locale files (typsicher via TranslationKey)
scripts/
  generate-icons.mjs    # SVG -> tray PNGs (running/stopped, @1x/@2x)
  sync-icon.mjs         # resources/icon.png -> build/icon.png + multi-res .ico (prebuild hook)
  generate-licenses.mjs # Scannt Produktions-Deps, schreibt resources/licenses.json (prebuild hook)
resources/
  licenses.json  # Generierte Lizenzliste (95 Pakete, aktualisiert bei pnpm build)
templates/
```

## Data Storage

The SQLite database lives at `%AppData%\TimeTrack\timetrack.db`. Schema (as of v1.9.0, schema_version 9):

- `clients` — name, color, active flag, `rate_cent` (optional Stundensatz)
- `projects` — client_id (FK), name, color, active flag, `rate_cent` (optional Stundensatz-Override)
- `entries` — client_id, description, started_at, stopped_at, heartbeat_at, `deleted_at` (soft-delete), `link_id` (cross-midnight pair UUID), `project_id` (nullable FK → projects)
- `settings` — key/value store (incl. PDF template settings: logo path, sender, tax id, accent color, footer, round minutes)

On startup the app auto-stops any entries where the heartbeat is older than 5 minutes (crash recovery).

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- All database access runs in the main process only
- Renderer communicates exclusively via the typed Context Bridge (`window.api`)
- Vulnerability reporting: see [SECURITY.md](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, branch naming, and PR guidelines.

## Privacy

All data stays local. Only outbound call: auto-update check against `api.github.com`. No telemetry. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © 2026 Robin Wald

The bundled third-party packages keep their own licenses; the full list is
generated by `scripts/generate-licenses.mjs` into `resources/licenses.json`
and shown in **Settings → About → Licenses**.
