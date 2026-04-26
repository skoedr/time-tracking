# TODOS

Deferred items from plan reviews. Items here have explicit decisions — they are NOT forgotten, they are scheduled.

## Deferred from v1.7 (/autoplan 2026-04-26)

- **Auto-detect watched folder for invoices** (Medium effort) — Instead of a file picker, watch a user-configured folder (Lexware default export path) and auto-pick the most recent PDF. Eliminates the file picker entirely. Blocked by: unvalidated assumption about Lexware/sevDesk folder conventions. Validate with 2–3 users before building. → v1.8 candidate.
- **Multi-invoice support** (Low priority) — Attach multiple Stundennachweise to a single invoice, or vice versa. Surfaces when agencies/multi-project freelancers use the feature. → Post-v1.7 based on user feedback.
- **Preview before merge** (Low priority) — Show page count of both PDFs before merging. Nice-to-have; the deterministic output path makes this optional. → Post-v1.7.
- **Full i18n DE/EN pass** — TodayView, TimerView, CalendarView, ClientsView + all modals. Currently only UpdateBanner + SettingsView are migrated. → v1.8.
- **Competitive positioning** — Reframe v1.8 around local-first data ownership, not PDF glue layer. Invoicing tools (Billomat, sevDesk) are building native time-report attachment. TimeTrack's durable advantage is privacy-first local record-of-truth. → v1.8 strategy review.
