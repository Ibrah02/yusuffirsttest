import { colorFor } from '../lib/palette'

type Item = { label: string; value: number; sub?: string; color?: string }

type Props = {
  items: Item[]
  format?: (v: number) => string
  /** 'palette' gives each bar a distinct categorical colour; 'value'/'risk'/'ink' are single-tone. */
  tone?: 'ink' | 'value' | 'risk' | 'palette'
}

const TONE_COLOR: Record<string, string | undefined> = {
  ink: '#1c2330',
  value: '#4e79a7',
  risk: '#b07aa1',
}

/** Horizontal bar list — label, proportional bar, formatted value. */
export function BarList({ items, format = (v) => v.toFixed(0), tone = 'ink' }: Props) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="barlist">
      {items.map((it, i) => {
        const color = it.color ?? (tone === 'palette' ? colorFor(i) : TONE_COLOR[tone])
        return (
          <div className="barlist-row" key={it.label}>
            <span className="barlist-label" title={it.label}>
              {it.label}
              {it.sub && <span className="barlist-sub"> {it.sub}</span>}
            </span>
            <span className="barlist-track">
              <span
                className="barlist-fill"
                style={{ width: `${(it.value / max) * 100}%`, background: color }}
              />
            </span>
            <span className="barlist-amt">{format(it.value)}</span>
          </div>
        )
      })}
    </div>
  )
}
