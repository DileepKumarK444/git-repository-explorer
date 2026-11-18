import { create } from 'zustand'
import { api } from '../services/api'
import type { RepoInfo } from '../types/repository'

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

export const lastRepoPath = () => read<string | null>('grx.lastRepo', null)

interface AppState {
  collapsed: boolean; tick: number; refresh: () => void; repo: RepoInfo | null; restored: boolean
  toggleSidebar: () => void; setRepo: (r: RepoInfo | null) => void; refreshRepo: () => Promise<void>; setRestored: () => void
}
export const useApp = create<AppState>((set) => ({
  tick: 0,
  refresh: () => set((s) => ({ tick: s.tick + 1 })),
  collapsed: read('grx.collapsed', false),
  repo: null,
  restored: false,
  toggleSidebar: () => set((s) => { write('grx.collapsed', !s.collapsed); return { collapsed: !s.collapsed } }),
  setRepo: (repo) => { write('grx.lastRepo', repo?.root ?? null); set({ repo }) },
  setRestored: () => set({ restored: true }),
  refreshRepo: async () => {  // re-read branch and status after an operation (read-only call)
    const r = useApp.getState().repo
    if (!r) return
    try { set({ repo: await api.validate(r.root) }) } catch { /* the next screen load will show the error */ }
  },
}))
