import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../../store/app'

export function RequireRepo({ children }: { children: (root: string) => ReactNode }) {
  const { repo, restored } = useApp()
  if (!restored) return null
  if (!repo) return <Navigate to="/" replace />
  return <>{children(repo.root)}</>
}
