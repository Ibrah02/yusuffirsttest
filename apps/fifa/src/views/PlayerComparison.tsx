import { useMemo, useState } from 'react'
import { useAllPlayers } from '../hooks/useAllPlayers'
import { Radar, type RadarAxis } from '../components/Radar'
import type { Player } from '@gen/Main/Model/1_0/PathItems'
import { topN } from '../lib/stats'

const METRICS: { key: keyof Player; label: string }[] = [
  { key: 'overallRating', label: 'Overall' },
  { key: 'potentialRating', label: 'Potential' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'matchesPlayed', label: 'Matches' },
  { key: 'marketValueMillionEur', label: 'Value' },
]

export function PlayerComparison() {
  const { players, loading, error } = useAllPlayers()
  const [idA, setIdA] = useState<number | null>(null)
  const [idB, setIdB] = useState<number | null>(null)

  // Axis maxima across the whole dataset, so radar shape is comparable.
  const axisMax = useMemo(() => {
    const m: Record<string, number> = {}
    for (const metric of METRICS) m[metric.key] = Math.max(1, ...players.map((p) => Number(p[metric.key])))
    return m
  }, [players])

  // Default to the two most valuable players once data arrives.
  const defaults = useMemo(() => topN(players, 2, (p) => p.marketValueMillionEur), [players])

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <p className="error">{error}</p>

  const a = players.find((p) => p.playerId === idA) ?? defaults[0]
  const b = players.find((p) => p.playerId === idB) ?? defaults[1]

  const options = [...players].sort((p, q) => p.playerName.localeCompare(q.playerName, undefined, { numeric: true }))
  const axes: RadarAxis[] = METRICS.map((m) => ({ label: m.label, max: axisMax[m.key] }))

  return (
    <div className="fifa-compare">
      <div className="compare-pickers">
        <label className="compare-pick compare-pick-a">
          Player A
          <select value={a?.playerId} onChange={(e) => setIdA(Number(e.target.value))}>
            {options.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.playerName} — {p.club} ({p.overallRating})
              </option>
            ))}
          </select>
        </label>
        <label className="compare-pick compare-pick-b">
          Player B
          <select value={b?.playerId} onChange={(e) => setIdB(Number(e.target.value))}>
            {options.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.playerName} — {p.club} ({p.overallRating})
              </option>
            ))}
          </select>
        </label>
      </div>

      {a && b && (
        <div className="compare-body">
          <div className="fifa-card compare-radar">
            <Radar
              axes={axes}
              series={[
                { name: a.playerName, values: METRICS.map((m) => Number(a[m.key])), tone: 'a' },
                { name: b.playerName, values: METRICS.map((m) => Number(b[m.key])), tone: 'b' },
              ]}
            />
            <div className="compare-legend">
              <span className="legend-a">● {a.playerName}</span>
              <span className="legend-b">● {b.playerName}</span>
            </div>
          </div>

          <div className="fifa-card compare-table">
            <table className="fifa-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="num legend-a">{a.playerName}</th>
                  <th className="num legend-b">{b.playerName}</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Club / Pos" av={`${a.club} · ${a.position}`} bv={`${b.club} · ${b.position}`} />
                <CompareRow label="Age" av={a.age} bv={b.age} />
                <CompareRow label="Overall" av={a.overallRating} bv={b.overallRating} hi />
                <CompareRow label="Potential" av={a.potentialRating} bv={b.potentialRating} hi />
                <CompareRow label="Goals" av={a.goals} bv={b.goals} hi />
                <CompareRow label="Assists" av={a.assists} bv={b.assists} hi />
                <CompareRow label="Matches" av={a.matchesPlayed} bv={b.matchesPlayed} hi />
                <CompareRow label="Value (€M)" av={a.marketValueMillionEur.toFixed(1)} bv={b.marketValueMillionEur.toFixed(1)} hi />
                <CompareRow label="Transfer risk" av={a.transferRiskLevel} bv={b.transferRiskLevel} />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function CompareRow({
  label,
  av,
  bv,
  hi,
}: {
  label: string
  av: string | number
  bv: string | number
  hi?: boolean
}) {
  // Highlight the larger of two numeric values.
  let aWin = false
  let bWin = false
  if (hi && typeof av !== 'string' && typeof bv !== 'string') {
    aWin = av > bv
    bWin = bv > av
  } else if (hi) {
    const na = Number(av)
    const nb = Number(bv)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      aWin = na > nb
      bWin = nb > na
    }
  }
  return (
    <tr>
      <td>{label}</td>
      <td className={`num ${aWin ? 'compare-win' : ''}`}>{av}</td>
      <td className={`num ${bWin ? 'compare-win' : ''}`}>{bv}</td>
    </tr>
  )
}
