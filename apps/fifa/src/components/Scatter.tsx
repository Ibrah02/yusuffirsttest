type Point = { x: number; y: number; color?: string }

type Props = {
  points: Point[]
  xLabel: string
  yLabel: string
  legend?: { label: string; color: string }[]
}

const W = 640
const H = 380
const PAD = 48

/** Minimal SVG scatter plot with auto-scaled axes and optional per-point colour. */
export function Scatter({ points, xLabel, yLabel, legend }: Props) {
  if (points.length === 0) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)

  const sx = (x: number) => PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD * 2)
  const sy = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD * 2)

  return (
    <div>
      <svg className="scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} versus ${xLabel}`}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="scatter-axis" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="scatter-axis" />
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} className="scatter-dot" style={{ fill: p.color }} />
        ))}
        <text x={W / 2} y={H - 10} className="scatter-label" textAnchor="middle">
          {xLabel}
        </text>
        <text x={16} y={H / 2} className="scatter-label" textAnchor="middle" transform={`rotate(-90 16 ${H / 2})`}>
          {yLabel}
        </text>
        <text x={PAD} y={H - PAD + 16} className="scatter-tick" textAnchor="middle">{Math.round(xMin)}</text>
        <text x={W - PAD} y={H - PAD + 16} className="scatter-tick" textAnchor="middle">{Math.round(xMax)}</text>
        <text x={PAD - 8} y={H - PAD} className="scatter-tick" textAnchor="end">{Math.round(yMin)}</text>
        <text x={PAD - 8} y={PAD + 4} className="scatter-tick" textAnchor="end">{Math.round(yMax)}</text>
      </svg>
      {legend && (
        <div className="chart-legend">
          {legend.map((l) => (
            <span key={l.label} className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
