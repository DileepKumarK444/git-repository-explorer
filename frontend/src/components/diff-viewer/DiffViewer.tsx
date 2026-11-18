import { useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { Columns2, Rows2, WrapText } from 'lucide-react'
import '../../features/files/monaco'
import { languageFor } from '../../features/files/monaco'
import { explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { useSettings } from '../../store/settings'
import { Btn, ErrorBox, Loading, StatusBadge } from '../ui/bits'
import { cn } from '../../utils/cn'

interface Props { root: string; path: string; oldPath?: string | null; base: string; target: string; status?: string; stats?: [number | null, number | null]; extra?: React.ReactNode }

/** Read-only side-by-side or unified diff of one file between two sources (revision, INDEX or WORKTREE). */
export default function DiffViewer({ root, path, oldPath, base, target, status, stats, extra }: Props) {
  const { data, error, loading, reload } = useFetch(() => explorer.diff(root, path, base, target, oldPath), [root, path, oldPath, base, target])
  const { s, resolved, update } = useSettings()
  const sideBySide = s.default_diff === 'split'
  const setSideBySide = (v: boolean) => void update({ default_diff: v ? 'split' : 'unified' })
  const [wrap, setWrap] = useState(s.diff_wrap)
  const [collapse, setCollapse] = useState(true)
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        {status && <StatusBadge s={status} />}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{oldPath ? `${oldPath} → ` : ''}{path}</span>
        {stats && stats[0] !== null && <span className="font-mono text-xs"><span className="text-add">+{stats[0]}</span> <span className="text-del">−{stats[1]}</span></span>}
        {extra}
        <Btn onClick={() => setCollapse((c) => !c)} className={cn(collapse && 'border-accent text-accent')} title="Hide unchanged regions">Changes only</Btn>
        <Btn onClick={() => setWrap((w) => !w)} className={cn(wrap && 'border-accent text-accent')}><WrapText size={13} />Wrap</Btn>
        <div className="inline-flex overflow-hidden rounded-[5px] border border-line" role="group" aria-label="Diff layout">
          <button aria-pressed={sideBySide} onClick={() => setSideBySide(true)} className={cn('flex h-7 items-center gap-1 border-0 px-2', sideBySide ? 'bg-accent-soft text-accent' : 'bg-panel2 text-mute')}><Columns2 size={13} />Split</button>
          <button aria-pressed={!sideBySide} onClick={() => setSideBySide(false)} className={cn('flex h-7 items-center gap-1 border-0 px-2', !sideBySide ? 'bg-accent-soft text-accent' : 'bg-panel2 text-mute')}><Rows2 size={13} />Unified</button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {error ? <ErrorBox message={error} retry={reload} /> : !data ? (loading ? <Loading what="Loading diff" /> : null) :
          data.binary ? <p className="p-5 text-mute">Binary file. A text diff is not available.</p> :
          data.too_large ? <p className="p-5 text-mute">This file is over the 2 MB diff limit.</p> :
          data.original === data.modified ? <p className="p-5 text-mute">No content changes in this file (mode or whitespace-only metadata change).</p> : (
          <DiffEditor key={`${base}|${target}|${path}`} original={data.original} modified={data.modified} language={languageFor(path)}
            theme={resolved === 'light' ? 'vs' : 'vs-dark'}
            options={{ readOnly: true, originalEditable: false, renderSideBySide: sideBySide, wordWrap: wrap ? 'on' : 'off',
              minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12.5, automaticLayout: true,
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
              hideUnchangedRegions: { enabled: collapse, contextLineCount: s.diff_context, minimumLineCount: 4 } }} />)}
      </div>
    </div>
  )
}
