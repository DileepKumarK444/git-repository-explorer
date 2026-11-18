import { useToasts } from '../../store/toast'
import { cn } from '../../utils/cn'

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[min(420px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
          className={cn('pointer-events-auto flex items-start gap-3 rounded-md border px-3 py-2 shadow-lg', t.kind === 'error' ? 'border-del bg-del-bg text-del' : 'border-line bg-panel text-fg')}>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="border-0 bg-transparent p-0 text-mute">✕</button>
        </div>))}
    </div>)
}
