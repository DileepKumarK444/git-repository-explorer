import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { explorer, ops } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { toast } from '../../store/toast'
import { useSettings } from '../../store/settings'
import type { Tag } from '../../types/explorer'
import { Btn, ErrorBox, Loading } from '../../components/ui/bits'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { RequireRepo } from '../repository/RequireRepo'
import { timeAgo } from '../../utils/time'
import { cn } from '../../utils/cn'

export function Tags() {
  return <RequireRepo>{(root) => <TagsBody root={root} />}</RequireRepo>
}

function TagsBody({ root }: { root: string }) {
  const { data, error, loading, reload } = useFetch(() => explorer.tags(root), [root])
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const confirmFirst = useSettings((s) => s.s.confirm_destructive)
  const [dlg, setDlg] = useState<'create' | Tag | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('HEAD')
  const [message, setMessage] = useState('')
  const wantsNew = sp.get('new')
  useEffect(() => { if (wantsNew) { setFormError(''); setName(''); setTarget(wantsNew === '1' ? 'HEAD' : wantsNew); setMessage(''); setDlg('create'); setSp({}, { replace: true }) } }, [wantsNew]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} retry={reload} />
  if (!data) return loading ? <Loading what="Loading tags" /> : null
  const field = 'h-7 w-full rounded-[5px] border border-line bg-bg px-2.5 font-mono text-xs'
  const copy = (n: string) => void navigator.clipboard?.writeText(n).then(() => toast.ok(`Copied ${n}`)).catch(() => undefined)
  const create = async () => {
    setBusy(true)
    try { await ops.createTag(root, name.trim(), target.trim() || null, message.trim() || null); toast.ok(`Created tag ${name.trim()}`); setDlg(null); reload() }
    catch (e) { setFormError((e as Error).message) } finally { setBusy(false) }
  }
  const remove = async (t: Tag) => {
    setBusy(true)
    try { await ops.deleteTag(root, t.name, true); toast.ok(`Deleted tag ${t.name}`); setDlg(null); setPicked((p) => p.filter((x) => x !== t.name)); reload() }
    catch (e) { toast.error((e as Error).message); setDlg(null) } finally { setBusy(false) }
  }
  const toggle = (n: string) => setPicked((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p.slice(-1), n])
  return (
    <div className="mx-auto max-w-[1180px] px-[22px] py-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex-1"><h1 className="mb-1 text-[19px] font-semibold tracking-tight">Tags</h1><div className="text-mute">{data.length} {data.length === 1 ? 'tag' : 'tags'}. Tags are local until you push them with Git.</div></div>
        <Btn disabled={picked.length !== 2} title="Select two tags to compare" onClick={() => nav(`/compare?mode=commit&base=${encodeURIComponent(picked[0])}&target=${encodeURIComponent(picked[1])}`)}>Compare selected</Btn>
        <Btn primary onClick={() => { setFormError(''); setName(''); setTarget('HEAD'); setMessage(''); setDlg('create') }}>+ New tag</Btn>
      </div>
      {data.length === 0 ? <p className="mt-6 text-mute">No tags yet. Create one to mark a release or a known-good commit.</p> : (
        <div className="mt-3.5 overflow-auto rounded-lg border border-line bg-panel">
          <table className="w-full border-collapse">
            <thead><tr>{['', 'Name', 'Type', 'Commit', 'Date', 'Message', ''].map((h, i) => <th key={i} className="whitespace-nowrap border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{h}</th>)}</tr></thead>
            <tbody>{data.map((t) => (
              <tr key={t.name} className="hover:bg-panel2">
                <td className="border-b border-line px-3 py-2"><input type="checkbox" aria-label={`Select ${t.name}`} checked={picked.includes(t.name)} onChange={() => toggle(t.name)} className="accent-[var(--accent)]" /></td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 font-mono text-mod">⚑ {t.name}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2"><span className={cn('rounded-full border px-1.5 font-mono text-[11px]', t.annotated ? 'border-mod/40 text-mod' : 'border-line text-mute')}>{t.annotated ? 'annotated' : 'lightweight'}</span></td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2"><button onClick={() => nav(`/commits?c=${t.commit}`)} className="border-0 bg-transparent p-0 font-mono text-accent">{t.short}</button></td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 text-faint">{timeAgo(t.date)}</td>
                <td className="max-w-[320px] truncate border-b border-line px-3 py-2 text-mute">{t.message ?? '—'}{t.tagger && <span className="text-faint"> · {t.tagger}</span>}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2"><span className="flex gap-1"><Btn onClick={() => nav(`/commits?c=${t.commit}`)}>View commit</Btn><Btn onClick={() => copy(t.name)}>Copy</Btn><Btn className="text-del" onClick={() => (confirmFirst ? setDlg(t) : void remove(t))}>Delete</Btn></span></td>
              </tr>))}</tbody>
          </table>
        </div>)}
      {dlg === 'create' && (
        <Dialog title="Create tag" onClose={() => setDlg(null)} footer={<><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn primary disabled={busy} onClick={() => void create()}>Create</Btn></>}>
          <label className="mb-1 block text-xs text-mute" htmlFor="tn">Tag name</label><input id="tn" value={name} onChange={(e) => { setName(e.target.value); setFormError('') }} placeholder="v1.2.0" className={field} />
          <label className="mb-1 mt-3 block text-xs text-mute" htmlFor="tt">Tag this commit, branch or tag</label><input id="tt" value={target} onChange={(e) => setTarget(e.target.value)} className={field} />
          <label className="mb-1 mt-3 block text-xs text-mute" htmlFor="tm">Message (optional, makes it an annotated tag)</label><input id="tm" value={message} onChange={(e) => setMessage(e.target.value)} className={cn(field, 'font-sans')} />
          {formError && <div role="alert" className="mt-3 text-del">{formError}</div>}
        </Dialog>)}
      {dlg && dlg !== 'create' && (
        <ConfirmDialog title={`Delete tag ${dlg.name}?`} confirmLabel="Delete tag" busy={busy} onClose={() => setDlg(null)} onConfirm={() => void remove(dlg)}
          body={<><p className="mt-0">This removes the tag <b className="font-mono text-fg">{dlg.name}</b> (on <span className="font-mono">{dlg.short}</span>) from this repository. The commit is not deleted.</p><p className="mb-0">If the tag was pushed, the remote keeps its copy until you delete it there.</p></>} />)}
    </div>
  )
}
