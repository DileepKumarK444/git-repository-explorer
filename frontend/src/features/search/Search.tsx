import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { explorer } from '../../services/api'
import type { Commit, RefHit, SearchContent } from '../../types/explorer'
import { Avatar, ErrorBox, Loading } from '../../components/ui/bits'
import { useSettings } from '../../store/settings'
import { RequireRepo } from '../repository/RequireRepo'
import { timeAgo } from '../../utils/time'
import { cn } from '../../utils/cn'

export function Search() {
  return <RequireRepo>{(root) => <SearchBody root={root} />}</RequireRepo>
}

type Tab = 'content' | 'files' | 'commits' | 'refs'
const tabs: [Tab, string][] = [['content', 'File contents'], ['files', 'Files'], ['commits', 'Commits'], ['refs', 'Branches & tags']]

function Toggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title: string }) {
  return <button aria-pressed={on} title={title} onClick={onClick} className={cn('h-7 min-w-8 rounded-[5px] border px-2 font-mono text-xs', on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel2 text-mute')}>{label}</button>
}

function SearchBody({ root }: { root: string }) {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const tab = (sp.get('tab') as Tab) || 'content'
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [dq, setDq] = useState(q)
  const [opts, setOpts] = useState({ case: false, word: false, regex: false })
  const [types, setTypes] = useState('')
  const configured = useSettings((s) => s.s.exclude_dirs).join(', ')
  const [exclude, setExclude] = useState(configured)
  useEffect(() => setExclude(configured), [configured])
  const [context, setContext] = useState(0)
  const [state, setState] = useState<{ loading: boolean; error: string | null; content?: SearchContent; list?: unknown[] }>({ loading: false, error: null })
  const input = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => { input.current?.focus() }, [tab])
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    if (!dq.trim()) { setState({ loading: false, error: null }); return }
    const ctl = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    const done = (patch: Partial<typeof state>) => !ctl.signal.aborted && setState({ loading: false, error: null, ...patch })
    const fail = (e: Error) => { if (!ctl.signal.aborted && e.name !== 'AbortError') setState({ loading: false, error: e.message }) }
    if (tab === 'content') explorer.searchContent(root, { q: dq, case: opts.case ? 'true' : undefined, word: opts.word ? 'true' : undefined, regex: opts.regex ? 'true' : undefined,
      types: types.replace(/\s/g, ''), exclude: exclude.split(',').map((x) => x.trim()).filter(Boolean).join(','), context }, ctl.signal).then((content) => done({ content })).catch(fail)
    else if (tab === 'files') explorer.searchFiles(root, dq).then((list) => done({ list })).catch(fail)
    else if (tab === 'commits') explorer.searchCommits(root, dq).then((list) => done({ list })).catch(fail)
    else explorer.searchRefs(root, dq).then((list) => done({ list })).catch(fail)
    return () => ctl.abort()
  }, [root, dq, tab, opts, types, exclude, context])

  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }) }
  const hl = (text: string, ranges: [number, number][]) => {
    const out: React.ReactNode[] = []; let at = 0
    ranges.forEach(([a, b], i) => { out.push(text.slice(at, a), <mark key={i} className="rounded-sm bg-mod-bg text-mod">{text.slice(a, b)}</mark>); at = b })
    out.push(text.slice(at)); return out
  }
  const c = state.content
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'content' ? 'Search file contents…' : tab === 'files' ? 'Find a file by name or path…' : tab === 'commits' ? 'Commit message or hash…' : 'Branch or tag name…'}
            className="h-8 min-w-[220px] flex-1 rounded-[5px] border border-line bg-bg px-3" />
          {tab === 'content' && <>
            <Toggle on={opts.case} onClick={() => setOpts((o) => ({ ...o, case: !o.case }))} label="Aa" title="Match case" />
            <Toggle on={opts.word} onClick={() => setOpts((o) => ({ ...o, word: !o.word }))} label="ab" title="Whole word" />
            <Toggle on={opts.regex} onClick={() => setOpts((o) => ({ ...o, regex: !o.regex }))} label=".*" title="Regular expression" /></>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-[5px] border border-line" role="tablist">
            {tabs.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('h-7 border-0 px-2.5', tab === t ? 'bg-accent-soft text-accent' : 'bg-panel2 text-mute')}>{l}</button>)}
          </div>
          {tab === 'content' && <>
            <label className="flex items-center gap-1.5 text-xs text-mute">Types <input aria-label="File types" value={types} onChange={(e) => setTypes(e.target.value)} placeholder="py, ts" className="h-7 w-24 rounded-[5px] border border-line bg-bg px-2 font-mono" /></label>
            <label className="flex items-center gap-1.5 text-xs text-mute">Exclude <input aria-label="Excluded folders" value={exclude} onChange={(e) => setExclude(e.target.value)} className="h-7 w-72 max-w-full rounded-[5px] border border-line bg-bg px-2 font-mono" /></label>
            <label className="flex items-center gap-1.5 text-xs text-mute">Context <select aria-label="Context lines" value={context} onChange={(e) => setContext(+e.target.value)} className="h-7 rounded-[5px] border border-line bg-bg px-1.5">{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} lines</option>)}</select></label></>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-panel">
        {state.error ? <ErrorBox message={state.error} /> : !dq.trim() ? <p className="p-5 text-mute">Type to search this repository. Searches are read-only and never leave your machine.</p> :
          state.loading && !c && !state.list ? <Loading what="Searching" /> : tab === 'content' && c ? (
            c.total === 0 ? <p className="p-5 text-mute">No matches for “{dq}”.</p> : <>
              <div className="border-b border-line px-4 py-1.5 text-xs text-mute">{c.total}{c.truncated ? '+' : ''} matches in {c.files.length} files{c.truncated && ' (showing the first 500; narrow the search)'}</div>
              {c.files.map((f) => {
                const shut = collapsed.has(f.path)
                return (
                  <div key={f.path}>
                    <button onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(f.path) ? n.delete(f.path) : n.add(f.path); return n })} className="flex w-full items-center gap-2 border-0 border-b border-line bg-panel2 px-4 py-1 text-left">
                      <span className="text-faint">{shut ? '▸' : '▾'}</span><span className="font-mono text-xs">{f.path}</span><span className="text-xs text-faint">{f.lines.filter((l) => l.match).length}</span></button>
                    {!shut && f.lines.map((l) => (
                      <div key={l.line} role="button" tabIndex={0} onClick={() => nav(`/files?path=${encodeURIComponent(f.path)}&line=${l.line}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/files?path=${encodeURIComponent(f.path)}&line=${l.line}`)}
                        className={cn('flex cursor-pointer gap-3 border-b border-line/50 px-4 py-0.5 font-mono text-xs hover:bg-panel2', !l.match && 'text-faint')}>
                        <span className="w-10 shrink-0 text-right text-faint">{l.line}</span><span className="whitespace-pre-wrap break-all">{hl(l.text, l.ranges)}</span></div>))}
                  </div>)
              })}</>
          ) : tab === 'files' ? ((state.list as string[] | undefined) ?? []).length === 0 ? <p className="p-5 text-mute">No files match “{dq}”.</p> :
            (state.list as string[]).map((p) => <div key={p} role="button" tabIndex={0} onClick={() => nav(`/files?path=${encodeURIComponent(p)}`)} className="cursor-pointer border-b border-line px-4 py-1.5 font-mono text-xs hover:bg-panel2">{p}</div>)
          : tab === 'commits' ? ((state.list as Commit[] | undefined) ?? []).length === 0 ? <p className="p-5 text-mute">No commits match “{dq}”.</p> :
            (state.list as Commit[]).map((m) => <div key={m.hash} role="button" tabIndex={0} onClick={() => nav(`/commits?c=${m.hash}`)} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-1.5 hover:bg-panel2">
              <Avatar name={m.author} /><span className="min-w-0 flex-1 truncate">{m.subject}</span><span className="font-mono text-xs text-accent">{m.short}</span><span className="text-xs text-faint">{timeAgo(m.date)}</span></div>)
          : tab === 'refs' && ((state.list as RefHit[] | undefined) ?? []).length === 0 ? <p className="p-5 text-mute">No branches or tags match “{dq}”.</p> :
            ((state.list as RefHit[] | undefined) ?? []).map((r) => <div key={r.kind + r.name} role="button" tabIndex={0} onClick={() => nav(r.kind === 'tag' ? '/tags' : `/commits?rev=${encodeURIComponent(r.name)}`)} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-1.5 hover:bg-panel2">
              <span className="rounded-full border border-line px-1.5 font-mono text-[11px] text-mute">{r.kind}</span><span className="flex-1 font-mono text-xs text-accent">{r.name}</span><span className="font-mono text-xs text-faint">{r.hash}</span></div>)}
      </div>
    </div>
  )
}
