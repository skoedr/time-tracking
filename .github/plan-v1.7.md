# v1.7 — PDF-Merge (Hero-Feature)

> **Nordstern:** Der einzige OSS-Pitch-Satz, den die App tragen muss: „TimeTrack
> erstellt deinen Stundennachweis und heftet ihn an deine Lexware-/sevDesk-/
> Billomat-Rechnung — in einem Klick."

## Theme

Freelancers who invoice via Lexware, sevDesk, or Billomat export a PDF invoice,
then manually open Smallpdf / iLovePDF / Acrobat to append the Stundennachweis.
TimeTrack v1.7 eliminates that second tool entirely.

**Ship criterion:** Maintainer replaces his own Lexware workflow (export PDF → open
Smallpdf → merge → save) with this feature and uses it for one full billing cycle.
A test freelancer with a Lexware PDF can do it in under 30 seconds.

---

## Scope

### In scope

1. **`pdfMerge.ts`** — New main-process module. Pure function: takes two PDF buffers
   (Stundennachweis + invoice), uses `pdf-lib` to concatenate, returns merged buffer.
   Merge order configurable (Stundennachweis vorne / hinten, default: hinten).

2. **`PdfExportModal.tsx`** — New checkbox "An bestehende Rechnungs-PDF anhängen"
   (hidden unless `pdf_merge_enabled` setting is on). When checked: show a file picker
   button to select the invoice PDF. After PDF is generated, call new IPC
   `pdf:merge-export` instead of `pdf:export`.

3. **`ipc.ts`** — New handler `pdf:merge-export`. Receives the standard export request
   plus `invoicePath: string`. Renders the Stundennachweis, loads the invoice PDF,
   merges via `pdfMerge.ts`, saves as
   `<invoiceDir>/<invoiceBasename>_inkl_Stundennachweis.pdf`. Invoice original is
   never modified. Returns `{ path: string }`.

4. **Settings toggle** — `SettingsView.tsx`, section "Export → Rechnungs-Anhang".
   Toggle activates the merge checkbox in PdfExportModal. Default off.
   Second setting: merge order (Stundennachweis vorne / hinten).

5. **`shared/types.ts`** — Extend `Settings` with `pdf_merge_enabled: string` and
   `pdf_merge_order: string`.

6. **Migration 009** — Seeds `pdf_merge_enabled='0'` and `pdf_merge_order='append'`
   (append = Stundennachweis hinten) via `INSERT OR IGNORE`. Pre-migration backup.

7. **`src/preload/index.d.ts`** — Extend `window.api.pdf` with `mergeExport()`.

8. **Tests** — Unit tests for `pdfMerge.ts` (merge two minimal PDFs, verify page
   count, verify order). Integration test: `pdf:merge-export` IPC handler with a
   real PDF fixture. Validation error tests (invalid PDF input → Toast, not crash).

### Not in scope

- Google Drive / Dropbox auto-upload of the merged PDF
- Batch-merge (multiple invoices at once)
- Editing PDF metadata (author, title, creation date) on the merged output
- Drag-and-drop reorder of pages within the merged document
- Preview of the merged document before saving
- Pomodoro mode, i18n full pass, Outlook integration (v1.8/v2.0)

---

## New Dependency

`pdf-lib` — pure JS, ~150 KB gzipped, MIT license. No native modules, no Chromium,
no server. Handles PDF parsing + page insertion without touching the filesystem.

```bash
pnpm add pdf-lib
```

Why not `pdfkit`: that builds new PDFs from scratch. We're combining two existing
PDFs, which is `pdf-lib`'s sweet spot.

Why not `hummus`/`node-poppler`: native modules. Would require electron-rebuild,
adding CI complexity. pdf-lib is pure JS — no rebuild step.

---

## Architecture

### New file: `src/main/pdfMerge.ts`

```typescript
import { PDFDocument } from 'pdf-lib'

export type MergeOrder = 'append' | 'prepend'

/**
 * Merge two PDF buffers. Returns a new buffer containing all pages
 * from both documents in the specified order.
 * Throws if either buffer is not a valid PDF.
 */
export async function mergePdfs(
  stundennachweis: Buffer,
  invoice: Buffer,
  order: MergeOrder = 'append'
): Promise<Buffer> {
  const [sDoc, iDoc] = await Promise.all([
    PDFDocument.load(stundennachweis),
    PDFDocument.load(invoice)   // throws if not valid PDF
  ])
  const merged = await PDFDocument.create()
  const first = order === 'append' ? iDoc : sDoc
  const second = order === 'append' ? sDoc : iDoc
  const firstPages = await merged.copyPages(first, first.getPageIndices())
  const secondPages = await merged.copyPages(second, second.getPageIndices())
  firstPages.forEach(p => merged.addPage(p))
  secondPages.forEach(p => merged.addPage(p))
  const bytes = await merged.save()
  return Buffer.from(bytes)
}
```

### Modified: `src/main/ipc.ts`

New handler `pdf:merge-export`:

```typescript
ipcMain.handle(
  'pdf:merge-export',
  async (_e, req: PdfRequest & { invoicePath: string }): Promise<IpcResult<{ path: string }>> => {
    // 1. Validate invoicePath is an existing file
    // 2. Build Stundennachweis buffer (same as pdf:export but no save dialog)
    // 3. Read invoice buffer from invoicePath
    // 4. Merge via mergePdfs()
    // 5. Derive output path: <invoiceDir>/<stem>_inkl_Stundennachweis.pdf
    // 6. writeFileSync(outputPath, mergedBuffer)
    // 7. Return ok({ path: outputPath })
  }
)
```

The existing `pdf:export` handler is unchanged — merge is a new IPC channel, not
a modification. This avoids regressions in the existing PDF path.

### Modified: `src/renderer/src/components/PdfExportModal.tsx`

State additions:
```typescript
const [mergeEnabled, setMergeEnabled] = useState(false)   // from settings
const [invoicePath, setInvoicePath] = useState<string | null>(null)
```

UI additions (only shown when `settings.pdf_merge_enabled === '1'`):
```tsx
<label className="flex items-start gap-2 text-sm text-zinc-300">
  <input type="checkbox" checked={mergeEnabled} onChange={...} />
  <span>
    An bestehende Rechnungs-PDF anhängen
    <span className="block text-xs text-zinc-500">
      Stundennachweis wird am Ende der gewählten PDF angefügt.
    </span>
  </span>
</label>
{mergeEnabled && (
  <div className="flex items-center gap-2">
    <button onClick={handlePickInvoice} ...>Rechnung wählen …</button>
    {invoicePath && <span className="truncate text-xs text-zinc-400">{basename(invoicePath)}</span>}
  </div>
)}
```

Export button behaviour: if `mergeEnabled && invoicePath`, calls
`window.api.pdf.mergeExport({...req, invoicePath})`, otherwise existing
`window.api.pdf.export(req)`.

### Modified: `src/renderer/src/views/SettingsView.tsx`

New section under existing "Export" or at end of settings:

```
┌─ Rechnungs-Anhang ─────────────────────────────────────────┐
│ □  Merge-Funktion im PDF-Export aktivieren                 │
│    (zeigt Checkbox im Export-Dialog)                        │
│                                                             │
│ Reihenfolge:  ● Stundennachweis hinten  ○ Stundennachweis  │
│                   (Standard)                vorne           │
└────────────────────────────────────────────────────────────┘
```

### Migration 009

```typescript
// src/main/migrations/009_pdf_merge_settings.ts
export const migration009 = {
  version: 9,
  description: 'Seed pdf_merge_enabled and pdf_merge_order settings',
  up(db: Database.Database): void {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('pdf_merge_enabled', '0')`).run()
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('pdf_merge_order', 'append')`).run()
  }
}
```

---

## Data Flow

```
User clicks "PDF speichern" with merge enabled
  │
  ├─ mergeEnabled=true, invoicePath set
  │
  ▼
window.api.pdf.mergeExport({ clientId, fromIso, toIso, ..., invoicePath })
  │
  ▼
ipc.ts: pdf:merge-export handler
  ├─ validateInvoicePath(invoicePath)         → fail if not .pdf or not exists
  ├─ buildPdfPayload(db, req, logoDataUrl)
  ├─ buildPdfHtml(payload)
  ├─ renderPdfBuffer({ html })               → Buffer (Stundennachweis)
  ├─ readFileSync(invoicePath)               → Buffer (Rechnung)
  ├─ mergePdfs(stundennachweis, invoice, order)
  ├─ writeFileSync(outputPath, merged)
  └─ return ok({ path: outputPath })
        │
        ▼
PdfExportModal: statusMsg = "PDF gespeichert: <outputPath>"
```

---

## PR Strategy

Single PR: `feat/v1.7-pdf-merge`

One PR is correct here. The merge logic, IPC handler, UI change, settings, and
migration are all tightly coupled. Splitting artificially would mean PR A has a
settings toggle that toggles nothing. The full feature is ~4 files + 1 migration
+ tests — well within "one logical change, one PR" guideline.

---

## Test Plan

| Test | File | Type | Priority |
|------|------|------|----------|
| `mergePdfs`: two valid PDFs → output has sum of pages | `pdfMerge.test.ts` | Unit | P1 |
| `mergePdfs`: order='append' → invoice pages first | `pdfMerge.test.ts` | Unit | P1 |
| `mergePdfs`: order='prepend' → stundennachweis pages first | `pdfMerge.test.ts` | Unit | P1 |
| `mergePdfs`: invalid PDF buffer → throws | `pdfMerge.test.ts` | Unit | P1 |
| `pdf:merge-export` IPC: valid request → merged file written | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` IPC: invoicePath not found → IpcResult.error | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` IPC: invoicePath is not a PDF → IpcResult.error | `ipc.test.ts` | Integration | P1 |
| `pdf:export` IPC: unchanged behaviour (regression) | `ipc.test.ts` | Integration | P1 |
| Migration 009: seeds both keys idempotently | `migrations/` | Unit | P2 |

Fixture: generate a minimal 1-page PDF buffer in tests using `pdf-lib` itself
(avoids binary test fixtures in the repo).

---

## Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Invoice PDF is password-protected | pdf-lib throws → Toast "Datei ist passwortgeschützt oder beschädigt" |
| Invoice PDF is corrupt/truncated | pdf-lib throws → Toast "Datei ist keine gültige PDF" |
| Invoice PDF path no longer exists at merge time | `existsSync` check → fail before loading |
| Output path not writable (OneDrive sync lock) | writeFileSync throws → Toast "Konnte Datei nicht speichern: <reason>" |
| Invoice has 0 pages (valid PDF, no content) | Merge proceeds, output = stundennachweis only |
| Stundennachweis has 0 entries | Merge proceeds (renderPdfBuffer returns valid empty-state PDF) |

---

## Effort Estimate

S–M. Single PR.

- `pdfMerge.ts`: ~50 lines
- `ipc.ts` addition: ~40 lines
- `PdfExportModal.tsx` change: ~50 lines
- `SettingsView.tsx` change: ~40 lines
- `index.d.ts` change: ~10 lines
- `types.ts` change: ~2 lines
- `migration 009`: ~20 lines
- Tests: ~120 lines

Total: ~330 lines new/changed. One week is conservative.

---

## Key Changes from /autoplan Review

### CEO Review decisions
- **Settings toggle removed.** Checkbox always-visible in PdfExportModal (like `includeSignatures`). No SettingsView changes. No migration needed.
- **Migration 009 dropped.** No settings keys → no schema change at all.
- **Merge-order setting cut.** Default: Stundennachweis appended at end (industry norm). No radio buttons.
- **Label:** "An Rechnung anhängen" (neutral, works for all workflow orders).
- **Scope change to `PdfMerge` UI:** Settings section removed from scope. SettingsView changes removed.

### Security fixes (from Eng Review)
- **Path traversal guard:** `validateInvoicePath()` must check `path.resolve(p)` and ensure extension is `.pdf` (case-insensitive via `.toLowerCase()`). Pattern from existing `backup:restore` handler.
- **File size cap:** validate `invoiceBuffer.length < 50 * 1024 * 1024` before loading into pdf-lib.
- **Input file lock:** wrap `readFileSync(invoicePath)` in try/catch, surface EBUSY/EPERM clearly.
- **Output collision on read-only dir:** if `writeFileSync` throws EPERM, fall back to `showSaveDialog` with derived filename pre-filled.

### Architecture fixes
- **Migration format:** `migration009` removed entirely (no settings to seed).
- **Extension-agnostic stem:** use `path.parse(invoicePath).name` not `path.basename(f, '.pdf')` — handles `.PDF` uppercase on Windows.

### Design additions
- **Missing interaction states:** busy=merge state ("Erstellt zusammengeführte PDF …"), picker-cancelled state (silent reset), no-file-selected hint text ("keine Datei gewählt").
- **Error messages include filename** for actionable context.

---

## Updated Architecture

### New file: `src/main/pdfMerge.ts`

```typescript
import { PDFDocument } from 'pdf-lib'

export type MergeOrder = 'append' | 'prepend'

export async function mergePdfs(
  stundennachweis: Buffer,
  invoice: Buffer,
  order: MergeOrder = 'append'
): Promise<Buffer> {
  const [sDoc, iDoc] = await Promise.all([
    PDFDocument.load(stundennachweis),
    PDFDocument.load(invoice)  // throws if invalid PDF
  ])
  const merged = await PDFDocument.create()
  const first = order === 'append' ? iDoc : sDoc
  const second = order === 'append' ? sDoc : iDoc
  const firstPages = await merged.copyPages(first, first.getPageIndices())
  const secondPages = await merged.copyPages(second, second.getPageIndices())
  firstPages.forEach(p => merged.addPage(p))
  secondPages.forEach(p => merged.addPage(p))
  return Buffer.from(await merged.save())
}
```

### Modified: `src/main/ipc.ts` — new handler `pdf:merge-export`

```typescript
ipcMain.handle(
  'pdf:merge-export',
  async (_e, req: PdfRequest & { invoicePath: string }): Promise<IpcResult<{ path: string }>> => {
    try {
      if (!req?.invoicePath) return fail('Kein Rechnungspfad angegeben')
      const resolved = path.resolve(req.invoicePath)
      // Security: extension check (case-insensitive)
      if (path.extname(resolved).toLowerCase() !== '.pdf') return fail('Datei ist keine PDF')
      if (!existsSync(resolved)) return fail('Datei nicht gefunden')

      let invoiceBuffer: Buffer
      try {
        invoiceBuffer = readFileSync(resolved)
      } catch (e: any) {
        if (e.code === 'EBUSY' || e.code === 'EPERM')
          return fail(`Datei ist durch ein anderes Programm gesperrt: ${path.basename(resolved)}`)
        return fail(e)
      }
      if (invoiceBuffer.length > 50 * 1024 * 1024) return fail('Rechnungs-PDF zu groß (max. 50 MB)')

      // ... build stundennachweis payload + render (same as pdf:export, no save dialog)
      const payload = buildPdfPayload(db, req, logoDataUrl)
      const snBuffer = await renderPdfBuffer({ html: buildPdfHtml(payload) })
      const merged = await mergePdfs(snBuffer, invoiceBuffer, 'append')
      log.debug('[pdf:merge-export] merged', { snPages: ..., invPages: ..., outputBytes: merged.length })

      // Derive output path: <invoiceDir>/<stem>_inkl_Stundennachweis.pdf
      const { dir, name } = path.parse(resolved)
      const outputPath = path.join(dir, `${name}_inkl_Stundennachweis.pdf`)

      try {
        writeFileSync(outputPath, merged)
        return ok({ path: outputPath })
      } catch (writeErr: any) {
        if (writeErr.code === 'EPERM' || writeErr.code === 'EACCES') {
          // Fallback: let user choose output path
          const fallback = await dialog.showSaveDialog({
            title: 'Zusammengeführte PDF speichern',
            defaultPath: path.basename(outputPath),
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
          })
          if (fallback.canceled || !fallback.filePath) return fail('Speichern abgebrochen')
          writeFileSync(fallback.filePath, merged)
          return ok({ path: fallback.filePath })
        }
        return fail(writeErr)
      }
    } catch (e) {
      return fail(e)
    }
  }
)
```

### Modified: `src/renderer/src/components/PdfExportModal.tsx`

Additional state:
```typescript
const [mergeInvoice, setMergeInvoice] = useState(false)
const [invoicePath, setInvoicePath] = useState<string | null>(null)
```

New UI block (after existing checkboxes, before status message):
```tsx
<label className="flex items-start gap-2 text-sm text-zinc-300">
  <input
    type="checkbox"
    checked={mergeInvoice}
    onChange={(e) => { setMergeInvoice(e.target.checked); if (!e.target.checked) setInvoicePath(null) }}
    disabled={busy}
    className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-400 focus:ring-offset-0"
  />
  <span>
    An Rechnung anhängen
    <span className="block text-xs text-zinc-500">
      Stundennachweis wird am Ende der gewählten PDF angefügt. Original bleibt unverändert.
    </span>
  </span>
</label>
{mergeInvoice && (
  <div className="ml-6 flex items-center gap-2">
    <button
      type="button"
      onClick={handlePickInvoice}
      disabled={busy}
      aria-label="Rechnung-PDF auswählen"
      className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
    >
      {invoicePath ? 'Rechnung wechseln …' : 'Rechnung wählen …'}
    </button>
    <span className="truncate text-xs text-zinc-500 max-w-[200px]">
      {invoicePath ? path.basename(invoicePath) : 'keine Datei gewählt'}
    </span>
  </div>
)}
```

Export button logic:
```typescript
async function handleExport(): Promise<void> {
  // ...existing validation...
  if (mergeInvoice && !invoicePath) {
    setStatusKind('error'); setStatusMsg('Bitte eine Rechnung-PDF auswählen.'); return
  }
  const req = { clientId, fromIso, toIso, includeSignatures, groupByTag }
  const res = mergeInvoice && invoicePath
    ? await window.api.pdf.mergeExport({ ...req, invoicePath })
    : await window.api.pdf.export(req)
  // ...existing status handling...
}
```

### Schema changes: NONE

No migration. No new settings keys. Cleanest possible diff.

### Modified: `src/shared/types.ts`
No changes. (Settings keys removed from scope.)

### Modified: `src/preload/index.d.ts`
```typescript
pdf: {
  export(req: { clientId: number; fromIso: string; toIso: string; includeSignatures?: boolean; groupByTag?: boolean }): Promise<IpcResult<{ path: string }>>
  mergeExport(req: { clientId: number; fromIso: string; toIso: string; includeSignatures?: boolean; groupByTag?: boolean; invoicePath: string }): Promise<IpcResult<{ path: string }>>
}
```

---

## Updated Failure Modes

| Scenario | Behaviour |
|----------|-----------|
| Invoice PDF password-protected | pdf-lib throws → Toast "Datei ist passwortgeschützt: [filename]" |
| Invoice PDF corrupt/truncated | pdf-lib throws → Toast "Datei ist keine gültige PDF: [filename]" |
| Invoice PDF path not found | `existsSync` check → Toast "Datei nicht gefunden" |
| Invoice PDF locked (EBUSY/EPERM on read) | try/catch → Toast "Datei ist durch ein anderes Programm gesperrt: [filename]" |
| Invoice file >50MB | size check → Toast "Rechnungs-PDF zu groß (max. 50 MB)" |
| Path traversal attempt | extension + resolve check → Toast "Datei ist keine PDF" |
| Output dir read-only (EPERM on write) | fallback to showSaveDialog with pre-filled name |
| Picker cancelled | Silent — `setInvoicePath(null)`, no error |
| Invoice has 0 pages | Merge proceeds, output = stundennachweis only |

---

## Updated PR Strategy

Single PR: `feat/v1.7-pdf-merge`

Files touched:
1. `src/main/pdfMerge.ts` — NEW (~60 lines)
2. `src/main/pdfMerge.test.ts` — NEW (~80 lines)
3. `src/main/ipc.ts` — EXTEND (~60 lines added)
4. `src/main/ipc.test.ts` — EXTEND (pdf:merge-export suite, ~80 lines)
5. `src/renderer/src/components/PdfExportModal.tsx` — EXTEND (~60 lines)
6. `src/preload/index.ts` — EXTEND (~10 lines: add mergeExport handler)
7. `src/preload/index.d.ts` — EXTEND (~5 lines: type declaration)

Total: ~7 files, ~355 lines new/changed. No schema change. No migration.

---

## Updated Test Plan

| Test | File | Type | P |
|------|------|------|---|
| `mergePdfs` valid A+B append → page count = sum | `pdfMerge.test.ts` | Unit | P1 |
| `mergePdfs` append → invoice pages first | `pdfMerge.test.ts` | Unit | P1 |
| `mergePdfs` prepend → SN pages first | `pdfMerge.test.ts` | Unit | P1 |
| `mergePdfs` corrupt invoice buffer → throws | `pdfMerge.test.ts` | Unit | P1 |
| `pdf:merge-export` valid → file written, returns path | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` invoicePath not found → error | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` not `.pdf` extension → error | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` path traversal → error | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` file >50MB → error | `ipc.test.ts` | Integration | P1 |
| `pdf:merge-export` locked invoice → EBUSY error | `ipc.test.ts` | Integration | P2 |
| `pdf:merge-export` output EPERM → fallback dialog | `ipc.test.ts` | Integration | P2 |
| `pdf:export` regression: unchanged behaviour | `ipc.test.ts` | Integration | P1 |

Fixture strategy: generate minimal 1-page and 2-page PDFs via `pdf-lib` in test setup. No binary files in repo.

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|----------------|-----------|-----------|
| 1 | CEO | Remove settings toggle + settings keys | Mechanical (user confirmed) | P5+P3 | Both models agreed, user confirmed in premise gate. Simpler code, better discoverability. |
| 2 | CEO | Remove merge-order setting (default: append) | Mechanical | P5 | Cut unnecessary scope. Append is industry norm. |
| 3 | CEO | Neutral label "An Rechnung anhängen" | Mechanical | P3 | Workflow varies, neutral framing works for all. |
| 4 | CEO | No Migration 009 (settings gate removed = no settings keys) | Mechanical | P5 | Zero schema change. Cleaner diff. |
| 5 | CEO | Create TODOS.md with deferred items | Mechanical | P1 | Vague intentions are lies. |
| 6 | Eng | Add path traversal guard (resolve + ext check) | Mechanical | P1+P5 | Existing backup:restore pattern already in codebase. |
| 7 | Eng | Add 50MB file size cap before readFileSync | Mechanical | P1 | Prevents OOM on malicious/large PDFs. |
| 8 | Eng | Add EBUSY/EPERM handling on invoice read | Mechanical | P1 | Plan only covered output locking, not input. |
| 9 | Eng | EPERM on write → fallback showSaveDialog | Mechanical | P1 | Invoice in read-only corp dir = real scenario, user has no recovery otherwise. |
| 10 | Eng | Fix migration format → raw SQL (migration removed anyway) | Mechanical | P5 | Would have caused crash-on-launch. Moot since migration dropped. |
| 11 | Eng | Use path.parse().name for stem derivation | Mechanical | P5 | path.basename(.pdf) breaks on .PDF (Windows Explorer). |
| 12 | Design | Add 4 missing interaction states | Mechanical | P1 | Completeness — missing states are user-visible failures. |
| 13 | Design | Error messages include filename | Mechanical | P5 | Actionable context over generic message. |
| 14 | Design | Add aria-label on file picker button | Mechanical | P1 | Accessibility — keyboard users need label. |

---

## GSTACK REVIEW REPORT

| Review | Status | Issues | Voices | Commit |
|--------|--------|--------|--------|--------|
| plan-ceo-review | ✅ clean | 0 unresolved | subagent-only | 92fd158 |
| plan-design-review | ✅ clean | 0 unresolved | subagent-only | 92fd158 |
| plan-eng-review | ✅ clean | 11 found, 0 unresolved | subagent-only | 92fd158 |
| autoplan-voices (ceo) | ✅ clean | 2/6 confirmed, 4 resolved | subagent-only | 92fd158 |
| autoplan-voices (design) | ✅ clean | 5/6 confirmed | subagent-only | 92fd158 |
| autoplan-voices (eng) | ✅ clean | 4/6 confirmed | subagent-only | 92fd158 |

**Verdict:** APPROVED 2026-04-26 — ready for /ship
