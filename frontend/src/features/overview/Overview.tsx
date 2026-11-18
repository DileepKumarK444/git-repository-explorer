import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { explorer, ops } from '../../services/api'
import { useApp } from '../../store/app'
import { toast } from '../../store/toast'
import { useFetch } from '../../hooks/useFetch'
import { Avatar, Btn, ErrorBox, Loading, RefTag, StatusBadge } from '../../components/ui/bits'
import { timeAgo } from '../../utils/time'
import { RequireRepo } from '../repository/RequireRepo'

export function Overview() {
  return <RequireRepo>{(root) => <OverviewBody root={root} />}</RequireRepo>
}

function OverviewBody({ root }: { root: string }) {
  const { data: o, error, loading, reload } = useFetch(() => explorer.overview(root), [root])
  const nav = useNavigate()
  const refreshRepo = useApp((s) => s.refreshRepo)
  const [busy, setBusy] = useState<string | null>(null)
  const remote = async (name: 'fetch' | 'pull' | 'push') => {
    setBusy(name)
    try { const r = await ops[name](root); toast.ok(r.message); reload(); void refreshRepo() }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }
  if (error) return <ErrorBox message={error} retry={reload} />
  if (!o) return loading ? <Loading what="Reading repository" /> : null
  const dirty = Object.entries(o.changes).filter(([k]) => k !== 'staged').reduce((n, [, v]) => n + v, 0)
  const stat = (label: string, value: string, tone = '') => (
    <div className="border-r border-line px-3.5 py-2.5 last:border-0"><small className="block text-[11px] uppercase tracking-[.06em] text-faint">{label}</small>
      <b className={`text-[17px] font-semibold tabular-nums ${tone}`}>{value}</b></div>)
  return (
    <div className="mx-auto max-w-[1180px] px-[22px] py-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-[220px] flex-1">
          <h1 className="mb-1 text-[19px] font-semibold tracking-tight">{o.name}</h1>
          <div className="font-mono text-xs text-faint">{o.root}</div>
        </div>
        <Btn onClick={reload}>⟳ Refresh</Btn>
        <Btn disabled={!!busy} onClick={() => void remote('fetch')}>{busy === 'fetch' ? 'Fetching…' : 'Fetch'}</Btn>
        <Btn disabled={!!busy} onClick={() => void remote('pull')} title="Fast-forward only. Never creates a merge.">{busy === 'pull' ? 'Pulling…' : 'Pull'}</Btn>
        <Btn primary disabled={!!busy} onClick={() => void remote('push')} title="Plain push. Never forces.">{busy === 'push' ? 'Pushing…' : `Push${o.ahead ? ` ↑${o.ahead}` : ''}`}</Btn>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] overflow-hidden rounded-lg border border-line bg-panel">
        {stat('Branch', o.detached ? 'detached' : o.branch ?? '—', 'font-mono !text-sm text-accent')}
        {stat('Upstream', o.upstream ? `↑${o.ahead} ↓${o.behind}` : 'none')}
        {stat('Branches', String(o.branches))}
        {stat('Tags', String(o.tags))}
        {stat('Uncommitted', dirty ? `${dirty} files` : 'clean', dirty ? 'text-mod' : 'text-add')}
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 max-[900px]:grid-cols-1">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.07em] text-mute">Recent activity</h2>
          {o.recent.length === 0 ? <p className="text-mute">No commits yet.</p> : (
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
              {o.recent.map((c) => (
                <div key={c.hash} onClick={() => nav(`/commits?c=${c.hash}`)} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-[7px] last:border-0 hover:bg-panel2">
                  <Avatar name={c.author} /><span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  {c.refs.slice(0, 2).map((r) => <RefTag key={r.name} r={r} />)}
                  <span className="font-mono text-xs text-accent">{c.short}</span>
                  <span className="text-faint max-[700px]:hidden">{timeAgo(c.date)}</span>
                </div>))}
            </div>)}
        </section>
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.07em] text-mute">Working tree</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            {([['M', 'Modified'], ['A', 'Added'], ['D', 'Deleted'], ['R', 'Renamed'], ['U', 'Untracked']] as const).map(([k, label]) => (
              <div key={k} onClick={() => nav('/changes')} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-[7px] last:border-0 hover:bg-panel2">
                <StatusBadge s={k} /><span className="flex-1">{label}</span><b className="tabular-nums">{o.changes[k]}</b>
              </div>))}
          </div>
          <p className="mt-2 text-xs text-mute">{o.changes.staged} staged.</p>
        </section>
      </div>
    </div>
  )
}
