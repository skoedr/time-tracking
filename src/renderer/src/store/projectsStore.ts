import { create } from 'zustand'

/**
 * Mutation-version store for projects (v1.9 #75 PR 2).
 *
 * Pattern mirrors clientsStore (C1): any IPC call that mutates project data
 * (`projects:create`, `:update`, `:archive`, `:delete`) must call
 * `bumpVersion()` after success. Components that display project lists
 * re-fetch via `useEffect([projectsVersion])`.
 */
interface ProjectsState {
  version: number
  bumpVersion: () => void
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  version: 0,
  bumpVersion: (): void => set((s) => ({ version: s.version + 1 }))
}))
