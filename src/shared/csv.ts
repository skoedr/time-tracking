/**
 * CSV export formatter (v1.5 PR C, issue #18).
 *
 * Produces UTF-8+BOM CSV that Excel DE opens without encoding prompts.
 * Default: semicolon separator + comma decimal (DACH convention).
 * Optional: comma separator + dot decimal (US / DATEV).
 *
 * Columns:
 *   Datum ; Start ; Ende ; Dauer ; Kunde ; Beschreibung ; Tags ; Referenz ; Stundensatz ; Betrag
 *
 * - Datum / Start / Ende in DE locale (dd.MM.yyyy / HH:mm).
 * - Dauer as HH:mm:ss so Excel [h]:mm:ss format works.
 * - Tags pipe-separated (| can't conflict with field separator).
 * - Betrag empty when no rate; decimal uses chosen separator.
 * - Line endings: \r\n (Windows / Excel DE friendly).
 * - Midnight-split entries stored as 2 separate rows in DB → 2 CSV rows (no special handling needed).
 */

import { formatTimeHHMM } from './date'
import { formatDuration } from './duration'
import { deserializeTags } from './tags'
import type { Entry, Client } from './types'

export interface CsvOptions {
  /** Field separator. Default: ';' (DACH). */
  fieldSeparator?: ';' | ','
  /** Decimal separator for monetary amounts. Default: ',' (DACH). */
  decimalSeparator?: ',' | '.'
}

const HEADER = [
  'Datum',
  'Start',
  'Ende',
  'Dauer',
  'Kunde',
  'Beschreibung',
  'Tags',
  'Referenz',
  'Stundensatz',
  'Betrag'
]

/** Wrap a field value in quotes if it contains the separator, quote char, or newline. */
function escapeField(value: string, sep: string): string {
  if (value.includes(sep) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

/** Format a fractional number using the chosen decimal separator, 2 decimal places. */
function formatDecimal(n: number, decimalSep: string): string {
  return n.toFixed(2).replace('.', decimalSep)
}

/**
 * Build a CSV string (UTF-8 BOM + header + data rows) from a list of entries.
 *
 * @param entries  - Only complete entries (stopped_at non-null) are exported.
 *                   Running entries are silently skipped.
 * @param clientMap - Map from client_id → Client (for name + rate).
 * @param opts     - Format options.
 */
export function formatCsv(
  entries: Entry[],
  clientMap: Map<number, Client>,
  opts: CsvOptions = {}
): string {
  const sep = opts.fieldSeparator ?? ';'
  const dec = opts.decimalSeparator ?? ','

  const rows: string[] = []
  rows.push(HEADER.map((h) => escapeField(h, sep)).join(sep))

  for (const entry of entries) {
    if (!entry.stopped_at) continue // skip running

    const start = new Date(entry.started_at)
    const stop = new Date(entry.stopped_at)
    const durationSec = Math.max(0, Math.floor((stop.getTime() - start.getTime()) / 1000))

    const datum = formatDate(start)
    const startStr = formatTimeHHMM(start)
    const endeStr = formatTimeHHMM(stop)
    const dauerStr = formatDuration(durationSec)

    const client = clientMap.get(entry.client_id)
    const clientName = client?.name ?? ''
    const rateCent = client?.rate_cent ?? 0

    const rateStr = rateCent > 0 ? formatDecimal(rateCent / 100, dec) : ''
    const betragStr =
      rateCent > 0 ? formatDecimal((durationSec / 3600) * (rateCent / 100), dec) : ''

    const tags = deserializeTags(entry.tags).join('|')
    const reference = entry.reference ?? ''

    const row = [
      datum,
      startStr,
      endeStr,
      dauerStr,
      clientName,
      entry.description,
      tags,
      reference,
      rateStr,
      betragStr
    ]
      .map((f) => escapeField(f, sep))
      .join(sep)

    rows.push(row)
  }

  // UTF-8 BOM + CRLF line endings
  return '\uFEFF' + rows.join('\r\n') + '\r\n'
}

/** Format a Date as dd.MM.yyyy in local timezone. */
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}
