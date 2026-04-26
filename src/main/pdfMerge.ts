import { PDFDocument } from 'pdf-lib'

export type MergeOrder = 'append' | 'prepend'

/**
 * Merge two PDF buffers. Stundennachweis is appended to (or prepended before)
 * the invoice. Returns a new buffer — both inputs are unchanged.
 *
 * Throws if either buffer is not a valid, unencrypted PDF.
 *
 * Order: 'append'  → invoice pages first, then Stundennachweis (default)
 *        'prepend' → Stundennachweis first, then invoice pages
 */
export async function mergePdfs(
  stundennachweis: Buffer,
  invoice: Buffer,
  order: MergeOrder = 'append'
): Promise<Buffer> {
  const [snDoc, invDoc] = await Promise.all([
    PDFDocument.load(stundennachweis),
    PDFDocument.load(invoice)
  ])

  const merged = await PDFDocument.create()
  const first = order === 'append' ? invDoc : snDoc
  const second = order === 'append' ? snDoc : invDoc

  const firstPages = await merged.copyPages(first, first.getPageIndices())
  const secondPages = await merged.copyPages(second, second.getPageIndices())
  firstPages.forEach((p) => merged.addPage(p))
  secondPages.forEach((p) => merged.addPage(p))

  return Buffer.from(await merged.save())
}
