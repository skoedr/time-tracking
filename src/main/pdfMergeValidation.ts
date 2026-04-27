import { existsSync } from 'fs'
import { extname, resolve } from 'path'

const MAX_PDF_BYTES = 50 * 1024 * 1024 // 50 MB

/**
 * Validates any PDF file path: non-empty, .pdf extension (case-insensitive), file exists.
 * Used for both invoice and Stundennachweis paths in merge handlers.
 *
 * The optional `existsFn` parameter allows injecting a mock for unit tests.
 * Callers that need the real filesystem omit it (defaults to existsSync).
 */
export function validatePdfPath(
  raw: string,
  existsFn: (p: string) => boolean = existsSync
): string | null {
  if (!raw) return 'Kein Rechnungspfad angegeben'
  const resolved = resolve(raw)
  if (extname(resolved).toLowerCase() !== '.pdf') return 'Die gewählte Datei ist keine PDF'
  if (!existsFn(resolved)) return 'Datei nicht gefunden'
  return null
}

/**
 * Validates the size of a loaded PDF buffer (≤ 50 MB).
 */
export function validateInvoiceSize(buf: Buffer): string | null {
  return buf.length > MAX_PDF_BYTES ? 'Rechnungs-PDF zu groß (max. 50 MB)' : null
}

/**
 * Validates the request shape for pdf:merge-export (re-render + merge).
 * Checks that clientId, fromIso, toIso, and invoicePath are present.
 */
export function validateMergeExportRequest(req: unknown): string | null {
  const r = req as Record<string, unknown> | null | undefined
  if (!r || typeof r.clientId !== 'number' || !r.fromIso || !r.toIso) {
    return 'Ungültige PDF-Anfrage'
  }
  if (!r.invoicePath) return 'Kein Rechnungspfad angegeben'
  return null
}

/**
 * Validates the request shape for pdf:merge-only (merge two existing PDFs).
 * Both stundennachweisPath and invoicePath must be non-empty strings.
 */
export function validateMergeOnlyRequest(req: unknown): string | null {
  const r = req as Record<string, unknown> | null | undefined
  if (!r || !r.stundennachweisPath || !r.invoicePath) {
    return 'Beide PDF-Pfade sind erforderlich'
  }
  return null
}
