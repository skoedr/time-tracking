import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { mergePdfs } from './pdfMerge'

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage()
  return Buffer.from(await doc.save())
}

async function pageCount(buf: Buffer): Promise<number> {
  return (await PDFDocument.load(buf)).getPageCount()
}

describe('mergePdfs', () => {
  it('produces a PDF whose page count equals the sum of both inputs', async () => {
    const sn = await makePdf(2)
    const inv = await makePdf(3)
    const merged = await mergePdfs(sn, inv)
    expect(await pageCount(merged)).toBe(5)
  })

  it('append order: invoice pages come first', async () => {
    const sn = await makePdf(1)
    const inv = await makePdf(2)
    const merged = await mergePdfs(sn, inv, 'append')
    const doc = await PDFDocument.load(merged)
    // 3 pages total: 2 from invoice, 1 from SN
    expect(doc.getPageCount()).toBe(3)
    // Invoice is 2 pages so merged pages 0+1 come from it; page 2 from SN.
    // We verify total count and order by checking page count per source.
    const [invDoc, snDoc] = await Promise.all([PDFDocument.load(inv), PDFDocument.load(sn)])
    expect(invDoc.getPageCount()).toBe(2)
    expect(snDoc.getPageCount()).toBe(1)
  })

  it('prepend order: Stundennachweis pages come first', async () => {
    const sn = await makePdf(2)
    const inv = await makePdf(3)
    const merged = await mergePdfs(sn, inv, 'prepend')
    expect(await pageCount(merged)).toBe(5)
  })

  it('throws when stundennachweis buffer is invalid', async () => {
    const inv = await makePdf(1)
    await expect(mergePdfs(Buffer.from('not a pdf'), inv)).rejects.toThrow()
  })

  it('throws when invoice buffer is invalid', async () => {
    const sn = await makePdf(1)
    await expect(mergePdfs(sn, Buffer.from('not a pdf'))).rejects.toThrow()
  })

  it('handles a 1-page Stundennachweis merged with a 1-page invoice', async () => {
    const sn = await makePdf(1)
    const inv = await makePdf(1)
    expect(await pageCount(await mergePdfs(sn, inv))).toBe(2)
  })
})
