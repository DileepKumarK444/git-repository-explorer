import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ops, explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { useApp } from '../../store/app'
import { toast } from '../../store/toast'
import { useSettings } from '../../store/settings'
import { copyText, useContextMenu } from '../../components/ui/ContextMenu'
import type { ChangeFile } from '../../types/explorer'
import { Btn, ErrorBox, Loading, StatusBadge } from '../../components/ui/bits'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { RequireRepo } from '../repository/RequireRepo'
import { cn } from '../../utils/cn'

const DiffViewer = lazy(() => import('../../components/diff-viewer/DiffViewer'))

export function Changes() {
  return <RequireRepo>{(root) => <ChangesBody root={root} />}</RequireRepo>
}

type Side = 'staged' | 'unstaged'
const labels: Record<string, string> = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'Untracked' }
const key = (side: Side, f: ChangeFile) => `${side}:${f.path}`
const pathsOf = (fs: ChangeFile[]) => [...new Set(fs.flatMap((f) => (f.old_path ? [f.old_path, f.path] : [f.path])))]

function ChangesBody({ root }: { root: string }) {
  const { data, error, loading, reload } = useFetch(() => explorer.changes(root), [root])
  const refreshRepo = useApp((s) => s.refreshRepo)
  const [sel, setSel] = useState<{ side: Side; path: string } | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<'path' | 'status' | 'size'>('path')
  const [msg, setMsg] = useState('')
  const [desc, setDesc] = useState('')
  const [msgError, setMsgError] = useState('')
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState<ChangeFile[] | null>(null)
  const msgRef = useRef<HTMLInputElement>(null)
  const confirmFirst = useSettings((s) => s.s.confirm_destructive)
  const ctx = useContextMenu()

  const view = useMemo(() => {
    const filt = (l: ChangeFile[]) => l.filter((f) => f.path.toLowerCase().includes(q.toLowerCase()) && (!status || f.status === status))
      .sort((a, b) => sort === 'status' ? a.status.localeCompare(b.status) || a.path.localeCompare(b.path)
        : sort === 'size' ? ((b.insertions ?? 0) + (b.deletions ?? 0)) - ((a.insertions ?? 0) + (a.deletions ?? 0)) : a.path.localeCompare(b.path))
    return { staged: filt(data?.staged ?? []), unstaged: filt(data?.unstaged ?? []) }
  }, [data, q, status, sort])
  const flat = useMemo(() => [...view.staged.map((f) => ({ side: 'staged' as Side, f })), ...view.unstaged.map((f) => ({ side: 'unstaged' as Side, f }))], [view])

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    try { await fn(); setChecked(new Set()); after?.(); reload(); void refreshRepo(); if (label) toast.ok(label) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const commit = () => {
    if (!msg.trim()) { setMsgError('Write a commit message first.'); msgRef.current?.focus(); return }
    if (!data?.staged.length) { setMsgError('Nothing is staged. Stage at least one file first.'); return }
    setMsgError('')
    void run('', async () => { const r = await ops.commit(root, msg, desc); toast.ok(`Committed ${r.short}`) }, () => { setMsg(''); setDesc(''); setSel(null) })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit() } }
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey)
  })

  if (error) return <ErrorBox message={error} retry={reload} />
  if (!data) return loading ? <Loading what="Reading changes" /> : null

  const total = data.staged.length + data.unstaged.length
  const idx = sel ? flat.findIndex((x) => x.side === sel.side && x.f.path === sel.path) : -1
  const cur = idx >= 0 ? flat[idx] : null
  const go = (d: number) => { const n = flat[idx + d]; if (n) setSel({ side: n.side, path: n.f.path }) }
  const pick = (side: Side) => flat.filter((x) => x.side === side && checked.has(key(side, x.f))).map((x) => x.f)
  const chk = { staged: pick('staged'), unstaged: pick('unstaged') }
  const toggle = (k: string) => setChecked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const stagedStats = data.staged.reduce((a, f) => [a[0] + (f.insertions ?? 0), a[1] + (f.deletions ?? 0)], [0, 0])

  const group = (title: string, side: Side, list: ChangeFile[], all: ChangeFile[]) => all.length === 0 ? null : (
    <div key={side}>
      <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-panel2 px-3 py-1.5">
        <input type="checkbox" aria-label={`Select all ${title.toLowerCase()}`} className="accent-[var(--accent)]" disabled={list.length === 0}
          checked={list.length > 0 && list.every((f) => checked.has(key(side, f)))}
          onChange={(e) => setChecked((s) => { const n = new Set(s); list.forEach((f) => e.target.checked ? n.add(key(side, f)) : n.delete(key(side, f))); return n })} />
        <b>{title}</b><span className="text-faint">{all.length}</span>
        <span className="flex-1" />
        {side === 'unstaged' ? <Btn disabled={busy} onClick={() => void run('Staged all changes', () => ops.stageAll(root))}>Stage all</Btn>
          : <Btn disabled={busy} onClick={() => void run('Unstaged all changes', () => ops.unstageAll(root))}>Unstage all</Btn>}
      </div>
      {list.map((f) => {
        const on = sel?.side === side && sel.path === f.path, name = f.path.split('/').pop(), dir = f.path.slice(0, f.path.length - (name?.length ?? 0))
        return (
          <div key={f.path} onContextMenu={(e) => ctx.open(e, [
            side === 'unstaged' ? { label: 'Stage', onClick: () => void run(`Staged ${name}`, () => ops.stage(root, pathsOf([f]))) } : { label: 'Unstage', onClick: () => void run(`Unstaged ${name}`, () => ops.unstage(root, pathsOf([f]))) },
            ...(side === 'unstaged' ? [{ label: 'Discard changes…', danger: true, onClick: () => askDiscard([f]) }] : []),
            { label: '', separator: true, onClick: () => undefined },
            { label: 'Copy path', onClick: () => copyText(f.path, () => toast.ok('Copied path')) },
          ])} className={cn('flex items-center gap-2 border-b border-line px-3 py-1.5 hover:bg-panel2', on && 'bg-accent-soft')}>
            <input type="checkbox" aria-label={`Select ${f.path}`} className="accent-[var(--accent)]" checked={checked.has(key(side, f))} onChange={() => toggle(key(side, f))} />
            <div role="button" tabIndex={0} onClick={() => setSel({ side, path: f.path })} onKeyDown={(e) => e.key === 'Enter' && setSel({ side, path: f.path })} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <StatusBadge s={f.status} />
              <span className="min-w-0 flex-1 truncate"><span className={cn(f.status === 'D' && 'line-through')}>{name}</span> <span className="font-mono text-xs text-faint">{f.old_path ? `← ${f.old_path}` : dir}</span></span>
              {f.conflict && <span className="rounded-full border border-del px-1.5 text-[11px] text-del">conflict</span>}
              <span className="font-mono text-xs">{f.insertions !== null && <><span className="text-add">+{f.insertions}</span> <span className="text-del">−{f.deletions}</span></>}</span>
            </div>
            {side === 'unstaged' ? <>
              <button disabled={busy} title="Stage" aria-label={`Stage ${f.path}`} onClick={() => void run(`Staged ${name}`, () => ops.stage(root, pathsOf([f])))} className="h-6 w-6 rounded border border-line bg-panel2 text-add">+</button>
              <button disabled={busy} title="Discard changes" aria-label={`Discard ${f.path}`} onClick={() => askDiscard([f])} className="h-6 w-6 rounded border border-line bg-panel2 text-del">↺</button>
            </> : <button disabled={busy} title="Unstage" aria-label={`Unstage ${f.path}`} onClick={() => void run(`Unstaged ${name}`, () => ops.unstage(root, pathsOf([f])))} className="h-6 w-6 rounded border border-line bg-panel2 text-mod">−</button>}
          </div>)
      })}
    </div>)
  const askDiscard = (fs: ChangeFile[]) => confirmFirst ? setDiscard(fs) : void run(`Discarded changes to ${fs.length} ${fs.length === 1 ? 'file' : 'files'}`, () => ops.discard(root, pathsOf(fs), true))
  const [base, target] = cur ? (cur.side === 'staged' ? ['HEAD', 'INDEX'] : ['INDEX', 'WORKTREE']) : ['', '']
  const nSel = chk.staged.length + chk.unstaged.length

  return (
    <div className="grid h-full grid-cols-[minmax(320px,400px)_minmax(0,1fr)] max-[800px]:grid-cols-1 max-[800px]:grid-rows-[60%_40%]">
      <section className="flex min-h-0 flex-col border-r border-line bg-panel">
        <div className="flex flex-wrap gap-1.5 border-b border-line p-2">
          <input aria-label="Filter by path" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by path…" className="h-7 min-w-0 flex-[1_1_120px] rounded-[5px] border border-line bg-bg px-2" />
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-7 rounded-[5px] border border-line bg-bg px-1.5">
            <option value="">All</option>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-7 rounded-[5px] border border-line bg-bg px-1.5">
            <option value="path">Sort: path</option><option value="status">Sort: status</option><option value="size">Sort: size</option></select>
          <Btn onClick={reload} title="Refresh">⟳</Btn>
        </div>
        {nSel > 0 && <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-accent-soft px-3 py-1.5">
          <span className="text-accent">{nSel} selected</span><span className="flex-1" />
          {chk.unstaged.length > 0 && <Btn disabled={busy} onClick={() => void run(`Staged ${chk.unstaged.length} files`, () => ops.stage(root, pathsOf(chk.unstaged)))}>Stage</Btn>}
          {chk.staged.length > 0 && <Btn disabled={busy} onClick={() => void run(`Unstaged ${chk.staged.length} files`, () => ops.unstage(root, pathsOf(chk.staged)))}>Unstage</Btn>}
          {chk.unstaged.length > 0 && <Btn disabled={busy} className="text-del" onClick={() => askDiscard(chk.unstaged)}>Discard…</Btn>}
        </div>}
        <div className="min-h-0 flex-1 overflow-auto">
          {total === 0 ? <p className="p-5 text-mute">Working tree clean. Nothing to commit.</p> : flat.length === 0 ? <p className="p-5 text-mute">No changes match the filter.</p> : <>
            {group('Staged', 'staged', view.staged, data.staged)}{group('Unstaged', 'unstaged', view.unstaged, data.unstaged)}</>}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line p-2.5">
          <input ref={msgRef} aria-label="Commit message" value={msg} onChange={(e) => { setMsg(e.target.value); setMsgError('') }} placeholder="Commit message (required)"
            className={cn('h-7 rounded-[5px] border bg-bg px-2', msgError ? 'border-del' : 'border-line')} />
          <textarea aria-label="Commit description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Description (optional)" className="resize-none rounded-[5px] border border-line bg-bg px-2 py-1.5" />
          {msgError && <div role="alert" className="text-xs text-del">{msgError}</div>}
          <button onClick={commit} disabled={busy} className="flex h-8 items-center justify-center gap-2 rounded-[5px] border border-accent bg-accent text-white">
            Commit {data.staged.length} staged {data.staged.length === 1 ? 'file' : 'files'} <span className="font-mono text-xs opacity-80">+{stagedStats[0]} −{stagedStats[1]}</span></button>
          <div className="text-[11.5px] text-faint">Only staged files are committed. Nothing is staged for you. Ctrl/Cmd+Enter commits.</div>
        </div>
      </section>
      <section className="min-h-0 min-w-0 bg-panel">
        {cur ? (
          <Suspense fallback={<Loading what="Loading diff viewer" />}>
            <DiffViewer root={root} path={cur.f.path} oldPath={cur.f.old_path} base={base} target={target} status={cur.f.status} stats={[cur.f.insertions, cur.f.deletions]}
              extra={<span className="flex items-center gap-1"><Btn onClick={() => go(-1)} disabled={idx <= 0} title="Previous file">↑</Btn><Btn onClick={() => go(1)} disabled={idx >= flat.length - 1} title="Next file">↓</Btn>
                <span className="text-xs text-faint">{idx + 1}/{flat.length}</span></span>} />
          </Suspense>) : <div className="grid h-full place-items-center p-6 text-center text-mute">{total ? 'Select a file to see its diff.' : 'No changes in the working tree.'}</div>}
      </section>
      {ctx.menu}
      {discard && (
        <ConfirmDialog title="Discard changes?" confirmLabel="Discard changes" busy={busy} onClose={() => setDiscard(null)}
          onConfirm={() => void run(`Discarded changes to ${discard.length} ${discard.length === 1 ? 'file' : 'files'}`, () => ops.discard(root, pathsOf(discard), true), () => setDiscard(null))}
          body={<><p className="mt-0">These unstaged edits will be permanently lost. This cannot be undone.</p>
            <ul className="m-0 max-h-40 overflow-auto pl-4 font-mono text-xs">{discard.map((f) => <li key={f.path}>{f.path}{f.status === 'U' && <span className="text-del"> (untracked: the file will be deleted)</span>}</li>)}</ul>
            <p className="mb-0 text-xs text-faint">Staged changes are kept.</p></>} />)}
    </div>
  )
}
