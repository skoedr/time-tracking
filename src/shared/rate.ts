/**
 * Hourly rate helpers. We store rates as integer cents (`clients.rate_cent`)
 * to dodge float drift on totals, and format/parse user-facing strings as
 * German decimal ("1.234,56 €").
 */

/**
 * Parse a user-entered rate string into integer cents.
 * - Empty string → 0 (treated as "no rate set").
 * - Accepts "85", "85,00", "85.50", "1.234,50".
 * - Returns `'invalid'` for unparseable input, `'negative'` for negatives.
 */
export type ParsedRate = number | 'invalid' | 'negative'

export function parseRateInput(raw: string): ParsedRate {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  // Strip German thousands separator, normalise comma to dot.
  const normalised = trimmed.replace(/\./g, '').replace(',', '.')
  const n = Number(normalised)
  if (!Number.isFinite(n)) return 'invalid'
  if (n < 0) return 'negative'
  return Math.round(n * 100)
}

/**
 * Render integer cents as a German decimal string for form inputs.
 * 0 → empty string so users see a clean placeholder instead of "0,00".
 */
export function formatRateInput(rateCent: number): string {
  if (!rateCent) return ''
  const euros = rateCent / 100
  return euros.toFixed(2).replace('.', ',')
}

/**
 * Render integer cents as a fully-formatted German currency string for
 * display ("1.234,56 €"). Returns `'—'` for 0 to signal "no rate".
 */
export function formatRateDisplay(rateCent: number): string {
  if (!rateCent) return '—'
  const euros = rateCent / 100
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(euros)
}
