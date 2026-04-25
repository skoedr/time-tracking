import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  ipcMain,
  dialog,
  type MenuItemConstructorOptions
} from 'electron'
import log from 'electron-log/main'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayRunningIcon from '../../resources/tray-running.png?asset'
import trayStoppedIcon from '../../resources/tray-stopped.png?asset'
import { getDb, recoverZombieEntries, MigrationError } from './db'
import { registerIpcHandlers } from './ipc'
import { applyMiniEnabled, destroyMini, pushMiniState, toggleMini } from './miniWindow'
import {
  configureIdleWatcher,
  setIdleThresholdMinutes,
  startIdleWatcher,
  stopIdleWatcher,
  rearmIdleWatcher
} from './idle'
import type { Client } from '../shared/types'

// ── Logging (v1.5 PR A) ─────────────────────────────────────────
// electron-log writes to %AppData%\TimeTrack\logs\main.log on Windows
// (~/Library/Logs/TimeTrack on macOS, ~/.config/TimeTrack/logs on Linux).
// `spyRendererConsole: true` mirrors renderer console.* into the same
// file via IPC — no separate channel needed. `Object.assign(console, …)`
// routes main-process console.* through the logger too, so existing
// console.error/warn/info calls in db.ts/ipc.ts/etc. land in the file
// without code changes.
log.initialize({ preload: true, spyRendererConsole: true })
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB, rotates to .old
Object.assign(console, log.functions)

// Catch-all for crashes that escape try/catch.
process.on('uncaughtException', (err) => {
  log.error('uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection:', reason)
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ── Hotkey registration state ────────────────────────────────────
// Tracked per-slot so `registerHotkey` and `registerMiniHotkey` can update
// independently without clobbering each other (no more `unregisterAll`).
let currentToggleHotkey = ''
let currentMiniHotkey = ''

// ── State for tray quick-start ──────────────────────────────────
let cachedActiveClients: Client[] = []
let isTimerRunning = false
let runningLabel = ''
let lastTodaySeconds = 0

/** Format seconds as `HH:MM` (no seconds) for the tray tooltip. */
function fmtHHMM(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function refreshActiveClients(): void {
  try {
    const db = getDb()
    cachedActiveClients = db
      .prepare(`SELECT * FROM clients WHERE active = 1 ORDER BY name ASC`)
      .all() as Client[]
  } catch (err) {
    console.warn('[tray] could not refresh client cache:', err)
    cachedActiveClients = []
  }
}

function buildTrayMenu(): Menu {
  const items: MenuItemConstructorOptions[] = []

  items.push({
    label: isTimerRunning ? `● ${runningLabel}` : 'Kein Timer aktiv',
    enabled: false
  })
  items.push({ type: 'separator' })

  if (isTimerRunning) {
    items.push({
      label: 'Stop',
      click: () => mainWindow?.webContents.send('timer:tray-stop')
    })
  } else if (cachedActiveClients.length > 0) {
    const quickStart: MenuItemConstructorOptions[] = cachedActiveClients
      .slice(0, 10) // soft limit so menu stays usable
      .map((c) => ({
        label: `▶ ${c.name}`,
        click: () => mainWindow?.webContents.send('timer:tray-quick-start', c.id)
      }))
    items.push({ label: 'Quick-Start', enabled: false })
    items.push(...quickStart)
  } else {
    items.push({ label: 'Keine aktiven Kunden', enabled: false })
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Fenster anzeigen',
    click: () => {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
  items.push({ type: 'separator' })
  items.push({
    label: 'Beenden',
    click: () => {
      isQuitting = true
      app.quit()
    }
  })

  return Menu.buildFromTemplate(items)
}

function updateTray(running: boolean, label: string, todaySeconds: number): void {
  if (!tray) return
  isTimerRunning = running
  runningLabel = label
  lastTodaySeconds = todaySeconds
  // State-aware tray glyph (PR D #16/#42 follow-up): green clock when running,
  // grey clock when idle. Both files live in resources/ and are bundled by
  // electron-vite's `?asset` resolver.
  tray.setImage(running ? trayRunningIcon : trayStoppedIcon)
  // Tooltip format (v1.2 #31):
  //   running: `● {client} · {HH:MM} · Heute {HH:MM}`
  //   idle:    `TimeTrack — Heute {HH:MM}`
  // (i18n in tooltip deferred to v1.4 — see DESIGN.md known limitations.)
  tray.setToolTip(
    running
      ? `● ${label} · Heute ${fmtHHMM(todaySeconds)}`
      : `TimeTrack — Heute ${fmtHHMM(todaySeconds)}`
  )
  tray.setContextMenu(buildTrayMenu())
}

function registerHotkey(accelerator: string): boolean {
  // Cross-slot collision check (v1.4 PR B). Without this, suspending
  // shortcuts during capture would let the user silently steal the
  // mini-widget's accelerator, since the OS-level register call would
  // succeed while the other slot is paused.
  if (accelerator && accelerator === currentMiniHotkey) {
    console.warn(`[hotkey] ${accelerator} is already bound to mini_hotkey`)
    return false
  }
  if (currentToggleHotkey) {
    globalShortcut.unregister(currentToggleHotkey)
    currentToggleHotkey = ''
  }
  if (!accelerator) return false
  const ok = globalShortcut.register(accelerator, () => {
    mainWindow?.webContents.send('timer:hotkey-toggle')
  })
  if (ok) currentToggleHotkey = accelerator
  else console.warn(`[hotkey] Could not register ${accelerator}`)
  return ok
}

/**
 * Mini-Widget hotkey — toggles widget visibility (only when widget is
 * enabled in Settings). Tracked separately from `hotkey_toggle` so changing
 * one doesn't clobber the other (we used to call `unregisterAll`).
 */
function registerMiniHotkey(accelerator: string): boolean {
  if (accelerator && accelerator === currentToggleHotkey) {
    console.warn(`[mini-hotkey] ${accelerator} is already bound to hotkey_toggle`)
    return false
  }
  if (currentMiniHotkey) {
    globalShortcut.unregister(currentMiniHotkey)
    currentMiniHotkey = ''
  }
  if (!accelerator) return false
  const ok = globalShortcut.register(accelerator, () => {
    toggleMini()
  })
  if (ok) currentMiniHotkey = accelerator
  else console.warn(`[mini-hotkey] Could not register ${accelerator}`)
  return ok
}

/**
 * Suspend all global shortcuts — used while the Settings view is capturing
 * a new hotkey, otherwise pressing the existing combo (e.g. Alt+Shift+S)
 * fires the registered handler instead of being captured by the renderer.
 * Restored via {@link resumeGlobalShortcuts}.
 */
function suspendGlobalShortcuts(): void {
  if (currentToggleHotkey) globalShortcut.unregister(currentToggleHotkey)
  if (currentMiniHotkey) globalShortcut.unregister(currentMiniHotkey)
}

function resumeGlobalShortcuts(): void {
  if (currentToggleHotkey) {
    globalShortcut.register(currentToggleHotkey, () => {
      mainWindow?.webContents.send('timer:hotkey-toggle')
    })
  }
  if (currentMiniHotkey) {
    globalShortcut.register(currentMiniHotkey, () => {
      toggleMini()
    })
  }
}

function applyAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: []
  })
}

function loadStartupSettings(): void {
  try {
    const db = getDb()
    const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
      key: string
      value: string
    }>
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    const idleMin = parseInt(map.idle_threshold_minutes ?? '5', 10)
    setIdleThresholdMinutes(Number.isFinite(idleMin) ? idleMin : 5)
    const hotkey = map.hotkey_toggle ?? 'Alt+Shift+S'
    registerHotkey(hotkey)
    const auto = map.auto_start === '1'
    applyAutoStart(auto)
    // v1.4 PR B — mini-widget hotkey + restore visibility from last session.
    const miniHotkey = map.mini_hotkey ?? 'Alt+Shift+M'
    const miniHotkeyOk = registerMiniHotkey(miniHotkey)
    if (!miniHotkeyOk && map.mini_enabled === '1') {
      // Surface the conflict at startup so the user knows their hotkey
      // is silently dead. Non-blocking dialog — the app continues to work,
      // toggling via Settings still works.
      dialog.showMessageBox({
        type: 'warning',
        title: 'TimeTrack — Hotkey-Konflikt',
        message: `Der Mini-Widget-Hotkey "${miniHotkey}" konnte nicht registriert werden.`,
        detail:
          'Eine andere Anwendung verwendet diese Tastenkombination bereits.\n\n' +
          'Du kannst in den Einstellungen einen anderen Hotkey wählen.',
        buttons: ['OK']
      })
    }
    if (map.mini_enabled === '1') applyMiniEnabled(true)
  } catch (err) {
    console.warn('[startup] settings load failed (using defaults):', err)
    registerHotkey('Alt+Shift+S')
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.timetrack.app')

  // Smoke-test mode (CI release pipeline). When invoked with
  // `--smoke-test=<path>`, open the DB (which runs migrations against
  // the Electron-ABI better-sqlite3 binary), write a JSON status to
  // <path>, and exit. No window, no tray, no IPC handlers.
  // This is the v1.2 packaged-binary smoke check (E11) that catches
  // ABI / native-module regressions before we publish a release.
  const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test'))
  if (smokeArg) {
    const outPath = smokeArg.includes('=') ? smokeArg.split('=').slice(1).join('=') : ''
    try {
      const db = getDb()
      const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as {
        v: number | null
      }

      // PDF pipeline smoke check (v1.3): seed a single client + entry,
      // build the HTML payload, render via the hidden BrowserWindow.
      // Catches regressions in printToPDF / Chromium / template wiring
      // against the packaged binary, not just the unit-tested HTML string.
      const { buildPdfPayload, buildPdfHtml } = await import('./pdf')
      const { renderPdfBuffer } = await import('./pdfWindow')
      let pdfBytes = 0
      try {
        db.prepare(
          `INSERT OR IGNORE INTO clients (id, name, color, rate_cent)
             VALUES (9999, '__smoke__', '#4f46e5', 0)`
        ).run()
        const today = new Date().toISOString().slice(0, 10)
        const startIso = `${today}T08:00:00.000Z`
        const stopIso = `${today}T09:00:00.000Z`
        db.prepare(
          `INSERT INTO entries (client_id, description, started_at, stopped_at)
             VALUES (9999, 'smoke', ?, ?)`
        ).run(startIso, stopIso)
        const payload = buildPdfPayload(db, {
          clientId: 9999,
          fromIso: today,
          toIso: today
        }, '')
        const html = buildPdfHtml(payload)
        const buf = await renderPdfBuffer({ html })
        pdfBytes = buf.length
      } finally {
        // Always clean up — keeps the smoke DB stable across re-runs.
        try {
          db.prepare(`DELETE FROM entries WHERE client_id = 9999`).run()
          db.prepare(`DELETE FROM clients WHERE id = 9999`).run()
        } catch {
          /* best-effort */
        }
      }

      const result = {
        ok: true as const,
        schemaVersion: row.v ?? 0,
        dbPath: app.getPath('userData'),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        pdfBytes
      }
      const payload = JSON.stringify(result)
      console.log(`[smoke] ${payload}`)
      if (outPath) {
        try {
          writeFileSync(outPath, payload, 'utf8')
        } catch (e) {
          console.warn('[smoke] could not write to outPath:', (e as Error).message)
        }
      }
      app.exit(0)
    } catch (err) {
      const payload = JSON.stringify({
        ok: false,
        error: (err as Error).message,
        electronVersion: process.versions.electron
      })
      console.error(`[smoke] ${payload}`)
      if (outPath) {
        try {
          writeFileSync(outPath, payload, 'utf8')
        } catch {
          /* ignore — exit code is the source of truth */
        }
      }
      app.exit(1)
    }
    return
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    getDb()
  } catch (err) {
    if (err instanceof MigrationError) {
      dialog.showErrorBox(
        'TimeTrack — Datenbank-Migration fehlgeschlagen',
        `Migration #${err.migration.version} (${err.migration.name}) ist fehlgeschlagen:\n\n` +
          `${err.cause.message}\n\n` +
          `Deine Datenbank wurde aus dem Pre-Migration-Backup wiederhergestellt:\n${err.backupPath}\n\n` +
          `Die App wird jetzt beendet. Bitte melde diesen Fehler.`
      )
    } else {
      dialog.showErrorBox(
        'TimeTrack — Datenbankfehler',
        `Datenbank konnte nicht geöffnet werden:\n\n${(err as Error).message}`
      )
    }
    isQuitting = true
    app.quit()
    return
  }
  recoverZombieEntries()
  registerIpcHandlers({
    refreshTrayClients: () => {
      refreshActiveClients()
      tray?.setContextMenu(buildTrayMenu())
    },
    setHotkey: (accelerator) => registerHotkey(accelerator),
    setAutoStart: (enabled) => applyAutoStart(enabled),
    setIdleThreshold: (minutes) => setIdleThresholdMinutes(minutes),
    setMiniEnabled: (enabled) => applyMiniEnabled(enabled),
    setMiniHotkey: (accelerator) => registerMiniHotkey(accelerator)
  })
  createWindow()

  refreshActiveClients()
  configureIdleWatcher({ getWindow: () => mainWindow })
  loadStartupSettings()

  tray = new Tray(trayStoppedIcon)
  updateTray(false, '', 0)
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  // Renderer notifies main to update tray state + drive idle watcher.
  // `startedAt` (v1.4 PR B) is forwarded to the mini-widget so it can tick
  // the elapsed time locally without round-trips.
  ipcMain.on(
    'tray:update',
    (
      _event,
      running: boolean,
      label: string,
      todaySeconds: number,
      startedAt: string | null = null
    ) => {
      updateTray(running, label, todaySeconds ?? lastTodaySeconds)
      pushMiniState({ running, label, startedAt })
      if (running) startIdleWatcher()
      else stopIdleWatcher()
    }
  )

  // Mini-Widget → main: forward play/stop intent to the main renderer,
  // which owns the timer state machine. We piggy-back on the existing
  // tray-stop / hotkey-toggle channels so there's only one source of truth.
  ipcMain.on('mini:request-stop', () => {
    mainWindow?.webContents.send('timer:tray-stop')
  })
  ipcMain.on('mini:request-start', () => {
    // hotkey-toggle starts when no timer is running and falls back to the
    // first active client — exactly what we want for the play button.
    mainWindow?.webContents.send('timer:hotkey-toggle')
  })

  // Settings view → main: pause/resume registered global shortcuts during
  // hotkey capture so the user can rebind a key (e.g. Alt+Shift+S) without
  // the existing handler firing first and swallowing the keystroke.
  ipcMain.on('hotkey:beginCapture', () => suspendGlobalShortcuts())
  ipcMain.on('hotkey:endCapture', () => resumeGlobalShortcuts())

  // Renderer dismissed idle modal — re-arm.
  ipcMain.on('idle:dismiss', () => rearmIdleWatcher())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopIdleWatcher()
  destroyMini()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
