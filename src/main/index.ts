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
import { join } from 'path'
import { writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayRunningIcon from '../../resources/tray-running.png?asset'
import trayStoppedIcon from '../../resources/tray-stopped.png?asset'
import { getDb, recoverZombieEntries, MigrationError } from './db'
import { registerIpcHandlers } from './ipc'
import {
  configureIdleWatcher,
  setIdleThresholdMinutes,
  startIdleWatcher,
  stopIdleWatcher,
  rearmIdleWatcher
} from './idle'
import type { Client } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

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
  globalShortcut.unregisterAll()
  if (!accelerator) return false
  const ok = globalShortcut.register(accelerator, () => {
    mainWindow?.webContents.send('timer:hotkey-toggle')
  })
  if (!ok) console.warn(`[hotkey] Could not register ${accelerator}`)
  return ok
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

app.whenReady().then(() => {
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
      const result = {
        ok: true as const,
        schemaVersion: row.v ?? 0,
        dbPath: app.getPath('userData'),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node
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
    setIdleThreshold: (minutes) => setIdleThresholdMinutes(minutes)
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
  ipcMain.on('tray:update', (_event, running: boolean, label: string, todaySeconds: number) => {
    updateTray(running, label, todaySeconds ?? lastTodaySeconds)
    if (running) startIdleWatcher()
    else stopIdleWatcher()
  })

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
