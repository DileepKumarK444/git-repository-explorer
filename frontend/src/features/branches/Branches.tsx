import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { explorer, ops } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { useApp } from '../../store/app'
import { toast } from '../../store/toast'
import { useSettings } from '../../store/settings'
import { copyText, useContextMenu } from '../../components/ui/ContextMenu'
import type { Branch } from '../../types/explorer'
import { Avatar, Btn, ErrorBox, Loading } from '../../components/ui/bits'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { timeAgo } from '../../utils/time'
import { RequireRepo } from '../repository/RequireRepo'
import { cn } from '../../utils/cn'

export function Branches() {
  return <RequireRepo>{(root) => <BranchesBody root={root} />}</RequireRepo>
}

type Dlg = { kind: 'create' } | { kind: 'rename'; b: Branch } | { kind: 'delete'; b: Branch; needsForce: boolean; message?: string } | null

function BranchesBody({ root }: { root: string }) {
  const { data, error, loading, reload } = useFetch(() => explorer.branches(root), [root])
  const refreshRepo = useApp((s) => s.refreshRepo)
  const [filter, setFilter] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Dlg>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [co, setCo] = useState(true)
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const confirmFirst = useSettings((s) => s.s.confirm_destructive)
  const ctx = useContextMenu()
  const rows = useMemo(() => (data ?? []).filter((b) => b.name.toLowerCase().includes(filter.toLowerCase())), [data, filter])
  const wantsNew = sp.get('new') === '1'
  useEffect(() => { if (wantsNew && data) { open({ kind: 'create' }); setSp({}, { replace: true }) } }, [wantsNew, data]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} retry={reload} />
  if (!data) return loading ? <Loading what="Loading branches" /> : null
  const local = data.filter((b) => !b.remote).length
  const current = data.find((b) => b.current)
  const copy = (n: string) => { void navigator.clipboard?.writeText(n).then(() => { setCopied(n); setTimeout(() => setCopied(null), 1200) }).catch(() => undefined) }
  const open = (d: Dlg, n = '', s = '') => { setFormError(''); setName(n); setStart(s || current?.name || ''); setCo(true); setDlg(d) }
  const close = () => setDlg(null)

  const done = (msg: string) => { toast.ok(msg); close(); reload(); void refreshRepo() }
  const attempt = async (fn: () => Promise<unknown>, msg: string, inline = false) => {
    setBusy(true)
    try { await fn(); done(msg) } catch (e) { inline ? setFormError((e as Error).message) : toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const checkout = (b: Branch) => void attempt(async () => { const r = await ops.checkout(root, b.name); if (r.created) toast.ok(`Created local branch ${r.branch} tracking ${b.name}`) }, `Switched to ${b.remote ? b.name.split('/').slice(1).join('/') : b.name}`)
  const del = async (b: Branch, force: boolean) => {
    setBusy(true)
    try { await ops.deleteBranch(root, b.name, force); done(`Deleted branch ${b.name}`) }
    catch (e) {
      const err = e as Error & { status?: number }
      if (err.status === 409 && !force) setDlg({ kind: 'delete', b, needsForce: true, message: err.message }); else { toast.error(err.message); close() }
    } finally { setBusy(false) }
  }
  const askDelete = (b: Branch) => confirmFirst ? setDlg({ kind: 'delete', b, needsForce: false }) : void del(b, false)
  const field = 'h-7 w-full rounded-[5px] border border-line bg-bg px-2.5 font-mono text-xs'

  return (
    <div className="mx-auto max-w-[1180px] px-[22px] py-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex-1"><h1 className="mb-1 text-[19px] font-semibold tracking-tight">Branches</h1>
          <div className="text-mute">{local} local, {data.length - local} remote. Currently on <b className="font-mono text-accent">{current?.name ?? 'detached HEAD'}</b>.</div></div>
        <input aria-label="Filter branches" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter branches…" className="h-7 w-52 rounded-[5px] border border-line bg-bg px-2.5" />
        <Btn primary onClick={() => open({ kind: 'create' })}>+ New branch</Btn>
      </div>
      <div className="mt-3.5 overflow-auto rounded-lg border border-line bg-panel">
        <table className="w-full border-collapse">
          <thead><tr>{['', 'Name', 'Last commit', 'Author', 'Date', 'Upstream', 'Ahead / behind', ''].map((h, i) =>
            <th key={i} className="whitespace-nowrap border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-faint">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={(b.remote ? 'r:' : 'l:') + b.name} className="hover:bg-panel2" onContextMenu={(e) => ctx.open(e, [
                ...(b.current ? [] : [{ label: b.remote ? 'Checkout as local' : 'Checkout', onClick: () => checkout(b) }]),
                { label: 'Compare with current', onClick: () => nav(`/compare?mode=branch&target=${encodeURIComponent(b.name)}`) },
                { label: 'View history', onClick: () => nav(`/commits?rev=${encodeURIComponent(b.name)}`) },
                { label: 'Copy branch name', onClick: () => copyText(b.name, () => toast.ok('Copied branch name')) },
                ...(b.remote ? [] : [{ label: '', separator: true, onClick: () => undefined }, { label: 'Rename…', onClick: () => open({ kind: 'rename', b }, b.name) }, { label: 'Delete…', danger: true, disabled: b.current, onClick: () => askDelete(b) }]),
              ])}>
                <td className="whitespace-nowrap border-b border-line px-3 py-2">
                  <span className={cn('rounded-full border px-1.5 font-mono text-[11px]', b.current ? 'border-accent bg-accent text-white' : b.remote ? 'border-mod/40 text-mod' : 'border-line text-mute')}>{b.current ? 'HEAD' : b.remote ? 'remote' : 'local'}</span></td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 font-mono text-accent">{b.name}</td>
                <td className="max-w-[260px] truncate border-b border-line px-3 py-2"><button onClick={() => nav(`/commits?c=${b.full_hash}`)} className="border-0 bg-transparent p-0 font-mono text-accent">{b.hash}</button> {b.subject}</td>
                <td className="border-b border-line px-3 py-2"><span className="flex items-center gap-1.5 whitespace-nowrap"><Avatar name={b.author} />{b.author}</span></td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 text-faint">{timeAgo(b.date)}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 font-mono text-faint">{b.upstream_gone ? 'gone' : b.upstream ?? '—'}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 font-mono">{b.upstream ? <><span className="text-add">↑{b.ahead}</span> <span className="text-del">↓{b.behind}</span></> : ''}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2">
                  <span className="flex gap-1">
                    {!b.current && <Btn disabled={busy} onClick={() => checkout(b)} title={b.remote ? 'Create a local tracking branch and switch to it' : 'Switch to this branch'}>{b.remote ? 'Checkout as local' : 'Checkout'}</Btn>}
                    <Btn onClick={() => nav(`/compare?mode=branch&target=${encodeURIComponent(b.name)}`)}>Compare</Btn>
                    <Btn onClick={() => nav(`/commits?rev=${encodeURIComponent(b.name)}`)}>History</Btn>
                    {!b.remote && <Btn onClick={() => open({ kind: 'rename', b }, b.name)}>Rename</Btn>}
                    {!b.remote && <Btn disabled={b.current} title={b.current ? 'The checked-out branch cannot be deleted' : 'Delete this local branch'} className={b.current ? '' : 'text-del'} onClick={() => askDelete(b)}>Delete</Btn>}
                    <Btn onClick={() => copy(b.name)}>{copied === b.name ? 'Copied' : 'Copy'}</Btn>
                  </span></td>
              </tr>))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-mute">No branches match “{filter}”.</p>}
      </div>

      {ctx.menu}
      {dlg?.kind === 'create' && (
        <Dialog title="Create branch" onClose={close} footer={<><Btn onClick={close}>Cancel</Btn><Btn primary disabled={busy} onClick={() => void attempt(() => ops.createBranch(root, name.trim(), start || null, co), `Created ${name.trim()}`, true)}>Create</Btn></>}>
          <label className="mb-1 block text-xs text-mute" htmlFor="bn">Branch name</label>
          <input id="bn" value={name} onChange={(e) => { setName(e.target.value); setFormError('') }} placeholder="feature/name" className={field} />
          <label className="mb-1 mt-3 block text-xs text-mute" htmlFor="bs">Create from</label>
          <select id="bs" value={start} onChange={(e) => setStart(e.target.value)} className={field}>{data.map((b) => <option key={(b.remote ? 'r' : 'l') + b.name} value={b.name}>{b.name}{b.current ? ' (current)' : ''}</option>)}</select>
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={co} onChange={(e) => setCo(e.target.checked)} className="accent-[var(--accent)]" /> Check out after creating</label>
          {formError && <div role="alert" className="mt-3 text-del">{formError}</div>}
        </Dialog>)}
      {dlg?.kind === 'rename' && (
        <Dialog title={`Rename ${dlg.b.name}`} onClose={close} footer={<><Btn onClick={close}>Cancel</Btn><Btn primary disabled={busy} onClick={() => void attempt(() => ops.renameBranch(root, dlg.b.name, name.trim()), `Renamed to ${name.trim()}`, true)}>Rename</Btn></>}>
          <label className="mb-1 block text-xs text-mute" htmlFor="rn">New name</label>
          <input id="rn" value={name} onChange={(e) => { setName(e.target.value); setFormError('') }} className={field} />
          {dlg.b.upstream && <p className="mb-0 mt-3 text-xs text-mute">Only the local branch is renamed. Its upstream <span className="font-mono">{dlg.b.upstream}</span> keeps its name.</p>}
          {formError && <div role="alert" className="mt-3 text-del">{formError}</div>}
        </Dialog>)}
      {dlg?.kind === 'delete' && (
        <ConfirmDialog title={dlg.needsForce ? 'Delete unmerged branch?' : `Delete ${dlg.b.name}?`} confirmLabel={dlg.needsForce ? 'Delete anyway' : 'Delete branch'} busy={busy} onClose={close} onConfirm={() => void del(dlg.b, dlg.needsForce)}
          body={dlg.needsForce ? <p className="m-0 text-del">{dlg.message}</p> : <>
            <p className="mt-0">This deletes the local branch <b className="font-mono text-fg">{dlg.b.name}</b> (last commit <span className="font-mono">{dlg.b.hash}</span>). Git refuses if it has unmerged commits, and you will be asked again.</p>
            {dlg.b.upstream && <p className="mb-0 text-xs">The remote branch <span className="font-mono">{dlg.b.upstream}</span> is not touched.</p>}</>} />)}
    </div>
  )
}
