import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import type { FileEntry } from '../../types/explorer'
import { cn } from '../../utils/cn'
import { copyText, useContextMenu } from '../../components/ui/ContextMenu'

interface Node { name: string; path: string; dir: boolean; status: string; children: Node[] }

export function buildTree(files: FileEntry[], foldersFirst = true): Node[] {
  const root: Node = { name: '', path: '', dir: true, status: '', children: [] }
  for (const f of files) {
    let cur = root
    const parts = f.path.split('/')
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      const last = i === parts.length - 1
      let n = cur.children.find((c) => c.name === part && c.dir === !last)
      if (!n) { n = { name: part, path, dir: !last, status: last ? f.status : '', children: [] }; cur.children.push(n) }
      cur = n
    })
  }
  const sort = (n: Node) => { n.children.sort((a, b) => (foldersFirst ? Number(b.dir) - Number(a.dir) : 0) || a.name.localeCompare(b.name)); n.children.forEach(sort) }
  sort(root)
  return root.children
}

const tone: Record<string, string> = { M: 'text-mod', A: 'text-add', U: 'text-add', D: 'text-del', R: 'text-accent' }

interface Props { files: FileEntry[]; selected: string | null; onSelect: (p: string) => void; showHidden: boolean; filter: string; expandSignal: { n: number; all: boolean }; sort?: 'folders_first' | 'name'; onCopied?: (t: string) => void; onHistory?: (p: string) => void }

const MAX_ROWS = 2000

export function FileTree({ files, selected, onSelect, showHidden, filter, expandSignal, sort = 'folders_first', onCopied, onHistory }: Props) {
  const ctx = useContextMenu()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [seen, setSeen] = useState(0)
  const [seenSel, setSeenSel] = useState<string | null>(null)
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return files.filter((e) => (showHidden || !e.path.split('/').some((p) => p.startsWith('.'))) && (!f || e.path.toLowerCase().includes(f)))
  }, [files, showHidden, filter])
  const tree = useMemo(() => buildTree(visible, sort === 'folders_first'), [visible, sort])
  const allDirs = useMemo(() => new Set(visible.flatMap((e) => e.path.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/')))), [visible])
  if (seen !== expandSignal.n) { setSeen(expandSignal.n); setOpen(expandSignal.all ? new Set(allDirs) : new Set()) }
  if (selected !== seenSel) {  // reveal the selected file: open its parent folders
    setSeenSel(selected)
    if (selected) setOpen((s) => { const n = new Set(s); selected.split('/').slice(0, -1).forEach((_, i, a) => n.add(a.slice(0, i + 1).join('/'))); return n })
  }
  const forceOpen = filter.trim().length > 0
  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })

  const rows: React.ReactNode[] = []
  const walk = (nodes: Node[], depth: number) => nodes.forEach((n) => {
    const isOpen = forceOpen || open.has(n.path)
    rows.push(
      <div key={n.path} role="treeitem" aria-expanded={n.dir ? isOpen : undefined} aria-selected={selected === n.path}
        onClick={() => (n.dir ? toggle(n.path) : onSelect(n.path))} style={{ paddingLeft: 8 + depth * 14 }}
        onContextMenu={(e) => ctx.open(e, [
          ...(n.dir ? [{ label: isOpen ? 'Collapse' : 'Expand', onClick: () => toggle(n.path) }] : [{ label: 'Open', onClick: () => onSelect(n.path) }]),
          ...(onHistory ? [{ label: n.dir ? 'View folder history' : 'View file history', onClick: () => onHistory(n.path) }] : []),
          { label: '', separator: true, onClick: () => undefined },
          { label: 'Copy path', onClick: () => copyText(n.path, () => onCopied?.('path')) },
          { label: 'Copy name', onClick: () => copyText(n.name, () => onCopied?.('name')) },
        ])}
        className={cn('flex h-[22px] cursor-pointer items-center gap-1.5 whitespace-nowrap pr-2.5 hover:bg-panel2', selected === n.path && 'bg-accent-soft')}>
        {n.dir ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
        {n.dir ? <Folder size={13} className="text-mute" /> : <File size={13} className="text-faint" />}
        <span className={cn('truncate', n.status === 'D' && 'line-through', n.status && tone[n.status])}>{n.name}</span>
        {n.status && <span className={cn('ml-auto font-mono text-[10px] font-semibold', tone[n.status])}>{n.status}</span>}
      </div>)
    if (n.dir && isOpen) walk(n.children, depth + 1)
  })
  walk(tree, 0)
  if (rows.length === 0) return <p className="p-3 text-mute">{filter ? `No files match “${filter}”.` : 'No files.'}</p>
  return <div role="tree" className="py-1">{rows.slice(0, MAX_ROWS)}{rows.length > MAX_ROWS && <p className="px-3 py-2 text-xs text-faint">Showing the first {MAX_ROWS} of {rows.length} rows. Type in the filter to narrow the list.</p>}{ctx.menu}</div>
}
