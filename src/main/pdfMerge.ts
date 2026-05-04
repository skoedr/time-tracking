import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString
} from 'pdf-lib'

export type MergeOrder = 'append' | 'prepend'

/**
 * Create a PDFRawStream bypassing the private constructor declaration.
 * The constructor is private only in type declarations, not at runtime.
 * This is the only way to copy raw (already-compressed) stream bytes
 * between PDF contexts without re-encoding.
 */
function makePDFRawStream(dict: PDFDict, contents: Uint8Array): PDFRawStream {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (PDFRawStream as any)(dict, contents) as PDFRawStream
}

export interface EmbeddedFileEntry {
  /** Filename as a hex string (e.g. "factur-x.xml" encoded as PDFHexString) */
  name: PDFHexString
  /** Raw compressed bytes from the source stream (preserved without re-encoding) */
  streamContents: Uint8Array
  /** Compression filter info from the source stream (/Filter, /Length, etc.) */
  streamDict: PDFDict
  /** /AFRelationship value from the file spec dict (e.g. PDFName.of('Data')) */
  afRelationship?: PDFName
}

/**
 * Recursively traverse a PDF name tree node, collecting [name, fileSpecRef] pairs.
 * Handles both flat (/Names array) and B-tree (/Kids array) structures per PDF §7.9.6.
 */
function traverseNameTree(
  doc: PDFDocument,
  node: PDFDict
): Array<[PDFHexString | PDFString, PDFRef]> {
  const ctx = doc.context

  const namesVal = node.get(PDFName.of('Names'))
  if (namesVal) {
    const namesArray =
      namesVal instanceof PDFRef
        ? ctx.lookup(namesVal, PDFArray)
        : namesVal instanceof PDFArray
          ? namesVal
          : undefined
    if (!namesArray) return []
    const result: Array<[PDFHexString | PDFString, PDFRef]> = []
    for (let i = 0; i + 1 < namesArray.size(); i += 2) {
      const key = namesArray.get(i)
      const val = namesArray.get(i + 1)
      if ((key instanceof PDFHexString || key instanceof PDFString) && val instanceof PDFRef) {
        result.push([key, val])
      }
    }
    return result
  }

  const kidsVal = node.get(PDFName.of('Kids'))
  if (kidsVal) {
    const kidsArray =
      kidsVal instanceof PDFRef
        ? ctx.lookup(kidsVal, PDFArray)
        : kidsVal instanceof PDFArray
          ? kidsVal
          : undefined
    if (!kidsArray) return []
    const result: Array<[PDFHexString | PDFString, PDFRef]> = []
    for (let i = 0; i < kidsArray.size(); i++) {
      const kid = kidsArray.get(i)
      let kidNode: PDFDict | undefined
      if (kid instanceof PDFRef) {
        kidNode = ctx.lookup(kid, PDFDict)
      } else if (kid instanceof PDFDict) {
        kidNode = kid
      }
      if (kidNode) result.push(...traverseNameTree(doc, kidNode))
    }
    return result
  }

  return []
}

/**
 * Extract all embedded file attachments from a PDF document.
 * Returns an empty array when no EmbeddedFiles entry exists or the structure
 * is unexpected (graceful degradation — merge proceeds without attachments).
 */
export function extractEmbeddedFiles(doc: PDFDocument): EmbeddedFileEntry[] {
  try {
    const ctx = doc.context
    const namesDict = doc.catalog.lookup(PDFName.of('Names'), PDFDict)
    if (!namesDict) return []

    const embeddedFilesVal = namesDict.get(PDFName.of('EmbeddedFiles'))
    if (!embeddedFilesVal) return []

    const embeddedFilesDict =
      embeddedFilesVal instanceof PDFRef
        ? ctx.lookup(embeddedFilesVal, PDFDict)
        : embeddedFilesVal instanceof PDFDict
          ? embeddedFilesVal
          : undefined
    if (!embeddedFilesDict) return []

    const pairs = traverseNameTree(doc, embeddedFilesDict)
    const entries: EmbeddedFileEntry[] = []

    for (const [name, fileSpecRef] of pairs) {
      try {
        const fileSpec = ctx.lookup(fileSpecRef, PDFDict)
        if (!fileSpec) continue

        const efDict = fileSpec.lookup(PDFName.of('EF'), PDFDict)
        if (!efDict) continue

        const streamRefVal = efDict.get(PDFName.of('F'))
        if (!(streamRefVal instanceof PDFRef)) continue

        // ctx.lookup has no PDFRawStream overload in type declarations — cast required
        const stream = ctx.lookup(streamRefVal) as PDFRawStream
        if (!stream) continue

        const afRelVal = fileSpec.get(PDFName.of('AFRelationship'))
        const afRelationship = afRelVal instanceof PDFName ? afRelVal : undefined

        const hexName =
          name instanceof PDFHexString
            ? name
            : PDFHexString.fromText(name.decodeText())

        entries.push({
          name: hexName,
          streamContents: stream.contents,
          streamDict: stream.dict,
          afRelationship
        })
      } catch {
        // Skip malformed entries gracefully
      }
    }

    return entries
  } catch {
    return []
  }
}

/**
 * Re-embed file attachments into a target PDF document.
 * Sets /Names → /EmbeddedFiles (flat name tree) and /AF in the catalog.
 * No-op when entries is empty.
 *
 * TODO: Consider copying fx:/rsm: XMP namespace entries for strict factur-X
 * conformance level validation. Skipped in v1.12.5 to avoid corrupting the
 * merged PDF's own metadata (page count, creation date). Planned for v1.13.
 */
export function reembedFiles(target: PDFDocument, entries: EmbeddedFileEntry[]): void {
  if (entries.length === 0) return

  const ctx = target.context
  const afRefs: PDFRef[] = []
  const nameTreePairs: Array<PDFHexString | PDFRef> = []

  for (const entry of entries) {
    // Copy raw compressed bytes into target context without re-encoding
    const newStream = makePDFRawStream(entry.streamDict, entry.streamContents)
    const streamRef = ctx.register(newStream)

    const efDict = ctx.obj({ F: streamRef, UF: streamRef }) as PDFDict

    const fileSpecDict = ctx.obj({
      Type: PDFName.of('Filespec'),
      F: entry.name,
      UF: entry.name,
      EF: efDict
    }) as PDFDict
    if (entry.afRelationship) {
      fileSpecDict.set(PDFName.of('AFRelationship'), entry.afRelationship)
    }
    const fileSpecRef = ctx.register(fileSpecDict)

    afRefs.push(fileSpecRef)
    nameTreePairs.push(entry.name, fileSpecRef)
  }

  // Build flat /EmbeddedFiles name tree
  const embeddedFilesDict = ctx.obj({
    Names: ctx.obj(nameTreePairs as Parameters<typeof ctx.obj>[0])
  }) as PDFDict

  // Update /Names dict in catalog (create if absent)
  const catalogNamesVal = target.catalog.get(PDFName.of('Names'))
  let namesDict: PDFDict | undefined
  if (catalogNamesVal instanceof PDFRef) {
    namesDict = ctx.lookup(catalogNamesVal, PDFDict)
  } else if (catalogNamesVal instanceof PDFDict) {
    namesDict = catalogNamesVal
  }
  if (namesDict) {
    namesDict.set(PDFName.of('EmbeddedFiles'), embeddedFilesDict)
  } else {
    target.catalog.set(
      PDFName.of('Names'),
      ctx.obj({ EmbeddedFiles: embeddedFilesDict }) as PDFDict
    )
  }

  // Set /AF array for PDF/A-3 machine-readable invoice conformance
  target.catalog.set(
    PDFName.of('AF'),
    ctx.obj(afRefs as Parameters<typeof ctx.obj>[0])
  )
}

/**
 * Copy the /Metadata (XMP) stream from the source PDF into the target.
 * Required for factur-X conformance: Mustang and other validators use the XMP
 * stream to detect e-invoice PDFs before checking /EmbeddedFiles.
 * No-op when source has no /Metadata stream.
 */
export function copyXmpMetadata(source: PDFDocument, target: PDFDocument): void {
  const metaVal = source.catalog.get(PDFName.of('Metadata'))
  if (!metaVal) return

  const sourceCtx = source.context
  let stream: PDFRawStream | undefined
  if (metaVal instanceof PDFRef) {
    // ctx.lookup has no PDFRawStream overload in type declarations — cast required
    stream = sourceCtx.lookup(metaVal) as PDFRawStream
  } else if (metaVal instanceof PDFRawStream) {
    stream = metaVal
  }
  if (!stream) return

  const newStream = makePDFRawStream(stream.dict, stream.contents)
  const newRef = target.context.register(newStream)
  target.catalog.set(PDFName.of('Metadata'), newRef)
}

/**
 * Copy the /OutputIntents array from the source PDF into the target.
 * Required for PDF/A-3 conformance: defines the ICC colour profile (e.g.
 * sRGB IEC61966-2.1) used by the document. Without it, PDF/A validators
 * reject DeviceRGB colour spaces as non-conformant.
 * No-op when source has no /OutputIntents.
 */
export function copyOutputIntents(source: PDFDocument, target: PDFDocument): void {
  const intentsVal = source.catalog.get(PDFName.of('OutputIntents'))
  if (!intentsVal) return

  const sourceCtx = source.context
  const targetCtx = target.context

  // Resolve the array from source
  let srcArray: PDFArray | undefined
  if (intentsVal instanceof PDFRef) {
    srcArray = sourceCtx.lookup(intentsVal, PDFArray)
  } else if (intentsVal instanceof PDFArray) {
    srcArray = intentsVal
  }
  if (!srcArray) return

  // Deep-copy each OutputIntent dict and its DestOutputProfile stream
  const newRefs: PDFRef[] = []
  for (let i = 0; i < srcArray.size(); i++) {
    try {
      const item = srcArray.get(i)
      const intentDict =
        item instanceof PDFRef
          ? sourceCtx.lookup(item, PDFDict)
          : item instanceof PDFDict
            ? item
            : undefined
      if (!intentDict) continue

      // Copy the ICC profile stream if present
      const profileVal = intentDict.get(PDFName.of('DestOutputProfile'))
      let newProfileRef: PDFRef | undefined
      if (profileVal instanceof PDFRef) {
        // ctx.lookup has no PDFRawStream overload in type declarations — cast required
        const profileStream = sourceCtx.lookup(profileVal) as PDFRawStream
        if (profileStream) {
          const newProfile = makePDFRawStream(profileStream.dict, profileStream.contents)
          newProfileRef = targetCtx.register(newProfile)
        }
      }

      // Rebuild the intent dict in target context, key by key
      const newDict = targetCtx.obj({}) as PDFDict
      intentDict.entries().forEach(([key, val]) => {
        if (key.toString() === '/DestOutputProfile') {
          if (newProfileRef) newDict.set(key, newProfileRef)
        } else if (val instanceof PDFRef || val instanceof PDFDict || val instanceof PDFArray) {
          // Skip complex indirect objects — only copy scalar values
        } else {
          newDict.set(key, val)
        }
      })
      newRefs.push(targetCtx.register(newDict))
    } catch {
      // Skip malformed OutputIntent entries gracefully
    }
  }

  if (newRefs.length > 0) {
    target.catalog.set(
      PDFName.of('OutputIntents'),
      targetCtx.obj(newRefs as Parameters<typeof targetCtx.obj>[0])
    )
  }
}

/**
 * Merge two PDF buffers. Stundennachweis is appended to (or prepended before)
 * the invoice. Returns a new buffer — both inputs are unchanged.
 *
 * Embedded file attachments (factur-X / ZUGFeRD XML) and XMP metadata from
 * the invoice are preserved in the merged document.
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

  // Extract embedded files before merge (pdf-lib silently discards EmbeddedFiles
  // when copying pages from a source document into a new PDFDocument)
  const embeddedFiles = extractEmbeddedFiles(invDoc)

  const merged = await PDFDocument.create()
  const first = order === 'append' ? invDoc : snDoc
  const second = order === 'append' ? snDoc : invDoc

  const firstPages = await merged.copyPages(first, first.getPageIndices())
  const secondPages = await merged.copyPages(second, second.getPageIndices())
  firstPages.forEach((p) => merged.addPage(p))
  secondPages.forEach((p) => merged.addPage(p))

  reembedFiles(merged, embeddedFiles)
  copyXmpMetadata(invDoc, merged)
  copyOutputIntents(invDoc, merged)

  return Buffer.from(await merged.save())
}
