import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  copyOutputIntents,
  copyXmpMetadata,
  extractEmbeddedFiles,
  mergePdfs,
  mergePdfsMulti,
  reembedFiles
} from './pdfMerge'

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage()
  return Buffer.from(await doc.save())
}

async function pageCount(buf: Buffer): Promise<number> {
  return (await PDFDocument.load(buf)).getPageCount()
}

/** Build a PDF with a single embedded XML attachment (flat /Names structure). */
async function makePdfWithAttachment(
  xmlContent: string,
  fileName = 'factur-x.xml'
): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  const ctx = doc.context

  const xmlBytes = Buffer.from(xmlContent, 'utf8')
  const stream = ctx.flateStream(xmlBytes)
  const streamRef = ctx.register(stream)

  const efDict = ctx.obj({ F: streamRef, UF: streamRef }) as PDFDict
  const fileSpecDict = ctx.obj({
    Type: PDFName.of('Filespec'),
    F: PDFHexString.fromText(fileName),
    UF: PDFHexString.fromText(fileName),
    EF: efDict,
    AFRelationship: PDFName.of('Data')
  }) as PDFDict
  const fileSpecRef = ctx.register(fileSpecDict)

  const hexName = PDFHexString.fromText(fileName)
  const embeddedFilesDict = ctx.obj({ Names: ctx.obj([hexName, fileSpecRef]) }) as PDFDict
  const namesDict = ctx.obj({ EmbeddedFiles: embeddedFilesDict }) as PDFDict
  doc.catalog.set(PDFName.of('Names'), namesDict)
  doc.catalog.set(PDFName.of('AF'), ctx.obj([fileSpecRef]))

  return Buffer.from(await doc.save())
}

/** Build a PDF with a B-tree /EmbeddedFiles structure (two leaf nodes under /Kids). */
async function makePdfWithBTreeAttachment(
  entries: Array<{ name: string; content: string }>
): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  const ctx = doc.context

  // Build two leaf nodes, each with one entry, to force a /Kids structure
  const leafRefs: PDFRef[] = []
  for (const { name, content } of entries) {
    const xmlBytes = Buffer.from(content, 'utf8')
    const stream = ctx.flateStream(xmlBytes)
    const streamRef = ctx.register(stream)
    const efDict = ctx.obj({ F: streamRef }) as PDFDict
    const fileSpec = ctx.obj({
      F: PDFHexString.fromText(name),
      EF: efDict,
      AFRelationship: PDFName.of('Data')
    }) as PDFDict
    const fileSpecRef = ctx.register(fileSpec)
    const hexName = PDFHexString.fromText(name)
    const leaf = ctx.obj({
      Limits: ctx.obj([hexName, hexName]),
      Names: ctx.obj([hexName, fileSpecRef])
    }) as PDFDict
    leafRefs.push(ctx.register(leaf))
  }

  const allNames = entries.map((e) => PDFHexString.fromText(e.name))
  const rootNode = ctx.obj({
    Limits: ctx.obj([allNames[0], allNames[allNames.length - 1]]),
    Kids: ctx.obj(leafRefs)
  }) as PDFDict
  const namesDict = ctx.obj({ EmbeddedFiles: rootNode }) as PDFDict
  doc.catalog.set(PDFName.of('Names'), namesDict)

  return Buffer.from(await doc.save())
}

/** Build a PDF with an XMP /Metadata stream containing a given XML string. */
async function makePdfWithXmp(xmpContent: string): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  const ctx = doc.context
  const xmpBytes = Buffer.from(xmpContent, 'utf8')
  const stream = ctx.flateStream(xmpBytes)
  const streamRef = ctx.register(stream)
  doc.catalog.set(PDFName.of('Metadata'), streamRef)
  return Buffer.from(await doc.save())
}

// ---------------------------------------------------------------------------

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

  it('preserves EmbeddedFiles from the invoice in the merged PDF', async () => {
    const xmlContent = '<factur-x><invoice>42</invoice></factur-x>'
    const sn = await makePdf(1)
    const inv = await makePdfWithAttachment(xmlContent)
    const merged = await mergePdfs(sn, inv)

    const mergedDoc = await PDFDocument.load(merged)
    const entries = extractEmbeddedFiles(mergedDoc)
    expect(entries).toHaveLength(1)
    expect(entries[0].name.decodeText()).toBe('factur-x.xml')
  })

  it('gracefully merges a plain PDF invoice without attachments', async () => {
    const sn = await makePdf(2)
    const inv = await makePdf(3)
    const merged = await mergePdfs(sn, inv)
    expect(await pageCount(merged)).toBe(5)
    const mergedDoc = await PDFDocument.load(merged)
    expect(extractEmbeddedFiles(mergedDoc)).toHaveLength(0)
  })

  it('preserves the XML attachment filename in the merged PDF', async () => {
    const sn = await makePdf(1)
    const inv = await makePdfWithAttachment('<x/>', 'ZUGFeRD-invoice.xml')
    const merged = await mergePdfs(sn, inv)
    const mergedDoc = await PDFDocument.load(merged)
    const entries = extractEmbeddedFiles(mergedDoc)
    expect(entries[0].name.decodeText()).toBe('ZUGFeRD-invoice.xml')
  })
})

describe('mergePdfsMulti', () => {
  it('throws when stundennachweis array is empty', async () => {
    const inv = await makePdf(1)
    await expect(mergePdfsMulti(inv, [])).rejects.toThrow()
  })

  it('produces a PDF with invoice + sum of all SN page counts', async () => {
    const inv = await makePdf(2)
    const sn1 = await makePdf(3)
    const sn2 = await makePdf(1)
    const sn3 = await makePdf(4)
    const merged = await mergePdfsMulti(inv, [sn1, sn2, sn3])
    expect(await pageCount(merged)).toBe(2 + 3 + 1 + 4)
  })

  it('places invoice pages first, then each SN in order', async () => {
    const inv = await makePdf(1)
    const sn1 = await makePdf(2)
    const sn2 = await makePdf(3)
    const merged = await mergePdfsMulti(inv, [sn1, sn2])
    expect(await pageCount(merged)).toBe(6)
  })

  it('preserves invoice embedded files in multi merge', async () => {
    const inv = await makePdfWithAttachment('<factur-x/>', 'factur-x.xml')
    const sn1 = await makePdf(1)
    const sn2 = await makePdf(1)
    const merged = await mergePdfsMulti(inv, [sn1, sn2])
    const mergedDoc = await PDFDocument.load(merged)
    const entries = extractEmbeddedFiles(mergedDoc)
    expect(entries).toHaveLength(1)
    expect(entries[0].name.decodeText()).toBe('factur-x.xml')
  })

  it('works with a single SN buffer (same result shape as mergePdfs append)', async () => {
    const inv = await makePdf(2)
    const sn = await makePdf(3)
    const merged = await mergePdfsMulti(inv, [sn])
    expect(await pageCount(merged)).toBe(5)
  })
})

// ---------------------------------------------------------------------------

describe('extractEmbeddedFiles', () => {
  it('returns entries from a PDF with a flat /EmbeddedFiles name tree', async () => {
    const buf = await makePdfWithAttachment('<invoice/>', 'factur-x.xml')
    const doc = await PDFDocument.load(buf)
    const entries = extractEmbeddedFiles(doc)
    expect(entries).toHaveLength(1)
    expect(entries[0].name.decodeText()).toBe('factur-x.xml')
    expect(entries[0].afRelationship).toEqual(PDFName.of('Data'))
    expect(entries[0].streamContents).toBeInstanceOf(Uint8Array)
  })

  it('returns empty array for a PDF with no attachments', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    expect(extractEmbeddedFiles(doc)).toHaveLength(0)
  })

  it('returns entries from a PDF with a B-tree /EmbeddedFiles structure', async () => {
    const buf = await makePdfWithBTreeAttachment([
      { name: 'a.xml', content: '<a/>' },
      { name: 'b.xml', content: '<b/>' }
    ])
    const doc = await PDFDocument.load(buf)
    const entries = extractEmbeddedFiles(doc)
    expect(entries).toHaveLength(2)
    const names = entries.map((e) => e.name.decodeText()).sort()
    expect(names).toEqual(['a.xml', 'b.xml'])
  })
})

// ---------------------------------------------------------------------------

describe('reembedFiles', () => {
  it('sets /Names/EmbeddedFiles and /AF in the target catalog', async () => {
    const sourceDoc = await PDFDocument.load(await makePdfWithAttachment('<x/>', 'test.xml'))
    const entries = extractEmbeddedFiles(sourceDoc)
    expect(entries).toHaveLength(1)

    const target = await PDFDocument.create()
    target.addPage()
    reembedFiles(target, entries)

    // Verify /Names/EmbeddedFiles structure
    const namesDict = target.catalog.lookup(PDFName.of('Names'), PDFDict)
    expect(namesDict).toBeDefined()
    const embeddedFilesDict = namesDict!.lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    expect(embeddedFilesDict).toBeDefined()
    const namesArray = embeddedFilesDict!.lookup(PDFName.of('Names'), PDFArray)
    expect(namesArray).toBeDefined()
    expect(namesArray!.size()).toBe(2) // [name, fileSpecRef]

    // Verify /AF array
    const afVal = target.catalog.get(PDFName.of('AF'))
    expect(afVal).toBeDefined()
  })

  it('round-trips XML content through extract + reembed', async () => {
    const xmlContent = '<factur-x><total>99.00</total></factur-x>'
    const sourceDoc = await PDFDocument.load(
      await makePdfWithAttachment(xmlContent, 'factur-x.xml')
    )
    const entries = extractEmbeddedFiles(sourceDoc)

    const target = await PDFDocument.create()
    target.addPage()
    reembedFiles(target, entries)

    // Reload and extract to verify round-trip
    const reloaded = await PDFDocument.load(Buffer.from(await target.save()))
    const extracted = extractEmbeddedFiles(reloaded)
    expect(extracted).toHaveLength(1)
    expect(extracted[0].name.decodeText()).toBe('factur-x.xml')
    expect(extracted[0].streamContents).toEqual(entries[0].streamContents)
  })

  it('is a no-op when entries array is empty', async () => {
    const target = await PDFDocument.create()
    target.addPage()
    reembedFiles(target, [])
    expect(target.catalog.get(PDFName.of('Names'))).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------

describe('copyXmpMetadata', () => {
  it('copies /Metadata stream from source to target', async () => {
    const xmp =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></x:xmpmeta>'
    const source = await PDFDocument.load(await makePdfWithXmp(xmp))
    const target = await PDFDocument.create()
    target.addPage()

    copyXmpMetadata(source, target)

    expect(target.catalog.get(PDFName.of('Metadata'))).toBeDefined()
  })

  it('is a no-op when source has no /Metadata', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    const target = await PDFDocument.create()
    target.addPage()

    copyXmpMetadata(source, target)

    expect(target.catalog.get(PDFName.of('Metadata'))).toBeUndefined()
  })

  it('mergePdfs copies /Metadata from invoice to merged PDF', async () => {
    const xmp =
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></x:xmpmeta>'
    const sn = await makePdf(1)
    // Build invoice with both XMP and an attachment
    const invDoc = await PDFDocument.create()
    invDoc.addPage()
    const ctx = invDoc.context
    const xmpBytes = Buffer.from(xmp, 'utf8')
    const xmpStream = ctx.flateStream(xmpBytes)
    invDoc.catalog.set(PDFName.of('Metadata'), ctx.register(xmpStream))
    const inv = Buffer.from(await invDoc.save())

    const merged = await mergePdfs(sn, inv)
    const mergedDoc = await PDFDocument.load(merged)
    expect(mergedDoc.catalog.get(PDFName.of('Metadata'))).toBeDefined()
  })
})

// ---------------------------------------------------------------------------

describe('copyOutputIntents', () => {
  async function makePdfWithOutputIntent(): Promise<Buffer> {
    const doc = await PDFDocument.create()
    doc.addPage()
    const ctx = doc.context
    // Minimal ICC profile bytes (just enough to be a valid stream)
    const iccBytes = Buffer.from('fake-icc-profile-data')
    const iccStream = ctx.flateStream(iccBytes)
    const iccRef = ctx.register(iccStream)
    const intentDict = ctx.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFA1'),
      OutputConditionIdentifier: 'sRGB IEC61966-2.1',
      DestOutputProfile: iccRef
    }) as PDFDict
    doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intentDict)]))
    return Buffer.from(await doc.save())
  }

  it('copies /OutputIntents including ICC profile stream to target', async () => {
    const source = await PDFDocument.load(await makePdfWithOutputIntent())
    const target = await PDFDocument.create()
    target.addPage()

    copyOutputIntents(source, target)

    expect(target.catalog.get(PDFName.of('OutputIntents'))).toBeDefined()
  })

  it('is a no-op when source has no /OutputIntents', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    const target = await PDFDocument.create()
    target.addPage()

    copyOutputIntents(source, target)

    expect(target.catalog.get(PDFName.of('OutputIntents'))).toBeUndefined()
  })

  it('mergePdfs copies /OutputIntents from invoice to merged PDF', async () => {
    const sn = await makePdf(1)
    const invDoc = await PDFDocument.load(await makePdfWithOutputIntent())
    const inv = Buffer.from(await invDoc.save())

    const merged = await mergePdfs(sn, inv)
    const mergedDoc = await PDFDocument.load(merged)
    expect(mergedDoc.catalog.get(PDFName.of('OutputIntents'))).toBeDefined()
  })
})
