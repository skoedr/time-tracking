/**
 * PDF payload assembly + HTML template rendering.
 *
 * Pure functions — no Electron, no I/O. The hidden-window driver in
 * `pdfWindow.ts` calls `buildPdfPayload()` to gather data and
 * `buildPdfHtml()` to produce the self-contained HTML string that gets
 * fed to `webContents.printToPDF()`.
 *
 * Why a string template instead of a third Vite renderer entry: the PDF
 * doesn't need Tailwind, React, or hot-reload. Inline CSS keeps the
 * artifact self-contained, eliminates a build-config knot (R5 in the
 * v1.3 plan), and makes the output trivially snapshot-testable.
 */
import type Database from 'better-sqlite3'
import { feeCent, formatEur, formatHoursMinutes, roundMinutes } from '../shared/currency'
import type { Client, Entry, Settings } from '../shared/types'

export interface PdfRequest {
  clientId: number
  /** ISO-date strings, inclusive. e.g. '2026-04-01' to '2026-04-30'. */
  fromIso: string
  toIso: string
  /**
   * Render the two signature lines ("Datum, Auftragnehmer" / "Datum,
   * Auftraggeber") at the bottom of the document. Default `false` —
   * most users never need them, and an empty signature row at the end
   * looks like an unfinished template. Toggled per-export from the modal.
   */
  includeSignatures?: boolean
}

export interface PdfRow {
  date: string
  startTime: string
  stopTime: string
  description: string
  minutes: number
  feeCent: number | null
}

export interface PdfPayload {
  client: Pick<Client, 'id' | 'name' | 'rate_cent'>
  /** Sender block: pulled from settings.company_name + pdf_sender_address. */
  sender: { name: string; address: string; taxId: string }
  /** ISO range echoed back for the header. */
  fromIso: string
  toIso: string
  rows: PdfRow[]
  totals: {
    minutes: number
    /** null when the client has no rate (rate_cent === 0). */
    feeCent: number | null
  }
  accentColor: string
  footerText: string
  /** Logo as a `data:image/...;base64,...` URL or empty string. */
  logoDataUrl: string
  /** Rounding step in minutes; 0 = no rounding. */
  roundMinutes: number
  /**
   * When true, the rendered HTML includes a bottom signature row with
   * lines for Auftragnehmer / Auftraggeber. Defaults to false at the
   * payload level so existing call-sites / tests don't have to opt out.
   */
  includeSignatures?: boolean
  /** Used for the "erstellt am" footer line. */
  generatedAtIso: string
}

const DATE_FMT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})

const TIME_FMT = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit'
})

function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso))
}

function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

/**
 * Snap a Date to the nearest `step` minutes (local time, half-up).
 * Used to align displayed start times with the rounded duration so the
 * PDF reader sees `19:00 – 19:30 → 0:30` instead of
 * `18:54 – 19:18 → 0:30` (which would look like a math error to the
 * recipient even though the duration column is correct).
 *
 * Edge: a snap near local midnight may roll the wall-clock time into
 * the next day (e.g. 23:50 with step=30 → 00:00 next day). The PDF
 * `date` column is taken from the raw start date, so this manifests as
 * a slightly weird-looking row — but in practice cross-midnight entries
 * are already auto-split into halves at the IPC layer (PR B), so no
 * stored entry should sit within `step/2` minutes of midnight.
 */
function snapToStepLocal(d: Date, step: number): Date {
  const totalMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  const snapped = Math.round(totalMin / step) * step
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  // setMinutes handles overflow into next day correctly.
  result.setMinutes(snapped)
  return result
}

function formatTimeDate(d: Date): string {
  return TIME_FMT.format(d)
}

/**
 * Read entries + client + settings from the DB and shape them into a
 * fully-resolved PdfPayload. Pure with respect to the DB handle —
 * doesn't write, doesn't touch the filesystem.
 *
 * The `logoDataUrl` is the caller's responsibility (loaded from
 * `settings.pdf_logo_path` once and base64-encoded) so this stays sync
 * and testable.
 */
export function buildPdfPayload(
  db: Database.Database,
  req: PdfRequest,
  logoDataUrl: string,
  generatedAtIso: string = new Date().toISOString()
): PdfPayload {
  const client = db
    .prepare(`SELECT id, name, rate_cent FROM clients WHERE id = ?`)
    .get(req.clientId) as Pick<Client, 'id' | 'name' | 'rate_cent'> | undefined
  if (!client) {
    throw new Error(`Kunde mit id=${req.clientId} nicht gefunden`)
  }

  const settingsRows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
    key: string
    value: string
  }>
  const settings = Object.fromEntries(
    settingsRows.map((r) => [r.key, r.value])
  ) as unknown as Settings

  const roundStep = parseInt(settings.pdf_round_minutes ?? '0', 10) || 0
  // Range is inclusive; `to` is the start of the day AFTER `toIso` so we
  // capture entries that ended at 23:59 of the last day.
  const fromTs = `${req.fromIso}T00:00:00.000Z`
  const toExclusive = endOfDayIso(req.toIso)

  const entries = db
    .prepare(
      `SELECT * FROM entries
         WHERE client_id = ?
           AND deleted_at IS NULL
           AND stopped_at IS NOT NULL
           AND started_at >= ?
           AND started_at < ?
         ORDER BY started_at ASC, id ASC`
    )
    .all(client.id, fromTs, toExclusive) as Entry[]

  const rows: PdfRow[] = entries.map((e) => {
    const start = new Date(e.started_at)
    const stop = new Date(e.stopped_at as string)
    // Use ceil here so that a sub-minute entry (e.g. a quick test toggle of
    // a few seconds) is reported as 1 raw minute instead of vanishing to 0.
    // Combined with the ceil-based `roundMinutes` below, this matches the
    // conventional billing rule: any started step gets charged in full.
    const rawMs = Math.max(0, stop.getTime() - start.getTime())
    const rawMin = rawMs > 0 ? Math.ceil(rawMs / 60000) : 0
    const minutes = roundMinutes(rawMin, roundStep)
    const fee = client.rate_cent > 0 ? feeCent(minutes, client.rate_cent) : null
    // When rounding is on, we also adjust the displayed times so the
    // visible "Von / Bis / Dauer" arithmetic adds up for the recipient.
    // Rule: snap the start to the nearest step, then derive the stop as
    // start + roundedMinutes. For step=0 (no rounding), display the raw
    // wall-clock times unchanged.
    let startTime: string
    let stopTime: string
    if (roundStep > 0) {
      const displayedStart = snapToStepLocal(start, roundStep)
      const displayedStop = new Date(displayedStart.getTime() + minutes * 60_000)
      startTime = formatTimeDate(displayedStart)
      stopTime = formatTimeDate(displayedStop)
    } else {
      startTime = formatTime(e.started_at)
      stopTime = formatTime(e.stopped_at as string)
    }
    return {
      date: formatDate(e.started_at),
      startTime,
      stopTime,
      description: e.description ?? '',
      minutes,
      feeCent: fee
    }
  })

  const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0)
  const totalFee = client.rate_cent > 0 ? rows.reduce((sum, r) => sum + (r.feeCent ?? 0), 0) : null

  return {
    client,
    sender: {
      name: settings.company_name ?? '',
      address: settings.pdf_sender_address ?? '',
      taxId: settings.pdf_tax_id ?? ''
    },
    fromIso: req.fromIso,
    toIso: req.toIso,
    rows,
    totals: { minutes: totalMinutes, feeCent: totalFee },
    accentColor: settings.pdf_accent_color || '#4f46e5',
    footerText: settings.pdf_footer_text ?? '',
    logoDataUrl,
    roundMinutes: roundStep,
    includeSignatures: req.includeSignatures === true,
    generatedAtIso
  }
}

/** Inclusive end-of-day → exclusive next-day-start in ISO. */
function endOfDayIso(dayIso: string): string {
  const d = new Date(`${dayIso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

/**
 * Escape user-controlled strings for safe interpolation into the HTML
 * template. Matches the OWASP basic set; we never output user content
 * into JS or attribute contexts (only text + a single style attribute
 * for the accent color, which we restrict to `#RRGGBB` upstream).
 */
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Validate `#RRGGBB` accent color and fall back to indigo on bad input. */
function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#4f46e5'
}

/**
 * Produce a self-contained HTML document for the PDF. All CSS inline,
 * all assets embedded as data: URLs. Designed for `pageSize: 'A4'`
 * with `printBackground: true` and 2 cm margins on the printToPDF call
 * (we don't repeat margins in CSS to avoid double-margins).
 */
export function buildPdfHtml(p: PdfPayload): string {
  const accent = safeColor(p.accentColor)
  const showFee = p.totals.feeCent !== null
  const dateRange = `${formatDate(p.fromIso)} – ${formatDate(p.toIso)}`
  const generated = formatDate(p.generatedAtIso)

  const senderLines = p.sender.address
    .split('\n')
    .map((line) => esc(line.trim()))
    .filter(Boolean)
    .join('<br />')

  const taxLine = p.sender.taxId ? `<div>Steuernr.: ${esc(p.sender.taxId)}</div>` : ''

  const logoBlock = p.logoDataUrl
    ? `<img src="${esc(p.logoDataUrl)}" alt="" class="logo" />`
    : '<div class="logo-placeholder"></div>'

  const tableRows = p.rows
    .map(
      (r) => `<tr>
        <td class="col-date">${esc(r.date)}</td>
        <td class="col-time">${esc(r.startTime)}</td>
        <td class="col-time">${esc(r.stopTime)}</td>
        <td class="col-desc">${esc(r.description)}</td>
        <td class="col-dur">${esc(formatHoursMinutes(r.minutes))}</td>
        ${showFee ? `<td class="col-fee">${esc(formatEur(r.feeCent ?? 0))}</td>` : ''}
      </tr>`
    )
    .join('\n')

  const emptyState =
    p.rows.length === 0
      ? `<tr class="empty"><td colspan="${showFee ? 6 : 5}">Keine Einträge im gewählten Zeitraum.</td></tr>`
      : ''

  const totalsRow = `<tr class="total">
        <td colspan="${showFee ? 4 : 4}">Summe</td>
        <td class="col-dur">${esc(formatHoursMinutes(p.totals.minutes))}</td>
        ${showFee ? `<td class="col-fee">${esc(formatEur(p.totals.feeCent ?? 0))}</td>` : ''}
      </tr>`

  // No visible rounding hint in the PDF: the recipient should never
  // notice that times were rounded. The displayed Von/Bis times are
  // already aligned with the rounded duration in `buildPdfPayload`,
  // so the row arithmetic is internally consistent.

  const footer = p.footerText ? `<div class="footer-text">${esc(p.footerText)}</div>` : ''

  // Signature lines are opt-in: most exports don't need them, and an
  // unsigned signature row at the end of an otherwise clean document
  // looks like a forgotten template.
  const signatureBlock = p.includeSignatures
    ? `<div class="signature-row">
      <div class="sig">Datum, Auftragnehmer</div>
      <div class="sig">Datum, Auftraggeber</div>
    </div>`
    : ''

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
<title>Stundennachweis</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #0f172a;
    font-size: 10pt;
    line-height: 1.45;
  }
  .page { padding: 0; }
  header.doc-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
  }
  .logo { max-height: 60px; max-width: 180px; object-fit: contain; }
  .logo-placeholder { width: 1px; height: 60px; }
  .sender {
    text-align: right;
    font-size: 9pt;
    color: #334155;
  }
  .sender .name { font-weight: 600; color: #0f172a; }
  h1.doc-title {
    font-size: 18pt;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: #0f172a;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 18px;
    border-bottom: 2px solid ${accent};
    padding-bottom: 8px;
  }
  .recipient { font-size: 11pt; }
  .recipient .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 2px; }
  .recipient .name { font-weight: 600; }
  .range { font-size: 10pt; color: #334155; }
  .range .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .range .value { font-weight: 600; color: #0f172a; }
  table.entries {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
  }
  table.entries th {
    background: ${accent};
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 7px 8px;
    font-size: 9pt;
  }
  table.entries td {
    padding: 6px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    font-size: 10pt;
  }
  table.entries .col-date { white-space: nowrap; width: 76px; }
  table.entries .col-time { white-space: nowrap; width: 52px; text-align: right; }
  table.entries .col-desc { word-break: break-word; }
  table.entries .col-dur { white-space: nowrap; text-align: right; width: 60px; font-variant-numeric: tabular-nums; }
  table.entries .col-fee { white-space: nowrap; text-align: right; width: 84px; font-variant-numeric: tabular-nums; }
  table.entries tr.total td {
    border-top: 2px solid ${accent};
    border-bottom: none;
    font-weight: 700;
    font-size: 11pt;
    padding-top: 10px;
  }
  table.entries tr.empty td {
    text-align: center;
    color: #64748b;
    padding: 24px 8px;
    font-style: italic;
  }
  footer.doc-foot {
    margin-top: 36px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #64748b;
  }
  footer.doc-foot .footer-text { white-space: pre-wrap; margin-bottom: 6px; color: #475569; }
  .signature-row {
    margin-top: 48px;
    display: flex;
    justify-content: space-between;
    gap: 48px;
  }
  .signature-row .sig {
    flex: 1;
    border-top: 1px solid #94a3b8;
    padding-top: 4px;
    font-size: 9pt;
    color: #475569;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="page">
    <header class="doc-head">
      ${logoBlock}
      <div class="sender">
        <div class="name">${esc(p.sender.name)}</div>
        ${senderLines ? `<div>${senderLines}</div>` : ''}
        ${taxLine}
      </div>
    </header>

    <h1 class="doc-title">Stundennachweis</h1>

    <div class="meta-row">
      <div class="recipient">
        <div class="label">Kunde</div>
        <div class="name">${esc(p.client.name)}</div>
      </div>
      <div class="range">
        <div class="label">Zeitraum</div>
        <div class="value">${esc(dateRange)}</div>
      </div>
    </div>

    <table class="entries">
      <thead>
        <tr>
          <th class="col-date">Datum</th>
          <th class="col-time">Von</th>
          <th class="col-time">Bis</th>
          <th class="col-desc">Tätigkeit</th>
          <th class="col-dur">Dauer</th>
          ${showFee ? '<th class="col-fee">Honorar</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
        ${emptyState}
        ${totalsRow}
      </tbody>
    </table>

    ${signatureBlock}

    <footer class="doc-foot">
      ${footer}
      <div>Erstellt am ${esc(generated)} mit TimeTrack.</div>
    </footer>
  </div>
</body>
</html>`
}
