import { app, shell, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getDb, recoverZombieEntries, MigrationError } from './db'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function updateTray(isRunning: boolean, label: string): void {
  if (!tray) return
  tray.setToolTip(isRunning ? `TimeTrack ● ${label}` : 'TimeTrack — Kein Timer aktiv')
  const menu = Menu.buildFromTemplate([
    {
      label: isRunning ? `● ${label}` : 'Kein Timer aktiv',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Fenster anzeigen',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
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

  // Minimize to tray on close
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
  registerIpcHandlers()
  createWindow()

  // System tray
  tray = new Tray(icon)
  updateTray(false, '')
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  // Global hotkey Alt+Shift+S → toggle timer in renderer
  const registered = globalShortcut.register('Alt+Shift+S', () => {
    mainWindow?.webContents.send('timer:hotkey-toggle')
  })
  if (!registered) {
    console.warn('Global hotkey Alt+Shift+S could not be registered')
  }

  // Renderer notifies main to update tray state
  ipcMain.on('tray:update', (_event, isRunning: boolean, label: string) => {
    updateTray(isRunning, label)
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
