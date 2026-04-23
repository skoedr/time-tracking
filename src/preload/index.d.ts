import { ElectronAPI } from '@electron-toolkit/preload'
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tray: {
        update(isRunning: boolean, label: string): void
      }
      onHotkeyToggle(callback: () => void): () => void
      clients: {
        getAll(): Promise<IpcResult<Client[]>>
        create(input: CreateClientInput): Promise<IpcResult<Client>>
        update(input: UpdateClientInput): Promise<IpcResult<Client>>
        delete(id: number): Promise<IpcResult<void>>
      }
      entries: {
        start(input: CreateEntryInput): Promise<IpcResult<Entry>>
        stop(id: number): Promise<IpcResult<Entry>>
        heartbeat(id: number): Promise<IpcResult<void>>
        getRunning(): Promise<IpcResult<Entry | null>>
        getByMonth(query: MonthQuery): Promise<IpcResult<Entry[]>>
        update(input: UpdateEntryInput): Promise<IpcResult<Entry>>
        delete(id: number): Promise<IpcResult<void>>
      }
      settings: {
        getAll(): Promise<IpcResult<Settings>>
        set(key: string, value: string): Promise<IpcResult<void>>
      }
    }
  }
}
