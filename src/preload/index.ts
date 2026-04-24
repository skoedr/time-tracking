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
  DashboardSummary
} from '../shared/types'

const api = {
  // Tray + hotkey
  tray: {
    update: (isRunning: boolean, label: string, todaySeconds: number): void =>
      ipcRenderer.send('tray:update', isRunning, label, todaySeconds)
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
    delete: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('entries:delete', id),
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
    getVersion: (): Promise<IpcResult<string>> => ipcRenderer.invoke('app:getVersion')
  },
  shell: {
    openPath: (path: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('shell:openPath', path),
    showItemInFolder: (path: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('shell:showItemInFolder', path)
  },
  paths: {
    get: (): Promise<IpcResult<{ db: string; backups: string }>> => ipcRenderer.invoke('paths:get')
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
