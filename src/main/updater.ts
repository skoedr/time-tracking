/**
 * v1.5 PR B — Auto-Update via electron-updater (#33).
 *
 * Bridge between electron-updater events and the renderer UI:
 * - Subscribes to all updater lifecycle events.
 * - Pushes a normalized `UpdateStatus` to all open windows via IPC.
 * - Provides imperative IPC handlers for "check now" and "install now".
 *
 * Offline policy: errors during the initial silent check are logged but
 * NOT pushed as an `error` status — we don't want a red banner on every
 * offline app start. Errors triggered by an explicit user "check now"
 * are surfaced (so the Settings UI can show "no connection").
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import type { IpcResult, UpdateStatus } from '../shared/types'

export type { UpdateStatus }

let lastStatus: UpdateStatus = { status: 'idle' }
let lastCheckIso: string | null = null
let suppressNextError = false // for offline-tolerant initial check

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: String(error) }
}

function broadcast(status: UpdateStatus): void {
  lastStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('update:status', status)
    }
  }
}

/**
 * Initialize the updater. Must be called after `app.whenReady()`.
 *
 * In dev mode (no packaged app) this is a no-op except for IPC handler
 * registration — `autoUpdater.checkForUpdates()` would error otherwise.
 */
export function initAutoUpdater(opts: { isDev: boolean }): void {
  // Wire up logger from PR A so updater events land in main.log.
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false // we surface a button instead

  autoUpdater.on('checking-for-update', () => {
    broadcast({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: { version: string }) => {
    broadcast({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info: { version: string }) => {
    lastCheckIso = new Date().toISOString()
    broadcast({ status: 'not-available', checkedAt: lastCheckIso })
    log.info(`No update available (current: ${info.version})`)
  })

  autoUpdater.on(
    'download-progress',
    (p: { percent: number; transferred: number; total: number }) => {
      const version =
        lastStatus.status === 'available' || lastStatus.status === 'downloading'
          ? lastStatus.version
          : ''
      broadcast({ status: 'downloading', version, progress: Math.round(p.percent) })
    }
  )

  autoUpdater.on('update-downloaded', (info: { version: string }) => {
    broadcast({ status: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    if (suppressNextError) {
      suppressNextError = false
      log.warn('Update check failed (suppressed, likely offline):', err.message)
      broadcast({ status: 'idle' })
      return
    }
    broadcast({ status: 'error', message: err.message })
  })

  // ── IPC handlers ───────────────────────────────────────────
  ipcMain.handle('update:getStatus', (): IpcResult<UpdateStatus> => ok(lastStatus))
  ipcMain.handle(
    'update:getLastCheck',
    (): IpcResult<string | null> => ok(lastCheckIso)
  )
  ipcMain.handle('update:getVersion', (): IpcResult<string> => ok(app.getVersion()))

  ipcMain.handle('update:check', async (): Promise<IpcResult<void>> => {
    if (opts.isDev) {
      return fail('Update-Check ist im Entwicklungsmodus deaktiviert.')
    }
    try {
      lastCheckIso = new Date().toISOString()
      await autoUpdater.checkForUpdates()
      return ok(undefined)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  ipcMain.handle('update:install', (): IpcResult<void> => {
    try {
      // quitAndInstall(isSilent=false, isForceRunAfter=true)
      // — shows the NSIS installer UI, then re-launches TimeTrack.
      autoUpdater.quitAndInstall(false, true)
      return ok(undefined)
    } catch (err) {
      return fail((err as Error).message)
    }
  })

  // ── Initial silent check ──────────────────────────────────
  // Don't surface errors here — offline app starts shouldn't show a banner.
  if (!opts.isDev) {
    suppressNextError = true
    lastCheckIso = new Date().toISOString()
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Initial update check failed:', err.message)
    })
  }
}
