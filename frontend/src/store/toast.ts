import { create } from 'zustand'

export interface Toast { id: number; kind: 'ok' | 'error'; text: string }
let n = 0
export const useToasts = create<{ toasts: Toast[]; push: (kind: Toast['kind'], text: string) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = ++n
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    if (kind === 'ok') setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
export const toast = { ok: (t: string) => useToasts.getState().push('ok', t), error: (t: string) => useToasts.getState().push('error', t) }
