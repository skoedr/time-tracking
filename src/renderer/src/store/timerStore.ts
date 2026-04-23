import { create } from 'zustand'
import type { Client, Entry } from '../../../shared/types'

interface TimerState {
  // Data
  clients: Client[]
  runningEntry: Entry | null

  // UI
  selectedClientId: number | null
  description: string
  elapsedSeconds: number
  isLoading: boolean

  // Actions
  setClients: (clients: Client[]) => void
  setRunningEntry: (entry: Entry | null) => void
  setSelectedClientId: (id: number | null) => void
  setDescription: (desc: string) => void
  setElapsedSeconds: (s: number) => void
  setIsLoading: (v: boolean) => void
}

export const useTimerStore = create<TimerState>((set) => ({
  clients: [],
  runningEntry: null,
  selectedClientId: null,
  description: '',
  elapsedSeconds: 0,
  isLoading: false,

  setClients: (clients) => set({ clients }),
  setRunningEntry: (runningEntry) => set({ runningEntry }),
  setSelectedClientId: (selectedClientId) => set({ selectedClientId }),
  setDescription: (description) => set({ description }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setIsLoading: (isLoading) => set({ isLoading })
}))
