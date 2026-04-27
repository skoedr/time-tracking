import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'path'
import { PDFDocument } from 'pdf-lib'
import { mergeOnlyHandler, pdfInfoHandler } from './pdfMergeHandlers'
import type { FsDeps, DialogDeps } from './pdfMergeHandlers'

async function makeMinimalPdf(pageCount = 1): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage()
  return Buffer.from(await doc.save())
}

let pdf1: Buffer
let pdf2: Buffer
let pdf3page: Buffer

beforeAll(async () => {
  pdf1 = await makeMinimalPdf(1)
  pdf2 = await makeMinimalPdf(2)
  pdf3page = await makeMinimalPdf(3)
})

// Normalize keys via resolve() so forward-slash Windows paths ('C:/foo.pdf') match
// what the handler sees after its own resolve() call.
function mockFs(files: Record<string, Buffer | 'EBUSY' | 'EPERM'>): FsDeps {
  const norm: Record<string, Buffer | 'EBUSY' | 'EPERM'> = {}
  for (const [k, v] of Object.entries(files)) norm[resolve(k)] = v

  return {
    existsSync: (p) => p in norm,
    statSync: (p) => {
      const f = norm[p]
      if (!f || typeof f === 'string') return { size: 0 }
      return { size: f.length }
    },
    readFileSync: (p) => {
      const f = norm[p]
      if (!f) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      if (f === 'EBUSY') throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
      if (f === 'EPERM') throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
      return f
    },
    writeFileSync: () => { /* no-op by default; override per test */ }
  }
}

const noDialog: DialogDeps = {
  showSaveDialog: async () => ({ canceled: true, filePath: undefined } as any)
}

// ── mergeOnlyHandler tests ────────────────────────────────────────────────────

describe('mergeOnlyHandler', () => {
  it('rejects null request', async () => {
    const res = await mergeOnlyHandler(null, mockFs({}), noDialog)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Pfade/)
  })

  it('rejects empty object', async () => {
    const res = await mergeOnlyHandler({}, mockFs({}), noDialog)
    expect(res.ok).toBe(false)
  })

  it('rejects non-pdf extension on SN path', async () => {
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/file.txt', invoicePath: 'C:/inv.pdf' },
      mockFs({ 'C:/file.txt': pdf1, 'C:/inv.pdf': pdf2 }),
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/keine PDF/)
  })

  it('rejects non-pdf extension on invoice path', async () => {
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.docx' },
      mockFs({ 'C:/sn.pdf': pdf1, 'C:/inv.docx': pdf2 }),
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/keine PDF/)
  })

  it('rejects SN file over 50 MB', async () => {
    const bigFs: FsDeps = {
      existsSync: () => true,
      statSync: (p) => ({ size: p.includes('sn') ? 51 * 1024 * 1024 : 1024 }),
      readFileSync: () => pdf1,
      writeFileSync: () => {}
    }
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      bigFs,
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/zu groß/)
  })

  it('rejects invoice file over 50 MB', async () => {
    const bigFs: FsDeps = {
      existsSync: () => true,
      statSync: (p) => ({ size: p.includes('inv') ? 51 * 1024 * 1024 : 1024 }),
      readFileSync: () => pdf1,
      writeFileSync: () => {}
    }
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      bigFs,
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/zu groß/)
  })

  it('returns EBUSY error for locked SN file', async () => {
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      mockFs({ 'C:/sn.pdf': 'EBUSY', 'C:/inv.pdf': pdf2 }),
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/gesperrt/)
  })

  it('returns EBUSY error for locked invoice file', async () => {
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      mockFs({ 'C:/sn.pdf': pdf1, 'C:/inv.pdf': 'EBUSY' }),
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/gesperrt/)
  })

  it('happy path: merges two PDFs and returns output path', async () => {
    const written: Array<{ path: string; buf: Buffer }> = []
    const fs: FsDeps = {
      existsSync: (p) => p === resolve('C:/sn.pdf') || p === resolve('C:/inv.pdf'),
      statSync: () => ({ size: 1024 }),
      readFileSync: (p) => (p === resolve('C:/sn.pdf') ? pdf1 : pdf2),
      writeFileSync: (p, buf) => written.push({ path: p, buf })
    }
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      fs,
      noDialog
    )
    expect(res.ok).toBe(true)
    expect(res.data?.path).toContain('inkl_Stundennachweis')
    expect(written).toHaveLength(1)

    // Verify merged output has 3 pages (pdf2 = 2 + pdf1 = 1).
    const merged = await PDFDocument.load(written[0].buf)
    expect(merged.getPageCount()).toBe(3)
  })

  it('appends timestamp suffix when output file already exists', async () => {
    const written: string[] = []
    const fs: FsDeps = {
      existsSync: () => true, // all paths "exist", including the first output candidate
      statSync: () => ({ size: 1024 }),
      readFileSync: (p) => (p.includes('sn') ? pdf1 : pdf2),
      writeFileSync: (p) => written.push(p)
    }
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      fs,
      noDialog
    )
    expect(res.ok).toBe(true)
    expect(res.data?.path).toMatch(/inkl_Stundennachweis_\d{4}-\d{2}-\d{2}/)
  })

  it('falls back to save dialog on EPERM write error', async () => {
    const savedViaDialog: string[] = []
    const fs: FsDeps = {
      existsSync: (p) => p === resolve('C:/sn.pdf') || p === resolve('C:/inv.pdf'),
      statSync: () => ({ size: 1024 }),
      readFileSync: (p) => (p.includes('sn') ? pdf1 : pdf2),
      writeFileSync: (p) => {
        if (p.includes('inkl')) throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
        savedViaDialog.push(p)
      }
    }
    const mockDialog: DialogDeps = {
      showSaveDialog: async () => ({ canceled: false, filePath: 'C:/fallback_merged.pdf' } as any)
    }
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      fs,
      mockDialog
    )
    expect(res.ok).toBe(true)
    expect(res.data?.path).toBe('C:/fallback_merged.pdf')
  })

  it('returns error when save dialog is cancelled', async () => {
    const fs: FsDeps = {
      existsSync: (p) => p === resolve('C:/sn.pdf') || p === resolve('C:/inv.pdf'),
      statSync: () => ({ size: 1024 }),
      readFileSync: (p) => (p.includes('sn') ? pdf1 : pdf2),
      writeFileSync: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) }
    }
    const res = await mergeOnlyHandler(
      { stundennachweisPath: 'C:/sn.pdf', invoicePath: 'C:/inv.pdf' },
      fs,
      noDialog
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/abgebrochen/)
  })
})

// ── pdfInfoHandler tests ──────────────────────────────────────────────────────

describe('pdfInfoHandler', () => {
  it('rejects null request', async () => {
    const res = await pdfInfoHandler(null, mockFs({}))
    expect(res.ok).toBe(false)
  })

  it('rejects empty filePath', async () => {
    const res = await pdfInfoHandler({ filePath: '' }, mockFs({}))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Pfad/)
  })

  it('rejects non-pdf extension', async () => {
    const res = await pdfInfoHandler(
      { filePath: 'C:/doc.txt' },
      mockFs({ 'C:/doc.txt': pdf1 })
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/keine PDF/)
  })

  it('rejects file over 50 MB', async () => {
    const fs: FsDeps = {
      existsSync: () => true,
      statSync: () => ({ size: 51 * 1024 * 1024 }),
      readFileSync: () => pdf1,
      writeFileSync: () => {}
    }
    const res = await pdfInfoHandler({ filePath: 'C:/big.pdf' }, fs)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/zu groß/)
  })

  it('returns EBUSY error for locked file', async () => {
    const res = await pdfInfoHandler(
      { filePath: 'C:/locked.pdf' },
      mockFs({ 'C:/locked.pdf': 'EBUSY' })
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/gesperrt/)
  })

  it('returns error for corrupt PDF', async () => {
    const fs: FsDeps = {
      existsSync: () => true,
      statSync: () => ({ size: 100 }),
      readFileSync: () => Buffer.from('this is not a pdf'),
      writeFileSync: () => {}
    }
    const res = await pdfInfoHandler({ filePath: 'C:/corrupt.pdf' }, fs)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Ungültige|verschlüsselt/)
  })

  it('returns page count for valid 3-page PDF', async () => {
    const fs: FsDeps = {
      existsSync: () => true,
      statSync: () => ({ size: pdf3page.length }),
      readFileSync: () => pdf3page,
      writeFileSync: () => {}
    }
    const res = await pdfInfoHandler({ filePath: 'C:/three.pdf' }, fs)
    expect(res.ok).toBe(true)
    expect(res.data?.pageCount).toBe(3)
  })
})
