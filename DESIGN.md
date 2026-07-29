# TimeTrack — Design Document

**Date:** 22 April 2026 (design system updated: 27 April 2026)  
**Mode:** Builder (personal use, possibly shared later)  
**Phase:** v1.8 — Glass Design System implemented  
**Reference:** `design/issue-76-glass-reference.html`

---

## Design System (v1.8 Glass)

### Typography

| Role            | Font                         | Usage                           |
| --------------- | ---------------------------- | ------------------------------- |
| UI text         | **Inter** (300–700)          | All labels, buttons, body text  |
| Numbers / times | **JetBrains Mono** (400–700) | Timer, durations, hotkeys, paths |

Both fonts via Google Fonts: `Inter` + `JetBrains Mono`. `font-variant-numeric: tabular-nums` + `letter-spacing: 1` on all timer displays.

---

### Color tokens (Dark / Light)

All colors as CSS Custom Properties in `src/renderer/src/assets/base.css`:

| Token           | Dark                                        | Light                                       | Usage                                 |
| --------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| `--page-bg`     | `linear-gradient(145deg, #0d0f1e, #080c1a)` | `linear-gradient(145deg, #dde4f8, #e8edfb)` | Body background                       |
| `--card-bg`     | `rgba(255,255,255,0.045)`                   | `rgba(255,255,255,0.70)`                    | Glass cards                           |
| `--card-hover`  | `rgba(255,255,255,0.07)`                    | `rgba(255,255,255,0.88)`                    | Card hover state                      |
| `--nav-bg`      | `rgba(10,12,28,0.80)`                       | `rgba(255,255,255,0.75)`                    | Nav + drawer backgrounds              |
| `--card-border` | `rgba(255,255,255,0.08)`                    | `rgba(0,0,0,0.07)`                          | All edges                             |
| `--input-bg`    | `rgba(0,0,0,0.30)`                          | `rgba(255,255,255,0.90)`                    | Inputs, selects, textareas            |
| `--text`        | `#e8eaf6`                                   | `#1a1c2e`                                   | Primary text                          |
| `--text2`       | `#8b93bc`                                   | `#5b6080`                                   | Secondary text, labels                |
| `--text3`       | `#4a5270`                                   | `#9098b8`                                   | Hint text, metadata                   |
| `--accent`      | `#8b7cf8`                                   | `#5b4ef0`                                   | Primary action color (indigo-violet)  |
| `--accent-bg`   | `rgba(139,124,248,0.12)`                    | `rgba(91,78,240,0.08)`                      | Subtle accent surfaces                |
| `--accent-glow` | `rgba(139,124,248,0.25)`                    | `rgba(91,78,240,0.18)`                      | Box-shadow on primary buttons         |
| `--green`       | `#4ade80`                                   | `#16a34a`                                   | Running timer, success                |
| `--green-bg`    | `rgba(74,222,128,0.10)`                     | `rgba(22,163,74,0.07)`                      | ActiveTimerPill background            |
| `--danger`      | `#f87171`                                   | `#dc2626`                                   | Delete, stop button                   |
| `--danger-bg`   | `rgba(248,113,113,0.10)`                    | `rgba(220,38,38,0.07)`                      | Danger-button hover surface           |
| `--shadow`      | `0 8px 32px rgba(0,0,0,0.50)`               | `0 8px 32px rgba(100,120,200,0.12)`         | Card shadow                           |
| `--blur`        | `blur(20px)`                                | `blur(20px)`                                | `backdrop-filter` on glass elements   |

---

### Component pattern

#### Glass Card

```css
background: var(--card-bg);
backdrop-filter: blur(20px);
border: 1px solid var(--card-border);
border-radius: 14px;
box-shadow: var(--shadow);
```

#### Glass Input / Select

```css
background: var(--input-bg);
border: 1px solid var(--card-border);
border-radius: 10px;
color: var(--text);
padding: 10px 14px;
font-family: Inter, sans-serif;
font-size: 13px;
```

#### Primary button (Accent)

```css
background: var(--accent);
color: #fff;
border-radius: 12px; /* oder 24px für Pill */
box-shadow: 0 8px 32px var(--accent-glow);
font-weight: 700;
```

#### Pill button (Outline / active)

```css
/* Inaktiv */
border: 1px solid var(--card-border);
background: var(--card-bg);
border-radius: 24px;
color: var(--text2);

/* Aktiv */
border-color: var(--accent);
background: var(--accent);
color: #fff;
```

#### Icon button (30×30)

```css
width: 30px;
height: 30px;
border-radius: 8px;
border: 1px solid transparent; /* hover: var(--card-border) */
background: transparent; /* hover: var(--accent-bg) oder var(--danger-bg) */
color: var(--text3); /* hover: var(--accent) oder var(--danger) */
```

#### Toggle (boolean setting)

```css
/* Wrapper */
width: 40px;
height: 22px;
border-radius: 11px;
background: var(--accent); /* an: accent, aus: card-bg */
border: 1px solid var(--accent);
box-shadow: 0 0 12px var(--accent-glow); /* nur wenn an */

/* Thumb */
width: 16px;
height: 16px;
border-radius: 50%;
background: #fff;
left: 20px (an) / 2px (aus); /* transition: left .2s */
```

#### Segmented Control (single-pick)

```css
/* Wrapper */
border: 1px solid var(--card-border);
border-radius: 8px; /* oder 24px */
display: flex;
gap: 4px;

/* Button aktiv */
background: var(--accent-bg);
border: 1px solid var(--accent);
color: var(--accent);

/* Button inaktiv */
background: var(--card-bg);
border: 1px solid var(--card-border);
color: var(--text2);
```

---

### Navigation

```
[Logo-Mark] [Heute] [Timer] [Kalender] [Kunden] [Einstellungen]   →→   [● Kunde 01:23:47] [☾]
```

- Nav background: `var(--nav-bg)` + `backdrop-filter: blur(20px)` + `border-bottom: 1px solid var(--card-border)`
- Active tab: `background: var(--accent)`, `color: #fff`, `border-radius: 24px` (pill)
- Inactive tab: `color: var(--text2)`, no background, `hover: rgba(255,255,255,0.10)`
- **Running timer in the nav:** pill with `var(--green-bg)` + `var(--green)` color + pulsing dot + `JetBrains Mono` time
- Theme toggle: icon button (☾ / ☀) on the far right

---

### Ambient blobs (background glow)

Two `position: fixed`, `pointer-events: none`, `z-index: 0` divs:

- Top-right: `var(--accent-bg)`, `filter: blur(80px)`, `400×400px`, `border-radius: 50%`
- Bottom-left: `var(--green-bg)`, `filter: blur(80px)`, `300×300px`, `border-radius: 50%`

---

### Settings view

Each section: `Section` = heading (11px, uppercase, `--text3`) + `GlassCard` below.  
Each row: `Row` = label on the left (`--text`, 13px, 500) + optional hint (`--text3`, 11px) + control on the right.

| Setting type                     | Control                                           |
| -------------------------------- | ------------------------------------------------- |
| Boolean (on/off)                 | **Toggle** (see above)                            |
| Single-pick from a few options   | **Segmented Control** (`border-radius: 8px`)      |
| Text input                       | **Glass Input** inline display                    |
| File picker                      | Small `border` button "Datei auswählen…"          |
| Info/path                        | `JetBrains Mono`, `--text3`, `overflow: ellipsis` |

---

### Icons (inline SVG, no icon package)

All icons as inline SVG, `stroke="currentColor"`, `strokeWidth="1.6"`, `strokeLinecap="round"`:

| Name                      | Usage                                       |
| ------------------------- | ------------------------------------------- |
| Edit (pencil)             | Edit entry / client                         |
| Trash (bin)               | Delete (danger color)                       |
| Archive / Unarchive (box) | Archive / reactivate client                 |
| Plus (cross)              | New entry / new client                      |
| ChevLeft / ChevRight      | Calendar navigation                         |
| ChevDown                  | Select arrow                                |
| Play (filled)             | Timer start                                 |
| Stop (square, filled)     | Timer stop                                  |
| Clock                     | Logo mark in nav                            |
| File                      | PDF / export                                |
| X                         | Close modal                                 |
| Check                     | Confirmation                                |
| Sun / Moon                | Theme toggle                                |
| Dot (8px circle)          | Client color, pulsing on the active timer   |

---

### Content layout

- Maximum content width: `max-w-3xl` (approx. 740px) with `margin: 0 auto`
- Settings view: max `580px`
- Clients view: max `600px`
- Timer view: centered (`align-items: center`, `justify-content: center`) with a large clock
- Padding: `22px 28px` in the main content area

---

### Animations

```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.85);
  }
}
@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
```

- Views on mount: `animation: fadeIn .2s ease`
- Running timer dot: `animation: pulse-dot 2s infinite`
- Drawer (CalendarDrawer): `animation: slideIn .2s ease`
- All interactive elements: `transition: all .15s` (hover states)

---

### Scrollbar

```css
::-webkit-scrollbar {
  width: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}
```

---

## The problem

A freelancer (single user) wants to track project time and produce clean
timesheets for clients from it. Toggl Track is too much (cloud account,
subscription, team features). Excel is too slow. It should feel like
a small, professional Windows tool that you simply let run on the side.

---

## Vision

A two-part Windows tool:

1. **Mini mode** — timer widget, always in front, one click to start.
2. **Calendar mode** — month view, add entries after the fact, export a timesheet.

The primary artifact: a PDF timesheet that looks like "page 2" of your own invoice.

---

## Premises (confirmed)

| #   | Premise                                                                                   |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | Solo-freelancer tool. No team, no cloud, everything local.                                |
| 2   | Mini mode is the daily workflow. Calendar is for adding entries & month-end close.        |
| 3   | Primary artifact: PDF timesheet. No invoicing, no accounting export.                      |
| 4   | Electron + React as the base. Outlook integration (Graph API) comes in phase 2.           |

---

## Tech stack

| Layer          | Technology                                    | Rationale                                                                          |
| -------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Shell          | **Electron**                                  | Native Windows window, system tray, no browser needed                             |
| UI             | **React** + Tailwind CSS                      | User knows the web stack, fast iteration                                          |
| Database       | **SQLite** (via `better-sqlite3`)             | Local, zero-config, no server                                                     |
| PDF            | **Electron `webContents.printToPDF()`**       | Uses the Chromium that Electron already ships — no Puppeteer (+300MB) needed      |
| Build          | **electron-builder**                          | `.exe` installer for Windows, auto-update prepared                                |
| Package manager | **npm** / **pnpm**                           | Standard for Electron projects                                                    |
| IPC security   | **Context Bridge** (`contextIsolation: true`) | HTML templates are rendered — nodeIntegration stays off                           |
| Data path      | **`app.getPath('userData')`**                 | `%AppData%\TimeTrack\` — updates never overwrite data                             |

> **Why not Tauri?** The Rust learning curve would slow down phase 1. Tauri stays
> an option for phase 3, when executable size becomes important.

> **Why not a web app?** System tray, always-on-top window, and a real Windows feel
> are decisive for mini mode. A web app cannot do that.

---

## Feature scope

### Phase 1 — the core product

#### Mini mode (timer widget)

- **Always-on-top**, small window (~300×150px)
- **Start / Pause / Stop** buttons with keyboard shortcut (`F5` / `F6`)
- **Global hotkey** (`F5`/`F6`) — works even when the window is in the background (`globalShortcut`)
- **Client dropdown** (quickly switchable)
- **Activity description** (free-text field, required before stop)
- **Running duration** (HH:MM:SS, live)
- **Rounding-mode** indicator (shows the rounded time)
- Click on the title → switches to calendar mode
- **Tray icon:** green = timer running, gray = stopped (via `nativeImage` + Electron Tray API)

#### Calendar mode

- **Month view** (calendar grid, one block per entry)
- **Color coding** by client
- **Create/edit/delete entry** (manual, for retroactive entries)
- **Total hours per month** by client (sidebar summary)
- **Export PDF** button (opens the export dialog)
- **List view** as an alternative to the calendar view

#### Client management

- Name, color, short label (for the PDF header)
- Hourly rate (optional, for later calculations)
- Archive (not delete)

#### Settings

- **Rounding mode:** 5 / 10 / 15 / 30 minutes; ceil / floor / round
- **Branding:** logo (PNG/SVG), company name, address, VAT no. (for the PDF footer)
- **Default activities:** predefined texts as quick-select
- **Startup behavior:** autostart with Windows (optional)
- **Mini mode always in front:** on/off
- **Auto-backup:** configurable target folder (e.g. OneDrive); the SQLite DB is copied daily

#### PDF export

- Choose the **time range** (month picker or custom)
- Choose the **client**
- **HTML template** (customizable, lives in the app data folder)
- **Default layout:**
  - Header: logo on the left, client info on the right, time range
  - Table: date | from | to | activity | duration (rounded)
  - Footer: total hours, signature line, page number
- The PDF is saved and opened in Explorer

---

### Phase 2 — Outlook integration

- **Microsoft Graph API** (OAuth2, one-time sign-in)
- Office E1 subscription is supported (delegated permissions: `Calendars.Read`)
- Import calendar events → map to a client + activity
- Duplicate detection (do not import the same event twice)
- Sync button in calendar mode

---

### Phase 3 — nice-to-have (no commitment)

- Tauri rewrite for a smaller executable size
- ~~Dark mode~~ **✅ implemented in v1.8**
- Multi-monitor support for mini mode
- CSV export (for accounting)
- Statistics view (hours per week/month over time)

---

## Data model

```sql
-- Kunden
CREATE TABLE clients (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  short     TEXT,           -- Kurzname für PDF-Header
  color     TEXT,           -- Hex-Farbe
  rate      REAL,           -- Stundensatz (optional)
  archived  INTEGER DEFAULT 0,
  created   TEXT
);

-- Zeiteinträge
CREATE TABLE entries (
  id              INTEGER PRIMARY KEY,
  client_id       INTEGER REFERENCES clients(id),
  started_at      TEXT NOT NULL,  -- ISO 8601
  stopped_at      TEXT,           -- NULL = läuft noch (Zombie-Check beim Start!)
  heartbeat_at    TEXT,           -- Alle 30s aktualisiert → Crash-Recovery
  description     TEXT,
  duration_s      INTEGER,        -- berechnete Dauer in Sekunden
  rounded_s       INTEGER,        -- gerundete Dauer (nach Rundungsmodus)
  source          TEXT DEFAULT 'manual',  -- 'manual' | 'outlook'
  outlook_id      TEXT,           -- Graph-Event-ID (für Duplikat-Check)
  created         TEXT
);

-- Index für Monatsabfragen (schnell bei vielen Einträgen)
CREATE INDEX idx_entries_client_started ON entries(client_id, started_at);

-- Einstellungen (Key-Value)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

---

## UI sketches

### Mini mode

```
┌─────────────────────────────┐
│ ▶ Kunde GmbH          00:47 │
│ [Implementierung Feature X  ]│
│ [▶ Start] [⏸] [⏹ Stop]      │
└─────────────────────────────┘
```

### Calendar mode (header)

```
┌──────────────────────────────────────────────────┐
│ ← April 2026 →          [+ Eintrag] [📄 Export]  │
│                                    Summe: 87,5 h │
├────────────────────────────────────────────────  │
│  Mo  Di  Mi  Do  Fr  Sa  So                      │
│  [█ Kunde A, 3h] [  ] [█ Kunde B, 2h] ...        │
└──────────────────────────────────────────────────┘
```

---

## App directory structure

```
time-tracking/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # App init, IPC handler, Tray
│   │   ├── db.ts          # SQLite setup & queries
│   │   ├── pdf.ts         # Puppeteer PDF-Erzeugung
│   │   └── updater.ts     # (Phase 2) Auto-Update
│   ├── renderer/          # React App
│   │   ├── App.tsx
│   │   ├── views/
│   │   │   ├── MiniTimer.tsx
│   │   │   ├── Calendar.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Clients.tsx
│   │   ├── components/    # Wiederverwendbare UI-Teile
│   │   └── store/         # Zustand (Zustand.js o.ä.)
│   └── shared/            # Typen, Konstanten
├── templates/
│   └── report.html        # Bearbeitbares PDF-Template
├── DESIGN.md
└── package.json
```

---

## Fastest path to phase 1 (build order)

1. Set up **Electron boilerplate** (`electron-vite` + React + TypeScript, `contextIsolation: true`)
2. Define the **Context Bridge** (IPC API between main + renderer)
3. Wire up **SQLite**, create the schema (`userData` path), set the index
4. **Mini mode** — timer widget, start/stop, client selector
   - Heartbeat writer (setInterval 30s → `heartbeat_at` in the DB)
   - Crash recovery on app start (open entry? → auto-stop)
5. **Global hotkey** (`globalShortcut` F5/F6)
6. **Tray icon** — green/gray, tooltip with the current duration
7. **Client management** (CRUD in Settings)
8. **Calendar mode** — month view, show entries
9. **Manual entry** — dialog for retroactive entries
10. **Settings** — rounding mode, branding, auto-backup path
11. **Auto-backup** — copy the SQLite file to the backup folder daily
12. **PDF export** — HTML template + `webContents.printToPDF()`
13. **Installer** — electron-builder `.exe`
14. **Phase 2:** Outlook integration (Graph API)

---

## Open decisions

| Question            | Recommendation                                            | Alternative          |
| ------------------- | --------------------------------------------------------- | -------------------- |
| State management    | Zustand (minimal, no Redux overhead)                      | Jotai                |
| Date library        | `date-fns` (tree-shakeable)                               | `dayjs`              |
| Calendar component  | Custom-built (simple grid)                                | `react-big-calendar` |
| PDF preview         | Browser preview window (BrowserWindow with `printToPDF`)  | save directly        |
| Update mechanism    | electron-updater (GitHub Releases)                        | manual               |

## Architecture decisions (from reviews)

| Decision       | Chosen                     | Rationale                                                     |
| -------------- | -------------------------- | ------------------------------------------------------------- |
| IPC security   | Context Bridge             | HTML templates are rendered, nodeIntegration off              |
| PDF engine     | `webContents.printToPDF()` | Electron already has Chromium — no Puppeteer                  |
| Data path      | `app.getPath('userData')`  | Update-safe, no data loss                                     |
| Crash recovery | Heartbeat + auto-stop      | `heartbeat_at` every 30s, close open entries on start         |

## Mandatory tests (from eng review)

| Test                                             | Type        | Priority  |
| ------------------------------------------------ | ----------- | --------- |
| Rounding mode (all 3 modes × all intervals)      | Unit        | P1        |
| Crash recovery: app start with an open entry     | Integration | P1        |
| PDF export: correct time range, correct hours    | Integration | P1        |
| Auto-backup: target folder does not exist        | Unit        | P2        |
| Zombie detection: heartbeat > 5 min old          | Unit        | P1        |

---

## Deferred (after the first release)

- Quick-start via tray context menu (start last client, stop)
- Monthly statistics (bar chart of hours per client)

---

## What we deliberately do NOT build (phase 1)

- No cloud sync, no account, no login
- No invoicing
- No team features
- No mobile client
- No time tracking via screenshot/activity tracking (no spy tool)

---

_Design status: REVIEWED — CEO + eng review completed. Glass Design System v1.8 implemented (issue #76)._

**Reviews:** /office-hours ✓ | /plan-ceo-review ✓ (SELECTIVE EXPANSION) | /plan-eng-review ✓

---

## v1.2 Visual Tokens (stub)

Minimal token sheet introduced with v1.2 (#26 Calendar, #30 Today, #28 Edit/Delete).
Full state-matrix and component catalogue follow in v1.3.

### Color tokens

**Surfaces (Tailwind slate scale)**

- `slate-900` `#0f172a` — page background
- `slate-800` `#1e293b` — card background
- `slate-700` `#334155` — raised surface, drawer body
- `slate-600` `#475569` — focused/expanded row
- `slate-400` `#94a3b8` — secondary text
- `slate-300` `#cbd5e1` — body text
- `slate-100` `#f1f5f9` — primary text / numerics

**Accent**

- `indigo-500` `#6366f1` — primary action, today-highlight border, active links
- `indigo-400` `#818cf8` — hover

**Semantic**

- `emerald-500` `#10b981` — success / save flash
- `amber-500` `#f59e0b` — warning (cross-midnight banner)
- `red-500` `#ef4444` — destructive / delete confirm

**Client palette (10 presets, locked in v1.1)**
`#6366f1` `#8b5cf6` `#ec4899` `#f59e0b` `#10b981`
`#3b82f6` `#ef4444` `#f97316` `#14b8a6` `#84cc16`

### Typography scale

- Display (timer numerics): 56px / 64px (mono, e.g. `font-mono text-7xl`)
- h1: 24px / 32px, semibold
- h2: 20px / 28px, semibold
- body: 14px / 20px, regular
- small: 12px / 16px, regular (KW column, tagessumme)

### Spacing tokens

4 / 8 / 12 / 16 / 24 / 32 px (`gap-1 / gap-2 / gap-3 / gap-4 / gap-6 / gap-8`).

### Calendar mini-bars (locked v1.2)

- Bar height: **3 px**, gap **2 px**
- Max **5 visible** per cell; overflow as clickable `+N` (opens Drawer)
- Bar color = `client.color`; running entry has 1px white border

### Drawer (locked v1.2)

- Position: `fixed right-0 top-0 w-96 h-screen`
- Sticky header (date + total, close X)
- Sticky footer ("+ Eintrag für [Date] hinzufügen")
- Inline-edit row expands to ~200 px max with `scrollIntoView({block:'center'})`

### Known limitations (deferred)

| #   | Limitation                                                                  | Defer-to  | Reason                                                       |
| --- | --------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| L1  | Tray-tooltip is German-only (ignores `settings.language`)                   | v1.4      | Full i18n pass scoped together                               |
| L2  | Client color palette not colorblind-safe (Indigo/Violet, Blue/Teal cluster) | v1.4      | Palette change requires migration of saved per-client colors |
| L3  | No mobile/tablet layout (<1024 px); Calendar grid breaks below that width   | v1.4      | App is Windows-desktop-first; web build not on roadmap       |
| L4  | No light mode                                                               | post-v1.5 | Single user, dark-only tested                                |
| L5  | Cross-midnight entries blocked (warning banner shown in EntryEditForm)      | v1.3      | Needs entry-splitting logic + PDF impact                     |
| L6  | Full ARIA / screen-reader pass                                              | v1.3      | Keyboard nav for Calendar already in v1.2                    |
