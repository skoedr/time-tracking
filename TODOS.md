# TODOS

Deferred items from plan reviews. Items here have explicit decisions — they are NOT forgotten, they are scheduled.

## Blocking v1.7 — RESOLVED

- ~~**Workflow-Gap: Stundennachweis vor Rechnung**~~ — Implementiert (2026-04-27): `pdfMergeValidation.ts`, `pdfMergeHandlers.ts`, `PdfMergeModal.tsx`, CalendarView trigger. 201 Tests grün, 0 TS-Fehler.
- ~~**Test-Isolation: gespiegelte Validierungslogik**~~ — Behoben: Extraktion nach `pdfMergeValidation.ts`, Umbennung `validateInvoicePath` → `validatePdfPath`, ipc.test.ts importiert nun aus shared module.

## Deferred from v1.7 (/autoplan 2026-04-26)

- **Auto-detect watched folder for invoices** (Medium effort) — Instead of a file picker, watch a user-configured folder (Lexware default export path) and auto-pick the most recent PDF. Eliminates the file picker entirely. Blocked by: unvalidated assumption about Lexware/sevDesk folder conventions. Validate with 2–3 users before building. → v1.8 candidate.
- **Multi-invoice support** (Low priority) — Attach multiple Stundennachweise to a single invoice, or vice versa. Surfaces when agencies/multi-project freelancers use the feature. → Post-v1.7 based on user feedback.
- ~~**Preview before merge**~~ — Included in v1.7 via `pdf:pdf-info` handler + page count row in `PdfMergeModal`. Removed from backlog.
- **Full i18n DE/EN pass** — TodayView, TimerView, CalendarView, ClientsView + all modals. Currently only UpdateBanner + SettingsView are migrated. → v1.8.
- **Competitive positioning** — Reframe v1.8 around local-first data ownership, not PDF glue layer. Invoicing tools (Billomat, sevDesk) are building native time-report attachment. TimeTrack's durable advantage is privacy-first local record-of-truth. → v1.8 strategy review.
- **Merge modal: Nav sidebar trigger** (Low) — `PdfMergeModal` is currently only accessible via the CalendarView pill row. Users not in CalendarView can't discover the merge feature. Add a second trigger to the nav sidebar or a global toolbar. Context: outside voice in /plan-eng-review flagged discoverability; design doc Open Question #3. → v1.8.
- **Handler extraction: pdf:merge-export** (Medium) — `pdf:merge-export` in `ipc.ts:659` uses the same inline handler pattern as the new handlers. Now that `pdfMergeHandlers.ts` establishes the injectable-deps pattern, apply it retroactively to `pdf:merge-export` so all PDF handlers have automated test coverage. Depends on: v1.7 landing first. → post-v1.7.
