# TODOS

Deferred items from plan reviews. Items here have explicit decisions — they are NOT forgotten, they are scheduled.

## Open Issues

- **#87 — UI centering across views** (Optional polish) — Basiszentrierung implementiert in v1.8.1 (`max-w-4xl mx-auto` auf SettingsView-Wrapper). Optional: pixelgenaue Werte via `max-w-[740px]` / `max-w-[600px]` statt Tailwind-Tokens für Today/Timer/Calendar/Clients. → v2.0 candidate.

### Deferred from #75 /autoplan Phase 1 (CEO Cherry-Picks)

- **E1 — Auto-color-shift für Projekte** (Low effort, Low risk) — Projektfarbe automatisch aus Kundenfarbe ableiten (Helligkeitsverschiebung), statt manuelle Farbwahl im Project-Modal. Visual coherence pro Kunde. → v1.9.x oder v2.0.
- **E3 — Projekt-Budget-Warnung** (Medium effort, Low risk) — Read-only "X von Y Stunden verbraucht"-Anzeige im Project-Modal und in TodayView. Setzt Stundenkontingent pro Projekt voraus. → v2.0.
- **E5 — Project-Quick-Stats in ClientsView** (Low effort, Low risk) — Pro Projekt: Eintragsanzahl + letzte Aktivität neben dem Projektnamen in der Sub-Liste. → v1.9.x.

## Resolved in v1.9.0

- ~~**#75 — Projekte pro Kunde**~~ — Abgeschlossen (v1.9.0, 2026-05-02): Migration 012, `projects`-Tabelle, vollständige CRUD-UI in ClientsView, projektbewusste Timer/Today/Calendar/EntryEditForm, projektgefilterter PDF- + CSV-Export. **Completed:** v1.9.0

## Blocking v1.7 — RESOLVED

- ~~**Workflow-Gap: Stundennachweis vor Rechnung**~~ — Implementiert (2026-04-27): `pdfMergeValidation.ts`, `pdfMergeHandlers.ts`, `PdfMergeModal.tsx`, CalendarView trigger. 201 Tests grün, 0 TS-Fehler.
- ~~**Test-Isolation: gespiegelte Validierungslogik**~~ — Behoben: Extraktion nach `pdfMergeValidation.ts`, Umbennung `validateInvoicePath` → `validatePdfPath`, ipc.test.ts importiert nun aus shared module.

## Deferred from v1.7 (/autoplan 2026-04-26)

- **Auto-detect watched folder for invoices** (Medium effort) — Instead of a file picker, watch a user-configured folder (Lexware default export path) and auto-pick the most recent PDF. Eliminates the file picker entirely. Blocked by: unvalidated assumption about Lexware/sevDesk folder conventions. Validate with 2–3 users before building. → v1.9 candidate.
- **Multi-invoice support** (Low priority) — Attach multiple Stundennachweise to a single invoice, or vice versa. Surfaces when agencies/multi-project freelancers use the feature. → Post-v1.8 based on user feedback.
- ~~**Preview before merge**~~ — Included in v1.7 via `pdf:pdf-info` handler + page count row in `PdfMergeModal`. Removed from backlog.
- ~~**Full i18n DE/EN pass**~~ — Shipped in v1.8.0. All views, components and mini-widget migrated.
- **Competitive positioning** — Reframe around local-first data ownership, not PDF glue layer. Invoicing tools (Billomat, sevDesk) are building native time-report attachment. TimeTrack's durable advantage is privacy-first local record-of-truth. → v1.9 strategy review.
- **Merge modal: Nav sidebar trigger** (Low) — `PdfMergeModal` is currently only accessible via the CalendarView pill row. Users not in CalendarView can't discover the merge feature. Add a second trigger to the nav sidebar or a global toolbar. → v1.9.
- **Handler extraction: pdf:merge-export** (Medium) — `pdf:merge-export` in `ipc.ts` uses the same inline handler pattern as the new handlers. Now that `pdfMergeHandlers.ts` establishes the injectable-deps pattern, apply it retroactively to `pdf:merge-export`. → post-v1.8.
- **Type guard hygiene: `filePath` input in PDF handlers** (Low) — `pdfInfoHandler` and `mergeOnlyHandler` cast `r.filePath as string` without an explicit `typeof r.filePath !== 'string'` check. Both fail safely today. Identified by `/cso` audit 2026-04-27. → v1.9 candidate.
