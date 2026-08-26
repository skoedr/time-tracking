/**
 * Status transitions of the auto-update flow, tested through the real
 * reduceUpdateStatus the event handlers in updater.ts call (#201 — this file
 * used to exercise a self-contained mirror of the reducer, which could drift
 * from the module without any test noticing).
 */
import { describe, it, expect, vi } from 'vitest'

// updater.ts imports electron, electron-log and electron-updater at module
// level; none of their behaviour is under test here.
vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))
vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }))

import { reduceUpdateStatus, type UpdateStatus } from './updater'

describe('updater status reducer', () => {
  it('idle -> checking -> available -> downloading -> ready', () => {
    let s: UpdateStatus = { status: 'idle' }
    s = reduceUpdateStatus(s, { type: 'checking' })
    expect(s.status).toBe('checking')

    s = reduceUpdateStatus(s, { type: 'available', version: '1.5.1' })
    expect(s).toEqual({ status: 'available', version: '1.5.1' })

    s = reduceUpdateStatus(s, { type: 'progress', percent: 42.7 })
    expect(s).toEqual({ status: 'downloading', version: '1.5.1', progress: 43 })

    s = reduceUpdateStatus(s, { type: 'progress', percent: 99.1 })
    expect(s).toEqual({ status: 'downloading', version: '1.5.1', progress: 99 })

    s = reduceUpdateStatus(s, { type: 'downloaded', version: '1.5.1' })
    expect(s).toEqual({ status: 'ready', version: '1.5.1' })
  })

  it('progress before available falls back to empty version', () => {
    const s = reduceUpdateStatus({ status: 'checking' }, { type: 'progress', percent: 10 })
    expect(s).toEqual({ status: 'downloading', version: '', progress: 10 })
  })

  it('progress keeps the version across consecutive downloading states', () => {
    const s = reduceUpdateStatus(
      { status: 'downloading', version: '2.0.0', progress: 10 },
      { type: 'progress', percent: 33.499 }
    )
    expect(s).toEqual({ status: 'downloading', version: '2.0.0', progress: 33 })
  })

  it('error overrides any prior status', () => {
    const s = reduceUpdateStatus(
      { status: 'available', version: '1.5.1' },
      { type: 'error', message: 'ENOTFOUND' }
    )
    expect(s).toEqual({ status: 'error', message: 'ENOTFOUND' })
  })

  it('not-available records the check time it is handed', () => {
    const s = reduceUpdateStatus(
      { status: 'checking' },
      { type: 'not-available', checkedAt: '2026-04-25T00:00:00Z' }
    )
    expect(s).toEqual({ status: 'not-available', checkedAt: '2026-04-25T00:00:00Z' })
  })
})
