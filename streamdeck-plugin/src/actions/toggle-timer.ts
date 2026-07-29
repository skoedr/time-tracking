/**
 * "Toggle timer" key action (#133).
 *
 * Each key targets (client, project|null). Pressing it toggles the timer for
 * exactly that target via TimeTrack's local bridge; the key image reflects the
 * live timer state. State is polled while at least one key is visible — the
 * bridge is request/response, there is no push channel.
 *
 * Timer text/labels are rendered INTO the SVG image, not via setTitle: a
 * user-defined title always beats a runtime title (SDK render precedence), an
 * image does not.
 */
import { action, KeyAction, SingletonAction } from '@elgato/streamdeck'
import streamDeck from '@elgato/streamdeck'
import type { KeyDownEvent, SendToPluginEvent, WillAppearEvent } from '@elgato/streamdeck'
import type { JsonValue } from '@elgato/utils'
import { getTimerStatus, listTargets, toggleTimer, type RunningTimer } from '../bridge'

export type ToggleSettings = {
  clientId?: number
  projectId?: number | null
  clientName?: string
  projectName?: string
  color?: string
  // Index signature keeps the type assignable to the SDK's JsonObject constraint.
  [key: string]: string | number | null | undefined
}

const POLL_MS = 2000

@action({ UUID: 'com.timetrack.streamdeck.toggle' })
export class ToggleTimer extends SingletonAction<ToggleSettings> {
  private pollTimer: NodeJS.Timeout | null = null

  override onWillAppear(_ev: WillAppearEvent<ToggleSettings>): void {
    this.ensurePolling()
    void this.refreshAll()
  }

  override onWillDisappear(): void {
    // Enumerable has no cheap "size"; stop when nothing is visible anymore.
    let any = false
    for (const _ of this.actions) {
      any = true
      break
    }
    if (!any && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  override async onKeyDown(ev: KeyDownEvent<ToggleSettings>): Promise<void> {
    const { clientId, projectId } = ev.payload.settings
    if (typeof clientId !== 'number') {
      await ev.action.showAlert()
      return
    }
    const res = await toggleTimer(clientId, projectId ?? null)
    if (!res.ok) {
      streamDeck.logger.warn(`toggle failed: ${res.error}`)
      await ev.action.showAlert()
      return
    }
    await ev.action.showOk()
    await this.refreshAll()
  }

  /** Property inspector asks for the client/project list. */
  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ToggleSettings>): Promise<void> {
    if ((ev.payload as { event?: string } | null)?.event !== 'getTargets') return
    const clients = await listTargets()
    await streamDeck.ui.sendToPropertyInspector({
      event: 'targets',
      clients: (clients ?? []) as unknown as JsonValue,
      unavailable: clients === null
    })
  }

  private ensurePolling(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => void this.refreshAll(), POLL_MS)
  }

  /** Re-render every visible key from one status read. */
  private async refreshAll(): Promise<void> {
    const status = await getTimerStatus()
    for (const a of this.actions) {
      if (!a.isKey()) continue
      const settings = await a.getSettings()
      await this.render(a, settings, status)
    }
  }

  private async render(
    key: KeyAction<ToggleSettings>,
    settings: ToggleSettings,
    status: RunningTimer | null | 'unavailable'
  ): Promise<void> {
    if (typeof settings.clientId !== 'number') {
      await key.setImage(
        svgImage('#374151', '#9ca3af', { header: '', lines: ['Set up', 'in the', 'inspector'] }, false)
      )
      return
    }
    const label = keyLabel(settings)
    if (status === 'unavailable') {
      await key.setImage(svgImage('#374151', '#6b7280', label, false, true))
      return
    }
    const active =
      status !== null &&
      status.client_id === settings.clientId &&
      (status.project_id ?? null) === (settings.projectId ?? null)
    const accent = normalizeColor(settings.color)
    await key.setImage(
      active
        ? svgImage(accent ?? '#16a34a', '#ffffff', label, true)
        : svgImage('#1f2937', '#e5e7eb', label, false, false, accent ?? undefined)
    )
  }
}

export interface KeyLabel {
  /** Small header line (client when a project is set, empty otherwise). */
  header: string
  /** Prominent lines (project if set, client otherwise), max 3. */
  lines: string[]
}

/**
 * With a project the project is the star of the key — the client shrinks to a
 * one-line header and can never push the project off the face. Without one,
 * the client name takes the stage.
 */
function keyLabel(settings: ToggleSettings): KeyLabel {
  const client = settings.clientName || `#${settings.clientId}`
  if (settings.projectName) {
    return {
      header: wrap(client, 15)[0] ?? '',
      lines: wrap(settings.projectName, 11).slice(0, 2)
    }
  }
  return { header: '', lines: wrap(client, 11).slice(0, 3) }
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    if (line === '') line = w
    else if ((line + ' ' + w).length <= width) line += ' ' + w
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out.map((l) => (l.length > width ? l.slice(0, width - 1) + '…' : l))
}

function normalizeColor(c: string | undefined): string | null {
  return c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 144×144 key face. `running` shows a filled dot; `stale` greys the face when
 * TimeTrack is unreachable; `accentBar` paints the client color as a bottom
 * bar on idle keys (mirrors the app's client color coding). The header (client
 * name when a project is configured) renders small at the top, the main lines
 * bold in the middle.
 */
function svgImage(
  bg: string,
  fg: string,
  label: KeyLabel,
  running: boolean,
  stale = false,
  accentBar?: string
): string {
  const { header, lines } = label
  const startY = (header ? 82 : 76) - (lines.length - 1) * 12
  const headerText = header
    ? `<text x="72" y="30" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="14" fill="${fg}" opacity="0.75" text-anchor="middle">${escapeXml(header)}</text>`
    : ''
  const text =
    headerText +
    lines
      .map(
        (l, i) =>
          `<text x="72" y="${startY + i * 24}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="20" font-weight="600" fill="${fg}" text-anchor="middle">${escapeXml(l)}</text>`
      )
      .join('')
  const dot = running
    ? `<circle cx="72" cy="122" r="8" fill="#ffffff"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/></circle>`
    : ''
  const bar = accentBar
    ? `<rect x="16" y="126" width="112" height="8" rx="4" fill="${accentBar}"/>`
    : ''
  const staleMark = stale
    ? `<text x="72" y="126" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="16" fill="${fg}" text-anchor="middle">offline</text>`
    : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
    `<rect x="4" y="4" width="136" height="136" rx="20" fill="${bg}"/>` +
    text +
    dot +
    bar +
    staleMark +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
