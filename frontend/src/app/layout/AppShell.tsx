import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { Sidebar } from '../../components/sidebar/Sidebar'
import { Toaster } from '../../components/ui/Toaster'
import { ErrorBoundary } from '../../components/ui/ErrorBoundary'
import { CommandPalette } from '../../components/command-palette/CommandPalette'
import { api } from '../../services/api'
import { lastRepoPath, useApp } from '../../store/app'
import { useSettings } from '../../store/settings'
import { MOD } from '../../utils/shortcuts'
import { cn } from '../../utils/cn'

const startupPath = { dashboard: '/', last_repository: '/overview', commits: '/commits', changes: '/changes' } as const

export function AppShell() {
  const { collapsed, toggleSidebar, repo, setRepo, setRestored, refresh, refreshRepo } = useApp()
  const { resolved, update } = useSettings()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [palette, setPalette] = useState(false)
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | 'down' | null>(null)

  useEffect(() => {  // load settings, then reopen the last (or default) repository and honour the startup screen
    void (async () => {
      await useSettings.getState().load()
      const st = useSettings.getState().s
      const path = lastRepoPath() ?? (st.default_repository || null)
      if (path) {
        try {
          setRepo(await api.open(path))
          if (pathname === '/' && st.startup_screen !== 'dashboard') navigate(startupPath[st.startup_screen], { replace: true })
        } catch { setRepo(null) }
      }
      setRestored()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const check = () => api.health().then((h) => setHealth(h.ok ? null : { ok: false, error: h.error })).catch(() => setHealth('down'))
    check(); addEventListener('focus', check)
    return () => removeEventListener('focus', check)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = e.metaKey || e.ctrlKey, k = e.key.toLowerCase()
      if (m && k === 'k') { e.preventDefault(); setPalette((p) => !p) }
      else if (m && k === 'b') { e.preventDefault(); toggleSidebar() }
      else if (m && e.shiftKey && k === 'f') { e.preventDefault(); navigate('/search') }
      else if (m && k === 'o') { e.preventDefault(); navigate('/') }
      else if (m && k === 'r' && !e.shiftKey && useApp.getState().repo) { e.preventDefault(); refresh(); void refreshRepo() }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [toggleSidebar, navigate, refresh, refreshRepo])

  const title = pathname === '/' ? 'Dashboard' : pathname.slice(1).replace(/^./, (c) => c.toUpperCase())
  return (
    <div className={cn('grid h-full', collapsed ? 'grid-cols-[52px_minmax(0,1fr)]' : 'grid-cols-[208px_minmax(0,1fr)] max-[700px]:grid-cols-[52px_minmax(0,1fr)]')}>
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-line bg-panel px-3.5">
          <span className="truncate font-medium">{repo && pathname !== '/' ? `${repo.name} / ${title}` : title}</span>
          <span className="flex-1" />
          <button onClick={() => setPalette(true)} className="hidden h-7 items-center gap-2 rounded-[5px] border border-line bg-panel2 px-2.5 text-mute min-[700px]:flex">Search or run a command <kbd className="rounded border border-line bg-panel px-1.5 font-mono text-[11px]">{MOD} K</kbd></button>
          <button aria-label="Toggle theme" onClick={() => void update({ theme: resolved === 'dark' ? 'light' : 'dark' })}
            className="grid h-7 w-7 place-items-center rounded-[5px] border-0 bg-transparent text-mute hover:bg-panel2">
            {resolved === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>
        {health && (
          <div role="alert" className="border-b border-del bg-del-bg px-4 py-2 text-del">
            {health === 'down' ? 'Cannot reach the local backend. Start it with ./dev.sh and reload this page.'
              : <>{health.error ?? 'Git was not found.'} <Link to="/settings" className="underline">Set the Git path in Settings</Link>.</>}
          </div>)}
        <div className="min-h-0 flex-1 overflow-auto"><ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary></div>
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster />
    </div>
  )
}
