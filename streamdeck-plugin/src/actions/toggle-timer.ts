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
import { keyImage, type KeyLabel } from '../keyImage'

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
  /**
   * Per-key render cache (design handoff, "Rendern nur bei Änderung"): the
   * face visibly changes only once per minute, so setImage() is skipped while
   * the render key — state · minute · target · label — stays the same.
   */
  private lastKey = new Map<string, string>()

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
    if (!any) {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
      // Forget cached faces so a reappearing key always gets a fresh render.
      this.lastKey.clear()
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
    // No showOk() overlay: the face itself flips state on the next line — the
    // SDK's green checkmark would just cover the new design.
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
      await this.setImageCached(key, 'unset||', keyImage({ state: 'unset', label: EMPTY_LABEL }))
      return
    }
    const label = keyLabel(settings)
    const target = `${settings.clientId}|${settings.projectId ?? ''}|${label.header}|${label.lines.join('·')}`
    if (status === 'unavailable') {
      await this.setImageCached(key, `offline|${target}`, keyImage({ state: 'offline', label }))
      return
    }
    const active =
      status !== null &&
      status.client_id === settings.clientId &&
      (status.project_id ?? null) === (settings.projectId ?? null)
    if (active) {
      const elapsedSec = Math.max(0, (Date.now() - Date.parse(status.started_at)) / 1000)
      // The deck rasterizes a static frame, so the minute ring only moves when
      // we re-render: a 5-second step advances it in 30° increments — 12 image
      // transfers per minute, and only for the running key.
      const ringStep = Math.floor(elapsedSec / 5)
      await this.setImageCached(
        key,
        `running|${ringStep}|${target}`,
        // Lazy: the face is only built when the cache misses.
        () => keyImage({ state: 'running', label, color: settings.color, elapsedSec })
      )
      return
    }
    await this.setImageCached(
      key,
      `idle|${target}|${settings.color ?? ''}`,
      () => keyImage({ state: 'idle', label, color: settings.color })
    )
  }

  /** setImage() only when the render key changed since the last call. */
  private async setImageCached(
    key: KeyAction<ToggleSettings>,
    renderKey: string,
    image: string | (() => string)
  ): Promise<void> {
    if (this.lastKey.get(key.id) === renderKey) return
    this.lastKey.set(key.id, renderKey)
    await key.setImage(typeof image === 'string' ? image : image())
  }
}

const EMPTY_LABEL: KeyLabel = { header: '', lines: [] }

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

