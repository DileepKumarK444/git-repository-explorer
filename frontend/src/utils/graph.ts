export interface GraphRow { col: number; before: (string | null)[]; after: (string | null)[]; parentCols: number[] }

/** Assigns each commit a lane. Recomputed over all loaded commits, so appending a page never changes earlier rows. */
export function layoutGraph(commits: { hash: string; parents: string[] }[]): { rows: GraphRow[]; width: number } {
  const lanes: (string | null)[] = []
  const rows: GraphRow[] = []
  let width = 1
  for (const c of commits) {
    const before = [...lanes]
    let col = lanes.indexOf(c.hash)
    if (col < 0) {
      col = lanes.indexOf(null)
      if (col < 0) { col = lanes.length; lanes.push(null) }
    }
    lanes.forEach((h, i) => { if (i !== col && h === c.hash) lanes[i] = null })
    lanes[col] = c.parents[0] ?? null
    const parentCols = c.parents.length ? [col] : []
    for (const p of c.parents.slice(1)) {
      let j = lanes.indexOf(p)
      if (j < 0) { j = lanes.indexOf(null); if (j < 0) { j = lanes.length; lanes.push(p) } else lanes[j] = p }
      parentCols.push(j)
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    rows.push({ col, before, after: [...lanes], parentCols })
    width = Math.max(width, before.length, lanes.length, col + 1)
  }
  return { rows, width }
}
