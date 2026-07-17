/**
 * Regression tests for the selector-based settings store (v1.13.2 PR 2).
 *
 * The point of replacing SettingsContext with a zustand store is render
 * isolation: a write to one settings key must NOT re-render components
 * subscribed to a different key. Under the old context, every setSetting
 * re-rendered every useSettings consumer (I18n, Theme, Rounding, App) —
 * the performance finding from the v1.13.2 review.
 *
 * Rendered WITHOUT StrictMode on purpose: StrictMode double-invokes render
 * functions, which would make the render counts here nondeterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useSettingsStore } from './settingsStore'
import type { Settings } from '../../../shared/types'

const BASE_SETTINGS = {
  language: 'de',
  theme_mode: 'system',
  pdf_round_minutes: '0'
} as unknown as Settings

function mockApi(): { set: ReturnType<typeof vi.fn> } {
  const set = vi.fn(async () => ({ ok: true as const, data: undefined }))
  const api = {
    settings: {
      getAll: async () => ({ ok: true as const, data: { ...BASE_SETTINGS } }),
      set
    }
  }
  ;(window as unknown as { api: typeof api }).api = api
  return { set }
}

let languageRenders = 0
function LanguageProbe(): React.JSX.Element {
  const language = useSettingsStore((s) => s.settings?.language)
  languageRenders++
  return <span data-testid="lang">{language}</span>
}

describe('settingsStore selector isolation', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null })
    languageRenders = 0
  })

  afterEach(cleanup)

  it('a write to one key does not re-render subscribers of another key', async () => {
    mockApi()
    render(<LanguageProbe />)
    await act(async () => {
      await useSettingsStore.getState().load()
    })
    const rendersAfterLoad = languageRenders

    await act(async () => {
      await useSettingsStore.getState().setSetting('export_prefs', '{"tab":"csv"}')
    })
    expect(languageRenders).toBe(rendersAfterLoad)
  })

  it('a write to the subscribed key does re-render and shows the new value', async () => {
    mockApi()
    const { getByTestId } = render(<LanguageProbe />)
    await act(async () => {
      await useSettingsStore.getState().load()
    })
    const rendersAfterLoad = languageRenders

    await act(async () => {
      await useSettingsStore.getState().setSetting('language', 'en')
    })
    expect(languageRenders).toBeGreaterThan(rendersAfterLoad)
    expect(getByTestId('lang').textContent).toBe('en')
  })

  it('setSetting persists to the DB via IPC', async () => {
    const { set } = mockApi()
    await act(async () => {
      await useSettingsStore.getState().load()
      await useSettingsStore.getState().setSetting('language', 'en')
    })
    expect(set).toHaveBeenCalledWith('language', 'en')
  })

  it('setSetting before load still persists (store update is a no-op)', async () => {
    const { set } = mockApi()
    await act(async () => {
      await useSettingsStore.getState().setSetting('language', 'en')
    })
    expect(useSettingsStore.getState().settings).toBeNull()
    expect(set).toHaveBeenCalledWith('language', 'en')
  })
})
