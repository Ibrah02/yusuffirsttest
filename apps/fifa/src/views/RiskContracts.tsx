import { useAllPlayers } from '../hooks/useAllPlayers'
import { BarList } from '../components/BarList'
import { avgByGroup, topN } from '../lib/stats'
import { ClubBadge } from '../components/ClubBadge'

const RISK_ORDER = ['Low', 'Medium', 'High']
const RISK_COLOR: Record<string, string> = { Low: '#59a14f', Medium: '#f28e2b', High: '#e15759' }

export function RiskContracts() {
  const { players, loading, error } = useAllPlayers()

  if (loading) return <p className="muted">Loading…</p>
  if (error) return <p className="error">{error}</p>

  const total = players.length
  const riskCounts = RISK_ORDER.map((level) => ({
    label: level,
    value: players.filter((p) => p.transferRiskLevel === level).length,
    color: RISK_COLOR[level],
  }))
  const valueByRisk = avgByGroup(players, (p) => p.transferRiskLevel, (p) => p.marketValueMillionEur)
    .sort((a, b) => RISK_ORDER.indexOf(a.label) - RISK_ORDER.indexOf(b.label))

  const injuryProne = players.filter((p) => p.injuryProne).length
  const injuryPct = ((injuryProne / total) * 100).toFixed(0)

  const expiring = players.filter((p) => p.contractYearsLeft <= 1)
  const freeNow = players.filter((p) => p.contractYearsLeft === 0).length
  // Most valuable players with a contract expiring within a year — the watchlist.
  const expiringWatch = topN(expiring, 15, (p) => p.marketValueMillionEur)

  return (
    <div className="fifa-grid">
      <section className="fifa-card fifa-card-wide fifa-stats">
        <div className="stat">
          <span className="stat-num">{total.toLocaleString()}</span>
          <span className="stat-label">Players</span>
        </div>
        <div className="stat">
          <span className="stat-num" style={{ color: '#e15759' }}>{riskCounts[2].value}</span>
          <span className="stat-label">High transfer risk</span>
        </div>
        <div className="stat">
          <span className="stat-num" style={{ color: '#f28e2b' }}>{injuryProne} <small>({injuryPct}%)</small></span>
          <span className="stat-label">Injury-prone</span>
        </div>
        <div className="stat">
          <span className="stat-num" style={{ color: '#b07aa1' }}>{freeNow}</span>
          <span className="stat-label">Contract expired (0 yrs)</span>
        </div>
      </section>

      <section className="fifa-card">
        <h3>Transfer risk breakdown</h3>
        <BarList items={riskCounts} format={(v) => `${v}`} tone="risk" />
      </section>

      <section className="fifa-card">
        <h3>Average value by risk level</h3>
        <BarList
          items={valueByRisk.map((d) => ({ label: d.label, value: d.value, color: RISK_COLOR[d.label] }))}
          format={(v) => `€${v.toFixed(1)}M`}
        />
      </section>

      <section className="fifa-card fifa-card-wide">
        <h3>Contracts expiring within a year — top by value</h3>
        <p className="card-note">{expiring.length.toLocaleString()} players have ≤ 1 year left.</p>
        <div className="fifa-table-wrap">
          <table className="fifa-table">
            <thead>
              <tr>
                <th>Player</th><th>Club</th><th>Pos</th>
                <th className="num">Yrs left</th><th className="num">Value (€M)</th><th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {expiringWatch.map((p) => (
                <tr key={p.playerId}>
                  <td>{p.playerName}</td>
                  <td><ClubBadge club={p.club} /></td>
                  <td>{p.position}</td>
                  <td className="num">{p.contractYearsLeft}</td>
                  <td className="num">{p.marketValueMillionEur.toFixed(1)}</td>
                  <td>
                    <span className={`fifa-risk risk-${p.transferRiskLevel.toLowerCase()}`}>
                      {p.transferRiskLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
