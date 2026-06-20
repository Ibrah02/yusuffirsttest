type Bin = { label: string; value: number }

type Props = {
  bins: Bin[]
  xLabel?: string
}

/** Vertical-bar histogram with a hue ramp across bins for visual lift. */
export function Histogram({ bins, xLabel }: Props) {
  const max = Math.max(1, ...bins.map((b) => b.value))
  const n = bins.length
  return (
    <div className="histogram-wrap">
      <div className="histogram">
        {bins.map((b, i) => {
          // Ramp from blue (210°) through teal/green (160°) across the range.
          const hue = 210 - (i / Math.max(1, n - 1)) * 60
          return (
            <div className="histogram-col" key={b.label} title={`${b.label}: ${b.value}`}>
              <span
                className="histogram-bar"
                style={{ height: `${(b.value / max) * 100}%`, background: `hsl(${hue} 55% 52%)` }}
              />
              <span className="histogram-tick">{b.label}</span>
            </div>
          )
        })}
      </div>
      {xLabel && <p className="chart-axis">{xLabel}</p>}
    </div>
  )
}
