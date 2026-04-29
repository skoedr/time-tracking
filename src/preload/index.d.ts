import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  Client,
  Entry,
  Project,
  CreateClientInput,
  UpdateClientInput,
  CreateEntryInput,
  CreateManualEntryInput,
  UpdateEntryInput,
  CreateProjectInput,
  UpdateProjectInput,
  MonthQuery,
  Settings,
  IpcResult,
  BackupInfo,
  DashboardSummary,
  UpdateStatus,
  LicenseEntry
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
        setPath(): Promise<IpcResult<string>>
        resetPath(): Promise<IpcResult<void>>
        getPathInfo(): Promise<IpcResult<{ dir: string; isCustom: boolean; isReachable: boolean }>>
      }
      dashboard: {
        todayTotal(): Promise<IpcResult<number>>
        summary(): Promise<IpcResult<DashboardSummary>>
      }
      app: {
        relaunch(): Promise<IpcResult<void>>
        getVersion(): Promise<IpcResult<string>>
        getLicenses(): Promise<IpcResult<LicenseEntry[]>>
      }
      shell: {
        openPath(path: string): Promise<IpcResult<void>>
        openExternal(url: string): Promise<IpcResult<void>>
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
          projectId?: number | null
          includeSignatures?: boolean
          groupByTag?: boolean
        }): Promise<IpcResult<{ path: string }>>
        mergeExport(req: {
          clientId: number
          fromIso: string
          toIso: string
          projectId?: number | null
          includeSignatures?: boolean
          groupByTag?: boolean
          invoicePath: string
        }): Promise<IpcResult<{ path: string }>>
        mergeOnly(req: {
          stundennachweisPath: string
          invoicePath: string
        }): Promise<IpcResult<{ path: string }>>
        pdfInfo(req: {
          filePath: string
        }): Promise<IpcResult<{ pageCount: number }>>
        openPdfDialog(): Promise<IpcResult<{ filePath: string } | null>>
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
          projectId?: number | null
          format?: 'de' | 'us'
          groupByTag?: boolean
        }): Promise<IpcResult<{ path: string }>>
      }
      projects: {
        getAll(req?: { clientId?: number | null }): Promise<IpcResult<Project[]>>
        create(input: CreateProjectInput): Promise<IpcResult<Project>>
        update(input: UpdateProjectInput): Promise<IpcResult<Project>>
        archive(id: number): Promise<IpcResult<void>>
        delete(id: number): Promise<IpcResult<void>>
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
