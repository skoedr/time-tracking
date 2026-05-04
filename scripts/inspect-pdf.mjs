#!/usr/bin/env node
/**
 * Quick inspector: shows what EmbeddedFiles structure a PDF has.
 * Usage: node scripts/inspect-pdf.mjs <path-to.pdf>
 */
import { readFileSync } from 'fs'
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFRef, PDFHexString, PDFString, PDFRawStream } from 'pdf-lib'
import { inflate } from 'zlib'
import { promisify } from 'util'

const inflateAsync = promisify(inflate)
const filePath = process.argv[2]
if (!filePath) { console.error('Usage: node scripts/inspect-pdf.mjs <path>'); process.exit(1) }

const buf = readFileSync(filePath)
const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
const ctx = doc.context

console.log('\n=== Catalog keys ===')
const catalogKeys = []
doc.catalog.entries().forEach(([k]) => catalogKeys.push(k.toString()))
console.log(catalogKeys.join(', '))

console.log('\n=== /Names dict ===')
const namesVal = doc.catalog.get(PDFName.of('Names'))
if (!namesVal) {
  console.log('  (no /Names in catalog)')
} else {
  let namesDict
  if (namesVal instanceof PDFRef) namesDict = ctx.lookup(namesVal, PDFDict)
  else if (namesVal instanceof PDFDict) namesDict = namesVal
  if (namesDict) {
    const keys = []
    namesDict.entries().forEach(([k]) => keys.push(k.toString()))
    console.log('  keys:', keys.join(', '))

    const efVal = namesDict.get(PDFName.of('EmbeddedFiles'))
    if (efVal) {
      console.log('  /EmbeddedFiles present!')
      let efDict = efVal instanceof PDFRef ? ctx.lookup(efVal, PDFDict) : efVal
      const namesArr = efDict?.get(PDFName.of('Names'))
      if (namesArr) {
        const arr = namesArr instanceof PDFRef ? ctx.lookup(namesArr, PDFArray) : namesArr
        console.log(`  flat /Names array, ${arr?.size()} entries`)
        for (let i = 0; i + 1 < arr?.size(); i += 2) {
          const k = arr.get(i)
          const name = k instanceof PDFHexString ? k.decodeText() : k instanceof PDFString ? k.decodeText() : k?.toString()
          console.log(`    [${i/2}] name = "${name}"`)
          const ref = arr.get(i + 1)
          if (ref instanceof PDFRef) {
            const fs = ctx.lookup(ref, PDFDict)
            if (fs) {
              const efD = fs.lookup(PDFName.of('EF'), PDFDict)
              const fRef = efD?.get(PDFName.of('F'))
              if (fRef instanceof PDFRef) {
                const stream = ctx.lookup(fRef, PDFRawStream)
                if (stream) {
                  const compressed = stream.contents
                  try {
                    const raw = await inflateAsync(compressed)
                    const text = raw.toString('utf8').slice(0, 200)
                    console.log(`    [${i/2}] stream size = ${compressed.length} bytes (compressed)`)
                    console.log(`    [${i/2}] content preview = ${text}`)
                  } catch {
                    console.log(`    [${i/2}] stream size = ${compressed.length} bytes (uncompressed or other filter)`)
                    console.log(`    [${i/2}] content preview = ${Buffer.from(compressed).toString('utf8').slice(0, 200)}`)
                  }
                }
              }
            }
          }
        }
      } else {
        const kidsVal = efDict?.get(PDFName.of('Kids'))
        if (kidsVal) console.log('  B-tree structure (/Kids found)')
        else console.log('  unknown structure in /EmbeddedFiles')
      }
    } else {
      console.log('  no /EmbeddedFiles key')
    }
  }
}

console.log('\n=== /AF array ===')
const afVal = doc.catalog.get(PDFName.of('AF'))
console.log(afVal ? '  /AF present' : '  (no /AF in catalog)')

console.log('\n=== Page count ===')
console.log(' ', doc.getPageCount(), 'pages')
