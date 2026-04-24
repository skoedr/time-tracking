# TimeTrack — Design Document

**Datum:** 22. April 2026  
**Modus:** Builder (Eigenbedarf, ggf. später teilen)  
**Phase:** Design — kein Code noch

---

## Das Problem

Freelancer (ein Nutzer) möchte Projektzeiten tracken und daraus saubere
Stundennachweise für Kunden erzeugen. Toggl Track ist zu viel (Cloud-Account,
Subscription, Team-Features). Excel ist zu langsam. Es soll sich anfühlen wie
ein kleines, professionelles Windows-Tool das man einfach nebenbei laufen lässt.

---

## Vision

Ein zweiteiliges Windows-Tool:

1. **Mini-Modus** — Timer-Widget, immer im Vordergrund, ein Klick zum Starten.
2. **Kalender-Modus** — Monatsansicht, Einträge nachtragen, Stundennachweis exportieren.

Das primäre Artefakt: ein PDF-Stundennachweis, der wie "Seite 2" der eigenen Rechnung
aussieht.

---

## Prämissen (bestätigt)

| #   | Prämisse                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | Solo-Freelancer-Tool. Kein Team, keine Cloud, alles lokal.                                |
| 2   | Mini-Modus ist der tägliche Workflow. Kalender ist für Nachtragen & Monatsabschluss.      |
| 3   | Primäres Artefakt: PDF-Stundennachweis. Keine Rechnungsstellung, kein Buchhaltungsexport. |
| 4   | Electron + React als Basis. Outlook-Integration (Graph API) kommt in Phase 2.             |

---

## Tech-Stack

| Schicht        | Technologie                                   | Begründung                                                                        |
| -------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Shell          | **Electron**                                  | Native Windows-Fenster, System-Tray, kein Browser nötig                           |
| UI             | **React** + Tailwind CSS                      | Nutzer kennt Web-Stack, schnelle Iteration                                        |
| Datenbank      | **SQLite** (via `better-sqlite3`)             | Lokal, zero-config, kein Server                                                   |
| PDF            | **Electron `webContents.printToPDF()`**       | Nutzt Chromium das Electron bereits eingebaut hat — kein Puppeteer (+300MB) nötig |
| Build          | **electron-builder**                          | `.exe`-Installer für Windows, Auto-Update vorbereitet                             |
| Paket-Manager  | **npm** / **pnpm**                            | Standard für Electron-Projekte                                                    |
| IPC-Sicherheit | **Context Bridge** (`contextIsolation: true`) | HTML-Templates werden gerendert — nodeIntegration bleibt aus                      |
| Datenpfad      | **`app.getPath('userData')`**                 | `%AppData%\TimeTrack\` — Updates überschreiben Daten nie                          |

> **Warum nicht Tauri?** Rust-Lernkurve würde Phase 1 verlangsamen. Tauri bleibt
> Option für Phase 3, wenn Executable-Größe wichtig wird.

> **Warum nicht Web-App?** System-Tray, Always-on-top-Fenster und echter Windows-Feel
> sind für den Mini-Modus entscheidend. Eine Web-App kann das nicht.

---

## Feature-Scope

### Phase 1 — Das Kernprodukt

#### Mini-Modus (Timer-Widget)

- **Always-on-top**, kleines Fenster (~300×150px)
- **Start / Pause / Stop**-Buttons mit Tastenkürzel (`F5` / `F6`)
- **Globaler Hotkey** (`F5`/`F6`) — funktioniert auch wenn das Fenster im Hintergrund ist (`globalShortcut`)
- **Kunden-Dropdown** (schnell wechselbar)
- **Tätigkeitsbeschreibung** (Freitextfeld, Pflicht vor Stop)
- **Laufende Dauer** (HH:MM:SS, live)
- **Rundungsmodus**-Indikator (zeigt gerundete Zeit an)
- Klick auf Titel → wechselt zu Kalender-Modus
- **Tray-Icon:** Grün = Timer läuft, Grau = gestoppt (via `nativeImage` + Electron Tray API)

#### Kalender-Modus

- **Monatsansicht** (Kalender-Grid, ein Block pro Eintrag)
- **Farb-Kodierung** nach Kunde
- **Eintrag erstellen/bearbeiten/löschen** (manuell, für Nachträge)
- **Gesamtstunden pro Monat** je Kunde (Sidebar-Summary)
- **PDF exportieren**-Button (öffnet Export-Dialog)
- **Liste-Ansicht** alternativ zur Kalender-Ansicht

#### Kunden-Verwaltung

- Name, Farbe, Kurzbezeichnung (für den PDF-Header)
- Stundensatz (optional, für spätere Berechnungen)
- Archivieren (nicht löschen)

#### Einstellungen

- **Rundungsmodus:** 5 / 10 / 15 / 30 Minuten; Ceil / Floor / Round
- **Branding:** Logo (PNG/SVG), Firmenname, Adresse, USt-Nr. (für PDF-Footer)
- **Standard-Tätigkeiten:** vordefinierte Texte als Quickselect
- **Startverhalten:** Autostart mit Windows (optional)
- **Mini-Modus immer im Vordergrund:** An/Aus
- **Auto-Backup:** Konfigurierbarer Zielordner (z.B. OneDrive); SQLite-DB wird täglich kopiert

#### PDF-Export

- **Zeitraum** wählen (Monat-Picker oder benutzerdefiniert)
- **Kunde** wählen
- **HTML-Template** (anpassbar, liegt im App-Datenordner)
- **Standardlayout:**
  - Header: Logo links, Kunden-Info rechts, Zeitraum
  - Tabelle: Datum | Von | Bis | Tätigkeit | Dauer (gerundet)
  - Footer: Gesamtstunden, Unterschriftszeile, Seitenangabe
- PDF wird gespeichert und im Explorer geöffnet

---

### Phase 2 — Outlook-Integration

- **Microsoft Graph API** (OAuth2, einmalige Anmeldung)
- Office E1 Subscription wird unterstützt (delegated permissions: `Calendars.Read`)
- Kalender-Ereignisse importieren → einem Kunden + Tätigkeit zuordnen
- Duplikat-Erkennung (gleiches Ereignis nicht zweimal importieren)
- Sync-Button im Kalender-Modus

---

### Phase 3 — Nice-to-have (kein Commit)

- Tauri-Rewrite für kleinere Executable-Größe
- Dark Mode
- Multi-Monitor-Unterstützung für Mini-Modus
- CSV-Export (für Buchhaltung)
- Statistik-View (Stunden pro Woche/Monat über Zeit)

---

## Datenmodell

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

## UI-Skizzen

### Mini-Modus

```
┌─────────────────────────────┐
│ ▶ Kunde GmbH          00:47 │
│ [Implementierung Feature X  ]│
│ [▶ Start] [⏸] [⏹ Stop]      │
└─────────────────────────────┘
```

### Kalender-Modus (Header)

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

## App-Verzeichnisstruktur

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

## Schnellster Weg zu Phase 1 (Build Order)

1. **Electron-Boilerplate** aufsetzen (`electron-vite` + React + TypeScript, `contextIsolation: true`)
2. **Context Bridge** definieren (IPC-API zwischen Main + Renderer)
3. **SQLite** anbinden, Schema anlegen (`userData`-Pfad), Index setzen
4. **Mini-Modus** — Timer-Widget, Start/Stop, Client-Selector
   - Heartbeat-Schreiber (setInterval 30s → `heartbeat_at` in DB)
   - Crash-Recovery beim App-Start (offener Eintrag? → Auto-Stop)
5. **Globaler Hotkey** (`globalShortcut` F5/F6)
6. **Tray-Icon** — grün/grau, Tooltip mit aktueller Dauer
7. **Kunden-Verwaltung** (CRUD in Settings)
8. **Kalender-Modus** — Monatsansicht, Einträge anzeigen
9. **Manueller Eintrag** — Dialog für Nachträge
10. **Einstellungen** — Rundungsmodus, Branding, Auto-Backup-Pfad
11. **Auto-Backup** — täglich SQLite-Datei in Backup-Ordner kopieren
12. **PDF-Export** — HTML-Template + `webContents.printToPDF()`
13. **Installer** — electron-builder `.exe`
14. **Phase 2:** Outlook-Integration (Graph API)

---

## Offene Entscheidungen

| Frage               | Empfehlung                                                | Alternative          |
| ------------------- | --------------------------------------------------------- | -------------------- |
| State-Management    | Zustand (minimal, kein Redux-Overhead)                    | Jotai                |
| Datumslib           | `date-fns` (tree-shakeable)                               | `dayjs`              |
| Kalender-Komponente | Eigenbau (simpler Grid)                                   | `react-big-calendar` |
| PDF-Preview         | Browser-Vorschau-Fenster (BrowserWindow mit `printToPDF`) | direkt speichern     |
| Update-Mechanismus  | electron-updater (GitHub Releases)                        | manuell              |

## Architektur-Entscheidungen (aus Reviews)

| Entscheidung   | Gewählt                    | Begründung                                                    |
| -------------- | -------------------------- | ------------------------------------------------------------- |
| IPC-Sicherheit | Context Bridge             | HTML-Templates werden gerendert, nodeIntegration aus          |
| PDF-Engine     | `webContents.printToPDF()` | Electron hat Chromium bereits — kein Puppeteer                |
| Datenpfad      | `app.getPath('userData')`  | Updates-sicher, kein Datenverlust                             |
| Crash-Recovery | Heartbeat + Auto-Stop      | `heartbeat_at` alle 30s, beim Start offene Einträge schließen |

## Pflicht-Tests (aus Eng-Review)

| Test                                             | Typ         | Priorität |
| ------------------------------------------------ | ----------- | --------- |
| Rundungsmodus (alle 3 Modi × alle Intervalle)    | Unit        | P1        |
| Crash-Recovery: App-Start mit offenem Eintrag    | Integration | P1        |
| PDF-Export: korrekter Zeitraum, korrekte Stunden | Integration | P1        |
| Auto-Backup: Zielordner nicht existent           | Unit        | P2        |
| Zombie-Erkennung: heartbeat > 5 min alt          | Unit        | P1        |

---

## Deferred (nach erstem Release)

- Quick-Start via Tray-Kontextmenü (Start letzter Kunde, Stop)
- Monats-Statistik (Balken-Chart Stunden pro Kunde)

---

## Was wir bewusst NICHT bauen (Phase 1)

- Kein Cloud-Sync, kein Account, kein Login
- Keine Rechnungsstellung
- Keine Teamfunktionen
- Kein Mobile-Client
- Keine Zeiterfassung per Screenshot/Activity-Tracking (kein Spy-Tool)

---

_Design-Status: REVIEWED — CEO + Eng Review abgeschlossen. Bereit zum Bauen._

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
