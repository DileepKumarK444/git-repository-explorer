import { layoutGraph } from './graph'

const c = (hash: string, ...parents: string[]) => ({ hash, parents })

test('linear history stays in one lane', () => {
  const { rows, width } = layoutGraph([c('c', 'b'), c('b', 'a'), c('a')])
  expect(rows.map((r) => r.col)).toEqual([0, 0, 0]); expect(width).toBe(1)
})

test('merge opens a second lane that closes at the fork point', () => {
  // m merges f into main; both descend from a
  const { rows, width } = layoutGraph([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')])
  expect(rows[0].parentCols).toEqual([0, 1])
  expect(rows[1].col).toBe(1)                      // f sits on the side lane
  expect(rows[2].col).toBe(0)
  expect(rows[3].before).toEqual(['a', 'a'])       // both lanes converge on a
  expect(rows[3].after).toEqual([])
  expect(width).toBe(2)
})

test('root commit ends its lane', () => {
  const { rows } = layoutGraph([c('a')])
  expect(rows[0].after).toEqual([]); expect(rows[0].parentCols).toEqual([])
})

test('page boundary does not change earlier rows', () => {
  const all = [c('d', 'c'), c('c', 'b'), c('b', 'a'), c('a')]
  expect(layoutGraph(all.slice(0, 2)).rows).toEqual(layoutGraph(all).rows.slice(0, 2))
})
