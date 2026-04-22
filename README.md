# TimeTrack

A personal Windows desktop time-tracking app for freelancers. Lightweight Toggl alternative with a local SQLite database, always-on-top mini widget, and PDF Stundennachweis export.

## Features

- **Timer** — Start/stop with client selection and description. Crash-safe via heartbeat.
- **Kunden-Verwaltung** — Create, edit, archive, and delete clients with color coding.
- **Global Hotkey** — `Alt+Shift+S` starts/stops the timer from anywhere.
- **Tray Icon** — Live status in the system tray. Minimize-to-tray on close.
- **Local SQLite** — All data stays on your machine under `%AppData%\TimeTrack\`.

### Coming soon

- Kalender-Modus (monthly overview)
- PDF Stundennachweis export
- Mini-Modus always-on-top widget
- electron-builder Windows installer

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

# Build Windows installer
pnpm build:win
```

## Project Structure

```
src/
  main/          # Electron main process
    index.ts     # App entry, tray, global hotkey
    db.ts        # SQLite schema + crash recovery
    ipc.ts       # All IPC handlers
  preload/
    index.ts     # Context Bridge (window.api)
    index.d.ts   # TypeScript types for renderer
  renderer/src/
    views/       # React page components
    hooks/       # useTimer logic hook
    store/       # Zustand stores
  shared/
    types.ts     # Shared TypeScript interfaces
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
