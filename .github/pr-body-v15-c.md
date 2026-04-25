## Summary

Closes #18

Replaces the PDF-only `PdfExportModal` with a unified `ExportModal` component that has a **PDF | CSV** tab toggle. Both tabs share the same client / date-range pickers so switching never resets the selection.

## Changes

### New: `src/shared/csv.ts`
Pure formatter. Produces UTF-8 + BOM CSV with CRLF line endings.
- Columns: Datum, Start, Ende, Dauer, Kunde, Beschreibung, Tags, Stundensatz, Betrag
- **DE format** — field sep `;`, decimal `,` (Excel DE)
- **US format** — field sep `,`, decimal `.` (DATEV)
- Tags are `|`-separated to avoid conflict with the field separator
- RFC-4180 quoting: fields containing sep / `"` / newline are wrapped in `"..."`; `"` → `""`

### New: `src/shared/csv.test.ts`
16 unit tests — BOM, CRLF, header, empty, running-entry skip, DE/US format, Betrag calc, empty rate, tags, escape variants, unknown client, midnight-split rows.

### New: `src/main/csvExport.ts`
IPC handler. Queries DB entries by clientId + range (stopped_at IS NOT NULL), opens native Save-dialog with default filename `Zeiterfassung-{safeName}-{YYYY-MM}.csv`, writes UTF-8.

### Modified: `src/main/ipc.ts`
Registers `csv:export` channel.

### Modified: `src/preload/index.ts` + `index.d.ts`
Exposes `window.api.csv.export(req)` to the renderer with full types.

### New: `src/renderer/src/components/ExportModal.tsx`
Unified modal, two tabs:
- **PDF tab** — existing Stundennachweis flow unchanged
- **CSV tab** — DE / US format radio buttons + explanatory hint

Old component re-exported as `PdfExportModal` for backward compatibility.

### Modified: `src/renderer/src/views/CalendarView.tsx`
Imports `ExportModal` instead of `PdfExportModal`; renders `<ExportModal>`.

### Modified: `CHANGELOG.md`
CSV-Export entry added under `[Unreleased] — v1.5`.

## Test results
```
Test Files  15 passed (15)
     Tests  136 passed | 51 skipped (187)
```
`pnpm typecheck` — clean.
