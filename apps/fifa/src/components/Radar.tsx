export type RadarAxis = { label: string; max: number }
export type RadarSeries = { name: string; values: number[]; tone: 'a' | 'b' }

type Props = {
  axes: RadarAxis[]
  series: RadarSeries[]
}

const SIZE = 360
const C = SIZE / 2
const R = SIZE / 2 - 56

/** SVG radar/spider chart comparing up to two series across shared axes. */
export function Radar({ axes, series }: Props) {
  const n = axes.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const point = (i: number, ratio: number) => {
    const r = R * Math.max(0, Math.min(1, ratio))
    return [C + r * Math.cos(angle(i)), C + r * Math.sin(angle(i))]
  }

  const rings = [0.25, 0.5, 0.75, 1]

  return (
    <svg className="radar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Player comparison radar">
      {/* grid rings */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          className="radar-ring"
          points={axes.map((_, i) => point(i, ring).join(',')).join(' ')}
        />
      ))}
      {/* spokes + labels */}
      {axes.map((ax, i) => {
        const [x, y] = point(i, 1)
        const [lx, ly] = point(i, 1.18)
        return (
          <g key={ax.label}>
            <line x1={C} y1={C} x2={x} y2={y} className="radar-spoke" />
            <text x={lx} y={ly} className="radar-axis-label" textAnchor="middle" dominantBaseline="middle">
              {ax.label}
            </text>
          </g>
        )
      })}
      {/* series polygons */}
      {series.map((s) => (
        <polygon
          key={s.name}
          className={`radar-series radar-series-${s.tone}`}
          points={s.values.map((v, i) => point(i, v / axes[i].max).join(',')).join(' ')}
        />
      ))}
    </svg>
  )
}
