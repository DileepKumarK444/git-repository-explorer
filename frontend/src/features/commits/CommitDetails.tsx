import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { Avatar, Btn, ErrorBox, Loading, RefTag, StatusBadge } from '../../components/ui/bits'

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export function CommitDetails({ root, rev, onSelect }: { root: string; rev: string; onSelect: (h: string) => void }) {
  const { data: c, error, loading, reload } = useFetch(() => explorer.commit(root, rev), [root, rev])
  const [copied, setCopied] = useState('')
  const nav = useNavigate()
  if (error) return <ErrorBox message={error} retry={reload} />
  if (!c) return loading ? <Loading what="Loading commit" /> : null
  const copy = (what: string, text: string) => void navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1200) }).catch(() => undefined)
  const [title, ...rest] = c.message.split('\n')
  const body = rest.join('\n').trim()
  return (
    <div>
      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <span className="font-mono text-[13px] text-accent">{c.short}</span>{c.refs.map((r) => <RefTag key={r.name} r={r} />)}
        <span className="flex-1" />
        <Btn onClick={() => copy('hash', c.hash)}>{copied === 'hash' ? 'Copied' : 'Copy hash'}</Btn>
        <Btn onClick={() => copy('msg', c.message)}>{copied === 'msg' ? 'Copied' : 'Copy message'}</Btn>
        <Btn onClick={() => nav(`/files?ref=${c.hash}`)}>Browse files here</Btn>
        <Btn onClick={() => nav(`/compare?mode=commit&base=${c.parents[0] ?? EMPTY_TREE}&target=${c.hash}`)} title="Diff against the first parent">View diff</Btn>
        <Btn onClick={() => nav(`/compare?mode=commit&base=${c.hash}`)}>Compare with…</Btn>
      </div>
      <h2 className="m-0 px-3.5 pb-1 pt-3.5 text-[15px] font-semibold normal-case tracking-normal text-fg">{title}</h2>
      {body && <pre className="m-0 whitespace-pre-wrap px-3.5 pb-1 font-sans text-mute">{body}</pre>}
      <dl className="m-0 grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3.5 py-3 text-[12.5px]">
        <dt className="text-faint">Author</dt><dd className="m-0 flex items-center gap-1.5"><Avatar name={c.author} />{c.author} <span className="text-faint">&lt;{c.email}&gt;</span></dd>
        <dt className="text-faint">Date</dt><dd className="m-0">{new Date(c.date).toLocaleString()}</dd>
        <dt className="text-faint">Commit</dt><dd className="m-0 break-all font-mono text-xs">{c.hash}</dd>
        <dt className="text-faint">Parents</dt><dd className="m-0 font-mono text-xs">{c.parents.length ? c.parents.map((p) => <button key={p} onClick={() => onSelect(p)} className="mr-2 border-0 bg-transparent p-0 font-mono text-xs text-accent">{p.slice(0, 7)}</button>) : 'none (root commit)'}</dd>
        <dt className="text-faint">Changed</dt><dd className="m-0">{c.files.length} files <span className="text-add">+{c.insertions}</span> <span className="text-del">−{c.deletions}</span>{c.parents.length > 1 && <span className="text-faint"> (against first parent)</span>}</dd>
      </dl>
      <div className="border-y border-line px-3.5 py-2 text-xs font-semibold uppercase tracking-[.07em] text-mute">Files changed</div>
      {c.files.length === 0 ? <p className="p-3.5 text-mute">No file changes.</p> : c.files.map((f) => (
        <div key={f.path} onClick={() => nav(`/files?path=${encodeURIComponent(f.path)}&ref=${c.hash}`)} title="Open this file at this commit"
          className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3.5 py-1.5 hover:bg-panel2">
          <StatusBadge s={f.status} /><span className="min-w-0 flex-1 truncate font-mono text-xs">{f.old_path ? `${f.old_path} → ` : ''}{f.path}</span>
          <span className="font-mono text-xs text-faint">{f.insertions === null ? 'binary' : <><span className="text-add">+{f.insertions}</span> <span className="text-del">−{f.deletions}</span></>}</span>
        </div>))}
    </div>
  )
}
