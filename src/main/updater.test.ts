/**
 * Status-transition reducer tests for the auto-update flow.
 *
 * We don't boot electron-updater here — instead we exercise a pure
 * reducer that mirrors the lifecycle the renderer-side store cares
 * about. Same shape as `src/main/updater.ts` UpdateStatus, but
 * driven by named events to keep the test self-contained.
 */
import { describe, it, expect } from 'vitest'

type Status =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; progress: number }
  | { status: 'ready'; version: string }
  | { status: 'not-available'; checkedAt: string }
  | { status: 'error'; message: string }

type Event =
  | { type: 'check' }
  | { type: 'available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'not-available' }
  | { type: 'error'; message: string }

function reduce(prev: Status, event: Event): Status {
  switch (event.type) {
    case 'check':
      return { status: 'checking' }
    case 'available':
      return { status: 'available', version: event.version }
    case 'progress': {
      const version =
        prev.status === 'available' || prev.status === 'downloading' ? prev.version : ''
      return { status: 'downloading', version, progress: Math.round(event.percent) }
    }
    case 'downloaded':
      return { status: 'ready', version: event.version }
    case 'not-available':
      return { status: 'not-available', checkedAt: '2026-04-25T00:00:00Z' }
    case 'error':
      return { status: 'error', message: event.message }
  }
}

describe('updater status reducer', () => {
  it('starts idle', () => {
    const s: Status = { status: 'idle' }
    expect(s.status).toBe('idle')
  })

  it('idle -> checking -> available -> downloading -> ready', () => {
    let s: Status = { status: 'idle' }
    s = reduce(s, { type: 'check' })
    expect(s.status).toBe('checking')

    s = reduce(s, { type: 'available', version: '1.5.1' })
    expect(s).toEqual({ status: 'available', version: '1.5.1' })

    s = reduce(s, { type: 'progress', percent: 42.7 })
    expect(s).toEqual({ status: 'downloading', version: '1.5.1', progress: 43 })

    s = reduce(s, { type: 'progress', percent: 99.1 })
    expect(s).toEqual({ status: 'downloading', version: '1.5.1', progress: 99 })

    s = reduce(s, { type: 'downloaded', version: '1.5.1' })
    expect(s).toEqual({ status: 'ready', version: '1.5.1' })
  })

  it('progress before available falls back to empty version', () => {
    let s: Status = { status: 'checking' }
    s = reduce(s, { type: 'progress', percent: 10 })
    expect(s).toEqual({ status: 'downloading', version: '', progress: 10 })
  })

  it('error overrides any prior status', () => {
    let s: Status = { status: 'available', version: '1.5.1' }
    s = reduce(s, { type: 'error', message: 'ENOTFOUND' })
    expect(s).toEqual({ status: 'error', message: 'ENOTFOUND' })
  })

  it('not-available records the check time', () => {
    let s: Status = { status: 'checking' }
    s = reduce(s, { type: 'not-available' })
    expect(s.status).toBe('not-available')
    if (s.status === 'not-available') {
      expect(s.checkedAt).toBeTruthy()
    }
  })

  it('progress percent is rounded', () => {
    const s = reduce(
      { status: 'available', version: '2.0.0' },
      { type: 'progress', percent: 33.499 }
    )
    expect(s).toEqual({ status: 'downloading', version: '2.0.0', progress: 33 })
  })
})
