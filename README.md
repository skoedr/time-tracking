# TimeTrack

A personal Windows desktop time-tracking app for freelancers. Lightweight Toggl alternative with a local SQLite database, always-on-top mini widget, and PDF Stundennachweis export.

## Features

- **Timer** — Start/stop with client selection and description. Crash-safe via heartbeat.
- **Kunden-Verwaltung** — Create, edit, archive, and delete clients with color coding.
- **Global Hotkey** — `Alt+Shift+S` (configurable) starts/stops the timer from anywhere.
- **Tray Icon + Quick-Start** — Right-click the tray to start a client timer without opening the window.
- **Idle-Detection** — When the system is idle past your threshold, the app asks whether to keep, stop, or mark as break.
- **Settings-View** — Language, auto-start, idle threshold, hotkey, and data paths in one place.
- **Auto-Backup** — Rolling 7-day SQLite backups under `%AppData%\TimeTrack\backups\`. Manual backup + restore from Settings.
- **DB Migrations** — Versioned schema with pre-migration backup, so updates never lose data.
- **Auto-Update Releases** — Pushing a `v*` tag builds the Windows installer and publishes a GitHub Release automatically.
- **Local SQLite** — All data stays on your machine under `%AppData%\TimeTrack\`.

### Coming soon

- Kalender-Modus (monthly overview) — see [v1.2 issues](https://github.com/skoedr/time-tracking/labels/v1.2)
- PDF Stundennachweis export — see [v1.3 issues](https://github.com/skoedr/time-tracking/labels/v1.3)
- Mini-Modus always-on-top widget — see [v1.4 issues](https://github.com/skoedr/time-tracking/labels/v1.4)
- Auto-Update + Onboarding — see [v1.5 issues](https://github.com/skoedr/time-tracking/labels/v1.5)

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
# 2. Tag and push
git tag v1.x.y
git push origin v1.x.y
# 3. The Release workflow does the rest. The release is created as a draft —
#    publish it from the GitHub UI (or `gh release edit vX.Y.Z --draft=false`).
```

## Project Structure

```
src/
  main/          # Electron main process
    index.ts     # App entry, tray (with Quick-Start), global hotkey
    db.ts        # SQLite open + WAL setup
    ipc.ts       # All IPC handlers (clients, entries, settings, shell, paths)
    idle.ts      # powerMonitor-based idle watcher
    backup.ts    # Daily/manual/pre-migration backups + restore
    migrations/  # Versioned schema migrations + runner
  preload/
    index.ts     # Context Bridge (window.api)
    index.d.ts   # TypeScript types for renderer
  renderer/src/
    views/       # React page components (incl. SettingsView)
    components/  # IdleModal etc.
    hooks/       # useTimer logic hook
    store/       # Zustand stores
  shared/
    types.ts     # Shared TypeScript interfaces
    duration.ts  # Time-formatting helpers
```

## Data Storage

The SQLite database lives at `%AppData%\TimeTrack\timetrack.db`. Schema:

- `clients` — name, color, active flag
- `entries` — client_id, description, started_at, stopped_at, heartbeat_at
- `settings` — key/value store

On startup the app auto-stops any entries where the heartbeat is older than 5 minutes (crash recovery).

## Security

- `contextIsolation: true`, `nodeIntegration: false`
- All database access runs in the main process only
- Renderer communicates exclusively via the typed Context Bridge (`window.api`)

## License

Private — not for distribution.
