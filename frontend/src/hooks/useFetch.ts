import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../store/app'

/** Minimal data loader: re-runs when `key` changes, ignores stale responses. */
export function useFetch<T>(fn: () => Promise<T>, key: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [n, setN] = useState(0)
  const tick = useApp((s) => s.tick)  // bumped by 'Refresh repository'
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...key, n, tick])
  const reload = useCallback(() => setN((v) => v + 1), [])
  return { ...state, reload }
}
