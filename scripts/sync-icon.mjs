// Syncs the manually maintained resources/icon.png into build/ so that
// electron-builder picks it up as the app/installer/exe icon.
// - build/icon.png  → 1024×1024 PNG (macOS / Linux / fallback)
// - build/icon.ico  → multi-resolution Windows icon (16/24/32/48/64/128/256)
//
// Run automatically via the `prebuild` npm hook. The source of truth is
// resources/icon.png — replace that file to update the app icon.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'resources', 'icon.png')

if (!existsSync(source)) {
  console.error(`[sync-icon] missing source: ${source}`)
  process.exit(1)
}

const buildDir = join(root, 'build')
mkdirSync(buildDir, { recursive: true })

const srcBuf = readFileSync(source)

// 1) build/icon.png — square 1024×1024 with transparent padding if needed.
const png1024 = await sharp(srcBuf)
  .resize({
    width: 1024,
    height: 1024,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png({ compressionLevel: 9 })
  .toBuffer()
writeFileSync(join(buildDir, 'icon.png'), png1024)
console.log('[sync-icon] build/icon.png written (1024×1024)')

// 2) build/icon.ico — multi-resolution from the same source.
const sizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngs = await Promise.all(
  sizes.map((size) =>
    sharp(srcBuf)
      .resize({
        width: size,
        height: size,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toBuffer()
  )
)
const ico = await pngToIco(icoPngs)
writeFileSync(join(buildDir, 'icon.ico'), ico)
console.log(`[sync-icon] build/icon.ico written (${sizes.join('/')})`)
