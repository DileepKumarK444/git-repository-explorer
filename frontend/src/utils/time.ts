export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  const units: [number, string][] = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]
  for (const [secs, name] of units) {
    if (s >= secs) { const n = Math.floor(s / secs); return `${n} ${name}${n > 1 ? 's' : ''} ago` }
  }
  return 'just now'
}
