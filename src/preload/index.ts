import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Client,
  Entry,
  CreateClientInput,
  UpdateClientInput,
  CreateEntryInput,
  UpdateEntryInput,
  MonthQuery,
  Settings,
  IpcResult
} from '../shared/types'

const api = {
  // Tray + hotkey
  tray: {
    update: (isRunning: boolean, label: string): void =>
      ipcRenderer.send('tray:update', isRunning, label)
  },
  onHotkeyToggle: (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on('timer:hotkey-toggle', handler)
    return () => ipcRenderer.removeListener('timer:hotkey-toggle', handler)
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
    update: (input: UpdateEntryInput): Promise<IpcResult<Entry>> =>
      ipcRenderer.invoke('entries:update', input),
    delete: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('entries:delete', id)
  },
  // Settings
  settings: {
    getAll: (): Promise<IpcResult<Settings>> => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('settings:set', key, value)
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
