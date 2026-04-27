import { create } from 'zustand'

/**
 * Mutation-version store for clients (C1).
 *
 * Pattern mirrors entriesStore (E1): any IPC call that mutates client data
 * (`clients:create`, `:update`, `:delete`) must call `bumpVersion()` after
 * success. `useTimer` re-fetches the client list via `useEffect([version])`.
 * This keeps timerStore.clients — and any view that reads it (TodayView,
 * CalendarView) — in sync without a full app restart.
 */
interface ClientsState {
  version: number
  bumpVersion: () => void
}

export const useClientsStore = create<ClientsState>((set) => ({
  version: 0,
  bumpVersion: (): void => set((s) => ({ version: s.version + 1 }))
}))
