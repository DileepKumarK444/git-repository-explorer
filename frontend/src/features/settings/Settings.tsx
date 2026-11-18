import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { defaults, useSettings, type Settings as S } from '../../store/settings'
import { cn } from '../../utils/cn'

const box = 'h-7 rounded-[5px] border border-line bg-bg px-2.5'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-[220px] flex-1"><div className="font-medium">{label}</div>{hint && <div className="text-xs text-faint">{hint}</div>}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>)
}
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-5"><h2 className="mb-2 mt-0 text-xs font-semibold uppercase tracking-[.07em] text-mute">{title}</h2><div className="overflow-hidden rounded-lg border border-line bg-panel">{children}</div></section>)

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-[5px] border border-line">{options.map(([v, l]) =>
    <button key={v} aria-pressed={value === v} onClick={() => onChange(v)} className={cn('h-7 border-0 px-2.5', value === v ? 'bg-accent-soft text-accent' : 'bg-panel2 text-mute')}>{l}</button>)}</div>
}
const Check = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) =>
  <input type="checkbox" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />

export function Settings() {
  const { s, update } = useSettings()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [git, setGit] = useState(s.git_path)
  const [excl, setExcl] = useState(s.exclude_dirs.join(', '))
  useEffect(() => { setGit(s.git_path); setExcl(s.exclude_dirs.join(', ')) }, [s.git_path, s.exclude_dirs])
  const save = async (patch: Partial<S>, okText = 'Saved') => {
    const err = await update(patch)
    setMsg(err ? { kind: 'error', text: err } : { kind: 'ok', text: okText })
    if (!err) setTimeout(() => setMsg((m) => (m?.kind === 'ok' ? null : m)), 1800)
  }
  return (
    <div className="mx-auto max-w-[820px] px-[22px] py-[18px]">
      <div className="mb-4 flex items-center gap-3"><h1 className="m-0 flex-1 text-[19px] font-semibold tracking-tight">Settings</h1>
        {msg && <span role={msg.kind === 'error' ? 'alert' : 'status'} className={msg.kind === 'error' ? 'text-del' : 'text-add'}>{msg.text}</span>}
        <button onClick={() => void save({ ...defaults, git_path: s.git_path, default_repository: s.default_repository }, 'Reset to defaults')} className="h-7 rounded-[5px] border border-line bg-panel2 px-2.5 text-mute">Reset to defaults</button></div>

      <Section title="Appearance">
        <Row label="Theme"><Seg label="Theme" value={s.theme} onChange={(theme) => void save({ theme })} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} /></Row>
      </Section>
      <Section title="Git">
        <Row label="Git executable" hint="Leave empty to use git from PATH. The GRX_GIT environment variable overrides this.">
          <input aria-label="Git executable path" value={git} onChange={(e) => setGit(e.target.value)} onBlur={() => git !== s.git_path && void save({ git_path: git.trim() })} placeholder="/usr/bin/git" className={cn(box, 'w-64 font-mono text-xs')} /></Row>
        <Row label="Default comparison branch" hint="Pre-selected as the base on the Compare screen. Empty picks main or master."><input aria-label="Default comparison branch" defaultValue={s.default_compare_branch} key={s.default_compare_branch} onBlur={(e) => e.target.value !== s.default_compare_branch && void save({ default_compare_branch: e.target.value.trim() })} placeholder="main" className={cn(box, 'w-48 font-mono text-xs')} /></Row>
        <Row label="Default repository" hint="Opened at start when no repository was open last time."><input aria-label="Default repository" defaultValue={s.default_repository} key={s.default_repository} onBlur={(e) => e.target.value !== s.default_repository && void save({ default_repository: e.target.value.trim() })} placeholder="/Users/you/Developer/project" className={cn(box, 'w-64 font-mono text-xs')} /></Row>
      </Section>
      <Section title="Explorer">
        <Row label="Show hidden files" hint="Files and folders starting with a dot."><Check label="Show hidden files" on={s.show_hidden_files} onChange={(v) => void save({ show_hidden_files: v })} /></Row>
        <Row label="File sorting"><Seg label="File sorting" value={s.file_sort} onChange={(file_sort) => void save({ file_sort })} options={[['folders_first', 'Folders first'], ['name', 'By name']]} /></Row>
        <Row label="Excluded folders" hint="Skipped by content search. Comma separated."><input aria-label="Excluded folders" value={excl} onChange={(e) => setExcl(e.target.value)} onBlur={() => void save({ exclude_dirs: excl.split(',').map((x) => x.trim()).filter(Boolean) })} className={cn(box, 'w-72 max-w-full font-mono text-xs')} /></Row>
      </Section>
      <Section title="Diff">
        <Row label="Default layout"><Seg label="Default diff layout" value={s.default_diff} onChange={(default_diff) => void save({ default_diff })} options={[['split', 'Side by side'], ['unified', 'Unified']]} /></Row>
        <Row label="Word wrap"><Check label="Word wrap in diffs" on={s.diff_wrap} onChange={(v) => void save({ diff_wrap: v })} /></Row>
        <Row label="Context lines" hint="Unchanged lines kept around each change when “Changes only” is on."><input aria-label="Context lines" type="number" min={0} max={20} defaultValue={s.diff_context} key={s.diff_context} onBlur={(e) => +e.target.value !== s.diff_context && void save({ diff_context: Math.max(0, Math.min(20, +e.target.value || 0)) })} className={cn(box, 'w-20')} /></Row>
      </Section>
      <Section title="General">
        <Row label="Confirm destructive operations" hint="Asks before discarding changes and deleting branches, tags or stashes. Turn off only if you are sure."><Check label="Confirm destructive operations" on={s.confirm_destructive} onChange={(v) => void save({ confirm_destructive: v })} /></Row>
        <Row label="Startup screen"><select aria-label="Startup screen" value={s.startup_screen} onChange={(e) => void save({ startup_screen: e.target.value as S['startup_screen'] })} className={box}>
          <option value="dashboard">Dashboard</option><option value="last_repository">Last repository overview</option><option value="commits">Commits of last repository</option><option value="changes">Changes of last repository</option></select></Row>
        <Row label="Recent repositories to keep" hint="Favourites are never removed."><input aria-label="Repository history limit" type="number" min={5} max={200} defaultValue={s.history_limit} key={s.history_limit} onBlur={(e) => +e.target.value !== s.history_limit && void save({ history_limit: +e.target.value })} className={cn(box, 'w-20')} /></Row>
        <Row label="Keyboard shortcuts"><Link to="/shortcuts" className="text-accent">View shortcuts</Link></Row>
      </Section>
    </div>)
}
