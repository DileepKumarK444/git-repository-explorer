import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Editor, { type OnMount } from '@monaco-editor/react'
import { ChevronsDownUp, ChevronsUpDown, Copy, Search, WrapText } from 'lucide-react'
import { explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { toast } from '../../store/toast'
import { Avatar, Btn, ErrorBox, Loading } from '../../components/ui/bits'
import { timeAgo } from '../../utils/time'
import { RequireRepo } from '../repository/RequireRepo'
import { FileTree } from './FileTree'
import { languageFor, monaco } from './monaco'
import { useSettings } from '../../store/settings'
import type { Blame } from '../../types/explorer'

export function Files() {
  return <RequireRepo>{(root) => <FilesBody root={root} />}</RequireRepo>
}

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)

function FilesBody({ root }: { root: string }) {
  const [sp, setSp] = useSearchParams()
  const path = sp.get('path'), ref = sp.get('ref') || undefined
  const nav = useNavigate()
  const [filter, setFilter] = useState('')
  const settings = useSettings((s) => s.s)
  const [hidden, setHidden] = useState(settings.show_hidden_files)
  const [expand, setExpand] = useState({ n: 0, all: false })
  const files = useFetch(() => explorer.files(root, ref), [root, ref])
  const select = (p: string) => setSp({ path: p, ...(ref ? { ref } : {}) })

  return (
    <div className="grid h-full grid-cols-[minmax(220px,300px)_minmax(0,1fr)_minmax(0,260px)] max-[1100px]:grid-cols-[minmax(200px,280px)_minmax(0,1fr)] max-[700px]:grid-cols-1 max-[700px]:grid-rows-[240px_1fr]">
      <section className="flex min-h-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-1.5 border-b border-line p-2">
          <input aria-label="Filter files" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…" className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-bg px-2" />
          <button title="Expand all" aria-label="Expand all" onClick={() => setExpand((s) => ({ n: s.n + 1, all: true }))} className="border-0 bg-transparent text-mute"><ChevronsUpDown size={15} /></button>
          <button title="Collapse all" aria-label="Collapse all" onClick={() => setExpand((s) => ({ n: s.n + 1, all: false }))} className="border-0 bg-transparent text-mute"><ChevronsDownUp size={15} /></button>
        </div>
        <label className="flex items-center gap-1.5 border-b border-line px-2.5 py-1 text-xs text-mute"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="accent-[var(--accent)]" /> Show hidden files</label>
        <div className="min-h-0 flex-1 overflow-auto">
          {files.error ? <ErrorBox message={files.error} retry={files.reload} /> : files.loading && !files.data ? <Loading what="Listing files" /> :
            <FileTree files={files.data ?? []} selected={path} onSelect={select} showHidden={hidden} filter={filter} expandSignal={expand} sort={settings.file_sort} onCopied={(t) => toast.ok(`Copied ${t}`)} onHistory={(p) => nav(`/commits?path=${encodeURIComponent(p)}`)} />}
        </div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-col">
        {ref && <div className="flex items-center gap-2 border-b border-line bg-mod-bg px-3 py-1.5 text-mod">Viewing files at <b className="font-mono">{ref.slice(0, 7)}</b>
          <Btn onClick={() => setSp(path ? { path } : {})}>Back to working tree</Btn></div>}
        {path ? <Viewer root={root} path={path} gitRef={ref} line={Number(sp.get('line')) || undefined} /> : <div className="grid flex-1 place-items-center text-mute">Select a file to view it. Files open read-only.</div>}
      </section>
      {path && <FileInfo root={root} path={path} gitRef={ref} onOpenCommit={(h) => nav(`/commits?c=${h}`)} onViewAt={(h) => setSp({ path, ref: h })} />}
    </div>
  )
}

function Viewer({ root, path, gitRef, line }: { root: string; path: string; gitRef?: string; line?: number }) {
  const file = useFetch(() => explorer.file(root, path, gitRef), [root, path, gitRef])
  const blame = useFetch(() => explorer.blame(root, path, gitRef).catch(() => null as Blame | null), [root, path, gitRef])
  const [wrap, setWrap] = useState(false)
  const [copied, setCopied] = useState(false)
  const editor = useRef<Parameters<OnMount>[0] | null>(null)
  const decos = useRef<string[]>([])
  const blameRef = useRef<Blame | null>(null)
  blameRef.current = blame.data
  const resolved = useSettings((s) => s.resolved)
  const crumbs = path.split('/')
  const ext = path.includes('.') ? path.split('.').pop() : '—'

  const annotate = (line: number) => {
    const ed = editor.current, b = blameRef.current
    if (!ed || !b) return
    const c = b.commits[b.lines[line - 1]]
    if (!c) { decos.current = ed.deltaDecorations(decos.current, []); return }
    const text = c.uncommitted ? 'You, not committed yet' : `${c.author}, ${c.time ? timeAgo(new Date(c.time * 1000).toISOString()) : ''} · ${c.summary ?? ''}`
    decos.current = ed.deltaDecorations(decos.current, [{
      range: new monaco.Range(line, ed.getModel()?.getLineMaxColumn(line) ?? 1, line, ed.getModel()?.getLineMaxColumn(line) ?? 1),
      options: { showIfCollapsed: true, after: { content: `    ${text}`, inlineClassName: 'grx-blame' },
        hoverMessage: c.uncommitted ? undefined : { value: `**${c.author}** · \`${c.hash.slice(0, 7)}\`\n\n${c.summary ?? ''}` } },
    }])
  }
  useEffect(() => { annotate(editor.current?.getPosition()?.lineNumber ?? 1) }, [blame.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const f = file.data
  const copy = () => f && void navigator.clipboard?.writeText(f.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }).catch(() => undefined)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        <nav aria-label="Path" className="flex min-w-0 flex-1 items-center gap-1 truncate font-mono text-xs text-mute">
          {crumbs.map((c, i) => <span key={i} className={i === crumbs.length - 1 ? 'text-fg' : ''}>{c}{i < crumbs.length - 1 && ' / '}</span>)}</nav>
        {f && <span className="text-xs text-faint">{fmtSize(f.size)} · .{ext}</span>}
        <Btn onClick={() => editor.current?.getAction('actions.find')?.run()} title="Search in file"><Search size={13} />Find</Btn>
        <Btn onClick={() => setWrap((w) => !w)} className={wrap ? 'border-accent text-accent' : ''}><WrapText size={13} />Wrap</Btn>
        <Btn onClick={copy} disabled={!f || f.binary}><Copy size={13} />{copied ? 'Copied' : 'Copy'}</Btn>
      </div>
      <div className="min-h-0 flex-1 bg-panel">
        {file.error ? <ErrorBox message={file.error} retry={file.reload} /> : !f ? <Loading what="Opening file" /> :
          f.binary ? <p className="p-5 text-mute">This is a binary file ({fmtSize(f.size)}). It is not shown as text.</p> :
          f.too_large ? <p className="p-5 text-mute">This file is {fmtSize(f.size)}, which is over the 2 MB viewing limit.</p> : (
          <Editor key={`${path}@${gitRef ?? 'wt'}`} value={f.content} language={languageFor(path)} theme={resolved === 'light' ? 'vs' : 'vs-dark'}
            options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: wrap ? 'on' : 'off', fontSize: 12.5,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", renderLineHighlight: 'line', domReadOnly: true }}
            onMount={(ed) => { editor.current = ed; ed.onDidChangeCursorPosition((e) => annotate(e.position.lineNumber)); if (line) { ed.revealLineInCenter(line); ed.setPosition({ lineNumber: line, column: 1 }) }; annotate(line ?? 1) }} />)}
      </div>
    </>
  )
}

function FileInfo({ root, path, gitRef, onOpenCommit, onViewAt }: { root: string; path: string; gitRef?: string; onOpenCommit: (h: string) => void; onViewAt: (h: string) => void }) {
  const hist = useFetch(() => explorer.commits(root, { path, limit: 15, rev: gitRef }), [root, path, gitRef])
  const list = useMemo(() => hist.data?.commits ?? [], [hist.data])
  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-panel max-[1100px]:hidden">
      <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[.07em] text-mute">File history</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {hist.error ? <ErrorBox message={hist.error} /> : hist.loading ? <Loading /> : list.length === 0 ? <p className="p-3 text-mute">No commits touch this file yet.</p> :
          list.map((c) => (
            <div key={c.hash} className="border-b border-line px-3 py-2">
              <button onClick={() => onOpenCommit(c.hash)} className="block w-full truncate border-0 bg-transparent p-0 text-left text-fg hover:text-accent">{c.subject}</button>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-faint"><Avatar name={c.author} /><span className="truncate">{c.author}</span><span className="ml-auto whitespace-nowrap">{timeAgo(c.date)}</span></div>
              <div className="mt-1 flex items-center gap-2"><span className="font-mono text-xs text-accent">{c.short}</span>
                <button onClick={() => onViewAt(c.hash)} className="border-0 bg-transparent p-0 text-xs text-mute underline">View file here</button></div>
            </div>))}
      </div>
    </aside>
  )
}
