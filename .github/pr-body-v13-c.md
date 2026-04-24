## Summary

PR C of v1.3 — the PDF Hero. Closes #16 (PDF-Stundennachweis) and #19
(Settings-Vorlage). Continues directly after #43 (PR A — Stundensatz +
Quick-Filter) and #44 (PR B — Cross-Midnight + JSON-Export) in the v1.3
sequential merge plan.

## What ships

**Hero flow (1 click):** `Calendar → 📄 Letzter Monat als PDF (oder Quick-Filter-Pille)
→ Modal mit vorbelegtem Kunde + Zeitraum → "PDF speichern" → Save-Dialog →
A4-PDF auf der Platte`. The modal is reusable from anywhere with optional
pre-fill.

**The PDF itself:** German Stundennachweis layout — Logo links + Sender
rechts oben, Titel "Stundennachweis", Kunde + Zeitraum, Tabelle mit
Datum/Von/Bis/Tätigkeit/Dauer und optional Honorar-Spalte (nur wenn der
Kunde einen `rate_cent > 0` hat), Summenzeile, Signatur-Zeile, Footer.
Akzentfarbe wird durchgängig angewandt; Stundensummen können optional auf
5/10/15/30 min gerundet werden.

**Settings → PDF-Vorlage:** Logo (Datei-Picker, max. 1 MB; PNG/JPG/SVG/WebP),
Absenderadresse (Multiline), Steuernummer, Akzentfarbe (Color-Picker),
Footer-Text, Stunden-Rundung. Logo wird ins `userData` kopiert
(stabiler Pfad `pdf-logo.<ext>`), beim Rendern als base64 `data:` URL
in die HTML eingebettet.

**Currency helpers** (`src/shared/currency.ts`): integer-cent math
(`feeCent(min, rateCent) = round(min × rateCent / 60)`), DE-Format
(`1.234,56 €`), `formatHoursMinutes(min)` (`H:MM`, negative-safe),
`roundMinutes(min, step)` (half-up; `step <= 0` = passthrough). 14 tests.

## Architectural deviation from the original v1.3 plan

The plan called for a third Vite renderer entry (`src/renderer-pdf/`)
that would render a React template inside a hidden BrowserWindow. I
switched to an **HTML-string template** (`buildPdfHtml(payload)` returns
a self-contained doc that gets written to `os.tmpdir()` and loaded via
`file://`) for two reasons:

1. **R1 eliminated** — the plan worried about needing
   `webSecurity: false` to load the logo. By embedding the logo as a
   base64 `data:` URL, the PDF window keeps `webSecurity: true` AND a
   strict CSP meta tag (`default-src 'none'; img-src data:; style-src
   'unsafe-inline'`).
2. **R5 eliminated** — no Vite multi-entry build config gymnastics; the
   PDF code path doesn't need Tailwind, React, or hot-reload.

Trade-off: the template is plain TS/HTML strings, not JSX. Acceptable
because (a) the layout is simple and unlikely to need component reuse,
(b) the output is trivially snapshot-testable, and (c) we can swap to
React-on-renderer later without changing the IPC contract if the
template ever grows complex.

## Files

**New:**
- `src/shared/currency.ts` + `.test.ts` (14 tests)
- `src/main/pdf.ts` (`buildPdfPayload` + `buildPdfHtml`, pure)
- `src/main/pdf.test.ts` (8 unskipped + 10 DB-skipped pattern matches `jsonExport.test.ts`)
- `src/main/logo.ts` (file-storage helpers, max 1 MB, ext allow-list, `data:` URL renderer)
- `src/main/logo.test.ts` (8 tests, fully unskippable — operates on tmpdirs)
- `src/main/pdfWindow.ts` (hidden-window driver around `printToPDF`)
- `src/renderer/src/components/PdfExportModal.tsx`

**Modified:**
- `src/main/ipc.ts` — three new handlers: `pdf:export`, `logo:set`, `logo:clear`
- `src/preload/index.ts` + `index.d.ts` — `window.api.pdf.*` and `window.api.logo.*` namespaces
- `src/shared/types.ts` — `Settings` extended with `pdf_logo_path`, `pdf_sender_address`, `pdf_tax_id`, `pdf_accent_color`, `pdf_footer_text`, `pdf_round_minutes` (no migration needed; Migration 004 from PR A already seeded them and `settings:getAll` returns the full key-value bag)
- `src/renderer/src/views/CalendarView.tsx` — hero button + 3 quick-filter pills now actually open the modal with `prefilledRange`
- `src/renderer/src/views/SettingsView.tsx` — new "PDF-Vorlage" section between Daten and Über
- `CHANGELOG.md`

## Security notes

- **CSP:** `default-src 'none'; img-src data:; style-src 'unsafe-inline'` —
  no scripts allowed at all in the PDF window.
- **`webSecurity: true`** preserved (no relaxation).
- **HTML escaping:** all user-controlled strings (client name, sender,
  description, footer) flow through `esc()` before interpolation. Test
  coverage: an `<script>` payload in the client name renders as text.
- **Accent color:** validated against `^#[0-9a-fA-F]{6}$`, falls back to
  indigo on bad input. Test verifies a `javascript:` payload is dropped.
- **Logo size cap:** 1 MB (`MAX_LOGO_BYTES`), enforced in both
  `saveLogo()` and `readLogoAsDataUrl()`.
- **Logo extension allow-list:** PNG, JPG/JPEG, SVG, WebP. Anything else
  rejected at save time and ignored at read time.

## Quality gates

- `pnpm typecheck` — green
- `pnpm test` — **89 passed** | 43 skipped (was 59 passed; +30 from PR C:
  14 currency, 8 logo, 8 pdf-pure)
- `pnpm lint` — **21 errors** (baseline maintained, 0 new)
- `npx prettier --write` ran clean on all touched files

## Deferred to PR D (intentionally out of scope)

- **Icon assets** from `timetrack_icon_glass_final.svg` → `build/icon.png`
  + `resources/tray-running.png` + `resources/tray-stopped.png` (the SVG is
  in the working tree but not committed in this PR)
- **Live PDF preview iframe** in the Settings → PDF-Vorlage section
- **Drag-and-drop logo upload** (currently file-picker only)
- **Entry-count preview** in the export modal ("X Einträge, Y Stunden")
- **PDF smoke test** in CI (visual regression / bytes-non-zero check)
- **GitHub Actions v5** upgrade (#42)

## How to test

1. Pull `feat/v1.3-pr-c-pdf`, run `pnpm dev`
2. Settings → PDF-Vorlage → Logo wählen + Adresse + Steuernummer + Akzentfarbe
3. Kalender → "📄 Letzter Monat als PDF" oder eine Pille klicken
4. Modal: Kunde + Zeitraum sind vorbelegt → "PDF speichern"
5. Öffne das PDF — Layout, deutsche Datums-/Zahlenformatierung, Honorar-Spalte
   (nur bei Kunden mit Stundensatz), optionale Rundung
6. Wiederholen mit einem 0-€-Kunden → keine Honorar-Spalte, keine Total-Zeile-€

## Decision log

- HTML-string template > React renderer entry (see "Architectural deviation")
- Logo as base64 `data:` URL > `file://` reference (eliminates R1)
- 1 MB Logo-Cap > unbounded (PDF size, data: URL practicality)
- Modal `key={range}` > `useEffect` reset (avoids cascading-renders lint warning)
- Honorar-Spalte rate-based (`client.rate_cent > 0`) > entry-based — semantic
  match: "this client is billable", not "did this entry happen to bill"
