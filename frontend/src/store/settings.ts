import { create } from 'zustand'
import { settingsApi } from '../services/api'

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  git_path: string
  default_compare_branch: string
  default_diff: 'split' | 'unified'
  default_repository: string
  show_hidden_files: boolean
  exclude_dirs: string[]
  file_sort: 'folders_first' | 'name'
  diff_wrap: boolean
  diff_context: number
  confirm_destructive: boolean
  startup_screen: 'dashboard' | 'last_repository' | 'commits' | 'changes'
  history_limit: number
}

export const defaults: Settings = {
  theme: 'dark', git_path: '', default_compare_branch: '', default_diff: 'split', default_repository: '', show_hidden_files: false,
  exclude_dirs: ['.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'coverage'], file_sort: 'folders_first', diff_wrap: false,
  diff_context: 3, confirm_destructive: true, startup_screen: 'dashboard', history_limit: 50,
}

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

const cachedTheme = (): Settings['theme'] => { try { const t = localStorage.getItem('grx.theme'); return t === 'light' || t === 'system' ? t : 'dark' } catch { return 'dark' } }

export function applyTheme(t: Settings['theme']): 'dark' | 'light' {
  const dark = t === 'dark' || (t === 'system' && prefersDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try { localStorage.setItem('grx.theme', t) } catch { /* storage unavailable */ }
  return dark ? 'dark' : 'light'
}

interface State {
  s: Settings; loaded: boolean; resolved: 'dark' | 'light'
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<string | null>
}

export const useSettings = create<State>((set, get) => ({
  s: { ...defaults, theme: cachedTheme() }, loaded: false, resolved: 'dark',
  load: async () => {
    try {
      const s = { ...defaults, ...(await settingsApi.get()) } as Settings
      set({ s, loaded: true, resolved: applyTheme(s.theme) })
    } catch { set({ loaded: true, resolved: applyTheme(get().s.theme) }) }  // backend down: run on defaults, the health banner explains
  },
  update: async (patch) => {
    const prev = get().s
    const next = { ...prev, ...patch }
    set({ s: next, ...(patch.theme ? { resolved: applyTheme(patch.theme) } : {}) })
    try {
      set({ s: { ...defaults, ...(await settingsApi.put(patch as Record<string, unknown>)) } as Settings })
      return null
    } catch (e) {
      set({ s: prev, resolved: applyTheme(prev.theme) })
      return (e as Error).message
    }
  },
}))

if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  const { s } = useSettings.getState()
  if (s.theme === 'system') useSettings.setState({ resolved: applyTheme('system') })
})
