// Shared types between main process and renderer

export interface Client {
  id: number
  name: string
  color: string
  active: number
  created_at: string
}

export interface Entry {
  id: number
  client_id: number
  description: string
  started_at: string
  stopped_at: string | null
  heartbeat_at: string | null
  rounded_min: number | null
  created_at: string
}

export interface Settings {
  rounding_mode: 'none' | 'ceil' | 'floor' | 'round'
  rounding_minutes: '5' | '10' | '15' | '30'
  company_name: string
  backup_path: string
}

export interface CreateClientInput {
  name: string
  color: string
}

export interface UpdateClientInput {
  id: number
  name: string
  color: string
  active: number
}

export interface CreateEntryInput {
  client_id: number
  description: string
  started_at: string
}

export interface UpdateEntryInput {
  id: number
  client_id: number
  description: string
  started_at: string
  stopped_at: string
}

export interface MonthQuery {
  year: number
  month: number // 1-12
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type BackupReason = 'daily' | 'manual' | 'pre-migration'

export interface BackupInfo {
  filename: string
  fullPath: string
  reason: BackupReason
  createdAt: string
  sizeBytes: number
}
