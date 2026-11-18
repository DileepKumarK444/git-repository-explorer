import type { GraphRow } from '../../utils/graph'

export const ROW_H = 32
const LANE = 14, PAD = 10
const colors = ['#7d93ff', '#4cc38a', '#e5a84b', '#d7708f', '#5fc0d6', '#a572d6']
const x = (i: number) => PAD + i * LANE
const col = (i: number) => colors[i % colors.length]

export const graphWidth = (lanes: number) => PAD * 2 + Math.max(0, lanes - 1) * LANE

export function GraphCell({ row, hash, merge, width }: { row: GraphRow; hash: string; merge: boolean; width: number }) {
  const mid = ROW_H / 2
  const paths: React.ReactNode[] = []
  row.before.forEach((h, i) => {
    if (h === null) return
    if (h === hash) {
      paths.push(i === row.col
        ? <path key={`in${i}`} d={`M${x(i)} 0V${mid}`} stroke={col(i)} />
        : <path key={`in${i}`} d={`M${x(i)} 0C${x(i)} ${mid * 0.7} ${x(row.col)} ${mid * 0.3} ${x(row.col)} ${mid}`} stroke={col(i)} />)
    } else {
      paths.push(<path key={`pass${i}`} d={`M${x(i)} 0V${ROW_H}`} stroke={col(i)} />)
    }
  })
  row.parentCols.forEach((j, k) => {
    paths.push(j === row.col
      ? <path key={`out${k}`} d={`M${x(row.col)} ${mid}V${ROW_H}`} stroke={col(row.col)} />
      : <path key={`out${k}`} d={`M${x(row.col)} ${mid}C${x(row.col)} ${mid + 8} ${x(j)} ${mid + 4} ${x(j)} ${ROW_H}`} stroke={col(j)} />)
  })
  return (
    <svg width={width} height={ROW_H} className="shrink-0" aria-hidden="true">
      <g fill="none" strokeWidth="2">{paths}</g>
      <circle cx={x(row.col)} cy={mid} r={merge ? 5 : 4.5} fill={merge ? 'var(--panel)' : col(row.col)} stroke={col(row.col)} strokeWidth="2" />
    </svg>
  )
}
