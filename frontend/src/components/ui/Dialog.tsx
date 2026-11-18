import { useEffect, useRef, type ReactNode } from 'react'
import { Btn } from './bits'

export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input,select,textarea')?.focus()
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-[min(480px,100%)] rounded-lg border border-line bg-panel shadow-2xl">
        <h2 className="m-0 border-b border-line px-4 py-3 text-[15px] font-semibold normal-case tracking-normal text-fg">{title}</h2>
        <div className="px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
      </div>
    </div>)
}

/** Confirmation for anything that can lose work. States what happens and what is affected. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, busy }: { title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Dialog title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn>
      <button onClick={onConfirm} disabled={busy} className="h-7 rounded-[5px] border border-del bg-del px-3 text-white">{busy ? 'Working…' : confirmLabel}</button></>}>
      <div className="text-mute">{body}</div>
    </Dialog>)
}
