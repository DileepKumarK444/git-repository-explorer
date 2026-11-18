import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface MenuItem { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; separator?: boolean }

/** Right-click menus. `open(event, items)` on contextmenu; render `menu` once in the component. */
export function useContextMenu(): { open: (e: MouseEvent, items: MenuItem[]) => void; menu: ReactNode } {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const close = useCallback(() => setState(null), [])
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey); addEventListener('scroll', close, true); addEventListener('resize', close)
    return () => { removeEventListener('keydown', onKey); removeEventListener('scroll', close, true); removeEventListener('resize', close) }
  }, [state, close])
  const open = useCallback((e: MouseEvent, items: MenuItem[]) => { e.preventDefault(); setState({ x: e.clientX, y: e.clientY, items }) }, [])
  const menu = state && (
    <div className="fixed inset-0 z-50" onMouseDown={close} onContextMenu={(e) => { e.preventDefault(); close() }}>
      <div role="menu" style={{ left: Math.min(state.x, innerWidth - 220), top: Math.min(state.y, innerHeight - state.items.length * 28 - 16) }}
        onMouseDown={(e) => e.stopPropagation()} className="absolute min-w-[200px] rounded-md border border-line bg-panel py-1 shadow-xl">
        {state.items.map((it, i) => it.separator ? <div key={i} className="my-1 border-t border-line" /> : (
          <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { close(); it.onClick() }}
            className={cn('block w-full border-0 bg-transparent px-3 py-1.5 text-left hover:bg-accent-soft', it.danger ? 'text-del' : 'text-fg')}>{it.label}</button>))}
      </div>
    </div>)
  return { open, menu }
}

export const copyText = (t: string, done: () => void) => void navigator.clipboard?.writeText(t).then(done).catch(() => undefined)
