# v1.5 — Trust at Scale & Data Portability

> Theme: Du kannst die App einem zweiten Freelancer ohne Anleitung geben — und
> wenn etwas schiefläuft, kommst du an die Logs. Updates kommen automatisch.

**Branch-Strategie:** 6 PRs in dieser Reihenfolge. Crash-Logging zuerst, weil jede
spätere PR davon profitiert (Auto-Update-Bugs, CSV-Edge-Cases). Auto-Update
zweitens, weil v1.5.0 selbst noch manuell installiert werden muss — ab v1.5.1
läuft's automatisch. i18n-Foundation kommt vor Onboarding, weil der Wizard gleich
mit echten `t()`-Strings gebaut wird.

| PR | Branch | Issues | Risiko | Größe | Status |
|----|--------|--------|--------|-------|--------|
| A | `feat/v1.5-crash-logging` | #34 | niedrig | S (electron-log + Renderer-Spy + 1 Settings-Button) | ⏳ |
| B | `feat/v1.5-auto-update` | #33 | hoch | M (electron-updater + Banner-UI + Builder-Config) | ⏳ |
| C | `feat/v1.5-csv-export` | #18 | mittel | M (Export-Format + Modal-Erweiterung + Tests) | ⏳ |
| D | `feat/v1.5-i18n-foundation` | (neu) | niedrig | M (i18n-Infrastruktur + DE-Locale + erste Views migrieren) | ⏳ |
| E | `feat/v1.5-onboarding` | #32 | niedrig | S (3-Schritte-Modal mit echtem Sprach-Switch) | ⏳ |
| F | `feat/v1.5-licenses` | #35 | sehr niedrig | XS (About-Dialog + license-Bundle) | ⏳ |

**Verschoben / gestrichen (NICHT in v1.5):**
- ❌ #23 (Pomodoro) — **gestrichen.** Maintainer nutzt es selbst nicht; Daily-Trust
  liefert Mini-Widget + Quicknote bereits. Issue wird mit `wontfix` geschlossen.
- 🚫 Code-Signing — bewusst nicht. SmartScreen-Warnung bleibt; bricht keine
  Funktion. Ggf. v1.6 wenn echte externe User da sind.

**Ship-Kriterium v1.5:** Du kannst v1.5.0 jemandem geben, der noch nie das Tool
gesehen hat, und ohne Rückfrage kommt er ans erste sinnvolle Tracking. Wenn er
crasht, schickt er dir die Log-Datei. Wenn du v1.5.1 raushaust, kriegt er sie
automatisch.

---

## PR A — Crash-Logging (#34)

**Why first:** Ist das Sicherheitsnetz für alles, was danach kommt. Auto-Update
ist heikel, CSV-Export hat Edge-Cases bei Tags+Kommas — wenn irgendwas
schiefläuft, willst du Logs haben, nicht Telemetrie raten.

### Scope

#### A.1 electron-log integrieren

- `pnpm add electron-log`
- In `src/main/index.ts` (ganz oben, vor allen anderen Imports die loggen könnten):
  ```ts
  import log from 'electron-log/main'
  log.initialize({ preload: true, spyRendererConsole: true })  // spielt Renderer-Logs in dieselbe Datei
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 5 * 1024 * 1024  // 5 MB
  Object.assign(console, log.functions)
  ```
- `console.error`, `console.warn`, `console.info` werden ab da automatisch
  in die Datei geschrieben (zusätzlich zur DevTools-Konsole).
- **Renderer-seitig:** `electron-log/renderer` ein-mal in `main.tsx` initialisieren
  (`import 'electron-log/renderer'`), damit Renderer-Console via IPC → Main-Logger
  routet. Spart eigene IPC-Channels.

#### A.2 Globale Error-Handler

- `process.on('uncaughtException', ...)` und `process.on('unhandledRejection', ...)`
  loggen mit `log.error`.
- In jedem `try/catch`-Block in `ipc.ts`/`backup.ts`/`pdf.ts` der bisher
  `console.error` macht: bleibt unverändert (wird automatisch geroutet).

#### A.3 Settings-Button "Letztes Log öffnen"

- In `SettingsView.tsx` neuer Abschnitt "Diagnose":
  - Button **"Log-Datei im Explorer zeigen"** → IPC `app:revealLogFile`
  - Button **"Log-Verzeichnis öffnen"** → IPC `app:openLogDir`
  - Hint-Text: "Bei Problemen: Log-Datei kopieren und beim Bug-Report anhängen."
- IPC: `shell.showItemInFolder(log.transports.file.getFile().path)`.

#### A.4 Smoke-Test

- Unit-Test (mockable): `console.error('test')` → File enthält Eintrag.
- Manueller Test: App starten, in Settings auf "Log öffnen" klicken, sehen dass
  `main.log` in `%AppData%\TimeTrack\logs\` existiert.

### Acceptance

- [ ] `electron-log` als dependency installiert
- [ ] Log-Datei wird unter `%AppData%\TimeTrack\logs\main.log` geschrieben
- [ ] Größenlimit 5 MB, ältere Datei wird rotiert (`.old`)
- [ ] Settings-Diagnose-Sektion zeigt 2 Buttons; beide öffnen den richtigen Pfad
- [ ] `uncaughtException` und `unhandledRejection` landen im Log
- [ ] Renderer-`console.error` landet ebenfalls im Log (electron-log kann das via
      `log.transports.ipc`)
- [ ] Bestehende Tests bleiben grün

### Risk & Rollback

- electron-log greift in `console`-Methoden ein. Wenn das interferiert, lässt
  sich `Object.assign(console, log.functions)` entfernen — Logs gehen weiter,
  nur kein Mirror.
- Rollback = PR revert; keine DB-Migration.

### Out of scope

- Crash-Reports automatisch hochladen (Sentry/Crashpad) — bewusst nein
  (Datensparsamkeit, Single-User-Tool).
- Strukturierte JSON-Logs — Plain-Text reicht für Copy/Paste in GitHub-Issues.

### Files

- `package.json` (neue dep)
- `src/main/index.ts` (log init + global handlers)
- `src/main/ipc.ts` (2 neue IPC-Channels: `app:revealLogFile`, `app:openLogDir`)
- `src/preload/index.ts` (api expose)
- `src/preload/index.d.ts` (typings)
- `src/renderer/src/views/SettingsView.tsx` (Diagnose-Sektion)
- `src/main/log.test.ts` (neu) — basic init-Test

### Schätzung

S — 1 Session.

---

## PR B — Auto-Update (#33)

**Why second:** v1.5.0 selbst muss manuell installiert werden (kein Updater im
v1.4.x). Ab v1.5.1 läuft's automatisch. Das ist der Punkt, ab dem du
Bug-Fixes ausliefern kannst, ohne den User zu nerven.

### Scope

#### B.1 electron-updater integrieren

- `pnpm add electron-updater`
- **`electron-builder.yml` ergänzen:** Aktuell fehlt der `publish`-Block. Hinzufügen:
  ```yaml
  publish:
    provider: github
    owner: skoedr
    repo: time-tracking
  ```
  Sonst schreibt der Builder kein passendes `latest.yml`.
- In `src/main/index.ts` (nach App-Ready, nicht im Dev-Mode):
  ```ts
  import { autoUpdater } from 'electron-updater'
  autoUpdater.logger = log  // aus PR A
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Update-Check fehlgeschlagen (ggf. offline):', err.message)
      // KEIN Banner zeigen — stiller Fehler bei Offline-Start
    })
  }
  ```
- `latest.yml` wird im Release schon hochgeladen (siehe `release.yml` Zeile ~98).

#### B.2 Update-UI (Banner + Modal)

- Neuer Renderer-Store `updateStore.ts`: `{ status: 'idle'|'checking'|'available'|'downloading'|'ready'|'error', version?: string, progress?: number, error?: string }`.
- IPC: Main pusht `update:status`-Events an Renderer.
- Komponente `UpdateBanner.tsx`:
  - `available`: "Version {x} verfügbar — wird heruntergeladen…" (passiv, indigo-50)
  - `downloading`: Progress-% in Banner (passiv, indigo-50)
  - `ready`: "Version {x} bereit” — [Jetzt neu starten]" (Button → `autoUpdater.quitAndInstall()`, indigo-100)
  - `error`: dezenter, nicht-aggressiver Banner (zinc/amber, **nicht rot**) mit "Mehr erfahren" → Settingsöffnen
  - `idle` → Banner kollabiert komplett, kein Platzhalter
- Banner sitzt oben in `App.tsx`, kollabiert wenn `status === 'idle'`.

#### B.3 Settings: Update-Sektion

- In `SettingsView.tsx`:
  - Aktuelle Version anzeigen (`app.getVersion()`)
  - Button "Jetzt nach Updates suchen" → `autoUpdater.checkForUpdates()`
  - Letzter Check-Timestamp
  - Letzter Fehler (falls vorhanden) — voller Text für Debugging

#### B.4 Test-Strategie (kritisch!)

- **Lokaler Smoke-Test:** Kleines Helper-Script `scripts/test-updater.mjs`
  startet einen lokalen HTTP-Server, der `latest.yml` + Fake-Installer hostet.
  `dev-app-update.yml` (in `build/` abgelegt, **nicht** im Repo-Root —
  electron-updater sucht dort) zeigt darauf. Manuelle Verifikation:
  Banner erscheint, Quit-and-Install funktioniert.
- **Echter Test = nur in Production möglich:** Self-Dogfood reicht. v1.5.0
  manuell installieren → späterer Hotfix v1.5.1 ist die echte Update-Probe.
  Wenn's bricht, ist die Doku-User-Story = neueste `.exe` von GitHub Releases ziehen.
- Unit-Tests: nur die Status-Reducer-Logik (status transitions), nicht
  electron-updater selbst.

### Acceptance

- [ ] `electron-updater` als dependency
- [ ] `electron-builder.yml` hat `publish: github` mit owner/repo gesetzt
- [ ] Beim App-Start (Production) wird `checkForUpdatesAndNotify()` aufgerufen
- [ ] Offline-Start = kein Banner, nur Log-Eintrag
- [ ] Update-Banner erscheint bei `available`/`downloading`/`ready`/`error`
- [ ] "Jetzt neu starten" startet App neu mit neuer Version
- [ ] Settings zeigt aktuelle Version + manuellen Check-Button
- [ ] Logs (PR A) enthalten Update-Events (`Update available v1.5.1`)
- [ ] Lokaler Smoke-Test mit Fake-Server bestanden

### Risk & Rollback

- **Höchstes Risiko der ganzen v1.5.** Wenn Updater bricht, kann er
  potenziell den nächsten Update-Pfad auch brechen. Mitigation:
  - PR A liefert die Logs zum Debuggen
  - Settings-Sektion zeigt Fehler explizit, nicht nur silent fail
  - `latest.yml` ist signiert via electron-builder
- Rollback: Auto-Update kann via Settings-Toggle deaktiviert werden? **Nein
  in v1.5** — bewusste Reduktion. Wenn nötig, in v1.6 nachziehen.
- Wenn ein Update hängenbleibt: User-Story = manuell neueste `.exe` von
  GitHub Releases ziehen. Dokumentieren in README.

### Out of scope

- Differential-Updates (electron-updater kann das, lohnt nicht für 80 MB
  Installer und seltene Releases)
- Update-Cancellation während Download — wird automatisch resumed
- Pre-Release-Channel — alles geht über Latest

### Files

- `package.json`
- `electron-builder.yml` (publish-Block ergänzen)
- `src/main/index.ts` (autoUpdater init)
- `src/main/updater.ts` (neu) — Status-Bridge zu IPC
- `src/main/ipc.ts` (Update-IPC)
- `src/preload/index.ts` + `.d.ts`
- `src/renderer/src/store/updateStore.ts` (neu)
- `src/renderer/src/components/UpdateBanner.tsx` (neu)
- `src/renderer/src/views/SettingsView.tsx` (Update-Sektion)
- `build/dev-app-update.yml` (neu, gitignored) — für lokalen Test
- `scripts/test-updater.mjs` (neu) — lokaler Server für Updater-Tests
- `src/main/updater.test.ts` (neu) — Status-Reducer-Tests

### Schätzung

M — 2 Sessions.

---

## PR C — CSV-Export (#18)

**Why now:** Daten-Portabilität für Steuerberater / DATEV. JSON deckt es
maintainer-seitig schon ab, aber kein Tax-Tool frisst JSON. CSV ist
universal.

### Scope

#### C.1 CSV-Format-Definition

Spalten (Excel-DE-kompatibel: Komma als Dezimal, Semikolon als Separator,
UTF-8-BOM):
```
Datum;Start;Ende;Dauer;Kunde;Kunden-ID;Beschreibung;Tags;Stundensatz;Betrag
25.04.2026;09:00;10:30;01:30:00;Acme GmbH;C-001;Meeting;wichtig|kunde;75,00;112,50
```

- Datums-/Zeitformate: `dd.MM.yyyy` und `HH:mm` (DE) — gibt's schon in `shared/date.ts`.
- Dauer: `HH:mm:ss` (für Excel-Stundenrechnungen mit `[h]:mm:ss`-Format).
- Betrag: leer wenn kein Stundensatz; Komma als Decimal.
- Tags: `|`-separiert (Semikolon ist schon Field-Separator).
- BOM für Excel: `\uFEFF` am Anfang.
- Zeilen-Ende: `\r\n` (Windows-Standard, Excel-DE freundlich).
- **Mitternachts-Einträge:** DB speichert sie schon als 2 separate Entries
  (`midnightSplit.ts`). CSV gibt Entries 1:1 aus — also 2 Zeilen, konsistent
  mit PDF und DB. Keine Sonderbehandlung.

#### C.2 Implementation

- `src/shared/csv.ts` (neu): `formatCsv(entries: Entry[], opts: { decimalSeparator: ',' | '.', fieldSeparator: ';' | ',' }): string`
- Default `;` + `,` (DE), Toggle in Modal für `,` + `.` (US/DATEV-Variante prüfen).
- Escape-Regeln: Felder mit `;`, `"`, `\n` → in `"..."` einwickeln, `"` → `""`.
- Tests: leere Liste, Sonderzeichen, lange Beschreibungen, alle Tag-Konstellationen.

#### C.3 UI-Integration

- Bestehendes PDF-Export-Modal zu **"Export"-Modal** umbenennen (`PdfExportModal.tsx` → `ExportModal.tsx`).
- Tabs/Toggle: **PDF** | **CSV** (oder Radio).
- CSV-Tab: Datums-Range (gleiche Logik wie PDF), Format-Toggle (DE/US),
  Save-Dialog für `.csv`-Datei.
- Main-Side: IPC `export:csv` → `dialog.showSaveDialog` + `fs.writeFile`.

#### C.4 Tests

- `csv.test.ts`: Format-Roundtrip mit Edge-Cases.
- `ipc.test.ts`: `export:csv` schreibt Datei, validiert Content.

### Acceptance

- [ ] CSV-Export aus dem Export-Modal heraus
- [ ] DE-Format default; US-Format optional
- [ ] UTF-8 mit BOM, Excel-DE öffnet ohne Encoding-Frage
- [ ] Stundensatz-Berechnung (Dauer × Rate) als `Betrag`-Spalte
- [ ] Tags `|`-getrennt
- [ ] Datums-Range-Filter respektiert (gleiche Range-Logik wie PDF)
- [ ] Mitternachts-Splits = 2 Zeilen (konsistent mit DB/PDF)
- [ ] Tests: leere Liste, Sonderzeichen, Multi-Tag, kein Rate, Mitternachts-Split

### Risk & Rollback

- Niedrig. Reine Datei-Generierung, keine DB-Änderung.
- Rollback = PR revert.

### Out of scope

- DATEV-XML (wesentlich komplexer, eigenes Issue für v1.6+)
- Excel-Direct-Export (.xlsx) — CSV reicht
- Geplante Auto-Exports (Cron) — manuell ist genug

### Files

- `src/shared/csv.ts` (neu)
- `src/shared/csv.test.ts` (neu)
- `src/main/csv.ts` (neu) — IPC-Handler
- `src/main/ipc.ts` (CSV-Channel)
- `src/preload/index.ts` + `.d.ts`
- `src/renderer/src/components/PdfExportModal.tsx` → umbenennen + erweitern
- `src/renderer/src/App.tsx` (Import-Pfad)

### Schätzung

M — 1-2 Sessions.

---

## PR D — i18n-Foundation (neu, scope-expansion)

**Why:** Der Onboarding-Wizard soll "Sprache: Deutsch (weitere folgen)" zeigen.
Das ist nur ehrlich, wenn der Code auch wirklich locale-aware ist. Präferierter
Weg: kleine eigene Implementation, keine schwere Library, damit es auch beim
2. Locale (EN) nicht weh tut.

### Scope

#### D.1 Foundation

- `src/shared/i18n.ts` (neu): Mini-Modul mit
  - `type Locale = 'de' | 'en'`
  - `loadLocale(locale: Locale): Record<string, string>`
  - Locales als TS-Module: `src/shared/locales/de.ts`, `src/shared/locales/en.ts`
    (TS-Maps statt JSON: Type-Safety, dead-key-Detection beim Build).
- React-Provider `I18nProvider` + Hook `useT()` → `t(key: keyof typeof de)`-Funktion.
- Locale-State im Zustand-Store `settingsStore.ts` (neu) — default `de`,
  persisted via Settings-Tabelle.

#### D.2 Migration

- Migration 008: `settings.locale TEXT NOT NULL DEFAULT 'de'`.

#### D.3 String-Extraction (begrenzt!)

- **In v1.5 migriert:** Onboarding-Wizard, About-Dialog, Update-Banner,
  SettingsView (mindestens die neuen Diagnose/Update-Sektionen).
- **NICHT migriert in v1.5:** TimerView, TodayView, CalendarView, ClientsView,
  alle bestehenden Modale. Strings bleiben hardcoded auf DE. **Bewusste
  Reduktion** — sonst sprengt es den Scope. v1.6 zieht den Rest nach.
- Ein Lint-Helper (`scripts/find-untranslated.mjs`) listet alle nicht-migrierten
  deutschen Strings als Backlog-Quelle.

#### D.4 Settings-UI

- In SettingsView ein `<select>` für Sprache: DE / EN. Wechsel triggert
  `i18n.setLocale()` + persists. UI updated live (nur die migrierten Strings).

#### D.5 EN-Locale

- DE = Source-of-Truth, alle Keys mit deutschen Strings.
- EN-Locale = Stub mit Übersetzungen für die migrierten Bereiche.
- TypeScript prüft, dass EN-Locale alle DE-Keys enthält (Record<keyof typeof de, string>).

#### D.6 Tests

- `i18n.test.ts`: `t('hello.world')` mit DE → deutscher String, mit EN → englischer.
- `useT`-Hook-Test mit React Testing Library.

### Acceptance

- [ ] Migration 008 setzt `settings.locale = 'de'`
- [ ] `i18n.ts` + `de.ts` + `en.ts` existieren
- [ ] `useT()`-Hook in mindestens 4 Komponenten benutzt (Onboarding, About,
      UpdateBanner, neue Settings-Sektionen)
- [ ] Settings-Sprach-Switch wechselt UI live
- [ ] EN-Locale enthält alle Keys (TS-Compile-Check)
- [ ] `find-untranslated.mjs` listet die noch hardcoded DE-Strings (als v1.6-Backlog)

### Risk & Rollback

- Niedrig. Strings, die nicht migriert sind, bleiben statisch — nichts bricht.
- Migration ist additiv.

### Out of scope

- Komplette App auf i18n umstellen — v1.6
- Plurale, Datumformate, Number-Formates pro Locale (Intl-API kann das, kommt später)
- Translation-Memory / externe Übersetzer-Pipeline (zu früh)

### Files

- `src/shared/i18n.ts` (neu)
- `src/shared/locales/de.ts` (neu)
- `src/shared/locales/en.ts` (neu)
- `src/shared/i18n.test.ts` (neu)
- `src/main/migrations/008-v15-i18n-onboarding.ts` (neu, kombiniert mit PR E falls schlau)
- `src/main/migrations/index.ts`
- `src/renderer/src/store/settingsStore.ts` (neu)
- `src/renderer/src/views/SettingsView.tsx` (Sprach-Switch)
- `src/renderer/src/main.tsx` (I18nProvider mounten)
- `scripts/find-untranslated.mjs` (neu)

### Schätzung

M — 1–2 Sessions.

---

## PR E — Onboarding-Wizard (#32)

**Why:** First-Run-Erlebnis. Heute startet die App und zeigt einen leeren
Timer ohne Kunden. User weiß nicht: muss ich erst einen Kunden anlegen?
Wo ist der Hotkey?

### Scope

#### E.1 First-Run-Detection

- Neue Settings-Row `onboarding_completed` (DEFAULT 0) — in derselben Migration
  wie i18n (PR D), oder als separate 009. **Vorzug: 008 macht beides** — ein
  Migrations-Schritt für v1.5-Settings.
- Beim App-Start: Settings lesen, wenn `onboarding_completed === 0` → Wizard zeigen.

#### E.2 Zwei Schritte (CEO-Cut: Sprach-Schritt durch i18n echt gemacht)

**Schritt 1 — Willkommen + Sprache (echt):**
- Begrüßungs-Text, App-Logo, kurze 2-Zeilen-Erklärung was TimeTrack macht.
- Sprach-Toggle DE/EN (nutzt PR D — echte Auswahl, kein Fake).

**Schritt 2 — Erster Kunde:**
- Inline-Form: Name, Stundensatz (optional), Farbe.
- "Später anlegen"-Button überspringt → leerer Zustand mit Hinweis-Button
  in TodayView.

**Schritt 3 — Hotkey:**
- "Du kannst Timer mit `Strg+Shift+T` (Default) starten/stoppen, ohne die App
  in den Vordergrund zu holen. Konfigurierbar in Einstellungen."
- Mini-Widget-Hinweis: "Mini-Widget einblenden mit `Alt+Shift+M` — immer
  sichtbar, immer im Bild."

#### E.3 Komponente

- `OnboardingWizard.tsx` (Modal-basiert, 3 Steps mit "Schritt 1 von 3"-Text
  statt Progress-Dots — dezenter)
- Alle Strings via `t()` (PR D)
- "Überspringen"-Link in jeder Step-Ecke → setzt `onboarding_completed = 1`
- Letzter Schritt: "Loslegen" → setzt `onboarding_completed = 1`, schließt Wizard

#### E.4 Tests

- `migrations.test.ts`:
  - Migration setzt `onboarding_completed = 0` für neue DBs
  - Migration setzt `onboarding_completed = 1` für Bestandsuser (entries.count > 0)
- Manueller Test: frisches Profil → Wizard erscheint; nach Abschluss → kommt nicht wieder.

### Acceptance

- [ ] Migration 008: `settings.onboarding_completed INTEGER NOT NULL DEFAULT 0` + `settings.locale TEXT NOT NULL DEFAULT 'de'`
- [ ] Beim ersten Start: Wizard erscheint
- [ ] 3 Schritte: Willkommen+Sprache, Kunde (Form mit Skip), Hotkey-Hinweis
- [ ] "Überspringen" und "Loslegen" beide setzen Flag → Wizard kommt nicht wieder
- [ ] Bestehende Installs (v1.4-Upgrade): Migration setzt Flag = 1 für alle, die
      schon ≥1 Entry haben (so erscheint der Wizard nicht für Bestandsuser)
- [ ] In Settings: "Onboarding erneut zeigen"-Button (für Debugging/Demo)
- [ ] Alle Wizard-Strings via `t()`-Hook (DE + EN)

### Risk & Rollback

- Niedrig. Reines UI + ein Setting.
- Migration ist additiv (DEFAULT 0).
- Bestandsuser-Schutz: Migration setzt Flag = 1 wenn `entries`-Tabelle nicht leer
  → kein Wizard für aktive User nach Update.

### Out of scope

- Mehrsprachigkeit (i18n) — macht PR D, hier nur konsumiert
- Sample-Daten / Demo-Modus
- Animations-Feuerwerk

### Files

- `src/main/migrations/008-v15-settings.ts` (neu — i18n + onboarding kombiniert)
- `src/main/migrations/index.ts` (registrieren — falls nicht schon in PR D)
- `src/renderer/src/components/OnboardingWizard.tsx` (neu)
- `src/renderer/src/App.tsx` (Wizard mounten)
- `src/renderer/src/views/SettingsView.tsx` (Re-Trigger-Button)
- `src/main/migrations/migrations.test.ts` (neue Migration testen)
- `src/shared/locales/de.ts` + `en.ts` (Wizard-Keys hinzufügen)

### Schätzung

S — 1 Session.

---

## PR F — Lizenz-Hinweise / About-Dialog (#35)

**Why:** Pflicht für Open-Source-Distribution. MIT verlangt Copyright-Notice;
Drittanbieter-Lizenzen müssen mit. Plus: ein About-Dialog ist Standard.

### Scope

#### F.1 License-Bundle generieren

- `pnpm add -D license-checker-rseidelsohn` (oder `licenses-rseidelsohn`)
- Build-Script: `scripts/generate-licenses.mjs`:
  - Liest alle production-deps + Lizenztexte
  - Schreibt nach `resources/THIRD_PARTY_LICENSES.txt`
  - Wird im electron-builder-Build automatisch eingepackt
- `package.json` script: `"prebuild": "node scripts/generate-licenses.mjs"`
  — **nur prebuild, NICHT predev** (sonst läuft das bei jedem `pnpm dev`)

#### F.2 About-Dialog

- Komponente `AboutDialog.tsx`:
  - App-Name + Version + GitHub-Link (Logo dazu für Eyecandy)
  - **Kurzer Block** (kein Wall-of-Text):
    - "© 2026 Robin Skoeder · MIT License"
    - Link "Vollständiger Lizenztext" → öffnet `LICENSE`-Datei via `shell.openPath`
    - Button "Drittanbieter-Lizenzen" → öffnet `THIRD_PARTY_LICENSES.txt`
  - Strings via `t()` (PR D)
- Trigger: in SettingsView ein "Über TimeTrack"-Button.
- Optional: Standard-`Help`-Menüpunkt im App-Menu (`role: 'about'`).

#### F.3 Tests

- Kein automatisierter Test nötig. Manueller Smoke-Test:
  - Build erzeugt `THIRD_PARTY_LICENSES.txt`
  - About-Dialog öffnet sich, zeigt korrekte Version
  - Drittanbieter-Button öffnet die Datei

### Acceptance

- [ ] `THIRD_PARTY_LICENSES.txt` wird in Build eingebettet
- [ ] About-Dialog erreichbar aus Settings
- [ ] Zeigt Version, License, Copyright, Link zu GitHub-Repo
- [ ] "Drittanbieter-Lizenzen"-Button öffnet die Datei
- [ ] CI-Build prüft, dass das Script läuft (im prebuild-Hook)

### Risk & Rollback

- Sehr niedrig. Reine Anzeige + Build-Step.

### Out of scope

- Update-Check direkt im About (das macht PR B in Settings)
- Donation-Button / Sponsor-Link

### Files

- `package.json` (dev-dep + script)
- `scripts/generate-licenses.mjs` (neu)
- `electron-builder.yml` (prüfen, dass `resources/` eingepackt wird)
- `src/renderer/src/components/AboutDialog.tsx` (neu)
- `src/renderer/src/views/SettingsView.tsx` (Button)
- `src/main/index.ts` (optional: about-menu role)
- `.gitignore` (`resources/THIRD_PARTY_LICENSES.txt` falls auto-generiert)

### Schätzung

XS — 0.5 Session.

---

## Reihenfolge & Dependencies

```
A (Crash-Logging) ───┬──> B (Auto-Update, nutzt Logger aus A)
                     │
                     ├──> C (CSV-Export, nutzt Logger für Export-Errors)
                     │
                     └──> D (i18n-Foundation) ───> E (Onboarding, nutzt t())
                                              └──> F (About, nutzt t() für Strings)
```

A blockt alles → muss zuerst. B und C unabhängig von D. D blockt E + F (wegen `t()`).
Reihenfolge in der Praxis: **A → B → C → D → E → F** (sequenziell, 1 Reviewer).
Alternativ könnten B/C/D parallel laufen — sequenziell ist einfacher.

## Workflow-Disziplin

- Pro PR: CHANGELOG-Eintrag im `[Unreleased] — v1.5`-Block (sonst hast du am Ende Lücken).
- Pro PR: Squash-Merge mit `feat:` / `fix:` / `chore:`-Prefix.
- Nach jeder PR: `gh pr view {n}` checken, dass CI grün ist.

## Release-Strategie

- v1.5.0 = A + B + C + D + E + F in einem Release. **Keine Beta-Phase** (Self-Dogfood reicht).
- Erste echte Auto-Update-Verifikation passiert mit v1.5.1 (Hotfix nach v1.5.0).
- CHANGELOG-Eintrag pro PR; finaler Release-Header beim Tag.

## Risiken zusammengefasst

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|--------------------|--------|------------|
| Auto-Update bricht silently | mittel | hoch | PR A liefert Logs; Settings zeigt Fehler; Offline = silent |
| Auto-Update v1.5.0→v1.5.1-Pfad ungetestet | niedrig | hoch | Doku: User kann manuell `.exe` ziehen wenn nötig |
| CSV-Encoding Excel-DE | niedrig | mittel | UTF-8-BOM + manueller Test mit Excel/LibreOffice |
| Onboarding nervt Bestandsuser | niedrig | mittel | Migration setzt Flag=1 wenn entries vorhanden |
| i18n-Stub bricht bestehende Komponenten | niedrig | mittel | Bestehende Strings bleiben hardcoded — nur neue + ausgewählte verwenden t() |
| License-Bundle aufgebläht | niedrig | niedrig | nur production-deps, ist eh Pflicht |

## Definition of Done v1.5.0

- [ ] Alle 6 PRs gemerged
- [ ] CHANGELOG aktualisiert
- [ ] README "Coming soon" → nur noch v1.6-Items
- [ ] ROADMAP: v1.5 als ausgeliefert markiert, Pomodoro als gestrichen
- [ ] #23 (Pomodoro) als `wontfix` geschlossen mit Begründung
- [ ] Lokaler Smoke-Test (alle PRs zusammen) durchgelaufen
- [ ] Tag `v1.5.0` gepusht, Release-Build grün
- [ ] `find-untranslated.mjs`-Output als Issue für v1.6 (i18n-Phase 2) angelegt
