import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useApp } from '../../store/app'
import type { RecentRepo } from '../../types/repository'
import { OpenRepository } from './OpenRepository'
import { RepoCard } from './RepoCard'

export function Dashboard() {
  const [repos, setRepos] = useState<RecentRepo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gitError, setGitError] = useState<string | null>(null)
  const setRepo = useApp((s) => s.setRepo)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try { setRepos(await api.recent()); setLoadError(null) } catch (e) { setLoadError((e as Error).message) }
  }, [])
  useEffect(() => {
    void load()
    api.health().then((h) => setGitError(h.ok ? null : h.error ?? 'Git was not found.')).catch(() => undefined)
  }, [load])

  async function open(path: string): Promise<string | null> {
    try {
      const info = await api.open(path)
      setRepo(info); navigate('/overview'); return null
    } catch (e) { return (e as Error).message }
  }
  const run = (p: Promise<unknown>) => p.then(load).catch((e: Error) => setLoadError(e.message))
  const fav = repos?.filter((r) => r.favourite) ?? []
  const recent = repos?.filter((r) => !r.favourite) ?? []
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-2.5'
  const card = (r: RecentRepo) => <RepoCard key={r.path} repo={r} onOpen={() => open(r.path)}
    onFavourite={() => run(api.favourite(r.path, !r.favourite))} onRemove={() => run(api.forget(r.path))} />

  return (
    <div className="mx-auto max-w-[1180px] px-[22px] py-[18px]">
      <h1 className="mb-1 text-[19px] font-semibold tracking-tight">Repositories</h1>
      <p className="mb-3.5 mt-0 text-mute">Your local repositories. Everything stays on this machine.</p>
      {gitError && <div role="alert" className="mb-3 rounded-md border border-del bg-del-bg p-2.5 text-del">{gitError}</div>}
      <OpenRepository onOpen={open} />
      {loadError && <div role="alert" className="mt-3 text-del">{loadError}</div>}
      {repos && repos.length === 0 && !loadError && <p className="mt-6 text-mute">No repositories yet. Open one above and it will appear here.</p>}
      {fav.length > 0 && <><h2 className="mb-2 mt-[22px] text-xs font-semibold uppercase tracking-[.07em] text-mute">Favourites</h2><div className={grid}>{fav.map(card)}</div></>}
      {recent.length > 0 && <><h2 className="mb-2 mt-[22px] text-xs font-semibold uppercase tracking-[.07em] text-mute">Recent</h2><div className={grid}>{recent.map(card)}</div></>}
    </div>
  )
}
