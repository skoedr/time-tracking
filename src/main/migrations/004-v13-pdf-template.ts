import type { Migration } from './index'

/**
 * v1.3 PDF template + reporting prep:
 * - Seeds settings keys for the PDF template (logo path, sender address,
 *   tax id, accent color, footer text) plus `pdf_round_minutes` so the
 *   PDF can optionally round entry durations on output without forcing a
 *   per-entry rounding UI.
 * - `INSERT OR IGNORE` makes this idempotent against partial reruns.
 *
 * No schema change. The hourly rate column (`clients.rate_cent`) was added
 * in migration 003 and is reused by v1.3.
 */
export const migration004: Migration = {
  version: 4,
  name: 'v1.3-pdf-template',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('pdf_logo_path', ''),
      ('pdf_sender_address', ''),
      ('pdf_tax_id', ''),
      ('pdf_accent_color', '#4f46e5'),
      ('pdf_footer_text', ''),
      ('pdf_round_minutes', '0');
  `
}
