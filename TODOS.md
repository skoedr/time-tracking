# TODOS

Deferred items from plan reviews. Items here have explicit decisions — they are NOT forgotten, they are scheduled.

## Open Issues

- **#87 — UI centering across views** (Optional polish) — Basiszentrierung implementiert in v1.8.1 (`max-w-4xl mx-auto` auf SettingsView-Wrapper). Optional: pixelgenaue Werte via `max-w-[740px]` / `max-w-[600px]` statt Tailwind-Tokens für Today/Timer/Calendar/Clients. → v2.0 candidate.

- **#93 — Auswertungs-Tab (Analytics Dashboard)** — Implementierung in `feat/v1.10-analytics` geplant. Scope definiert via /plan-ceo-review + /plan-eng-review (2026-05-11). CEO-Plan: `~/.gstack/projects/time-tracking/ceo-plans/2026-05-11-v1.10-analytics.md`. **In v1.10 Scope:** Neuer Auswertungs-Tab, Monatsnavigation, Stat-Cards (Stunden/Umsatz/Billable%), DeltaPills, TrendChart (Wochen+Monate-Toggle), ClientBars, WeekdayBars, EmptyState. **Deferred aus v1.10:** Tags-Panel (#93-follow-up), Hochrechnung/Forecast-KPI (#93-follow-up), PaceBlock (benötigt Settings-Schema-Change → v1.11 candidate).

- **#94 — Stammdaten-Erweiterung Kunden + Projekte** — Rechnungsadresse + USt-IdNr. für PDF-Stundennachweis-Empfängerblock; Projektnummer, Stundenkontingent, Abrechnungstyp, Projektstatus. Kein Rechnungsfeature — nur Stundennachweis.

### Deferred from #79 /autoplan Final Gate (v1.9.5)

- **T1 — UNC-Pfad-Support für Backup-Pfad** (Medium effort) — Wenn `backup_path` ein UNC-Pfad (z.B. `\\nas01\backups`) ist, soll eine explizite Fehlermeldung erscheinen wenn der Pfad nicht erreichbar ist, statt silent fail. `mkdirSync` auf UNC unter Windows benötigt gesondertes Handling. → v1.10

- **#96 — Quick Start 2.0: Last-Used Combo + Press-and-Hold Project Fan** — Pill zeigt letztes genutztes Projekt als Subtitle; Tap = sofort starten, Press & Hold (~300ms) = radialer Fächer öffnet sich mit allen Projekten des Kunden. Mini-Widget: nur Tap (kein Fächer). Keine neue DB-Tabelle nötig (letztes Projekt aus entries-History). → v1.10

### Deferred from #75 /autoplan Phase 1 (CEO Cherry-Picks)

~~- **E1 — Auto-color-shift für Projekte**~~ → Resolved in v1.9.6

~~- **E5 — Project-Quick-Stats in ClientsView**~~ → Resolved in v1.9.6

### Design-Gespräche ausstehend

- **Merge modal Nav-Trigger** — PdfMergeModal ist nur via CalendarView erreichbar. Zweiter Einstiegspunkt in Sidebar oder ExportModal. Design-Gespräch ausstehend.
- **Competitive positioning** — README + App-Beschreibung auf LocalFirst / Datenschutz / Kein-Abo schärfen. Kein Code, nur Text. Gespräch ausstehend.

### Nächster Hotfix (technisches Housekeeping)

- **Handler extraction: pdf:merge-export** — `pdf:merge-export` in `ipc.ts` noch im alten Inline-Stil; in `pdfMergeHandlers.ts`-Muster überführen für testbarere Struktur. Kein User-Value, aber sauberer.

## Resolved in v1.9.0

- ~~**#75 — Projekte pro Kunde**~~ — Abgeschlossen (v1.9.0, 2026-05-02): Migration 012, `projects`-Tabelle, vollständige CRUD-UI in ClientsView, projektbewusste Timer/Today/Calendar/EntryEditForm, projektgefilterter PDF- + CSV-Export. **Completed:** v1.9.0

## Blocking v1.7 — RESOLVED

- ~~**Workflow-Gap: Stundennachweis vor Rechnung**~~ — Implementiert (2026-04-27): `pdfMergeValidation.ts`, `pdfMergeHandlers.ts`, `PdfMergeModal.tsx`, CalendarView trigger. 201 Tests grün, 0 TS-Fehler.
- ~~**Test-Isolation: gespiegelte Validierungslogik**~~ — Behoben: Extraktion nach `pdfMergeValidation.ts`, Umbennung `validateInvoicePath` → `validatePdfPath`, ipc.test.ts importiert nun aus shared module.

## Deferred from v1.7 (/autoplan 2026-04-26)

- ~~**Auto-detect watched folder for invoices**~~ — Zurückgestellt indefinitely. Kein fixer Lexware/sevDesk-Standardpfad; Nutzen noch nicht validiert.
- **Multi-invoice support** (Low priority) — Attach multiple Stundennachweise to a single invoice, or vice versa. Surfaces when agencies/multi-project freelancers use the feature. → Post-v1.8 based on user feedback.
- ~~**Preview before merge**~~ — Included in v1.7 via `pdf:pdf-info` handler + page count row in `PdfMergeModal`. Removed from backlog.
- ~~**Full i18n DE/EN pass**~~ — Shipped in v1.8.0. All views, components and mini-widget migrated.
- ~~**Competitive positioning**~~ → Kein Issue, Gespräch ausstehend (siehe oben).
- ~~**Merge modal: Nav sidebar trigger**~~ → Kein Issue, Design-Gespräch ausstehend (siehe oben).
- **Handler extraction: pdf:merge-export** → Verschoben in »Nächster Hotfix« (siehe oben).
- **Type guard hygiene: `filePath` input in PDF handlers** (Low) — `pdfInfoHandler` und `mergeOnlyHandler` casten `r.filePath as string` ohne expliziten `typeof`-Check. Beide fallen sicher. → v1.9 candidate.
