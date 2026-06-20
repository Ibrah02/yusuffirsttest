import { useAllPlayers } from '../hooks/useAllPlayers'
import { BarList } from '../components/BarList'
import { Scatter } from '../components/Scatter'
import { goalsPer90, topN } from '../lib/stats'
import { positionColor } from '../lib/palette'
import { POSITIONS } from '../constants'

export function Performance() {
  const { players, loading, error } = useAllPlayers()

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <p className="error">{error}</p>

  const topGoals = topN(players, 12, (p) => p.goals)
  const topAssists = topN(players, 12, (p) => p.assists)
  const topPer90 = topN(
    players.filter((p) => p.minutesPlayed >= 900),
    12,
    goalsPer90,
  )

  const scatter = players.map((p) => ({
    x: p.overallRating,
    y: p.marketValueMillionEur,
    color: positionColor(p.position),
  }))
  const scatterLegend = POSITIONS.map((pos) => ({ label: pos, color: positionColor(pos) }))

  return (
    <div className="fifa-grid">
      <section className="fifa-card">
        <h3>Top goalscorers</h3>
        <BarList
          items={topGoals.map((p) => ({ label: p.playerName, value: p.goals, sub: `· ${p.club}`, color: positionColor(p.position) }))}
          format={(v) => `${v}`}
        />
      </section>

      <section className="fifa-card">
        <h3>Top assist providers</h3>
        <BarList
          items={topAssists.map((p) => ({ label: p.playerName, value: p.assists, sub: `· ${p.club}`, color: positionColor(p.position) }))}
          format={(v) => `${v}`}
        />
      </section>

      <section className="fifa-card">
        <h3>Goals per 90 minutes</h3>
        <p className="card-note">Players with ≥ 900 minutes.</p>
        <BarList
          items={topPer90.map((p) => ({ label: p.playerName, value: goalsPer90(p), sub: `· ${p.position}`, color: positionColor(p.position) }))}
          format={(v) => v.toFixed(2)}
        />
      </section>

      <section className="fifa-card fifa-card-wide">
        <h3>Market value vs overall rating</h3>
        <p className="card-note">
          Each dot is a player. In real data this trends up and to the right — here it is a featureless cloud,
          because the dataset is synthetic and the two columns are independent (correlation ≈ 0). The flatness is
          the finding.
        </p>
        <Scatter points={scatter} xLabel="Overall rating →" yLabel="Market value (€M) →" legend={scatterLegend} />
      </section>
    </div>
  )
}
