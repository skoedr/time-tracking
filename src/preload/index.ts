import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Client,
  Entry,
  CreateClientInput,
  UpdateClientInput,
  CreateEntryInput,
  CreateManualEntryInput,
  UpdateEntryInput,
  MonthQuery,
  Settings,
  IpcResult,
  BackupInfo,
  DashboardSummary,
  UpdateStatus,
  LicenseEntry
} from '../shared/types'
import type { CsvRequest } from '../main/csvExport'

// ── v1.8 #76: FOUC prevention ─────────────────────────────────────────────
// Reads theme_mode synchronously (before React mounts) so the .dark class is
// set on <html> before the first paint. ipcRenderer.sendSync blocks the
// renderer thread briefly — acceptable here because it's a single SQLite row.
{
  const rawMode = ipcRenderer.sendSync('settings:getSync', 'theme_mode') as string | null
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = rawMode === 'dark' || (rawMode !== 'light' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}
// ──────────────────────────────────────────────────────────────────────────

const api = {
  // Tray + hotkey
  tray: {
    update: (
      isRunning: boolean,
      label: string,
      todaySeconds: number,
      startedAt: string | null = null
    ): void => ipcRenderer.send('tray:update', isRunning, label, todaySeconds, startedAt)
  },
  // v1.4 PR B — mini-widget channels.
  mini: {
    onState: (
      callback: (state: { running: boolean; label: string; startedAt: string | null }) => void
    ): (() => void) => {
      const handler = (
        _e: unknown,
        state: { running: boolean; label: string; startedAt: string | null }
      ): void => callback(state)
      ipcRenderer.on('mini:state-changed', handler)
      return (): void => {
        ipcRenderer.removeListener('mini:state-changed', handler)
      }
    },
    requestStart: (): void => ipcRenderer.send('mini:request-start'),
    requestStop: (): void => ipcRenderer.send('mini:request-stop')
  },
  hotkeyCapture: {
    begin: (): void => ipcRenderer.send('hotkey:beginCapture'),
    end: (): void => ipcRenderer.send('hotkey:endCapture')
  },
  onHotkeyToggle: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('timer:hotkey-toggle', handler)
    return () => ipcRenderer.removeListener('timer:hotkey-toggle', handler)
  },
  onTrayQuickStart: (callback: (clientId: number) => void): (() => void) => {
    const handler = (_e: unknown, clientId: number): void => callback(clientId)
    ipcRenderer.on('timer:tray-quick-start', handler)
    return () => ipcRenderer.removeListener('timer:tray-quick-start', handler)
  },
  onTrayStop: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('timer:tray-stop', handler)
    return () => ipcRenderer.removeListener('timer:tray-stop', handler)
  },
  onIdleDetected: (
    callback: (data: { idleSince: string; idleSeconds: number }) => void
  ): (() => void) => {
    const handler = (_e: unknown, data: { idleSince: string; idleSeconds: number }): void =>
      callback(data)
    ipcRenderer.on('timer:idle-detected', handler)
    return () => ipcRenderer.removeListener('timer:idle-detected', handler)
  },
  idle: {
    dismiss: (): void => ipcRenderer.send('idle:dismiss')
  },
  // Clients
  clients: {
    getAll: (): Promise<IpcResult<Client[]>> => ipcRenderer.invoke('clients:getAll'),
    create: (input: CreateClientInput): Promise<IpcResult<Client>> =>
      ipcRenderer.invoke('clients:create', input),
    update: (input: UpdateClientInput): Promise<IpcResult<Client>> =>
      ipcRenderer.invoke('clients:update', input),
    delete: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('clients:delete', id)
  },
  // Entries
  entries: {
    start: (input: CreateEntryInput): Promise<IpcResult<Entry>> =>
      ipcRenderer.invoke('entries:start', input),
    stop: (id: number): Promise<IpcResult<Entry>> => ipcRenderer.invoke('entries:stop', id),
    heartbeat: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('entries:heartbeat', id),
    getRunning: (): Promise<IpcResult<Entry | null>> => ipcRenderer.invoke('entries:getRunning'),
    getByMonth: (query: MonthQuery): Promise<IpcResult<Entry[]>> =>
      ipcRenderer.invoke('entries:getByMonth', query),
    create: (input: CreateManualEntryInput): Promise<IpcResult<Entry>> =>
      ipcRenderer.invoke('entries:create', input),
    update: (input: UpdateEntryInput): Promise<IpcResult<Entry>> =>
      ipcRenderer.invoke('entries:update', input),
    delete: (id: number, cascadeLinked = false): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('entries:delete', id, cascadeLinked),
    undelete: (id: number): Promise<IpcResult<Entry>> => ipcRenderer.invoke('entries:undelete', id)
  },
  // Settings
  settings: {
    getAll: (): Promise<IpcResult<Settings>> => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('settings:set', key, value)
  },
  backups: {
    list: (): Promise<IpcResult<BackupInfo[]>> => ipcRenderer.invoke('backup:list'),
    create: (): Promise<IpcResult<string>> => ipcRenderer.invoke('backup:create'),
    restore: (filePath: string): Promise<IpcResult<{ safetyBackupPath: string }>> =>
      ipcRenderer.invoke('backup:restore', filePath)
  },
  // Dashboard
  dashboard: {
    todayTotal: (): Promise<IpcResult<number>> => ipcRenderer.invoke('dashboard:todayTotal'),
    summary: (): Promise<IpcResult<DashboardSummary>> => ipcRenderer.invoke('dashboard:summary')
  },
  app: {
    relaunch: (): Promise<IpcResult<void>> => ipcRenderer.invoke('app:relaunch'),
    getVersion: (): Promise<IpcResult<string>> => ipcRenderer.invoke('app:getVersion'),
    getLicenses: (): Promise<IpcResult<LicenseEntry[]>> => ipcRenderer.invoke('app:getLicenses')
  },
  shell: {
    openPath: (path: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (path: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('shell:showItemInFolder', path)
  },
  paths: {
    get: (): Promise<IpcResult<{ db: string; backups: string; logs: string; logFile: string }>> =>
      ipcRenderer.invoke('paths:get')
  },
  exporter: {
    json: (): Promise<IpcResult<{ path: string; bytes: number }>> =>
      ipcRenderer.invoke('export:json')
  },
  tags: {
    recent: (): Promise<IpcResult<string[]>> => ipcRenderer.invoke('tags:recent')
  },
  pdf: {
    export: (req: {
      clientId: number
      fromIso: string
      toIso: string
      includeSignatures?: boolean
      groupByTag?: boolean
    }): Promise<IpcResult<{ path: string }>> => ipcRenderer.invoke('pdf:export', req),
    mergeExport: (req: {
      clientId: number
      fromIso: string
      toIso: string
      includeSignatures?: boolean
      groupByTag?: boolean
      invoicePath: string
    }): Promise<IpcResult<{ path: string }>> => ipcRenderer.invoke('pdf:merge-export', req),
    mergeOnly: (req: {
      stundennachweisPath: string
      invoicePath: string
    }): Promise<IpcResult<{ path: string }>> => ipcRenderer.invoke('pdf:merge-only', req),
    pdfInfo: (req: {
      filePath: string
    }): Promise<IpcResult<{ pageCount: number }>> => ipcRenderer.invoke('pdf:pdf-info', req),
    openPdfDialog: (): Promise<IpcResult<{ filePath: string } | null>> =>
      ipcRenderer.invoke('pdf:open-pdf-dialog')
  },
  logo: {
    set: (): Promise<IpcResult<{ path: string }>> => ipcRenderer.invoke('logo:set'),
    clear: (): Promise<IpcResult<void>> => ipcRenderer.invoke('logo:clear')
  },
  // v1.5 PR C — CSV export
  csv: {
    export: (req: CsvRequest): Promise<IpcResult<{ path: string }>> =>
      ipcRenderer.invoke('csv:export', req)
  },
  // v1.5 PR B — auto-updater
  update: {
    getStatus: (): Promise<IpcResult<UpdateStatus>> => ipcRenderer.invoke('update:getStatus'),
    getLastCheck: (): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke('update:getLastCheck'),
    getVersion: (): Promise<IpcResult<string>> => ipcRenderer.invoke('update:getVersion'),
    check: (): Promise<IpcResult<void>> => ipcRenderer.invoke('update:check'),
    install: (): Promise<IpcResult<void>> => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: UpdateStatus): void => callback(status)
      ipcRenderer.on('update:status', handler)
      return (): void => {
        ipcRenderer.removeListener('update:status', handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
