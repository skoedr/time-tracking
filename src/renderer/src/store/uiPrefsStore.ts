import { create } from 'zustand'

/**
 * UI preference flags that live in the settings DB but are needed
 * in multiple renderer components simultaneously.
 *
 * Call `loadUiPrefs()` once on app mount (App.tsx). Individual components
 * read flags reactively via `useUiPrefsStore(s => s.showProjectNumber)`.
 */
interface UiPrefsState {
  showProjectNumber: boolean
  load: () => Promise<void>
  setShowProjectNumber: (v: boolean) => void
}

export const useUiPrefsStore = create<UiPrefsState>((set) => ({
  showProjectNumber: false,
  load: async (): Promise<void> => {
    const res = await window.api.settings.getAll()
    if (res.ok) {
      set({ showProjectNumber: res.data.show_project_number === '1' })
    }
  },
  setShowProjectNumber: (v: boolean): void => set({ showProjectNumber: v })
}))
