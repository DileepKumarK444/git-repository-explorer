import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import type { Commit } from '../../types/explorer'
import { Avatar, ErrorBox, RefTag } from '../../components/ui/bits'
import { layoutGraph } from '../../utils/graph'
import { timeAgo } from '../../utils/time'
import { cn } from '../../utils/cn'
import { toast } from '../../store/toast'
import { copyText, useContextMenu } from '../../components/ui/ContextMenu'
import { useApp } from '../../store/app'
import { RequireRepo } from '../repository/RequireRepo'
import { CommitDetails } from './CommitDetails'
import { GraphCell, ROW_H, graphWidth } from './GraphCell'

export function Commits() {
  return <RequireRepo>{(root) => <CommitsBody root={root} />}</RequireRepo>
}

const PAGE = 100
interface Filters { q: string; author: string; hash: string; since: string; until: string; path: string }
const empty: Filters = { q: '', author: '', hash: '', since: '', until: '', path: '' }
const fromUrl = (sp: URLSearchParams): Filters => ({ ...empty, path: sp.get('path') ?? '' })

function CommitsBody({ root }: { root: string }) {
  const [sp, setSp] = useSearchParams()
  const selected = sp.get('c'), rev = sp.get('rev') ?? ''
  const [f, setF] = useState<Filters>(() => fromUrl(sp))
  const [applied, setApplied] = useState<Filters>(() => fromUrl(sp))
  useEffect(() => { const t = setTimeout(() => setApplied(f), 300); return () => clearTimeout(t) }, [f])
  const nav = useNavigate()
  const ctx = useContextMenu()
  const tick = useApp((s) => s.tick)
  const branches = useFetch(() => explorer.branches(root), [root])

  const [list, setList] = useState<Commit[]>([])
  const [more, setMore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gen = useRef(0)
  const filtered = Object.values(applied).some(Boolean) || !!rev

  const load = useCallback(async (skip: number, g: number) => {
    setBusy(true)
    try {
      const r = await explorer.commits(root, { skip, limit: PAGE, rev, author: applied.author, q: applied.q, since: applied.since, until: applied.until, path: applied.path, hash: applied.hash })
      if (g !== gen.current) return
      setList((l) => (skip === 0 ? r.commits : [...l, ...r.commits])); setMore(r.has_more); setError(null)
    } catch (e) { if (g === gen.current) setError((e as Error).message) }
    finally { if (g === gen.current) setBusy(false) }
  }, [root, rev, applied])
  useEffect(() => { gen.current++; setList([]); setMore(true); void load(0, gen.current) }, [load, tick])

  // windowed rendering: only rows near the viewport exist in the DOM
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, h: 600 })
  useEffect(() => { const el = box.current; if (el) setView((v) => ({ ...v, h: el.clientHeight })) }, [])
  const first = Math.max(0, Math.floor(view.top / ROW_H) - 6)
  const last = Math.min(list.length, Math.ceil((view.top + view.h) / ROW_H) + 6)
  useEffect(() => { if (more && !busy && !error && list.length > 0 && last >= list.length - 20) void load(list.length, gen.current) }, [last, list.length, more, busy, error, load])

  const { rows, width } = useMemo(() => layoutGraph(list), [list])
  const gw = filtered ? 0 : graphWidth(width)
  const pick = (h: string) => { const n = new URLSearchParams(sp); n.set('c', h); setSp(n) }
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const input = 'h-7 min-w-0 rounded-[5px] border border-line bg-bg px-2'

  return (
    <div className="grid h-full grid-cols-[minmax(340px,1.1fr)_minmax(0,1fr)] max-[800px]:grid-cols-1 max-[800px]:grid-rows-[50%_50%]">
      <section className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
        <div className="flex flex-wrap gap-1.5 border-b border-line p-2">
          <input aria-label="Search commit messages" className={cn(input, 'flex-[2_1_160px]')} placeholder="Message…" value={f.q} onChange={set('q')} />
          <input aria-label="Author" className={cn(input, 'flex-[1_1_90px]')} placeholder="Author" value={f.author} onChange={set('author')} />
          <input aria-label="Commit hash" className={cn(input, 'w-24 font-mono')} placeholder="Hash" value={f.hash} onChange={set('hash')} />
          <select aria-label="Branch" className={cn(input, 'w-36')} value={rev} onChange={(e) => { const n = new URLSearchParams(sp); e.target.value ? n.set('rev', e.target.value) : n.delete('rev'); setSp(n) }}>
            <option value="">All branches</option>{(branches.data ?? []).map((b) => <option key={(b.remote ? 'r' : 'l') + b.name} value={b.name}>{b.name}</option>)}</select>
          <input aria-label="Since" type="date" className={cn(input, 'w-[130px]')} value={f.since} onChange={set('since')} />
          <input aria-label="Until" type="date" className={cn(input, 'w-[130px]')} value={f.until} onChange={set('until')} />
          <input aria-label="File path" className={cn(input, 'flex-[1_1_120px] font-mono')} placeholder="File path" value={f.path} onChange={set('path')} />
        </div>
        {filtered && <div className="border-b border-line px-3 py-1 text-xs text-faint">Graph is hidden while filtering, because filtered history is not continuous.
          <button className="ml-2 border-0 bg-transparent p-0 text-accent underline" onClick={() => { setF(empty); setApplied(empty); setSp(selected ? { c: selected } : {}) }}>Clear filters</button></div>}
        {error && <ErrorBox message={error} retry={() => void load(list.length, gen.current)} />}
        <div ref={box} onScroll={(e) => setView({ top: e.currentTarget.scrollTop, h: e.currentTarget.clientHeight })} className="min-h-0 flex-1 overflow-auto" role="list" aria-label="Commits">
          <div style={{ height: list.length * ROW_H + (more || busy ? ROW_H : 0), position: 'relative' }}>
            {list.slice(first, last).map((c, k) => {
              const i = first + k
              return (
                <div key={c.hash} role="listitem" onClick={() => pick(c.hash)} onContextMenu={(e) => ctx.open(e, [
                    { label: 'Copy hash', onClick: () => copyText(c.hash, () => toast.ok('Copied hash')) },
                    { label: 'Copy message', onClick: () => copyText(c.subject, () => toast.ok('Copied message')) },
                    { label: '', separator: true, onClick: () => undefined },
                    { label: 'View diff', onClick: () => nav(`/compare?mode=commit&base=${c.parents[0] ?? '4b825dc642cb6eb9a060e54bf8d69288fbee4904'}&target=${c.hash}`) },
                    { label: 'Compare with…', onClick: () => nav(`/compare?mode=commit&base=${c.hash}`) },
                    { label: 'Browse files here', onClick: () => nav(`/files?ref=${c.hash}`) },
                    { label: 'Tag this commit…', onClick: () => nav(`/tags?new=${c.hash}`) },
                  ])} style={{ position: 'absolute', top: i * ROW_H, height: ROW_H, left: 0, right: 0 }}
                  className={cn('flex cursor-pointer items-center gap-2 pr-3 hover:bg-panel2', selected === c.hash && 'bg-accent-soft')}>
                  {!filtered && <GraphCell row={rows[i]} hash={c.hash} merge={c.parents.length > 1} width={gw} />}
                  {filtered && <span className="w-3" />}
                  {c.refs.slice(0, 3).map((r) => <RefTag key={r.name} r={r} />)}
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  <span className="font-mono text-xs text-accent max-[1100px]:hidden">{c.short}</span>
                  <Avatar name={c.author} /><span className="w-[84px] whitespace-nowrap text-right text-xs text-faint max-[1100px]:hidden">{timeAgo(c.date)}</span>
                </div>)
            })}
            {(more || busy) && list.length > 0 && <div style={{ position: 'absolute', top: list.length * ROW_H, height: ROW_H }} className="grid w-full place-items-center text-xs text-faint">Loading more…</div>}
          </div>
          {!busy && list.length === 0 && !error && <p className="p-4 text-mute">{filtered ? 'No commits match these filters.' : 'This repository has no commits yet.'}</p>}
          {busy && list.length === 0 && <p className="p-4 text-mute">Loading history…</p>}
        </div>
        <div className="border-t border-line px-3 py-1 text-xs text-faint">{list.length} commits loaded{more ? ', more on scroll' : ''}</div>
      </section>
      {ctx.menu}
      <section className="min-h-0 min-w-0 overflow-auto bg-panel">
        {selected ? <CommitDetails root={root} rev={selected} onSelect={pick} /> : <div className="grid h-full place-items-center p-6 text-center text-mute">Select a commit to see its details.</div>}
      </section>
    </div>
  )
}
