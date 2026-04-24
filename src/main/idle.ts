import { powerMonitor, BrowserWindow } from 'electron'

/**
 * Polls system idle time and emits `timer:idle-detected` to the renderer
 * exactly once per idle episode. Renderer is responsible for showing the
 * modal and acknowledging via `idle:dismiss` to re-arm.
 *
 * Polling only runs while a timer is active (renderer toggles via setActive).
 */
const POLL_INTERVAL_MS = 30_000

let timer: NodeJS.Timeout | null = null
let active = false
let alreadyEmitted = false
let thresholdSeconds = 300 // default 5 min, overridden by setThreshold
let getWindow: () => BrowserWindow | null = () => null

export function configureIdleWatcher(opts: {
  getWindow: () => BrowserWindow | null
}): void {
  getWindow = opts.getWindow
}

export function setIdleThresholdMinutes(minutes: number): void {
  // Clamp to reasonable range (1 min to 12h).
  const clamped = Math.max(1, Math.min(720, minutes))
  thresholdSeconds = clamped * 60
}

export function startIdleWatcher(): void {
  if (active) return
  active = true
  alreadyEmitted = false
  if (timer) clearInterval(timer)
  timer = setInterval(check, POLL_INTERVAL_MS)
}

export function stopIdleWatcher(): void {
  active = false
  alreadyEmitted = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Renderer dismisses the modal — re-arm so the next idle episode can fire. */
export function rearmIdleWatcher(): void {
  alreadyEmitted = false
}

function check(): void {
  if (!active || alreadyEmitted) return
  const idleSeconds = powerMonitor.getSystemIdleTime()
  if (idleSeconds >= thresholdSeconds) {
    const idleSinceMs = Date.now() - idleSeconds * 1000
    const idleSince = new Date(idleSinceMs).toISOString()
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('timer:idle-detected', { idleSince, idleSeconds })
      alreadyEmitted = true
    }
  }
}
