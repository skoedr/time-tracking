/**
 * Rasterises the Stream Deck plugin's SVG icons into the PNGs Elgato requires
 * (#192).
 *
 * The plugin's own artwork is SVG — that is what the key faces are drawn in at
 * runtime, and SVG is what `setImage`/`setFeedback` accept. The *manifest*
 * icons are a different matter: `streamdeck validate` rejects anything but PNG
 * ("Icon file not found, 'imgs/plugin' — File must be .png"), so a plugin with
 * SVG manifest icons cannot be packed and therefore cannot be distributed.
 *
 * The SVGs stay the source of truth; the PNGs are generated from them and
 * committed, so packing needs no rasteriser in CI. Deliberately NOT gated by a
 * regenerate-and-diff check like resources/licenses.json: sharp's PNG output is
 * not guaranteed byte-identical across platforms, and the release packs on
 * Linux while this is usually run on Windows. Rerun it when an SVG changes.
 *
 *   node scripts/streamdeck-icons.mjs
 *
 * Sizes follow Elgato's manifest documentation:
 *   plugin/category icon   288x288 (@2x 576)
 *   action icon             20x20  (@2x 40)   — list + property inspector
 *   action state image      72x72  (@2x 144)  — the key face before the plugin
 *                                               draws its own
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const plugin = join(root, 'streamdeck-plugin')
/**
 * The SVGs live OUTSIDE the packaged directory on purpose. With `plugin.svg`
 * and `plugin.png` side by side under imgs/, the manifest path `imgs/plugin`
 * is ambiguous and Elgato resolves it to the SVG — "multiple files named
 * 'imgs/plugin' found, using 'imgs/plugin.svg'" — which is exactly the icon
 * that cannot be packed.
 */
const src = join(plugin, 'icons-src')
const imgs = join(plugin, 'com.timetrack.streamdeck.sdPlugin', 'imgs')

/** @type {Array<{ source: string, out: string, size: number }>} */
const TARGETS = [
  // Plugin + category icon (manifest `Icon` / `CategoryIcon`).
  { source: 'plugin.svg', out: 'plugin.png', size: 288 },
  { source: 'plugin.svg', out: 'plugin@2x.png', size: 576 },
  // Action icon in the action list (manifest `Actions[].Icon`).
  { source: 'toggle.svg', out: 'action.png', size: 20 },
  { source: 'toggle.svg', out: 'action@2x.png', size: 40 },
  // Default key face (manifest `Actions[].States[].Image`). The plugin
  // overwrites this at runtime; it is what you see while dragging the action.
  { source: 'toggle.svg', out: 'toggle.png', size: 72 },
  { source: 'toggle.svg', out: 'toggle@2x.png', size: 144 }
]

for (const { source, out, size } of TARGETS) {
  const svg = readFileSync(join(src, source))
  // `density` scales the SVG before rasterising — without it sharp renders at
  // the SVG's intrinsic 72px and upscaling turns the edges to mush.
  const png = await sharp(svg, { density: Math.round((72 * size) / 72) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(join(imgs, out), png)
  console.log(`[streamdeck-icons] ${out} (${size}x${size}, ${png.length} B)`)
}
