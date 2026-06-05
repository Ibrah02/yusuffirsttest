import type { Provenance } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import {
  formatAsOf,
  isStale,
  isModelled,
  sourceLabel,
  coverageState,
  coverageLabel,
} from '../lib/format'

type Props = { provenance: Provenance; asOf: Date | string }

/**
 * The honesty strip shown wherever a country reading appears: which source
 * produced it, how fresh it is, how complete the coverage is, and whether the
 * values are modelled rather than observed. Keeps the app from rendering a
 * confident signal without saying where the number came from.
 */
export function ProvenanceBadge({ provenance, asOf }: Props) {
  const stale = isStale(asOf)
  const cov = coverageState(provenance.coverage)

  return (
    <span className="prov">
      <span className="prov-source">{sourceLabel(provenance.source)}</span>
      <span className={`prov-asof${stale ? ' is-stale' : ''}`}>
        as of {formatAsOf(asOf)}
        {stale && ' · stale'}
      </span>
      {cov !== 'monitored' && (
        <span className={`coverage-tag coverage-${cov}`}>{coverageLabel(provenance.coverage)}</span>
      )}
      {isModelled(provenance.basis) && <span className="prov-modelled">modelled</span>}
    </span>
  )
}

/** Larger coverage banner for the country drill-in / uncovered states. */
export function CoverageBanner({ provenance }: { provenance: Provenance }) {
  const cov = coverageState(provenance.coverage)
  if (cov === 'monitored') return null
  return (
    <p className={`coverage-banner coverage-${cov}`}>
      <strong>{coverageLabel(provenance.coverage)}.</strong> {provenance.note}
    </p>
  )
}

/** Compact chip flagging an unevidenced dividend read on cards. */
export function UpsideGapTag() {
  return <span className="upside-tag">Upside not yet monitored</span>
}

/** Drill-in banner explaining the upside gap — a known gap, not a solved feature. */
export function UpsideGapBanner() {
  return (
    <p className="coverage-banner upside-banner">
      <strong>Upside not yet monitored.</strong> This reads as possible upside, but no demographic-dividend data
      source exists yet — every source we have watches the harm side (price, conflict, climate). Treat it as an
      unevidenced inference, not a confirmed dividend.
    </p>
  )
}
