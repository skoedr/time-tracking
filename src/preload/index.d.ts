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
  IpcResult,
  BackupInfo
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tray: {
        update(isRunning: boolean, label: string): void
      }
      onHotkeyToggle(callback: () => void): () => void
      onTrayQuickStart(callback: (clientId: number) => void): () => void
      onTrayStop(callback: () => void): () => void
      onIdleDetected(
        callback: (data: { idleSince: string; idleSeconds: number }) => void
      ): () => void
      idle: {
        dismiss(): void
      }
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
      backups: {
        list(): Promise<IpcResult<BackupInfo[]>>
        create(): Promise<IpcResult<string>>
        restore(filePath: string): Promise<IpcResult<{ safetyBackupPath: string }>>
      }
      app: {
        relaunch(): Promise<IpcResult<void>>
        getVersion(): Promise<IpcResult<string>>
      }
      shell: {
        openPath(path: string): Promise<IpcResult<void>>
        showItemInFolder(path: string): Promise<IpcResult<void>>
      }
      paths: {
        get(): Promise<IpcResult<{ db: string; backups: string }>>
      }
    }
  }
}
