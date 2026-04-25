# v1.4 — Flow & Less Friction

> Theme: App soll im Workflow verschwinden, nicht stören. Plus die CI-Hausaufgabe
> (Node 20 → 24), bevor sie blocking wird.

**Branch-Strategie:** 4 PRs in dieser Reihenfolge. CI zuerst, weil Juni-Deadline.

| PR | Branch | Issues | Risiko | Größe |
|----|--------|--------|--------|-------|
| A | `chore/v1.4-ci-node24` | #41 | sehr niedrig | XS (1 Datei, 2 Zeilen) |
| B | `feat/v1.4-mini-widget` | #22 | hoch | L (zweites BrowserWindow + Hotkey + Migration + timerStore-Refactor) |
| C | `feat/v1.4-tags` | #24 | mittel | M (Schema + Form + Filter + PDF-Group) |
| D | `feat/v1.4-quicknote-window` | #25 + Backlog | niedrig | S (Toast-Hook + Window-Persist + 1 kombi-Migration) |

**Verschoben (NICHT in v1.4):**
- #18 (CSV-Export) → v1.5 (JSON deckt Trust ab, Steuerberater-Pull fehlt)
- #23 (Pomodoro) → v1.5 (Mini-Widget + Quicknote liefern mehr Daily-Trust)
- Backlog: PDF-Overlap-Merge → v1.5 (kosmetisch, keine Daten-Korrektheit)

**Ship-Kriterium v1.4:** Wochenlang täglich nutzen ohne dass es nervt. Niemand öffnet das Hauptfenster, um zu sehen "läuft mein Timer?".

---

## PR A — CI Node 24 Bump (#41)

**Why first:** Juni-Deadline ist hart, jeder weitere Release-Tag würde die Annotation triggern. Außerdem 1-Zeilen-Bump, kein Risiko.

### Scope

`pnpm/action-setup@v4` → `@v5` in beiden Workflows (`.github/workflows/release.yml` Zeile 24, `test.yml` Zeile 14). v5 wurde im März released und nutzt Node.js 24.

Alle anderen Actions (`checkout`, `setup-node`, `upload-artifact`, `download-artifact`) sind bereits `@v5`. Nichts weiter zu tun.

### Acceptance

- [ ] `release.yml` und `test.yml` zeigen `pnpm/action-setup@v5`
- [ ] Beide Workflows laufen erfolgreich gegen Test-PR / Test-Tag
- [ ] Keine Node-20-Deprecation-Annotation in der Run-Summary
- [ ] Smoke-Test (DB + PDF) bleibt grün

### Risk & Rollback

- pnpm v6 kommt mit Node 24. `node-version: 22` im `setup-node`-Step ist die Source-of-Truth für die App-Build-Toolchain — bleibt unverändert. v5 nutzt nur Node 24 für die Action-Runtime selbst.
- Rollback = Revert-Commit; Tag-Re-Push dauert 5 Minuten.

### Out of scope

- Node-Version der App-Toolchain ändern (das ist Electron 39 / Node 22 — separat).
- Andere CI-Verbesserungen (Cache-Tuning, Matrix-Build) — eigenes Issue wenn nötig.

### Files

- `.github/workflows/release.yml` — Zeile 24
- `.github/workflows/test.yml` — Zeile 14

### Schätzung

XS — 5 Minuten Code, 10 Minuten Test-PR-Lauf.

---

## PR B — Mini-Widget (#22)

**Hero-Feature von v1.4.** Always-on-top 200×40-Widget, immer sichtbar, kein Tab-Wechsel, kein Hauptfenster aufpoppen. Toggl-Killer-Move.

### Scope

#### B.1 Zweites BrowserWindow (`mini`)

- Neuer Vite-Renderer-Entry `src/renderer/mini/index.html` + `src/renderer/mini/main.tsx`
  - Eigene React-Mini-App, nutzt `useTimer`-Store gegen IPC.
  - Inhalt: `● {clientName} · {HH:MM:SS} · [⏹]`, transparenter Hintergrund, Drag-Region overall, Stop-Button als no-drag-Region.
- `electron.vite.config.ts`: dritten Renderer-Entry hinzufügen (analog zu wie es bei zwei wäre — heute haben wir nur einen).
- `src/main/miniWindow.ts`: `BrowserWindow`-Factory mit `frame:false, alwaysOnTop:true, resizable:false, skipTaskbar:true, transparent:true, width:200, height:40, hasShadow:false, focusable:true`.
- Position: aus Settings (`mini_x`/`mini_y`) lesen; Default = rechts unten via `screen.getPrimaryDisplay().workAreaSize`. `move`-Event in 250ms-debounce in Settings persistieren.
- Doppelklick → Hauptfenster fokussieren (`mainWindow.show(); focus()`).

#### B.2 Toggle-Hotkey

- Default `Alt+Shift+M`, konfigurierbar in Settings (analog zu `hotkey` für Start/Stop).
- `globalShortcut.register` registriert beim App-Start; `unregisterAll`/re-register beim Hotkey-Change.
- Konflikt-Handling: wenn `register` `false` zurückgibt, Toast in der Hauptfenster-UI „Hotkey {x} bereits belegt".

#### B.3 IPC + State-Sync

- Neuer Channel `mini:toggle` (vom Hotkey-Handler in main); öffnet/schließt `miniWindow`.
- Bestehender Timer-State muss in das Mini-Renderer ankommen. **Push-Pattern (entschieden):** Main broadcastet `timer:state-changed` auf beide Windows via `webContents.send`, Renderer subscribed. Mini tickt 1×/Sek lokal aus letztem Start-Zeitstempel.
- **Breaking change im timerStore-Design:** Mit zwei Renderern wird `timerStore` zum reinen Spiegel des Main-State — KEIN direktes `useTimer.set()` mehr im Renderer. Alle Mutations via IPC. Diese Refactor-Arbeit ist Teil von PR B, nicht von PR A.
- **Hotkey-Konflikt-UX:** Beim App-Start triggert `register()` `false` → `dialog.showMessageBox` (Toast erreicht niemanden wenn Mini zu + Main minimiert). Bei Hotkey-Change in Settings: bestehender Toast im Main-Renderer.

#### B.4 Migration 006

```sql
-- 006-v14-mini-widget.sql
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('mini_enabled', '0'),
  ('mini_hotkey', 'Alt+Shift+M'),
  ('mini_x', '-1'),
  ('mini_y', '-1');
```

`-1` als Sentinel für „noch nie positioniert, nimm Default rechts unten".

#### B.5 Settings-View

- Neue Section „Mini-Widget":
  - Checkbox „Mini-Widget aktivieren" (`mini_enabled`)
  - Hotkey-Capture-Input für `mini_hotkey` (analog zu Start/Stop-Hotkey)
  - Button „Position zurücksetzen" → schreibt `-1`/`-1`

#### B.6 Transparent-Window-Fallback

Windows DWM-Composition kann mit anderen Direct3D-Apps schwarze Hintergründe produzieren. Plan B falls Probleme auftauchen: `transparent: false` + dunkler Halbtransparenter Background-Color (`bg-gray-900/85` o.ä.), eckige Ecken statt rounded. Manuelles Testen gegen Win11 vor Merge.

### Acceptance

- [ ] Beim App-Start mit `mini_enabled=1`: Mini erscheint an gespeicherter Position (oder Default rechts unten)
- [ ] Mini bleibt über Vollbild-Apps (Browser, IDE) sichtbar
- [ ] Hotkey toggelt sichtbar/unsichtbar; konfigurierbar in Settings; Konflikt zeigt Toast
- [ ] Klick auf `[⏹]` stoppt aktuellen Eintrag; Mini zeigt dann „Kein Timer" oder versteckt sich (siehe Frage unten)
- [ ] Doppelklick öffnet Hauptfenster
- [ ] Position-Roundtrip: drag → close app → restart → gleiche Position
- [ ] Migration 006 idempotent
- [ ] Settings-Toggle wirkt sofort (kein Restart nötig)
- [ ] Test: Migration backward-compatible mit Schema 5

### Open Questions

1. **Was zeigt das Widget wenn kein Timer läuft?**
   - A) Auto-hide → User wundert sich „wo ist mein Widget"
   - B) Dezent „Kein Timer" mit Klick → Hauptfenster
   - **Empfehlung:** B, weil discoverable. Auto-hide wirkt wie Bug.

2. **Hotkey toggelt Sichtbarkeit oder Aktivierung?**
   - A) Toggle nur Sichtbarkeit, `mini_enabled` ist Master-Switch in Settings → Hotkey kann nichts tun wenn deaktiviert
   - B) Hotkey toggelt `mini_enabled` direkt → Setting bleibt redundant
   - **Empfehlung:** A, weil Settings als persistent contract bleibt; Hotkey ist temporäres Hide für „mal kurz weg".

3. **Drag-Region: ganzes Widget oder nur Rand?**
   - A) Ganzes Widget draggable, Stop-Button als no-drag-Insel → minimaler Code
   - B) Nur ein 4-Pixel-Rand draggable wie macOS → mehr CSS, frickelig
   - **Empfehlung:** A.

### Risk & Mitigation

- **Two-window sync race:** wenn Main-Renderer und Mini-Renderer beide `entries:create` aufrufen können, müssen wir den existierenden timer:state-changed-Channel zur single source of truth machen. Bestehender `useTimer`-Store muss aufgebrochen werden.
- **Transparency + Windows:** transparent windows haben in Electron historisch Glitches (schwarze Hintergründe in DWM). Test gegen Win11; Fallback `transparent:false` mit dunklem Background-Color wenn nötig.
- **Hotkey-Conflict mit anderen Apps:** `Alt+Shift+M` ist nicht reserviert, aber jemand könnte es überlagert haben. Conflict-Toast ist Pflicht.
- **Workspace-Dispose:** beim App-Quit Mini sauber zerstören vor Tray (analog zu Hauptfenster).

### Files

- `electron.vite.config.ts` — dritten Renderer-Entry
- `src/main/index.ts` — Mini-Window-Lifecycle in `app.whenReady`, Hotkey-Register, neue IPC
- `src/main/miniWindow.ts` (NEU) — Factory + Position-Management
- `src/main/migrations/006-v14-mini-widget.ts` (NEU)
- `src/preload/index.ts` + `index.d.ts` — `mini.toggle()`, `timer.onStateChanged()`
- `src/renderer/mini/index.html` (NEU)
- `src/renderer/mini/main.tsx` (NEU)
- `src/renderer/mini/MiniApp.tsx` (NEU)
- `src/renderer/mini/mini.css` (NEU)
- `src/renderer/src/views/SettingsView.tsx` — neue Mini-Section
- `src/renderer/src/store/timerStore.ts` — Push-State-Sync von Main, weg vom Renderer-Polling

### Schätzung

L — die Hälfte ist BrowserWindow-Setup, die andere Hälfte ist State-Sync zwischen zwei Renderern. Realistisch 1.5–2 Tage menschlich, ~90 min CC+gstack inklusive Tests.

---

## PR C — Tags pro Eintrag (#24)

### Scope

#### C.1 Schema (Migration 007)

```sql
-- 007-v14-tags.sql
ALTER TABLE entries ADD COLUMN tags TEXT NOT NULL DEFAULT '';
-- intentionally NO index: SQLite cannot use indexes for `%,tag,%` LIKE patterns,
-- and at the expected scale (<10k entries for a solo freelancer over 5 years)
-- substring search runs in sub-millisecond. Adding an unused index just costs
-- write-performance and disk space.
```

Speicherformat: `,tag1,tag2,` mit führendem + trailing Komma. `LIKE '%,bug,%'` findet `bug` exakt, kein false-positive für `bugfix`.

#### C.2 Tag-Parser (`src/shared/tags.ts`, NEU)

Pure Funktionen:

- `parseTagInput(raw: string): string[]` — splittet an Komma und Whitespace, lowercased, dedupes, max-Length-checked, droppt `,`/Sonderzeichen außer `-` und `_`.
- `serializeTags(tags: string[]): string` — joins als `,a,b,c,` (oder `''` wenn leer)
- `entryHasTag(serialized: string, tag: string): boolean` — `serialized.includes(`,${tag},`)`

Vollständige Test-Coverage: leerer Input, Whitespace-only, Duplikate, Sonderzeichen, Max-Length, Unicode-Tags.

#### C.3 IPC

- `entries:create` + `entries:update` akzeptieren `tags?: string[]`, persistieren als serialisierten String.
- `tags:recent` — neuer Read-only Handler: `SELECT DISTINCT tag FROM entries_tags_view WHERE created_at > now()-90d` (entweder via View oder via JS-Side splitten der `entries.tags` aus letzten 90 Tagen).

#### C.4 UI: EntryEditForm

Tag-Input-Komponente:
- Chip-Liste der bereits gesetzten Tags
- Input-Feld; Tab/Enter/Komma fügt Tag hinzu, Backspace bei leerem Feld entfernt letzten Chip
- Autocomplete-Dropdown aus `tags:recent`-Ergebnis, gefiltert per Substring
- Visual: Pill `#tagname ×` mit deterministischer Hash-Farbe (`tag.charCodeAt(0) % 8` aus 8-Farb-Palette: indigo / emerald / amber / rose / violet / sky / lime / orange). Gibt visuelles Cluster-Feedback ohne User-Konfig.

#### C.5 Calendar-Filter

- Im Drawer (Tagesliste) optional Tag-Filter-Pille oben.
- v1.4: nur Filter im Drawer, nicht im Monatsraster (würde komplex). Issue #24 sagt nichts dazu, wir limitieren scope.

#### C.6 PDF-Group-by-Tag

Neuer Checkbox im PDF-Modal: „Nach Tag gruppieren":
- Wenn aktiviert + mind. ein Eintrag hat Tags: Tabelle wird gruppiert mit Subtotals pro Tag (alphabetisch sortiert), Einträge ohne Tag in Sektion „Ohne Tag" am Ende.
- Wenn aktiviert + niemand hat Tags: silent fallback auf normales Layout (kein Error).

### Acceptance

- [ ] Migration 007 idempotent + backward-compatible (alte Einträge → `tags=''`)
- [ ] Tag-Parser strippt Whitespace, lowercased, deduped, max 32 Zeichen pro Tag
- [ ] `entries:create`/`update` persistieren Tags korrekt
- [ ] `tags:recent` liefert Vorschläge aus letzten 90 Tagen, sortiert nach Häufigkeit
- [ ] Autocomplete funktioniert in EntryEditForm (Tab + Klick)
- [ ] Suche `,bug,` findet `bug` aber NICHT `bugfix` (LIKE-Test)
- [ ] PDF-Gruppierung mit Subtotals sieht ordentlich aus
- [ ] Tests für Parser (>=10 Cases), für IPC-Roundtrip, für PDF-Group

### Open Questions

1. **Tag-Casing:** all-lowercase erzwingen (`#Bug` → `#bug`)?
   - **Empfehlung:** ja. Nutzer tippen inkonsistent; Vereinheitlichung verhindert "Bug" + "bug" + "BUG" als drei separate.

2. **Max Tags pro Eintrag:** Limit?
   - **Empfehlung:** 10. Mehr ist Tag-Misbrauch, UI-Chips werden unübersichtlich.

3. **Tag-Renaming-UI:** brauchen wir eine globale Tag-Liste mit „rename"?
   - **Empfehlung:** v1.4 nein. Wenn nötig später als kleines Issue. Manuelles Edit pro Eintrag reicht für Solo-User.

### Files

- `src/main/migrations/007-v14-tags.ts` (NEU)
- `src/main/ipc.ts` — `entries:create`/`update` erweitern, neuer `tags:recent`
- `src/main/pdf.ts` — `groupByTag?: boolean` in `PdfRequest`/`Payload`, `buildPdfHtml` Group-Logik
- `src/preload/index.ts` + `index.d.ts` — `tags.recent()`
- `src/renderer/src/components/EntryEditForm.tsx` — Tag-Input
- `src/renderer/src/components/TagInput.tsx` (NEU)
- `src/renderer/src/components/PdfExportModal.tsx` — Group-Checkbox
- `src/renderer/src/components/CalendarDrawer.tsx` — optional Tag-Filter
- `src/shared/tags.ts` (NEU)
- `src/shared/tags.test.ts` (NEU)

### Schätzung

M — Parser + Schema sind klein, UI-Chip-Komponente und PDF-Group sind die meiste Arbeit. ~1 Tag menschlich, ~45 min CC+gstack.

---

## PR D — Quicknote + Window-Size (#25 + Backlog)

Kombiniert Schnell-Notiz und Window-Size-Persistierung in **eine** PR mit **einer** Settings-Migration. Beide sind klein und zusammen überschaubar.

### Scope

#### D.1 Schnell-Notiz (#25)

Toast-Variante des bestehenden `toastStore` mit Inline-Input. Wenn ein Eintrag mit `description=''` gestoppt wird:

- Toast unten rechts: „Was war das?" mit Text-Input + Speichern-Button
- Auto-Fokus auf Input
- 30-Sek-Timer; **Progress-Bar visualisiert ablaufende Zeit** (Tailwind `transition-all duration-30000`)
- ESC = wegklicken ohne Speichern
- Enter / Klick „Speichern" = `entries:update` mit der Beschreibung in den eben gestoppten Eintrag (per ID gemerkt)

#### D.2 Window-Size (Backlog)

Quality-of-Life ohne Schema-Risiko. Heute: 900×670 Default, kein Min, keine Persistenz, alle Views in `max-w-md`/`max-w-3xl`.

- `BrowserWindow`-Constructor: `width: settings.window_width ?? 1100, height: settings.window_height ?? 750, minWidth: 900, minHeight: 600`
- `resize`/`move`-Events in 500ms-debounce → Settings (`window_width`, `window_height`, `window_x`, `window_y`)
- Off-Screen-Schutz: wenn Settings-Position außerhalb sichtbarer Displays → Default

View-Container-Audit:

| View | Aktuell | Vorschlag |
|------|---------|-----------|
| TimerView | `max-w-md` | `max-w-md` (bewusst schmal, Form-Layout) |
| TodayView | `max-w-3xl` | `max-w-5xl` (Stat-Cards + Quick-Start atmen lassen) |
| CalendarView | `max-w-5xl` | `max-w-7xl` (Monatsraster braucht Platz) |
| ClientsView | `max-w-3xl` | `max-w-3xl` (bleibt) |
| SettingsView | `max-w-3xl` | `max-w-5xl` (2-Spalten-Refactor v1.5+) |

v1.4: nur Container-Werte, keine 2-Spalten-Refactors.

#### D.3 Migration 008 (kombiniert)

```sql
-- 008-v14-quicknote-window.sql
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('quicknote_enabled', '1'),
  ('window_width', '1100'),
  ('window_height', '750'),
  ('window_x', '-1'),
  ('window_y', '-1');
```

Eine Migration für beide Settings-Bundles spart einen DB-Backup-Cycle und reduziert Migrations-Surface.

#### D.4 Hook (Quicknote)

`useTimer.stop()` returned heute den gestoppten Entry. Renderer:

```ts
const stoppedEntry = await stop()
if (settings.quicknote_enabled === '1' && !stoppedEntry.description) {
  toast.showQuicknotePrompt(stoppedEntry.id)
}
```

`toastStore` bekommt einen neuen Toast-Type `quicknote` mit Custom-Render (Input + Save + Progress-Bar).

#### D.5 Settings

Checkbox „Schnell-Notiz nach Stop anzeigen" in SettingsView → Allgemein.

### Acceptance

**Quicknote:**
- [ ] Toast erscheint NUR wenn Beschreibung leer war UND Setting aktiv
- [ ] Eingabe wird in den gestoppten Eintrag geschrieben (per ID, nicht in einen neuen)
- [ ] Race-Test: User startet sofort einen neuen Timer — die Schnell-Notiz schreibt trotzdem in den richtigen alten Eintrag
- [ ] ESC + Auto-Dismiss schreiben NICHT
- [ ] Progress-Bar läuft sichtbar von voll auf leer in 30 s

**Window:**
- [ ] Window-Position roundtrip funktioniert (close → reopen)
- [ ] Min-Size verhindert kaputte Layouts
- [ ] Off-Screen-Schutz aktiv
- [ ] Container-Werte in Tests/Snapshot wie geplant

**Schema:**
- [ ] Migration 008 idempotent + backward-compatible

### Risk

- Niedrig für beide Teile.
- Quicknote: ID des gestoppten Eintrags muss korrekt durchgeleitet werden, sonst überschreibt es einen anderen Eintrag.
- Window: Off-Screen-Edge-Case (User trennt zweiten Monitor mit darauf positioniertem Fenster).

### Files

- `src/main/migrations/008-v14-quicknote-window.ts` (NEU)
- `src/main/index.ts` — Window-Size aus Settings, Persist-Hooks, Off-Screen-Check via `screen.getAllDisplays()`
- `src/renderer/src/store/toastStore.ts` — neuer `quicknote`-Type oder generisches `customToast`
- `src/renderer/src/components/Toast.tsx` — Render-Branch für quicknote inkl. Progress-Bar
- `src/renderer/src/hooks/useTimer.ts` — `stop()` triggert Quicknote-Toast wenn nötig
- `src/renderer/src/views/SettingsView.tsx` — neue Checkbox
- `src/renderer/src/views/TodayView.tsx` — Container-Width
- `src/renderer/src/views/CalendarView.tsx` — Container-Width

### Schätzung

S+ — ~90 min menschlich, ~30 min CC+gstack.

---

## (PR E entfällt — Window-Size in PR D integriert)

---

## Sequencing & Ship-Strategy

```
main ──── PR A (CI) ─── PR B (Mini-Widget) ─── PR C (Tags) ─── PR D (Quicknote+Window) ─── tag v1.4.0
         (klein, fast)  (groß, hero)         (mittel)         (klein-kombi)
```

PRs sequenziell, nicht parallel:
- B touched `index.ts`, `preload`, neue Renderer → konflikt-anfällig wenn parallel zu D.
- C ist auch Schema-touch; wenn parallel zu B, Migrations-Nummerierung kollidiert.
- D ist klein und kombi; geht schnell nach C.

### Per-PR Smoke-Test-Erweiterung

- **PR A:** keine Code-Änderung, der existierende DB+PDF-Smoke deckt alles ab.
- **PR B:** Smoke-Test seedet `mini_enabled=1` in DB und verifiziert Migration 006. **KEIN** Window-Spawn (zu fragil im headless Windows-Runner; transparent windows + DWM ohne aktive Composition kann crashen).
- **PR C:** Smoke-Test seedet einen Eintrag mit `tags=',a,b,'` und rendert PDF mit `groupByTag=true` — `pdfBytes >= 1000`-Check bleibt.
- **PR D:** keine Smoke-Erweiterung nötig (UI-only + Settings-Migration).

### Migrations-Nummerierung

PR-Reihenfolge bestimmt Nummer:
- 006 = Mini-Widget (PR B)
- 007 = Tags (PR C)
- 008 = Quicknote + Window-Size kombi (PR D)

Wenn die Reihenfolge sich beim Mergen ändert, muss umnummeriert werden. Lieber eindeutig in den PR-Bodies festhalten.

---

## Out of Scope für v1.4 (explizit)

- **CSV-Export (#18)** → v1.5. JSON deckt Daten-Portabilität, kein aktiver Steuerberater-Pull.
- **Pomodoro (#23)** → v1.5. Mini-Widget + Quicknote liefern mehr Daily-Trust.
- **PDF-Overlap-Merge** (Backlog) → v1.5. Kosmetisch, keine Daten-Korrektheit.
- **Globale Tag-Verwaltung mit Rename** → v1.5+, wenn Need entsteht.
- **Settings-View 2-spaltig mit PDF-Vorlage-Preview** → v1.5+, scope-creep für E.
- **i18n EN-Translation der neuen Strings** → v1.5 (i18n-Infra existiert noch nicht, separates Projekt).
- **Code-Signing** → bewusst nicht in v1.5 laut bestehender Roadmap.

---

## Multi-Angle Review (zu füllen via /autoplan)

### CEO-Sicht

**Premise:** v1.4-Theme „App soll im Workflow verschwinden". Nordstern-Ausrichtung: Trust + Friction-Removal. ✅

**6-Monats-Regret-Test:**
1. Fehlt Mini-Widget (#22) → User vergisst, dass Timer läuft → falsche Stunden → Trust kaputt. **Hoch-Wert.**
2. Fehlt Quicknote (#25) → Eintrag mit `description=''` landet im PDF als „—" → User schämt sich vor Auftraggeber. **Hoch-Wert.**
3. Fehlt Tags (#24) → User googlet stundenlang „was war das letzte Woche". **Mittel.**
4. Fehlt Window-Density → Heute-View fühlt sich eng an. **Niedrig.** (Aber 45 min Aufwand → ja.)

**Bedenken:** v1.4 hatte ursprünglich 4 Schema-Migrationen. Reduziert auf 3 durch 008+009-Merge. Reduziert Migration-Surface, ein DB-Backup-Cycle gespart. ✅

**Verdict:** PASS — Scope passt, Verschiebung von #18/#23 auf v1.5 defensiv-richtig.

### Eng-Sicht

**Top-Risiken adressiert:**
1. Two-Window State-Sync: Push-Pattern + timerStore-Refactor explizit als Sub-Task in PR B.
2. Transparent Window Win11: Fallback `transparent:false` + dunkles Halbtransparent-Background dokumentiert.
3. Tags `LIKE`-Performance: Index gedroppt, Kommentar im Migration-Code.
4. Hotkey-Konflikt-UX: `dialog.showMessageBox` beim Start, Toast bei Settings-Change.
5. Smoke-Test PR B: scope-down auf DB-Settings only, kein Window-Spawn (CI-Flakiness vermieden).

**Test-Strategie:** Migration-Tests für alle 3 neuen, `tags.test.ts` mit ~15 cases, Mini-Widget manuell.

**Verdict:** PASS — Risiken bekannt + Mitigation klar.

### Design-Sicht

**Mini-Widget:** 200×40, `client.color`-Punkt (konsistent mit Calendar/Tray), system-default Font, Stop-Button ≥24px Hit-Area, hover slight backdrop-darken. PR-B-Detail.

**Tag-Chips:** Pill `#tagname ×` mit deterministischer Hash-Farbe (8-Farb-Palette via `tag.charCodeAt(0) % 8`). Visuelles Cluster-Feedback ohne User-Konfig.

**Quicknote-Toast:** Bottom-right wie alle Toasts, full-width Input, Progress-Bar für 30-Sek-Auto-Dismiss (sonst wirkt „Toast plötzlich weg" wie Bug).

**Verdict:** PASS — Conventions klar, im PR-Body weiter detaillieren.

### DX-Sicht

**Build-Time:** Dritter Renderer-Entry +1s pnpm dev, akzeptabel.

**Test-Suite:** 90 → ~105 Tests, ~1.7s Laufzeit. Noch im „instant feedback"-Bereich.

**HMR:** `electron.vite.config.ts` Multi-Renderer-Setup als ersten Commit in PR B — sonst ist Dev-Loop fürs Mini-Widget kaputt.

**CI-Time:** PR A sogar leichter Speed-up (Node 24 schneller als Node 20).

**Verdict:** PASS — DX-freundlich, eine Best-Practice-Notiz für PR B.

---

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings | Verdict |
|--------|------|--------|----------|---------|
| CEO | 1 | ✅ | Migrations 008+009 zusammenlegen → angenommen | PASS — Scope solide, Friction-Removal-Theme korrekt |
| Eng | 1 | ✅ | timerStore-Refactor explizit, transparent-Fallback dokumentiert, Tags-Index droppen, Smoke-Test scope-down → alle angenommen | PASS — Risiken adressiert |
| Design | 1 | ✅ | Tag-Hash-Farben angenommen, Mini hover-state + native Font in PR-B-Issue, Quicknote-Progress-Bar in PR D | PASS — visual conventions klar |
| DX | 1 | ✅ | electron.vite.config-Update als erster B-Commit, Suite-Wachstum +15 Tests akzeptabel | PASS — Build-Time-Impact tolerierbar |
