import { ElectronAPI } from '@electron-toolkit/preload'
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
  UpdateStatus
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      tray: {
        update(
          isRunning: boolean,
          label: string,
          todaySeconds: number,
          startedAt?: string | null
        ): void
      }
      mini: {
        onState(
          callback: (state: {
            running: boolean
            label: string
            startedAt: string | null
          }) => void
        ): () => void
        requestStart(): void
        requestStop(): void
      }
      hotkeyCapture: {
        begin(): void
        end(): void
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
        create(input: CreateManualEntryInput): Promise<IpcResult<Entry>>
        update(input: UpdateEntryInput): Promise<IpcResult<Entry>>
        delete(id: number, cascadeLinked?: boolean): Promise<IpcResult<void>>
        undelete(id: number): Promise<IpcResult<Entry>>
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
      dashboard: {
        todayTotal(): Promise<IpcResult<number>>
        summary(): Promise<IpcResult<DashboardSummary>>
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
        get(): Promise<IpcResult<{ db: string; backups: string; logs: string; logFile: string }>>
      }
      exporter: {
        json(): Promise<IpcResult<{ path: string; bytes: number }>>
      }
      tags: {
        recent(): Promise<IpcResult<string[]>>
      }
      pdf: {
        export(req: {
          clientId: number
          fromIso: string
          toIso: string
          includeSignatures?: boolean
          groupByTag?: boolean
        }): Promise<IpcResult<{ path: string }>>
      }
      logo: {
        set(): Promise<IpcResult<{ path: string }>>
        clear(): Promise<IpcResult<void>>
      }
      csv: {
        export(req: {
          clientId: number
          fromIso: string
          toIso: string
          format?: 'de' | 'us'
        }): Promise<IpcResult<{ path: string }>>
      }
      update: {
        getStatus(): Promise<IpcResult<UpdateStatus>>
        getLastCheck(): Promise<IpcResult<string | null>>
        getVersion(): Promise<IpcResult<string>>
        check(): Promise<IpcResult<void>>
        install(): Promise<IpcResult<void>>
        onStatus(callback: (status: UpdateStatus) => void): () => void
      }
    }
  }
}
