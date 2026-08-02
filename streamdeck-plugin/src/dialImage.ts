/**
 * TimeTrack Stream Deck — touch-strip faces for the timer dial (#186).
 *
 * Same design language as the keys (`keyImage.ts`), on the encoder's 200x100
 * slot: dark glass while idle, the client colour lit up while a timer runs,
 * the minute ring sweeping like a clock hand, and the breathing dot.
 *
 * The whole slot is ONE full-bleed SVG handed to the layout's `canvas` pixmap.
 * Text as layout items would mean a fixed rect per string; the four faces here
 * place their text differently, and a layout cannot switch geometry. Rendering
 * everything into the image keeps the layout contract at a single key — which
 * matters, because a key the layout does not know is dropped in silence.
 *
 * The same hardware rules as on the keys apply: one static frame, no SMIL, no
 * `pathLength`. Motion is frame-by-frame, driven by the action's 1 Hz tick.
 */
import { FONT, MONO, escapeXml, normalizeKeyColor, scaleL } from './keyImage'
import { formatHm } from './dialModel'

const W = 200
const H = 100

/**
 * The one key `setFeedback` writes to, and the one key `layouts/dial.json`
 * declares. Feedback keys are a contract with the layout: a key the layout
 * does not know is dropped without a word, which on the device is
 * indistinguishable from a broken feature. `dialImage.test.ts` checks both
 * sides against each other.
 */
export const FEEDBACK_KEY = 'canvas'

// ── Bausteine ──────────────────────────────────────────────────────────────

const SHELL = (fill: string): string =>
  `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="${fill}"/>`

/** Innere 1-px-Kante — macht aus der Fläche eine Glasscheibe. */
const HAIRLINE = (opacity = 0.12): string =>
  `<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="13.25" fill="none" stroke="#ffffff" stroke-opacity="${opacity}"/>`

function dataUrl(inner: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    inner +
    '</svg>'
  // base64 rather than percent-encoding: the layout schema documents pixmap
  // values as "base64 encoded string", and that is the form the app parses
  // most reliably. Node's Buffer is available inside the plugin runtime.
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

function text(
  s: string,
  o: {
    x: number
    y: number
    size: number
    fill: string
    weight?: number
    anchor?: 'start' | 'middle' | 'end'
    mono?: boolean
    opacity?: number
    spacing?: number
  }
): string {
  if (!s) return ''
  const attrs = [
    `x="${o.x}"`,
    `y="${o.y}"`,
    `font-family="${o.mono ? MONO : FONT}"`,
    `font-size="${o.size}"`,
    `font-weight="${o.weight ?? 500}"`,
    `fill="${o.fill}"`,
    `text-anchor="${o.anchor ?? 'start'}"`
  ]
  if (o.opacity != null) attrs.push(`opacity="${o.opacity}"`)
  if (o.spacing != null) attrs.push(`letter-spacing="${o.spacing}"`)
  return `<text ${attrs.join(' ')}>${escapeXml(s)}</text>`
}

/**
 * Hard truncation with an ellipsis. No font metrics are available inside the
 * deck's renderer, so the budgets are character counts calibrated per size —
 * deliberately conservative: a clipped name is worse than a short one.
 */
export function fit(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return s.slice(0, Math.max(1, maxChars - 1)).trimEnd() + '…'
}

/** Break into at most two lines at a space, else truncate to one. */
export function wrapTwo(s: string, maxChars: number): string[] {
  if (s.length <= maxChars) return [s]
  const words = s.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (line === '') line = w
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 2).map((l) => fit(l, maxChars))
}

// ── Minutenring ────────────────────────────────────────────────────────────

/**
 * Rounded rect x/y 4, w 192, h 92, r 12 as an explicit path: starts at top
 * centre (100, 4) and runs clockwise, like a clock hand. Dashes are in REAL
 * user units — `pathLength` is ignored by the deck's renderer.
 */
const RING_PATH =
  'M 100 4 H 184 A 12 12 0 0 1 196 16 V 84 A 12 12 0 0 1 184 96 H 16 ' +
  'A 12 12 0 0 1 4 84 V 16 A 12 12 0 0 1 16 4 H 100'
/** Straights 84+68+168+68+84 = 472, plus 4 quarter arcs (2π·12) ≈ 547.4. */
const RING_LENGTH = 472 + 2 * Math.PI * 12

function ring(elapsedSec: number): string {
  const dash = ((Math.floor(elapsedSec) % 60) / 60) * RING_LENGTH
  return (
    `<rect x="4" y="4" width="192" height="92" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2.5"/>` +
    (dash > 0.5
      ? `<path d="${RING_PATH}" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${Math.ceil(RING_LENGTH)}"/>`
      : '')
  )
}

/** Frame-by-frame pulse: a 4 s cosine sampled once per second. */
function pulse(cx: number, cy: number, elapsedSec: number): string {
  const o = 0.675 + 0.325 * Math.cos((2 * Math.PI * (Math.floor(elapsedSec) % 4)) / 4)
  return `<circle cx="${cx}" cy="${cy}" r="5" fill="#ffffff" opacity="${o.toFixed(2)}"/>`
}

// ── Hintergründe ───────────────────────────────────────────────────────────

/** Dunkles Glas mit Akzent-Schimmer von unten — wie die Idle-Taste. */
function glassBackground(accent: string): string {
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#242844"/><stop offset="1" stop-color="#0d1020"/></linearGradient>` +
    `<radialGradient id="w" cx="0.5" cy="1" r="0.9">` +
    `<stop offset="0" stop-color="${accent}" stop-opacity="0.30"/>` +
    `<stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    SHELL('url(#w)') +
    `<rect x="1" y="1" width="${W - 2}" height="40" rx="13" fill="url(#s)"/>` +
    HAIRLINE()
  )
}

// ── Flächen ────────────────────────────────────────────────────────────────

export interface DialLabel {
  /** Client name — the header when a project is shown, else the main line. */
  client: string
  /** Project name, or null for a client-only target. */
  project: string | null
}

/**
 * Idle: the two numbers from the app's "Heute" page, plus the entry a press
 * would start. The footer is what keeps the press from being blind — without
 * it you would have to rotate first to find out what you are about to start.
 */
function statsFace(o: {
  todaySeconds: number
  weekSeconds: number
  label: DialLabel | null
  position: string
  color?: string
}): string {
  const accent = normalizeKeyColor(o.color)
  const selection = o.label
    ? o.label.project
      ? `${o.label.client} · ${o.label.project}`
      : o.label.client
    : 'No clients'
  return (
    glassBackground(accent) +
    text('TODAY', { x: 16, y: 24, size: 10, fill: '#8b93bc', weight: 600, spacing: 1.2 }) +
    text('WEEK', { x: 110, y: 24, size: 10, fill: '#8b93bc', weight: 600, spacing: 1.2 }) +
    text(formatHm(o.todaySeconds), {
      x: 16,
      y: 52,
      size: 25,
      fill: '#e8eaf6',
      weight: 700,
      mono: true,
      spacing: -1
    }) +
    text(formatHm(o.weekSeconds), {
      x: 110,
      y: 52,
      size: 25,
      fill: '#8b93bc',
      weight: 700,
      mono: true,
      spacing: -1
    }) +
    `<line x1="16" y1="64" x2="184" y2="64" stroke="#ffffff" stroke-opacity="0.10"/>` +
    `<circle cx="20" cy="80" r="4" fill="${accent}"/>` +
    text(fit(selection, 24), { x: 30, y: 84, size: 12, fill: '#8b93bc' }) +
    text(o.position, { x: 184, y: 84, size: 11, fill: '#4a5270', anchor: 'end', mono: true })
  )
}

/**
 * Rotating: the entry under the wheel. The bar along the bottom is the
 * position in the list — on a long list the counter alone does not convey
 * "how far in" you are.
 */
function browseFace(o: {
  label: DialLabel
  position: string
  progress: number
  color?: string
  running: boolean
}): string {
  const accent = normalizeKeyColor(o.color)
  const main = o.label.project ?? o.label.client
  const lines = wrapTwo(main, 17)
  const header = o.label.project ? o.label.client : ''
  const barW = Math.max(6, Math.round(168 * Math.min(1, Math.max(0, o.progress))))
  return (
    glassBackground(accent) +
    `<circle cx="20" cy="21" r="4" fill="${accent}"/>` +
    text(fit(header, 22), { x: 30, y: 25, size: 11, fill: '#8b93bc', weight: 600 }) +
    text(o.position, { x: 184, y: 25, size: 11, fill: '#4a5270', anchor: 'end', mono: true }) +
    (lines.length === 1
      ? text(lines[0], { x: 16, y: 62, size: 20, fill: '#e8eaf6', weight: 600 })
      : text(lines[0], { x: 16, y: 54, size: 19, fill: '#e8eaf6', weight: 600 }) +
        text(lines[1], { x: 16, y: 74, size: 19, fill: '#e8eaf6', weight: 600 })) +
    // Running target while browsing: the same green the app uses for a live
    // timer, so the wheel says "this one is already going" before you press.
    (o.running ? `<circle cx="184" cy="80" r="4.5" fill="#4ade80"/>` : '') +
    `<rect x="16" y="88" width="168" height="4" rx="2" fill="#ffffff" fill-opacity="0.10"/>` +
    `<rect x="16" y="88" width="${barW}" height="4" rx="2" fill="${accent}"/>`
  )
}

/** Running: client colour lit up, elapsed time, ring and pulse. */
function runningFace(o: { label: DialLabel; elapsedSec: number; color?: string }): string {
  const base = normalizeKeyColor(o.color)
  const top = scaleL(base, 1.18)
  const bot = scaleL(base, 0.62)
  const sec = Math.max(0, Math.floor(o.elapsedSec))
  const header = o.label.project ? o.label.client : ''
  const main = o.label.project ?? o.label.client
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="0.55" stop-color="${base}"/>` +
    `<stop offset="1" stop-color="${bot}"/></linearGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    `<rect x="1" y="1" width="${W - 2}" height="42" rx="13" fill="url(#s)"/>` +
    ring(sec) +
    (header
      ? text(fit(header, 24), { x: 18, y: 27, size: 12, fill: '#ffffff', opacity: 0.8 }) +
        text(fit(main, 20), { x: 18, y: 50, size: 17, fill: '#ffffff', weight: 600 })
      : text(fit(main, 18), { x: 18, y: 40, size: 19, fill: '#ffffff', weight: 600 })) +
    text(formatHm(sec), {
      x: 18,
      y: 84,
      size: 30,
      fill: '#ffffff',
      weight: 700,
      mono: true,
      spacing: -1
    }) +
    pulse(178, 74, sec)
  )
}

/** The app is not running, or hardware keys are switched off. */
function offlineFace(): string {
  return (
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#20222c"/><stop offset="1" stop-color="#0f1116"/></linearGradient></defs>` +
    SHELL('url(#b)') +
    HAIRLINE(0.07) +
    // Clock glyph from imgs/plugin.svg, desaturated.
    `<circle cx="30" cy="50" r="13" fill="none" stroke="#4a5270" stroke-width="2.5"/>` +
    `<line x1="30" y1="43" x2="30" y2="51" stroke="#4a5270" stroke-width="2.5" stroke-linecap="round"/>` +
    `<line x1="30" y1="51" x2="35" y2="54" stroke="#4a5270" stroke-width="2.5" stroke-linecap="round"/>` +
    text('TimeTrack offline', { x: 54, y: 47, size: 15, fill: '#767c8e', weight: 600 }) +
    text('Settings → Integrations', { x: 54, y: 66, size: 11, fill: '#5b6070' })
  )
}

/** Bridge answers, but there is nothing to start yet. */
function emptyFace(): string {
  return (
    glassBackground('#8b7cf8') +
    text('No clients yet', { x: 100, y: 48, size: 16, fill: '#e8eaf6', weight: 600, anchor: 'middle' }) +
    text('Add one in TimeTrack', { x: 100, y: 70, size: 11, fill: '#8b93bc', anchor: 'middle' })
  )
}

export type DialFace =
  | { state: 'offline' }
  | { state: 'empty' }
  | {
      state: 'stats'
      todaySeconds: number
      weekSeconds: number
      label: DialLabel | null
      position: string
      color?: string
    }
  | {
      state: 'browse'
      label: DialLabel
      position: string
      progress: number
      color?: string
      running: boolean
    }
  | { state: 'running'; label: DialLabel; elapsedSec: number; color?: string }

/** 200x100 touch-strip face as a data: URL for the layout's `canvas` pixmap. */
export function dialImage(face: DialFace): string {
  switch (face.state) {
    case 'offline':
      return dataUrl(offlineFace())
    case 'empty':
      return dataUrl(emptyFace())
    case 'running':
      return dataUrl(runningFace(face))
    case 'browse':
      return dataUrl(browseFace(face))
    default:
      return dataUrl(statsFace(face))
  }
}
