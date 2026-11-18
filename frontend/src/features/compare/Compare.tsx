import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import type { ChangeFile } from '../../types/explorer'
import { Avatar, ErrorBox, Loading, StatusBadge } from '../../components/ui/bits'
import { useSettings } from '../../store/settings'
import { RequireRepo } from '../repository/RequireRepo'
import { timeAgo } from '../../utils/time'
import { cn } from '../../utils/cn'

const DiffViewer = lazy(() => import('../../components/diff-viewer/DiffViewer'))

export function Compare() {
  return <RequireRepo>{(root) => <CompareBody root={root} />}</RequireRepo>
}

type Mode = 'branch' | 'commit' | 'branch-wt' | 'head-wt'
const modes: [Mode, string][] = [['branch', 'Branch ↔ branch'], ['commit', 'Commit ↔ commit'], ['branch-wt', 'Branch ↔ working tree'], ['head-wt', 'HEAD ↔ working tree']]
const labels: Record<string, string> = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed' }

function CompareBody({ root }: { root: string }) {
  const [sp, setSp] = useSearchParams()
  const mode = (sp.get('mode') as Mode) || 'branch'
  const branches = useFetch(() => explorer.branches(root), [root])
  const names = useMemo(() => (branches.data ?? []).map((b) => b.name), [branches.data])
  const current = branches.data?.find((b) => b.current)?.name
  const pref = useSettings((s) => s.s.default_compare_branch)
  const defBase = pref && names.includes(pref) ? pref : names.includes('main') ? 'main' : names.includes('master') ? 'master' : names.find((n) => n !== current) ?? current ?? ''
  const base = mode === 'head-wt' ? 'HEAD' : sp.get('base') ?? (mode === 'commit' ? '' : defBase)
  const target = mode === 'branch-wt' || mode === 'head-wt' ? 'WORKTREE' : sp.get('target') ?? (mode === 'commit' ? 'HEAD' : current ?? '')
  const ready = !!base && !!target
  const update = (kv: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(kv).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); setSp(n, { replace: true }) }
  const [file, setFile] = useState<ChangeFile | null>(null)

  const res = useFetch(() => ready ? explorer.compare(root, base, target, mode === 'commit') : Promise.resolve(null), [root, base, target, mode, ready])
  const r = res.data
  const grouped = useMemo(() => Object.keys(labels).map((k) => [k, (r?.files ?? []).filter((f) => f.status === k)] as const).filter(([, l]) => l.length), [r])

  const select = (v: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={v} onChange={(e) => { onChange(e.target.value); setFile(null) }} className="h-7 max-w-[220px] rounded-[5px] border border-line bg-bg px-2 font-mono text-xs">
      {!names.includes(v) && <option value={v}>{v}</option>}{names.map((n) => <option key={n} value={n}>{n}</option>)}</select>)
  const text = (v: string, onChange: (v: string) => void, label: string) => (
    <input aria-label={label} defaultValue={v} key={v} onBlur={(e) => { onChange(e.target.value.trim()); setFile(null) }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="hash, tag or branch" className="h-7 w-44 rounded-[5px] border border-line bg-bg px-2 font-mono text-xs" />)
  const pick = mode === 'commit' ? text : select

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3.5 py-2.5">
        <h1 className="m-0 text-[15px] font-semibold">Compare</h1>
        <div className="inline-flex overflow-hidden rounded-[5px] border border-line" role="tablist">
          {modes.map(([m, l]) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setFile(null); setSp({ mode: m }, { replace: true }) }}
            className={cn('h-7 border-0 px-2.5', mode === m ? 'bg-accent-soft text-accent' : 'bg-panel2 text-mute')}>{l}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-mute">Base</span>{mode === 'head-wt' ? <code className="font-mono text-xs">HEAD</code> : pick(base, (v) => update({ base: v }), 'Base')}
          <span className="text-mute">←</span>
          <span className="text-mute">Compare</span>{mode === 'branch-wt' || mode === 'head-wt' ? <code className="font-mono text-xs">working tree</code> : pick(target, (v) => update({ target: v }), 'Compare')}
        </div>
      </div>
      {!ready ? <p className="p-5 text-mute">{mode === 'commit' ? 'Enter two commits, tags or branches to compare.' : 'Choose what to compare.'}</p> :
        res.error ? <ErrorBox message={res.error} retry={res.reload} /> : !r ? <Loading what="Comparing" /> : (<>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] border-b border-line bg-panel">
            {r.worktree ? null : [['Ahead', `↑ ${r.ahead}`, 'text-add'], ['Behind', `↓ ${r.behind}`, 'text-del']].map(([l, v, c]) => <Stat key={l} l={l} v={v} c={c} />)}
            <Stat l="Files" v={String(r.files.length)} />
            {Object.entries(labels).filter(([k]) => k !== 'R').map(([k, l]) => <Stat key={k} l={l} v={String(r.files.filter((f) => f.status === k).length)} />)}
            <Stat l="Lines" v={<><span className="text-add">+{r.insertions}</span> <span className="text-del">−{r.deletions}</span></>} />
          </div>
          {!mode.endsWith('commit') && r.merge_base && <div className="border-b border-line px-3.5 py-1 text-xs text-faint">Showing what <b className="font-mono">{r.target}</b> changed since it diverged from <b className="font-mono">{r.base}</b> (merge base <span className="font-mono">{r.merge_base.slice(0, 7)}</span>).</div>}
          {r.worktree && <div className="border-b border-line px-3.5 py-1 text-xs text-faint">Includes staged and unstaged edits to tracked files. Untracked files are listed on the Changes screen.</div>}
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,400px)_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[45%_55%]">
            <div className="min-h-0 overflow-auto border-r border-line bg-panel">
              {r.files.length === 0 ? <p className="p-5 text-mute">No file differences.</p> : grouped.map(([k, list]) => (
                <div key={k}><div className="sticky top-0 z-[1] border-b border-line bg-panel2 px-3 py-1.5"><b>{labels[k]}</b> <span className="text-faint">{list.length}</span></div>
                  {list.map((f) => (
                    <div key={f.path} role="button" tabIndex={0} onClick={() => setFile(f)} onKeyDown={(e) => e.key === 'Enter' && setFile(f)}
                      className={cn('flex cursor-pointer items-center gap-2 border-b border-line px-3 py-1.5 hover:bg-panel2', file?.path === f.path && 'bg-accent-soft')}>
                      <StatusBadge s={f.status} /><span className="min-w-0 flex-1 truncate font-mono text-xs">{f.old_path ? `${f.old_path} → ` : ''}{f.path}</span>
                      <span className="font-mono text-xs">{f.insertions === null ? 'bin' : <><span className="text-add">+{f.insertions}</span> <span className="text-del">−{f.deletions}</span></>}</span></div>))}
                </div>))}
              {!r.worktree && <>
                <CommitList title={`Commits in ${r.target} not in ${r.base}`} list={r.commits_ahead} total={r.ahead} />
                <CommitList title={`Commits in ${r.base} not in ${r.target}`} list={r.commits_behind} total={r.behind} />
              </>}
            </div>
            <div className="min-h-0 min-w-0">
              {file ? <Suspense fallback={<Loading what="Loading diff viewer" />}><DiffViewer root={root} path={file.path} oldPath={file.old_path} base={r.diff_base} target={r.target} status={file.status} stats={[file.insertions, file.deletions]} /></Suspense>
                : <div className="grid h-full place-items-center p-6 text-center text-mute">{r.files.length ? 'Select a file to see its diff.' : 'Nothing differs between these.'}</div>}
            </div>
          </div>
        </>)}
    </div>
  )
}

const Stat = ({ l, v, c = '' }: { l: string; v: React.ReactNode; c?: string }) => (
  <div className="border-r border-line px-3.5 py-2 last:border-0"><small className="block text-[11px] uppercase tracking-[.06em] text-faint">{l}</small><b className={cn('text-base font-semibold tabular-nums', c)}>{v}</b></div>)

function CommitList({ title, list, total }: { title: string; list: { hash: string; short: string; subject: string; author: string; date: string }[]; total: number }) {
  if (!total) return null
  return (
    <div><div className="sticky top-0 z-[1] border-y border-line bg-panel2 px-3 py-1.5"><b>{title}</b> <span className="text-faint">{total}</span></div>
      {list.map((c) => <a key={c.hash} href={`#/commits?c=${c.hash}`} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-fg no-underline hover:bg-panel2">
        <Avatar name={c.author} /><span className="min-w-0 flex-1 truncate">{c.subject}</span><span className="font-mono text-xs text-accent">{c.short}</span><span className="text-xs text-faint">{timeAgo(c.date)}</span></a>)}
      {total > list.length && <p className="px-3 py-2 text-xs text-faint">Showing the latest {list.length} of {total}.</p>}
    </div>)
}
