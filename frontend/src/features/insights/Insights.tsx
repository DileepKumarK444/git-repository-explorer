import { explorer } from '../../services/api'
import { useFetch } from '../../hooks/useFetch'
import { ErrorBox, Loading } from '../../components/ui/bits'
import { RequireRepo } from '../repository/RequireRepo'
import type { Insights as Data } from '../../types/explorer'

export function Insights() {
  return <RequireRepo>{(root) => <InsightsBody root={root} />}</RequireRepo>
}

const size = (k: number) => (k < 1024 ? `${k} KB` : `${(k / 1024).toFixed(1)} MB`)

function Bars({ rows, unit }: { rows: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,45%)_40px] items-center gap-2 text-xs">
          <span className="truncate font-mono" title={r.label}>{r.label}</span>
          <span className="h-2 overflow-hidden rounded-sm bg-panel2"><span className="block h-full rounded-sm bg-accent" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="text-right tabular-nums text-mute" title={`${r.value} ${unit}`}>{r.value}</span>
        </div>))}
    </div>)
}

function Activity({ d }: { d: Data }) {
  const W = 720, H = 150, L = 34, B = 20, T = 8, n = d.activity.length
  const max = Math.max(1, ...d.activity.map((a) => a.commits))
  const step = Math.max(1, Math.ceil(max / 4)), top = step * Math.ceil(max / step)
  const bw = (W - L) / Math.max(n, 1)
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Commits per week">
      {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
        <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--faint)">{v}</text></g>))}
      {d.activity.map((a, i) => (
        <rect key={a.week} x={L + i * bw + 1} y={y(a.commits)} width={Math.max(1, bw - 2)} height={Math.max(0, H - B - y(a.commits))} fill="var(--accent)" rx="1.5">
          <title>{`Week of ${a.week}: ${a.commits} commits, ${a.files} file changes`}</title></rect>))}
      {n > 0 && <><text x={L} y={H - 5} fontSize="10" fill="var(--faint)">{d.activity[0].week}</text><text x={W} y={H - 5} textAnchor="end" fontSize="10" fill="var(--faint)">{d.activity[n - 1].week}</text></>}
    </svg>)
}

function InsightsBody({ root }: { root: string }) {
  const { data: d, error, loading, reload } = useFetch(() => explorer.insights(root), [root])
  if (error) return <ErrorBox message={error} retry={reload} />
  if (!d) return loading ? <Loading what="Reading history" /> : null
  if (d.empty) return <div className="grid h-full place-items-center p-8 text-center text-mute">No commits yet, so there is nothing to analyse.</div>
  const stat = (l: string, v: string) => <div className="border-r border-line px-3.5 py-2.5 last:border-0"><small className="block text-[11px] uppercase tracking-[.06em] text-faint">{l}</small><b className="text-[17px] font-semibold tabular-nums">{v}</b></div>
  const card = 'rounded-lg border border-line bg-panel p-3.5'
  const h = 'mb-2.5 mt-0 text-xs font-semibold uppercase tracking-[.07em] text-mute'
  return (
    <div className="mx-auto max-w-[1180px] px-[22px] py-[18px]">
      <h1 className="mb-3 text-[19px] font-semibold tracking-tight">Insights</h1>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] overflow-hidden rounded-lg border border-line bg-panel">
        {stat('Commits', d.commits.toLocaleString())}{stat('Contributors', String(d.contributors.length))}{stat('Branches', String(d.branches))}{stat('Tags', String(d.tags))}{stat('Files', d.files.toLocaleString())}{stat('Repo size', size(d.size_kib))}
      </div>
      <section className={`${card} mt-4`}><h2 className={h}>Commits per week</h2>{d.activity.length ? <Activity d={d} /> : <p className="m-0 text-mute">No activity.</p>}</section>
      <div className="mt-4 grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <section className={card}><h2 className={h}>Contributors by commits</h2><Bars unit="commits" rows={d.contributors.map((c) => ({ label: c.name, value: c.commits }))} /></section>
        <section className={card}><h2 className={h}>Most active directories</h2><Bars unit="file changes" rows={d.top_dirs.map((x) => ({ label: x.path, value: x.changes }))} /></section>
      </div>
      <section className={`${card} mt-4`}><h2 className={h}>Most frequently modified files</h2><Bars unit="commits" rows={d.top_files.map((x) => ({ label: x.path, value: x.changes }))} /></section>
      {d.scan_limited && <p className="mt-3 text-xs text-faint">File statistics cover the latest {d.scanned.toLocaleString()} commits of {d.commits.toLocaleString()}. Contributor counts cover all of history.</p>}
    </div>)
}
