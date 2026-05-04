import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dialog } from 'electron'
import { join, parse, resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
import log from 'electron-log/main'
import type Database from 'better-sqlite3'
import { mergePdfs } from './pdfMerge'
import { buildPdfPayload, buildPdfHtml } from './pdf'
import type { PdfPayload, PdfRequest } from './pdf'
import { renderPdfBuffer } from './pdfWindow'
import { readLogoAsDataUrl } from './logo'
import { validateMergeExportRequest, validateMergeOnlyRequest, validatePdfPath } from './pdfMergeValidation'
import type { IpcResult, Settings } from '../shared/types'

const MAX_PDF_BYTES = 50 * 1024 * 1024 // 50 MB

// ── Injectable deps (real implementations are the defaults) ──────────────────
// Injecting deps makes the core logic testable without an Electron runtime.

export interface FsDeps {
  existsSync: (path: string) => boolean
  statSync: (path: string) => { size: number }
  readFileSync: (path: string) => Buffer
  writeFileSync: (path: string, data: Buffer) => void
}

export interface DialogDeps {
  showSaveDialog: (opts: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
}

const realFsDeps: FsDeps = { existsSync, statSync, readFileSync, writeFileSync }
const realDialogDeps: DialogDeps = { showSaveDialog: (o) => dialog.showSaveDialog(o) }

// ── pdf:merge-only handler ────────────────────────────────────────────────────

export interface MergeOnlyRequest {
  stundennachweisPath: string
  invoicePath: string
}

export async function mergeOnlyHandler(
  req: unknown,
  fsDeps: FsDeps = realFsDeps,
  dialogDeps: DialogDeps = realDialogDeps
): Promise<IpcResult<{ path: string }>> {
  try {
    // Shape check — both paths must be non-empty strings.
    const shapeErr = validateMergeOnlyRequest(req)
    if (shapeErr) return { ok: false, error: shapeErr }

    const { stundennachweisPath, invoicePath } = req as MergeOnlyRequest

    // Deep path validation: extension + existence (using injected existsSync for testability).
    const snPathErr = validatePdfPath(stundennachweisPath, fsDeps.existsSync)
    if (snPathErr) return { ok: false, error: `Stundennachweis: ${snPathErr}` }

    const invPathErr = validatePdfPath(invoicePath, fsDeps.existsSync)
    if (invPathErr) return { ok: false, error: `Rechnung: ${invPathErr}` }

    const resolvedSn = resolve(stundennachweisPath)
    const resolvedInv = resolve(invoicePath)

    // Size guard — reject before reading large files.
    if (fsDeps.statSync(resolvedSn).size > MAX_PDF_BYTES) {
      return { ok: false, error: 'Stundennachweis-PDF zu groß (max. 50 MB)' }
    }
    if (fsDeps.statSync(resolvedInv).size > MAX_PDF_BYTES) {
      return { ok: false, error: 'Rechnungs-PDF zu groß (max. 50 MB)' }
    }

    // Read both files — guard against locked files (Lexware / Acrobat open).
    let snBuffer: Buffer
    try {
      snBuffer = fsDeps.readFileSync(resolvedSn)
    } catch (e: any) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        return {
          ok: false,
          error: `Stundennachweis ist durch ein anderes Programm gesperrt: ${parse(resolvedSn).base}`
        }
      }
      return { ok: false, error: String(e) }
    }

    let invBuffer: Buffer
    try {
      invBuffer = fsDeps.readFileSync(resolvedInv)
    } catch (e: any) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        return {
          ok: false,
          error: `Rechnung ist durch ein anderes Programm gesperrt: ${parse(resolvedInv).base}`
        }
      }
      return { ok: false, error: String(e) }
    }

    // Merge: invoice first, then Stundennachweis appended.
    const merged = await mergePdfs(snBuffer, invBuffer, 'append')
    log.debug('[pdf:merge-only] merged', {
      snBytes: snBuffer.length,
      invoiceBytes: invBuffer.length,
      mergedBytes: merged.length
    })

    // Derive output path next to the invoice. Append timestamp if file already exists.
    const { dir, name } = parse(resolvedInv)
    let outputPath = join(dir, `${name}_inkl_Stundennachweis.pdf`)
    if (fsDeps.existsSync(outputPath)) {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      outputPath = join(dir, `${name}_inkl_Stundennachweis_${ts}.pdf`)
    }

    try {
      fsDeps.writeFileSync(outputPath, merged)
      return { ok: true, data: { path: outputPath } }
    } catch (writeErr: any) {
      // Target directory is read-only — fall back to a user-chosen path.
      if (writeErr.code === 'EPERM' || writeErr.code === 'EACCES') {
        const fallback = await dialogDeps.showSaveDialog({
          title: 'Zusammengeführte PDF speichern',
          defaultPath: `${name}_inkl_Stundennachweis.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (fallback.canceled || !fallback.filePath) {
          return { ok: false, error: 'Speichern abgebrochen' }
        }
        fsDeps.writeFileSync(fallback.filePath, merged)
        return { ok: true, data: { path: fallback.filePath } }
      }
      return { ok: false, error: String(writeErr) }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── pdf:pdf-info handler ──────────────────────────────────────────────────────

export async function pdfInfoHandler(
  req: unknown,
  fsDeps: FsDeps = realFsDeps
): Promise<IpcResult<{ pageCount: number }>> {
  try {
    const r = req as Record<string, unknown> | null | undefined
    if (!r || !r.filePath) return { ok: false, error: 'Kein Pfad angegeben' }

    const pathErr = validatePdfPath(r.filePath as string, fsDeps.existsSync)
    if (pathErr) return { ok: false, error: pathErr }

    const resolved = resolve(r.filePath as string)

    if (fsDeps.statSync(resolved).size > MAX_PDF_BYTES) {
      return { ok: false, error: 'PDF zu groß (max. 50 MB)' }
    }

    let buf: Buffer
    try {
      buf = fsDeps.readFileSync(resolved)
    } catch (e: any) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        return {
          ok: false,
          error: `Datei ist durch ein anderes Programm gesperrt: ${parse(resolved).base}`
        }
      }
      return { ok: false, error: String(e) }
    }

    let doc: PDFDocument
    try {
      doc = await PDFDocument.load(buf)
    } catch {
      return { ok: false, error: 'Ungültige oder verschlüsselte PDF-Datei' }
    }

    return { ok: true, data: { pageCount: doc.getPageCount() } }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── pdf:merge-export handler ──────────────────────────────────────────────────
// Re-renders the Stundennachweis from live DB data and merges it with an
// existing invoice PDF. Extracted from ipc.ts for testability.

export interface MergeExportPdfDeps {
  readLogoAsDataUrl: (absolutePath: string) => string
  buildPdfPayload: (db: Database.Database, req: PdfRequest, logoDataUrl: string) => PdfPayload
  buildPdfHtml: (payload: PdfPayload) => string
  renderPdfBuffer: (opts: { html: string }) => Promise<Buffer>
  mergePdfs: (sn: Buffer, invoice: Buffer, mode: 'append') => Promise<Buffer>
}

const realMergeExportPdfDeps: MergeExportPdfDeps = {
  readLogoAsDataUrl,
  buildPdfPayload,
  buildPdfHtml,
  renderPdfBuffer,
  mergePdfs
}

export async function mergeExportHandler(
  db: Database.Database,
  req: unknown,
  fsDeps: FsDeps = realFsDeps,
  dialogDeps: DialogDeps = realDialogDeps,
  pdfDeps: MergeExportPdfDeps = realMergeExportPdfDeps
): Promise<IpcResult<{ path: string }>> {
  try {
    const reqErr = validateMergeExportRequest(req)
    if (reqErr) return { ok: false, error: reqErr }

    const typedReq = req as PdfRequest & { invoicePath: string }
    const pathErr = validatePdfPath(typedReq.invoicePath, fsDeps.existsSync)
    if (pathErr) return { ok: false, error: pathErr }

    const resolvedInvoice = resolve(typedReq.invoicePath)

    if (fsDeps.statSync(resolvedInvoice).size > MAX_PDF_BYTES) {
      return { ok: false, error: 'Rechnungs-PDF zu groß (max. 50 MB)' }
    }

    let invoiceBuffer: Buffer
    try {
      invoiceBuffer = fsDeps.readFileSync(resolvedInvoice)
    } catch (e: any) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        return {
          ok: false,
          error: `Datei ist durch ein anderes Programm gesperrt: ${parse(resolvedInvoice).base}`
        }
      }
      return { ok: false, error: String(e) }
    }

    const settingsRows = db
      .prepare(`SELECT key, value FROM settings`)
      .all() as Array<{ key: string; value: string }>
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value])) as unknown as Settings

    const logoDataUrl = pdfDeps.readLogoAsDataUrl(settings.pdf_logo_path ?? '')
    const payload = pdfDeps.buildPdfPayload(db, typedReq, logoDataUrl)
    const snBuffer = await pdfDeps.renderPdfBuffer({ html: pdfDeps.buildPdfHtml(payload) })
    const merged = await pdfDeps.mergePdfs(snBuffer, invoiceBuffer, 'append')

    log.debug('[pdf:merge-export] merged', {
      invoiceBytes: invoiceBuffer.length,
      snBytes: snBuffer.length,
      mergedBytes: merged.length
    })

    const { dir, name } = parse(resolvedInvoice)
    let outputPath = join(dir, `${name}_inkl_Stundennachweis.pdf`)
    if (fsDeps.existsSync(outputPath)) {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      outputPath = join(dir, `${name}_inkl_Stundennachweis_${ts}.pdf`)
    }

    try {
      fsDeps.writeFileSync(outputPath, merged)
      return { ok: true, data: { path: outputPath } }
    } catch (writeErr: any) {
      // Target directory is read-only — fall back to a user-chosen path.
      if (writeErr.code === 'EPERM' || writeErr.code === 'EACCES') {
        const fallback = await dialogDeps.showSaveDialog({
          title: 'Zusammengeführte PDF speichern',
          defaultPath: `${name}_inkl_Stundennachweis.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (fallback.canceled || !fallback.filePath) {
          return { ok: false, error: 'Speichern abgebrochen' }
        }
        fsDeps.writeFileSync(fallback.filePath, merged)
        return { ok: true, data: { path: fallback.filePath } }
      }
      return { ok: false, error: String(writeErr) }
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
