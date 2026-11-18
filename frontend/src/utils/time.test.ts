import { timeAgo } from './time'
const now = new Date('2026-11-18T12:00:00Z').getTime()
test.each([
  ['2026-11-18T11:59:50Z', 'just now'], ['2026-11-18T11:00:00Z', '1 hour ago'],
  ['2026-11-16T12:00:00Z', '2 days ago'], ['2026-10-01T12:00:00Z', '1 month ago'],
])('%s -> %s', (iso, out) => expect(timeAgo(iso, now)).toBe(out))
test('null is a dash', () => expect(timeAgo(null)).toBe('—'))
