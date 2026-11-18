import { lazy, Suspense, useState } from 'react'
import { explorer, ops } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { toast } from '../../store/toast'
import { useApp } from '../../store/app'
import { useSettings } from '../../store/settings'
import type { Stash, StashFile } from '../../types/explorer'
import { Btn, ErrorBox, Loading, StatusBadge } from '../../components/ui/bits'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { RequireRepo } from '../repository/RequireRepo'
import { timeAgo } from '../../utils/time'
import { cn } from '../../utils/cn'

const DiffViewer = lazy(() => import('../../components/diff-viewer/DiffViewer'))

export function Stashes() {
  return <RequireRepo>{(root) => <StashesBody root={root} />}</RequireRepo>
}

function StashesBody({ root }: { root: string }) {
  const { data, error, loading, reload } = useFetch(() => explorer.stashes(root), [root])
  const refreshRepo = useApp((s) => s.refreshRepo)
  const confirmFirst = useSettings((s) => s.s.confirm_destructive)
  const [sel, setSel] = useState(0)
  const [file, setFile] = useState<StashFile | null>(null)
  const [dlg, setDlg] = useState<'create' | Stash | null>(null)
  const [msg, setMsg] = useState('')
  const [untracked, setUntracked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const files = useFetch(() => (data && data[sel] ? explorer.stashFiles(root, data[sel].index) : Promise.resolve([] as StashFile[])), [root, data, sel])
  if (error) return <ErrorBox message={error} retry={reload} />
  if (!data) return loading ? <Loading what="Loading stashes" /> : null
  const cur = data[Math.min(sel, data.length - 1)]
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); toast.ok(label); setFile(null); setSel(0); reload(); void refreshRepo() }
    catch (e) { toast.error((e as Error).message); reload() } finally { setBusy(false) }
  }
  const create = async () => {
    setBusy(true)
    try { await ops.createStash(root, msg.trim() || null, untracked); toast.ok('Stashed your changes'); setDlg(null); setSel(0); reload(); void refreshRepo() }
    catch (e) { setFormError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="grid h-full grid-cols-[minmax(280px,360px)_minmax(0,1fr)] max-[800px]:grid-cols-1 max-[800px]:grid-rows-[45%_55%]">
      <section className="flex min-h-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2"><b>Stashes</b><span className="text-faint">{data.length}</span><span className="flex-1" />
          <Btn primary onClick={() => { setMsg(''); setUntracked(false); setFormError(''); setDlg('create') }}>+ Stash changes</Btn></div>
        <div className="min-h-0 flex-1 overflow-auto">
          {data.length === 0 ? <p className="p-5 text-mute">No stashes. Stash saves your uncommitted work aside so you can switch tasks, then bring it back later.</p> : data.map((s, i) => (
            <div key={s.hash} role="button" tabIndex={0} onClick={() => { setSel(i); setFile(null) }} onKeyDown={(e) => e.key === 'Enter' && setSel(i)} className={cn('cursor-pointer border-b border-line px-3 py-2 hover:bg-panel2', cur && cur.index === s.index && 'bg-accent-soft')}>
              <div className="truncate font-medium">{s.message}</div>
              <div className="mt-0.5 flex gap-2 text-xs text-faint"><span className="font-mono">{s.ref}</span>{s.branch && <span>on {s.branch}</span>}<span className="ml-auto">{timeAgo(s.date)}</span></div>
            </div>))}
        </div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-col bg-panel">
        {!cur ? <div className="grid h-full place-items-center p-6 text-center text-mute">Nothing stashed.</div> : <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">{cur.message}</span>
            <Btn disabled={busy} onClick={() => void act(`Applied ${cur.ref}. The stash was kept.`, () => ops.applyStash(root, cur.index))} title="Re-apply the changes and keep the stash">Apply</Btn>
            <Btn disabled={busy} onClick={() => void act(`Popped ${cur.ref}`, () => ops.popStash(root, cur.index))} title="Apply the changes, then delete the stash">Pop</Btn>
            <Btn disabled={busy} className="text-del" onClick={() => (confirmFirst ? setDlg(cur) : void act(`Dropped ${cur.ref}`, () => ops.dropStash(root, cur.index, true)))}>Drop…</Btn>
          </div>
          <div className="max-h-[38%] overflow-auto border-b border-line">
            {files.loading && !files.data ? <Loading /> : (files.data ?? []).length === 0 ? <p className="p-3 text-mute">No file changes recorded.</p> : (files.data ?? []).map((f) => (
              <div key={f.path} role="button" tabIndex={0} onClick={() => setFile(f)} className={cn('flex cursor-pointer items-center gap-2 border-b border-line px-3 py-1.5 hover:bg-panel2', file?.path === f.path && 'bg-accent-soft')}>
                <StatusBadge s={f.status} /><span className="font-mono text-xs">{f.path}</span>{f.untracked && <span className="text-xs text-faint">untracked</span>}</div>))}
          </div>
          <div className="min-h-0 flex-1">
            {file ? <Suspense fallback={<Loading what="Loading diff viewer" />}><DiffViewer root={root} path={file.path} oldPath={file.old_path} base={`${cur.ref}^1`} target={file.untracked ? `${cur.ref}^3` : cur.ref} status={file.status} /></Suspense>
              : <div className="grid h-full place-items-center p-6 text-center text-mute">Select a file to see what this stash changes.</div>}
          </div></>}
      </section>
      {dlg === 'create' && (
        <Dialog title="Stash changes" onClose={() => setDlg(null)} footer={<><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn primary disabled={busy} onClick={() => void create()}>Stash</Btn></>}>
          <label className="mb-1 block text-xs text-mute" htmlFor="sm">Message (optional)</label>
          <input id="sm" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="What is this work?" className="h-7 w-full rounded-[5px] border border-line bg-bg px-2.5" />
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={untracked} onChange={(e) => setUntracked(e.target.checked)} className="accent-[var(--accent)]" /> Include untracked files</label>
          <p className="mb-0 mt-3 text-xs text-mute">Tracked changes, staged and unstaged, are saved and removed from your working tree.</p>
          {formError && <div role="alert" className="mt-3 text-del">{formError}</div>}
        </Dialog>)}
      {dlg && dlg !== 'create' && (
        <ConfirmDialog title={`Drop ${dlg.ref}?`} confirmLabel="Drop stash" busy={busy} onClose={() => setDlg(null)}
          onConfirm={() => { const s = dlg; setDlg(null); void act(`Dropped ${s.ref}`, () => ops.dropStash(root, s.index, true)) }}
          body={<><p className="mt-0">This permanently deletes the stash “{dlg.message}”.</p><p className="mb-0">Its changes will be lost unless you apply it first. This cannot be undone from here.</p></>} />)}
    </div>
  )
}
