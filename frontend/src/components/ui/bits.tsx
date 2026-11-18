import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'
import type { Ref } from '../../types/explorer'

export const Loading = ({ what = 'Loading' }: { what?: string }) => <div className="p-5 text-mute">{what}…</div>
export const ErrorBox = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div role="alert" className="m-4 rounded-md border border-del bg-del-bg p-3 text-del">
    {message}{retry && <button onClick={retry} className="ml-3 rounded border border-del bg-transparent px-2 text-del">Retry</button>}
  </div>
)
export const Btn = ({ children, onClick, primary, disabled, title, className }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; title?: string; className?: string }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2.5',
      primary ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 hover:border-faint', className)}>{children}</button>
)
export function RefTag({ r }: { r: Ref }) {
  const style = r.type === 'head' ? 'border-accent bg-accent text-white'
    : r.type === 'tag' ? 'border-mod/40 bg-mod-bg text-mod' : r.type === 'remote' ? 'border-line text-mute' : 'border-accent/40 bg-accent-soft text-accent'
  return <span className={cn('inline-flex h-[18px] shrink-0 items-center rounded-full border px-1.5 font-mono text-[11px]', style)}>{r.type === 'tag' ? '⚑ ' : ''}{r.name}</span>
}
const colors: Record<string, string> = { M: 'bg-mod-bg text-mod', A: 'bg-add-bg text-add', U: 'bg-add-bg text-add', D: 'bg-del-bg text-del', R: 'bg-accent-soft text-accent' }
export const StatusBadge = ({ s }: { s: string }) => s ? <span className={cn('inline-grid h-4 w-4 shrink-0 place-items-center rounded-[3px] font-mono text-[10px] font-semibold', colors[s] ?? 'bg-panel2 text-mute')}>{s}</span> : null
const palette = ['#c4527a', '#3d8f7a', '#b0742a', '#5a6fd6', '#8a5fb8', '#3f87b5']
export function Avatar({ name }: { name: string }) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return <span title={name} className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9.5px] font-semibold text-white" style={{ background: palette[h % palette.length] }}>
    {name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span>
}
