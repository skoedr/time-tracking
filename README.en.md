# TimeTrack

A personal Windows desktop time-tracking app for freelancers. Lightweight Toggl alternative with a local SQLite database, calendar view, and PDF timesheet export.

> **Language:** The German README is the primary version ([README.md](README.md)). This English translation is provided for OSS contributors.

## Features

- **Today View** — Default tab with active timer pill, daily/weekly total, top-3 client quick-start, and last 5 entries.
- **Timer** — Start/stop with client selection and description. Crash-safe via heartbeat.
- **Calendar Mode** — 7×N monthly grid with calendar-week column, daily total, color-coded mini-bars per client, and day-drawer with inline edit.
- **Quick-Filter + 1-Click PDF** — "This week / Last week / This month / Last month" plus hero button "📄 Last month as PDF".
- **PDF Timesheet** — Printable A4 PDF with date / from / to / activity / duration (optionally with fee). Configurable in **Settings → PDF Template**: logo, sender address, tax number, accent color, footer, hour rounding, optional signature fields.
- **Hourly Rate per Client** — Optional fee field, renders as €-column in the PDF.
- **Full JSON Export** — Clients + entries + settings as a readable JSON file (data portability).
- **Cross-Midnight Auto-Split** — Entries spanning midnight are automatically split into two linked half-day entries — DST-safe.
- **Client Management** — Create, edit, archive, delete; color code + hourly rate.
- **Global Hotkey** — `Alt+Shift+S` (configurable) starts/stops the timer from any window.
- **Tray Icon + Quick-Start** — Right-click the tray to launch active clients as direct buttons. Tray glyph changes with timer state.
- **Mini Widget** — Always-on-top 200×40 overlay (hotkey `Alt+Shift+M`, configurable). Shows running timer + client + stop/start buttons — no main window needed. Draggable, visible over fullscreen apps.
- **Tags per Entry** — Color chips per time block. Filter in calendar drawer by tag click. PDF export groupable by tag.
- **Quick Note after Stop** — Description field empty? A 30 s modal "What was that?" appears after stopping. Enter saves, Escape skips.
- **Idle Detection** — PC idle beyond threshold? Modal asks: keep, stop, or mark as break.
- **Auto-Backup** — Rolling 7-day SQLite snapshots under `%AppData%\TimeTrack\backups\`. Manual backup + restore from Settings.
- **DB Migrations** — Versioned schema with pre-migration backup so updates never lose data.
- **Auto-Update** — `electron-updater` checks for new GitHub releases on startup. UpdateBanner appears when updates are available; manual check + install button in Settings → Updates.
- **Crash Logging** — `electron-log` writes rotating logs to `%AppData%\TimeTrack\logs\`. Catch-all for main- and renderer-process errors. Log file can be opened directly from Settings → Diagnostics.
- **Onboarding Wizard** — 3-step assistant on first start: choose language → create first client → hotkey hint. Shown once; existing users retain the flag automatically.
- **CSV Export** — Unified ExportModal with client/date-range filter. Output: flat CSV with all entries (DATEV-compatible format).
- **i18n DE/EN** — Full translation via type-safe locale files. Language switchable in Settings → General (live, no restart needed).
- **License Notices** — About dialog under Settings → About. Shows the MIT license for TimeTrack + expandable list of all 95 bundled third-party packages with SPDX identifier and license text.
- **Auto-Update Releases** — Pushing a `v*` tag builds the Windows installer and publishes a GitHub Release automatically (with a smoke test against the DB **and** PDF pipeline).
- **Local SQLite** — All data stays on your machine under `%AppData%\TimeTrack\`.

### Coming soon

- **PDF-Merge** (v1.7) — Attach the timesheet to an existing invoice PDF (Lexware / sevDesk / Billomat) in one click. Saves the manual Smallpdf/Acrobat step.
- **Outlook Integration** (v2.0) — Read-only import via Microsoft Graph (Device Code Flow, no server, Office E1 + personal accounts).
- Pomodoro mode (#23) — deferred to v1.8 based on user demand.

Full roadmap: [ROADMAP.md](ROADMAP.md) · Issues: [github.com/skoedr/time-tracking/issues](https://github.com/skoedr/time-tracking/issues)

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

- Download the latest release:
  [github.com/skoedr/time-tracking/releases/latest](https://github.com/skoedr/time-tracking/releases/latest)
- Roadmap and per-version planning: see [ROADMAP.md](ROADMAP.md) and the
  [open issues](https://github.com/skoedr/time-tracking/issues).

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
    ipc.ts       # All IPC handlers (clients, entries, settings, dashboard, exports)
    idle.ts      # powerMonitor-based idle watcher
    backup.ts    # Daily/manual/pre-migration backups + restore
    pdf.ts       # PDF payload builder + HTML template (timesheet)
    pdfWindow.ts # Hidden BrowserWindow renderer (printToPDF pipeline)
    jsonExport.ts# Full JSON export (clients + entries + settings)
    logo.ts      # Logo file -> base64 data URL for PDF embedding
    updater.ts   # electron-updater bridge + IPC handlers (auto-update)
    csvExport.ts # CSV export builder
    migrations/  # Versioned schema migrations + runner (001..008)
  preload/
    index.ts     # Context Bridge (window.api)
    index.d.ts   # TypeScript types for renderer
  renderer/src/
    views/       # TimerView, TodayView, CalendarView, ClientsView, SettingsView
    components/  # Dialog, IdleModal, PdfExportModal, CalendarDrawer, EntryEditForm, Toast,
                 # ConfirmDialog, UpdateBanner, OnboardingWizard, AboutDialog, ExportModal
    contexts/    # I18nContext (DE/EN translations, useT hook)
    hooks/       # useTimer logic hook
    store/       # Zustand stores (timer, entries, toast, updateStore)
  shared/
    types.ts     # Shared TypeScript interfaces
    duration.ts  # Time-formatting helpers
    currency.ts  # Cent-based money + minute rounding (ceil)
    date.ts      # Local-day helpers
    dateRanges.ts# Quick-filter range calculation (DST-safe)
    midnightSplit.ts # Cross-midnight entry split logic
    rate.ts      # German decimal <-> integer cent parsing
    locales/     # de.ts + en.ts locale files (type-safe via TranslationKey)
scripts/
  generate-icons.mjs    # SVG -> tray PNGs (running/stopped, @1x/@2x)
  sync-icon.mjs         # resources/icon.png -> build/icon.png + multi-res .ico (prebuild hook)
  generate-licenses.mjs # Scans prod deps, writes resources/licenses.json (prebuild hook)
resources/
  licenses.json  # Generated license list (95 packages, updated on pnpm build)
templates/
```

## Data Storage

The SQLite database lives at `%AppData%\TimeTrack\timetrack.db`. Schema (as of v1.5, schema_version 8):

- `clients` — name, color, active flag, `rate_cent` (optional hourly rate)
- `entries` — client_id, description, started_at, stopped_at, heartbeat_at, `deleted_at` (soft-delete), `link_id` (cross-midnight pair UUID)
- `settings` — key/value store (incl. PDF template settings: logo path, sender, tax id, accent color, footer, round minutes)

On startup the app auto-stops any entries where the heartbeat is older than 5 minutes (crash recovery).

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- All database access runs in the main process only
- Renderer communicates exclusively via the typed Context Bridge (`window.api`)
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, branch naming, and PR guidelines.

## Privacy

All data stays local on your device. The only outbound call is the auto-update check against `api.github.com`. No telemetry, no analytics. See [PRIVACY.md](PRIVACY.md) for details.

## License

[MIT](LICENSE) © 2026 Robin Wald

The bundled third-party packages keep their own licenses; the full list is
generated by `scripts/generate-licenses.mjs` into `resources/licenses.json`
and shown in **Settings → About → Licenses**.
