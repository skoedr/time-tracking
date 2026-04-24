// Regenerates app + tray icons from timetrack_icon_glass_final.svg.
// The source SVG is a sheet (680x560.46 viewBox) containing the hero icon
// at the top-center and two simplified tray variants on the right.
// We render the sheet at high density, crop each region by SVG coordinates
// (scaled to pixels), auto-trim transparent borders, and resize to targets.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const svgPath = join(root, 'timetrack_icon_glass_final.svg')

// Source SVG viewBox is 680 x 560.46. Render at 6x → ~4080 x 3363 pixels.
// Coordinates below were determined empirically by extracting + previewing.
const SCALE = 6
const renderWidth = 4080

// Pixel-coordinate bounding boxes inside the rendered sheet.
const REGIONS = {
  hero: { left: 1320, top: 80, width: 1440, height: 1320 },
  trayRunning: { left: 3060, top: 2240, width: 540, height: 420 },
  trayStopped: { left: 3060, top: 2810, width: 540, height: 420 }
}

async function main() {
  if (!existsSync(svgPath)) {
    throw new Error(`Source SVG missing: ${svgPath}`)
  }
  const svgBuf = readFileSync(svgPath)

  // Render the whole sheet once at high density.
  const sheet = await sharp(svgBuf, { density: 96 * SCALE })
    .resize({ width: renderWidth })
    .png()
    .toBuffer()

  mkdirSync(join(root, 'build'), { recursive: true })
  mkdirSync(join(root, 'resources'), { recursive: true })

  // Helper: extract a region, auto-trim transparent borders, fit into a square
  // with transparent padding so the icon centers nicely at the target size.
  async function extractSquare(region, size) {
    const cropped = await sharp(sheet).extract(region).png().toBuffer()
    const meta = await sharp(cropped).metadata()
    const side = Math.max(meta.width ?? 0, meta.height ?? 0)
    // Pad to square, then resize to target.
    const square = await sharp(cropped)
      .resize({
        width: side,
        height: side,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer()
    return sharp(square)
      .resize({ width: size, height: size, fit: 'contain' })
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  // 1. Hero app icon — 1024×1024 PNG (electron-builder consumes this)
  const hero1024 = await extractSquare(REGIONS.hero, 1024)
  writeFileSync(join(root, 'build', 'icon.png'), hero1024)
  writeFileSync(join(root, 'resources', 'icon.png'), hero1024)
  console.log('build/icon.png + resources/icon.png written (1024×1024)')

  // 2. Hero ICO — multi-resolution for Windows
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const heroPngs = await Promise.all(sizes.map((s) => extractSquare(REGIONS.hero, s)))
  const ico = await pngToIco(heroPngs)
  writeFileSync(join(root, 'build', 'icon.ico'), ico)
  console.log(`build/icon.ico written (${sizes.join('/')})`)

  // 3. Tray icons — 32×32 PNG (Electron auto-picks @2x density on HiDPI)
  const trayRunning = await extractSquare(REGIONS.trayRunning, 32)
  const trayStopped = await extractSquare(REGIONS.trayStopped, 32)
  writeFileSync(join(root, 'resources', 'tray-running.png'), trayRunning)
  writeFileSync(join(root, 'resources', 'tray-stopped.png'), trayStopped)

  // Also emit @2x variants for HiDPI displays.
  const trayRunning2x = await extractSquare(REGIONS.trayRunning, 64)
  const trayStopped2x = await extractSquare(REGIONS.trayStopped, 64)
  writeFileSync(join(root, 'resources', 'tray-running@2x.png'), trayRunning2x)
  writeFileSync(join(root, 'resources', 'tray-stopped@2x.png'), trayStopped2x)
  console.log('resources/tray-{running,stopped}.png + @2x written (32×32 / 64×64)')

  // 4. Side-by-side preview for visual sanity check (not committed).
  mkdirSync(join(root, '.icon-build'), { recursive: true })
  const previewPieces = await Promise.all([
    extractSquare(REGIONS.hero, 256),
    extractSquare(REGIONS.trayRunning, 128),
    extractSquare(REGIONS.trayStopped, 128)
  ])
  const preview = await sharp({
    create: {
      width: 256 + 128 + 128 + 32,
      height: 256,
      channels: 4,
      background: { r: 245, g: 245, b: 250, alpha: 1 }
    }
  })
    .composite([
      { input: previewPieces[0], left: 0, top: 0 },
      { input: previewPieces[1], left: 256 + 16, top: 64 },
      { input: previewPieces[2], left: 256 + 16 + 128 + 16, top: 64 }
    ])
    .png()
    .toBuffer()
  writeFileSync(join(root, '.icon-build', 'preview.png'), preview)
  console.log('.icon-build/preview.png written for review')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
