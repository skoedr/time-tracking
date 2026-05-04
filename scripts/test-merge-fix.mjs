#!/usr/bin/env node
/**
 * Test the factur-X fix by merging a real invoice with a Stundennachweis
 * and validating the result with our extractEmbeddedFiles function.
 *
 * Usage: node scripts/test-merge-fix.mjs <invoice.pdf> <stundennachweis.pdf> <output.pdf>
 */
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { register } from 'node:module'

const [,, invoicePath, snPath, outPath] = process.argv
if (!invoicePath || !snPath || !outPath) {
  console.error('Usage: node scripts/test-merge-fix.mjs <invoice.pdf> <sn.pdf> <output.pdf>')
  process.exit(1)
}

// Load pdf-lib directly (it's a CJS module)
const require = createRequire(import.meta.url)
const pdfLib = require('pdf-lib')
const { PDFDocument, PDFDict, PDFArray, PDFName, PDFRef, PDFHexString, PDFString, PDFRawStream } = pdfLib

// --- copy of extractEmbeddedFiles + reembedFiles logic ---

function traverseNameTree(doc, node) {
  const ctx = doc.context
  const namesVal = node.get(PDFName.of('Names'))
  if (namesVal) {
    const arr = namesVal instanceof PDFRef ? ctx.lookup(namesVal, PDFArray) : namesVal instanceof PDFArray ? namesVal : undefined
    if (!arr) return []
    const result = []
    for (let i = 0; i + 1 < arr.size(); i += 2) {
      const k = arr.get(i), v = arr.get(i + 1)
      if ((k instanceof PDFHexString || k instanceof PDFString) && v instanceof PDFRef) result.push([k, v])
    }
    return result
  }
  const kidsVal = node.get(PDFName.of('Kids'))
  if (kidsVal) {
    const arr = kidsVal instanceof PDFRef ? ctx.lookup(kidsVal, PDFArray) : kidsVal instanceof PDFArray ? kidsVal : undefined
    if (!arr) return []
    const result = []
    for (let i = 0; i < arr.size(); i++) {
      const kid = arr.get(i)
      const kidNode = kid instanceof PDFRef ? ctx.lookup(kid, PDFDict) : kid instanceof PDFDict ? kid : undefined
      if (kidNode) result.push(...traverseNameTree(doc, kidNode))
    }
    return result
  }
  return []
}

function extractEmbeddedFiles(doc) {
  try {
    const ctx = doc.context
    const namesDict = doc.catalog.lookup(PDFName.of('Names'), PDFDict)
    if (!namesDict) return []
    const efVal = namesDict.get(PDFName.of('EmbeddedFiles'))
    if (!efVal) return []
    const efDict = efVal instanceof PDFRef ? ctx.lookup(efVal, PDFDict) : efVal instanceof PDFDict ? efVal : undefined
    if (!efDict) return []
    const pairs = traverseNameTree(doc, efDict)
    const entries = []
    for (const [name, fsRef] of pairs) {
      try {
        const fs = ctx.lookup(fsRef, PDFDict)
        if (!fs) continue
        const efD = fs.lookup(PDFName.of('EF'), PDFDict)
        if (!efD) continue
        const streamRef = efD.get(PDFName.of('F'))
        if (!(streamRef instanceof PDFRef)) continue
        const stream = ctx.lookup(streamRef, PDFRawStream)
        if (!stream) continue
        const afRel = fs.get(PDFName.of('AFRelationship'))
        entries.push({
          name: name instanceof PDFHexString ? name : PDFHexString.fromText(name.decodeText()),
          streamContents: stream.contents,
          streamDict: stream.dict,
          afRelationship: afRel instanceof PDFName ? afRel : undefined
        })
      } catch {}
    }
    return entries
  } catch { return [] }
}

function reembedFiles(target, entries) {
  if (!entries.length) return
  const ctx = target.context
  const afRefs = [], pairs = []
  for (const entry of entries) {
    const newStream = new PDFRawStream(entry.streamDict, entry.streamContents)
    const streamRef = ctx.register(newStream)
    const efDict = ctx.obj({ F: streamRef, UF: streamRef })
    const fsDict = ctx.obj({ Type: PDFName.of('Filespec'), F: entry.name, UF: entry.name, EF: efDict })
    if (entry.afRelationship) fsDict.set(PDFName.of('AFRelationship'), entry.afRelationship)
    const fsRef = ctx.register(fsDict)
    afRefs.push(fsRef)
    pairs.push(entry.name, fsRef)
  }
  const efDict = ctx.obj({ Names: ctx.obj(pairs) })
  const namesVal = target.catalog.get(PDFName.of('Names'))
  let namesDict = namesVal instanceof PDFRef ? ctx.lookup(namesVal, PDFDict) : namesVal instanceof PDFDict ? namesVal : undefined
  if (namesDict) namesDict.set(PDFName.of('EmbeddedFiles'), efDict)
  else target.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: efDict }))
  target.catalog.set(PDFName.of('AF'), ctx.obj(afRefs))
}

function copyXmpMetadata(source, target) {
  const metaVal = source.catalog.get(PDFName.of('Metadata'))
  if (!metaVal) return
  const sourceCtx = source.context
  let stream = metaVal instanceof PDFRef ? sourceCtx.lookup(metaVal, PDFRawStream) : metaVal instanceof PDFRawStream ? metaVal : undefined
  if (!stream) return
  const newStream = new PDFRawStream(stream.dict, stream.contents)
  const newRef = target.context.register(newStream)
  target.catalog.set(PDFName.of('Metadata'), newRef)
}

// --- main ---

console.log('Reading files...')
const invoiceBuf = readFileSync(invoicePath)
const snBuf = readFileSync(snPath)

console.log('Loading PDFs...')
const [invDoc, snDoc] = await Promise.all([PDFDocument.load(invoiceBuf), PDFDocument.load(snBuf)])

console.log('Extracting embedded files from invoice...')
const entries = extractEmbeddedFiles(invDoc)
console.log(`  Found ${entries.length} embedded file(s):`, entries.map(e => e.name.decodeText()))

console.log('Merging pages...')
const merged = await PDFDocument.create()
for (const p of await merged.copyPages(invDoc, invDoc.getPageIndices())) merged.addPage(p)
for (const p of await merged.copyPages(snDoc, snDoc.getPageIndices())) merged.addPage(p)

console.log('Re-embedding files...')
reembedFiles(merged, entries)
console.log('Copying XMP metadata...')
copyXmpMetadata(invDoc, merged)

console.log('Saving...')
const outBuf = Buffer.from(await merged.save())
writeFileSync(outPath, outBuf)
console.log(`  Written: ${outPath} (${outBuf.length} bytes, ${merged.getPageCount()} pages)`)

console.log('\nVerifying output...')
const verify = await PDFDocument.load(outBuf)
const verified = extractEmbeddedFiles(verify)
console.log(`  Embedded files in output: ${verified.length}`)
for (const e of verified) console.log(`    - "${e.name.decodeText()}" (${e.streamContents.length} bytes)`)
console.log(`  /AF present: ${!!verify.catalog.get(PDFName.of('AF'))}`)
console.log('\nDone. Now run:')
console.log(`  java -jar Mustang-CLI-2.23.0.jar --action validate --source "${outPath}"`)
