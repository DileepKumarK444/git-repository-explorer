import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { explorer, ops } from '../../services/api'
import { useApp } from '../../store/app'
import { useSettings } from '../../store/settings'
import { toast } from '../../store/toast'
import { MOD } from '../../utils/shortcuts'
import { cn } from '../../utils/cn'

interface Cmd { id: string; label: string; hint?: string; group: string; run: () => void }

const score = (label: string, q: string) => {
  if (!q) return 1
  const l = label.toLowerCase(), s = q.toLowerCase()
  if (l.includes(s)) return 100 - l.indexOf(s)
  let i = 0
  for (const c of l) if (c === s[i]) i++
  return i === s.length ? 1 : 0
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { repo, refresh, refreshRepo, toggleSidebar } = useApp()
  const { resolved, update } = useSettings()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [branches, setBranches] = useState<string[]>([])
  const [files, setFiles] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const root = repo?.root

  useEffect(() => {
    if (!open) return
    setQ(''); setIdx(0); setFiles([])
    setTimeout(() => input.current?.focus(), 0)
    if (root) explorer.branches(root).then((b) => setBranches(b.filter((x) => !x.remote && !x.current).map((x) => x.name))).catch(() => setBranches([]))
  }, [open, root])
  useEffect(() => {
    if (!open || !root || q.trim().length < 2) { setFiles([]); return }
    const t = setTimeout(() => explorer.searchFiles(root, q.trim()).then((f) => setFiles(f.slice(0, 6))).catch(() => setFiles([])), 150)
    return () => clearTimeout(t)
  }, [q, root, open])

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => nav(to)
    const list: Cmd[] = [
      { id: 'open', group: 'Repository', label: 'Open repository', hint: `${MOD} O`, run: go('/') },
      { id: 'settings', group: 'App', label: 'Open settings', run: go('/settings') },
      { id: 'shortcuts', group: 'App', label: 'Keyboard shortcuts', run: go('/shortcuts') },
      { id: 'theme', group: 'App', label: `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`, run: () => void update({ theme: resolved === 'dark' ? 'light' : 'dark' }) },
      { id: 'sidebar', group: 'App', label: 'Toggle sidebar', hint: `${MOD} B`, run: toggleSidebar },
    ]
    if (root) list.push(
      ...([['overview', 'Overview'], ['files', 'Files'], ['commits', 'View commits'], ['branches', 'View branches'], ['changes', 'View changes'], ['compare', 'Compare branches'], ['tags', 'View tags'], ['stashes', 'View stashes'], ['insights', 'View insights']] as const)
        .map(([p, l]) => ({ id: p, group: 'Go to', label: l, run: go(`/${p}`) })),
      { id: 'newbranch', group: 'Branches', label: 'Create branch', run: go('/branches?new=1') },
      { id: 'search', group: 'Search', label: 'Search file contents', hint: `${MOD} ⇧ F`, run: go('/search') },
      { id: 'searchfiles', group: 'Search', label: 'Search files', run: go('/search?tab=files') },
      { id: 'searchcommits', group: 'Search', label: 'Search commits', run: go('/search?tab=commits') },
      { id: 'refresh', group: 'Repository', label: 'Refresh repository', hint: `${MOD} R`, run: () => { refresh(); void refreshRepo(); toast.ok('Refreshed') } },
      ...branches.map((b) => ({ id: `sw:${b}`, group: 'Switch branch', label: `Switch to ${b}`, run: () => {
        ops.checkout(root, b).then(() => { toast.ok(`Switched to ${b}`); refresh(); void refreshRepo() }).catch((e: Error) => toast.error(e.message)) } })),
      ...files.map((f) => ({ id: `f:${f}`, group: 'Files', label: f, run: go(`/files?path=${encodeURIComponent(f)}`) })))
    return list
  }, [root, branches, files, nav, refresh, refreshRepo, toggleSidebar, update, resolved])

  const shown = useMemo(() => cmds.map((c) => ({ c, s: c.group === 'Files' ? 50 : score(c.label, q.trim()) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.c), [cmds, q])
  useEffect(() => setIdx(0), [q])
  if (!open) return null
  const run = (c?: Cmd) => { if (!c) return; onClose(); c.run() }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Command palette" className="w-[min(560px,92vw)] overflow-hidden rounded-[10px] border border-line bg-panel shadow-2xl">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Command"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, shown.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter') run(shown[idx])
            else if (e.key === 'Escape') onClose()
          }}
          placeholder={root ? 'Type a command, branch or file name…' : 'Type a command…'} className="h-11 w-full border-0 border-b border-line bg-transparent px-4 text-sm" />
        <div role="listbox" className="max-h-[50vh] overflow-auto py-1">
          {shown.length === 0 ? <div className="px-4 py-3 text-mute">No matching command.</div> : shown.map((c, i) => (
            <div key={c.id} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}
              className={cn('flex cursor-pointer items-center gap-3 px-4 py-2', i === idx && 'bg-accent-soft')}>
              <span className="w-28 shrink-0 text-[11px] uppercase tracking-[.06em] text-faint">{c.group}</span>
              <span className={cn('min-w-0 flex-1 truncate', c.group === 'Files' && 'font-mono text-xs')}>{c.label}</span>
              {c.hint && <span className="rounded border border-line px-1.5 font-mono text-[11px] text-mute">{c.hint}</span>}
            </div>))}
        </div>
      </div>
    </div>)
}
