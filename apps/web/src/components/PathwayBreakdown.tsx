import type { PathwayContribution } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import { pathwayShort } from '../lib/format'

/**
 * Compact "fired on" chips for cards and watchlist rows — the at-a-glance
 * evidence of which pathways crossed their threshold in a composite signal.
 * Renders nothing for single-source layers (no contributions).
 */
export function FiredSummary({ contributions }: { contributions?: PathwayContribution[] }) {
  if (!contributions || contributions.length === 0) return null
  const fired = contributions.filter((c) => c.fired)
  if (fired.length === 0) {
    return <span className="fired-summary none">No pathway firing</span>
  }
  return (
    <span className="fired-summary">
      <span className="fired-label">Fired on</span>
      {fired.map((c) => (
        <span key={c.pathway.id} className="fired-chip">
          {pathwayShort(c.pathway)}
        </span>
      ))}
    </span>
  )
}

/**
 * Full per-pathway breakdown for the country drill-in — the evidence an analyst
 * reviews: which pathways fired, how anomalous (z), and the weight each carries.
 */
export function PathwayBreakdown({ contributions }: { contributions?: PathwayContribution[] }) {
  if (!contributions || contributions.length === 0) return null
  return (
    <ul className="pathway-breakdown">
      {contributions.map((c) => (
        <li key={c.pathway.id} className={c.fired ? 'fired' : ''}>
          <span className={`pw-dot ${c.fired ? 'on' : 'off'}`} />
          <span className="pw-short">{pathwayShort(c.pathway)}</span>
          <span className="pw-name">{c.pathway.name}</span>
          <span className="pw-z">z = {c.zScore.toFixed(2)}</span>
          <span className="pw-weight">×{c.weight}</span>
          <span className={`pw-state ${c.fired ? 'on' : 'off'}`}>{c.fired ? 'firing' : 'quiet'}</span>
        </li>
      ))}
    </ul>
  )
}
