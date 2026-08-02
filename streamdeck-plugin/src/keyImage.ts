/**
 * TimeTrack Stream Deck — Tastenflächen ("Glass Keys").
 *
 * Ersetzt svgImage() aus src/actions/toggle-timer.ts (#133).
 * Vier Zustände: running | idle | unset | offline.
 * Alle Werte sind final (siehe README.md, Abschnitt "Design Tokens").
 *
 * Keine Abhängigkeiten. Reines SVG als data:-URL für key.setImage().
 */

// ── Farb-Helfer (sRGB <-> OKLab) ────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const srgbToLin = (c: number): number => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

const linToSrgb = (x: number): number => {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

function rgbToOklab(rgb: [number, number, number]): [number, number, number] {
  const R = srgbToLin(rgb[0]),
    G = srgbToLin(rgb[1]),
    B = srgbToLin(rgb[2])
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function oklabToHex(lab: [number, number, number]): string {
  const [L, a, b] = lab
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return '#' + [R, G, B].map((v) => linToSrgb(v).toString(16).padStart(2, '0')).join('')
}

/** App-Akzent (dark mode) als Fallback für fehlende/ungültige Kundenfarben. */
const ACCENT_FALLBACK = '#8b7cf8'

/**
 * Zieht eine beliebige DB-Kundenfarbe auf eine tastentaugliche Helligkeit:
 * OKLab L = 0.65, Chroma = 0.15, Hue bleibt. Damit hat weiße Schrift auf der
 * Running-Fläche immer >= 4.5:1 — auch bei Pastellgelb oder Neonpink.
 * Graustufen (C < 0.02) bleiben neutral.
 */
export function normalizeKeyColor(hex?: string): string {
  const raw = hex && /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : ACCENT_FALLBACK
  const [, a, b] = rgbToOklab(hexToRgb(raw))
  const C = Math.hypot(a, b)
  if (C < 0.02) return oklabToHex([0.65, 0, 0])
  const k = 0.15 / C
  return oklabToHex([0.65, a * k, b * k])
}

/** Lightness skalieren, Hue/Chroma behalten. Geteilt mit dialImage.ts (#186). */
export function scaleL(hex: string, f: number): string {
  const [L, a, b] = rgbToOklab(hexToRgb(hex))
  return oklabToHex([Math.max(0.05, Math.min(0.92, L * f)), a, b])
}

// ── Typografie ─────────────────────────────────────────────────────────────
// Im Key-SVG ist keine Font eingebettet — daher nur systemsichere Stacks.
// Inter (App-Font) ist hier NICHT verfügbar.

export const FONT = 'Segoe UI, Helvetica, Arial, sans-serif'
export const MONO = 'Consolas, Menlo, monospace'

// ── Bausteine ──────────────────────────────────────────────────────────────

const SHELL = (fill: string): string =>
  `<rect x="4" y="4" width="136" height="136" rx="22" fill="${fill}"/>`

/** Innere 1-px-Kante — macht aus der Fläche eine Glasscheibe. */
const HAIRLINE = (opacity = 0.14): string =>
  `<rect x="5.5" y="5.5" width="133" height="133" rx="20.5" fill="none" stroke="#ffffff" stroke-opacity="${opacity}"/>`

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dataUrl(inner: string): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">' +
    inner +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** h:mm — minutengenau reicht; der Ring trägt die Sekunden. */
function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`
}

export interface KeyLabel {
  /** Kleine Kopfzeile (Kunde, wenn ein Projekt gesetzt ist — sonst leer). */
  header: string
  /** Hauptzeilen (Projekt wenn gesetzt, sonst Kunde), max. 3. */
  lines: string[]
}

export type KeyState = 'idle' | 'running' | 'unset' | 'offline'

// ── Textzeilen ─────────────────────────────────────────────────────────────

function head(text: string, fill: string, size: number, y: number, opacity?: number): string {
  if (!text) return ''
  const op = opacity == null ? '' : ` opacity="${opacity}"`
  return `<text x="72" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="500" fill="${fill}"${op} text-anchor="middle">${escapeXml(text)}</text>`
}

/**
 * Hauptzeilen, 21 px / 600, zentriert.
 * 1 Zeile -> y 84 · 2 Zeilen -> y 76/101 · 3 Zeilen -> y 68/93/118
 */
function mainLines(lines: string[], fill: string): string {
  const ys = lines.length === 1 ? [84] : lines.length === 2 ? [76, 101] : [68, 93, 118]
  return lines
    .slice(0, 3)
    .map(
      (l, i) =>
        `<text x="72" y="${ys[i]}" font-family="${FONT}" font-size="21" font-weight="600" fill="${fill}" text-anchor="middle">${escapeXml(l)}</text>`
    )
    .join('')
}

// ── Minutenring ────────────────────────────────────────────────────────────

/**
 * Rounded square x/y 9, w/h 126, r 19 as an explicit path: starts at top
 * center (72, 9), runs clockwise — like a clock hand.
 */
const RING_PATH =
  'M 72 9 H 116 A 19 19 0 0 1 135 28 V 116 A 19 19 0 0 1 116 135 H 28 ' +
  'A 19 19 0 0 1 9 116 V 28 A 19 19 0 0 1 28 9 H 72'
/** Straights 44+88+88+88+44 = 352, plus 4 quarter arcs (2π·19) ≈ 471.4. */
const RING_LENGTH = 352 + 2 * Math.PI * 19

// ── Zustände ───────────────────────────────────────────────────────────────

function runningFace(label: KeyLabel, color: string | undefined, elapsedSec: number): string {
  const base = normalizeKeyColor(color)
  const top = scaleL(base, 1.18)
  const bot = scaleL(base, 0.62)
  const sec = Math.max(0, Math.floor(elapsedSec))
  // The Stream Deck renderer rasterizes ONE static frame and supports neither
  // SMIL nor pathLength (confirmed on hardware: pathLength ignored ⇒ the dash
  // pattern repeated ~4× around the real ~471-unit perimeter). The progress is
  // therefore an explicit clockwise path starting at top center, dashed in
  // REAL user units; re-rendering advances it.
  const dash = ((sec % 60) / 60) * RING_LENGTH
  const ring =
    `<rect x="9" y="9" width="126" height="126" rx="19" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3"/>` +
    (dash > 0.5
      ? `<path d="${RING_PATH}" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${Math.ceil(RING_LENGTH)}"/>`
      : '')
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="0.55" stop-color="${base}"/>` +
    `<stop offset="1" stop-color="${bot}"/></linearGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    `<rect x="10" y="10" width="124" height="56" rx="17" fill="url(#s)"/>` +
    ring +
    head(label.header || label.lines[0] || '', '#ffffff', 13, 32, 0.8) +
    (label.header
      ? `<text x="72" y="58" font-family="${FONT}" font-size="19" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(label.lines[0] ?? '')}</text>`
      : '') +
    `<text x="72" y="104" font-family="${MONO}" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="-1">${formatElapsed(sec)}</text>` +
    // Frame-by-frame pulse (no SMIL on the deck): sampled at 1 fps by the
    // render tick, a 4 s cosine breathes in four steps — 1 → 0.68 → 0.35 → 0.68.
    `<circle cx="72" cy="124" r="4.5" fill="#ffffff" opacity="${(0.675 + 0.325 * Math.cos((2 * Math.PI * (sec % 4)) / 4)).toFixed(2)}"/>`
  )
}

function idleFace(label: KeyLabel, color: string | undefined): string {
  const accent = normalizeKeyColor(color)
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#242844"/><stop offset="1" stop-color="#0d1020"/></linearGradient>` +
    `<radialGradient id="w" cx="0.5" cy="1" r="0.85">` +
    `<stop offset="0" stop-color="${accent}" stop-opacity="0.32"/>` +
    `<stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.13"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    SHELL('url(#w)') +
    `<rect x="10" y="10" width="124" height="58" rx="17" fill="url(#s)"/>` +
    HAIRLINE() +
    head(label.header, '#8b93bc', 14, 34) +
    mainLines(label.lines, '#e8eaf6') +
    `<rect x="52" y="122" width="40" height="5" rx="2.5" fill="${accent}"/>`
  )
}

function unsetFace(): string {
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#1c2036"/><stop offset="1" stop-color="#0d1020"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    `<rect x="9" y="9" width="126" height="126" rx="19" fill="none" stroke="#ffffff" stroke-opacity="0.20" stroke-width="2" stroke-dasharray="7 7"/>` +
    // Uhr-Glyph — Geometrie aus icons-src/plugin.svg, im App-Akzent.
    `<circle cx="72" cy="52" r="17" fill="none" stroke="#5b4ef0" stroke-width="2.5"/>` +
    `<line x1="72" y1="43" x2="72" y2="53" stroke="#5b4ef0" stroke-width="2.5" stroke-linecap="round"/>` +
    `<line x1="72" y1="53" x2="79" y2="57" stroke="#5b4ef0" stroke-width="2.5" stroke-linecap="round"/>` +
    // EN variant per handoff (open point 1): the plugin has no i18n yet and
    // its existing strings are English.
    `<text x="72" y="96" font-family="${FONT}" font-size="18" font-weight="600" fill="#8b93bc" text-anchor="middle">Pick a</text>` +
    `<text x="72" y="118" font-family="${FONT}" font-size="18" font-weight="600" fill="#8b93bc" text-anchor="middle">client</text>`
  )
}

function offlineFace(label: KeyLabel): string {
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#20222c"/><stop offset="1" stop-color="#0f1116"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    HAIRLINE(0.07) +
    head(label.header, '#5b6070', 14, 34) +
    mainLines(label.lines, '#767c8e') +
    `<rect x="38" y="112" width="68" height="22" rx="11" fill="none" stroke="#4a5270" stroke-width="1.5"/>` +
    `<text x="72" y="127" font-family="${FONT}" font-size="13" font-weight="500" fill="#767c8e" text-anchor="middle">offline</text>`
  )
}

/**
 * 144x144 Tastenfläche als data:-URL.
 *
 * @param state       running = Kundenfarbe leuchtet, idle = dunkles Glas,
 *                    unset = gestrichelt, offline = entsättigt + Chip
 * @param label       aus keyLabel(settings) — unverändert übernommen
 * @param color       rohe Kundenfarbe aus der DB (wird normalisiert)
 * @param elapsedSec  Laufzeit in Sekunden (nur für 'running')
 */
export function keyImage(opts: {
  state: KeyState
  label: KeyLabel
  color?: string
  elapsedSec?: number
}): string {
  const { state, label, color } = opts
  switch (state) {
    case 'running':
      return dataUrl(runningFace(label, color, opts.elapsedSec ?? 0))
    case 'unset':
      return dataUrl(unsetFace())
    case 'offline':
      return dataUrl(offlineFace(label))
    default:
      return dataUrl(idleFace(label, color))
  }
}
