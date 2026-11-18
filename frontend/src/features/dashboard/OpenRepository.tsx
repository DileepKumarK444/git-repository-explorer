import { useState, type DragEvent } from 'react'
import { FolderOpen } from 'lucide-react'
import { api } from '../../services/api'

/** Browsers do not expose a dropped folder's real path, so drop works only when a path is available as text. */
export function OpenRepository({ onOpen }: { onOpen: (path: string) => Promise<string | null> }) {
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(p: string) {
    if (!p.trim()) { setError('Enter a folder path first.'); return }
    setBusy(true); setError(null)
    setError(await onOpen(p.trim()))
    setBusy(false)
  }
  async function pick() {
    setError(null)
    try {
      const { path: picked } = await api.pickFolder()
      if (picked) { setPath(picked); await submit(picked) }
    } catch (e) { setError((e as Error).message) }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list')
    const p = text.startsWith('file://') ? decodeURIComponent(text.slice(7)) : text
    if (p.startsWith('/')) { setPath(p.trim()); void submit(p.trim()) }
    else setError('Your browser did not share the folder path. Use Browse, or paste the path.')
  }
  return (
    <section onDragOver={(e) => e.preventDefault()} onDrop={onDrop} aria-label="Open repository"
      className="rounded-lg border-[1.5px] border-dashed border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <FolderOpen size={22} className="text-mute" />
        <div className="min-w-[200px] flex-1">
          <b>Open a repository</b>
          <div className="text-mute">Choose a folder or paste its path. Opening only reads; nothing is changed.</div>
        </div>
        <input aria-label="Repository path" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit(path)}
          placeholder="/Users/you/Developer/project"
          className="h-7 w-[280px] max-w-full rounded-[5px] border border-line bg-bg px-2.5" />
        <button onClick={pick} className="h-7 rounded-[5px] border border-line bg-panel2 px-2.5 hover:border-faint">Browse…</button>
        <button onClick={() => submit(path)} disabled={busy} className="h-7 rounded-[5px] border border-accent bg-accent px-2.5 text-white">{busy ? 'Checking…' : 'Open'}</button>
      </div>
      {error && <div role="alert" className="mt-2 text-del">{error}</div>}
    </section>
  )
}
