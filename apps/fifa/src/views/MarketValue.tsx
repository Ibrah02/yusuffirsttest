import { useAllPlayers } from '../hooks/useAllPlayers'
import { BarList } from '../components/BarList'
import { Histogram } from '../components/Histogram'
import { avgByGroup, histogram, topN } from '../lib/stats'
import { positionColor } from '../lib/palette'
import { ClubBadge } from '../components/ClubBadge'

const eur = (v: number) => `€${v.toFixed(1)}M`

export function MarketValue() {
  const { players, loading, error } = useAllPlayers()

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <p className="error">{error}</p>

  const valueBins = histogram(players.map((p) => p.marketValueMillionEur), 16)
  const byClub = avgByGroup(players, (p) => p.club, (p) => p.marketValueMillionEur)
  const byPosition = avgByGroup(players, (p) => p.position, (p) => p.marketValueMillionEur)
  const byNationality = avgByGroup(players, (p) => p.nationality, (p) => p.marketValueMillionEur)
  const top20 = topN(players, 20, (p) => p.marketValueMillionEur)

  return (
    <div className="fifa-grid">
      <section className="fifa-card fifa-card-wide">
        <h3>Market value distribution</h3>
        <p className="card-note">All {players.length.toLocaleString()} players, binned by value (€M).</p>
        <Histogram bins={valueBins} xLabel="Market value (€M) →" />
      </section>

      <section className="fifa-card">
        <h3>Average value by club</h3>
        <BarList items={byClub.map((d) => ({ label: d.label, value: d.value }))} format={eur} tone="palette" />
      </section>

      <section className="fifa-card">
        <h3>Average value by position</h3>
        <BarList
          items={byPosition.map((d) => ({ label: d.label, value: d.value, color: positionColor(d.label) }))}
          format={eur}
        />
      </section>

      <section className="fifa-card">
        <h3>Average value by nationality</h3>
        <BarList items={byNationality.map((d) => ({ label: d.label, value: d.value }))} format={eur} tone="palette" />
      </section>

      <section className="fifa-card fifa-card-wide">
        <h3>Top 20 most valuable</h3>
        <div className="fifa-table-wrap">
          <table className="fifa-table">
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>Club</th><th>Pos</th>
                <th className="num">OVR</th><th className="num">Value (€M)</th>
              </tr>
            </thead>
            <tbody>
              {top20.map((p, i) => (
                <tr key={p.playerId}>
                  <td className="num">{i + 1}</td>
                  <td>{p.playerName}</td>
                  <td><ClubBadge club={p.club} /></td>
                  <td>{p.position}</td>
                  <td className="num">{p.overallRating}</td>
                  <td className="num">{p.marketValueMillionEur.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
