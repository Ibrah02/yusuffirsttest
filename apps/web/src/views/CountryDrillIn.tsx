import { useEffect, useState } from 'react'
import { Session } from '../peer-colab-model/Session'
import { EarlyWarningMonitor } from '@gen/East_Africa_dashbaord/Client/PathItems'
import type { CountrySignal } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import {
  directionLabel,
  directionTone,
  confidenceLabel,
  formatAsOf,
  isStale,
  basisLabel,
  coverageState,
  coverageLabel,
  sourceLabel,
  upsideUnevidenced,
  leadTimeText,
} from '../lib/format'
import { CoverageBanner, UpsideGapBanner } from '../components/ProvenanceBadge'
import { PathwayBreakdown } from '../components/PathwayBreakdown'

type Props = { countryCode: string; onBack: () => void }

export function CountryDrillIn({ countryCode, onBack }: Props) {
  const [signal, setSignal] = useState<CountrySignal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    setSignal(null)
    setError(null)
    Session.getClient()
      .request(EarlyWarningMonitor.getCountrySignal({ countryCode }))
      .then((result) => {
        if (!live) return
        if (result.success) setSignal(result.value)
        else setError(result.error?.toLongString() ?? `No signal for ${countryCode}.`)
        setLoading(false)
      })
    return () => {
      live = false
    }
  }, [countryCode])

  return (
    <section>
      <button className="link-back" onClick={onBack}>
        ← Back to regional outlook
      </button>

      {loading && <p className="muted">Loading {countryCode}…</p>}
      {error && <p className="error">{error}</p>}

      {signal && <CountryDetail signal={signal} />}
    </section>
  )
}

function CountryDetail({ signal }: { signal: CountrySignal }) {
  const cov = coverageState(signal.provenance.coverage)
  const uncovered = cov === 'unmonitored'
  const upside = upsideUnevidenced(signal.direction)
  const stale = isStale(signal.asOf)
  const headline = uncovered ? 'Not monitored' : upside ? 'Possible upside' : directionLabel(signal.direction)

  return (
    <article className={`detail tone-${uncovered || upside ? 'neutral' : directionTone(signal.direction)}`}>
      <span className="headline-eyebrow">
        {signal.country.name} ({signal.country.code})
      </span>
      <h2>{headline}</h2>

      <CoverageBanner provenance={signal.provenance} />
      {upside && <UpsideGapBanner />}

      {!uncovered && (
        <p className="headline-meta">
          {leadTimeText(signal)} · {confidenceLabel(signal.confidence.band)} · as of{' '}
          <span className={stale ? 'is-stale' : ''}>
            {formatAsOf(signal.asOf)}
            {stale && ' (stale)'}
          </span>
        </p>
      )}

      <dl className="detail-grid">
        <div>
          <dt>Dominant pathway</dt>
          <dd>
            <strong>{signal.dominantPathway.name}</strong>
            <span className={`pill pill-${signal.dominantPathway.polarity.toLowerCase()}`}>
              {signal.dominantPathway.polarity}
            </span>
            {signal.dominantPathway.description && <p className="muted">{signal.dominantPathway.description}</p>}
          </dd>
        </div>
        <div>
          <dt>Reliability</dt>
          <dd>
            {signal.confidence.band}
            {signal.confidence.note && <p className="muted">{signal.confidence.note}</p>}
          </dd>
        </div>
        <div>
          <dt>Source &amp; coverage</dt>
          <dd>
            <strong>{sourceLabel(signal.provenance.source)}</strong>
            <span className={`coverage-tag coverage-${cov}`}>{coverageLabel(signal.provenance.coverage)}</span>
            <span className={`basis-tag basis-${signal.provenance.basis.toLowerCase()}`}>
              {basisLabel(signal.provenance.basis)}
            </span>
            {signal.provenance.note && <p className="muted">{signal.provenance.note}</p>}
          </dd>
        </div>
        <div>
          <dt>As of</dt>
          <dd>
            <span className={stale ? 'is-stale' : ''}>
              {formatAsOf(signal.asOf)}
              {stale && ' — stale'}
            </span>
          </dd>
        </div>
      </dl>

      {signal.contributions && signal.contributions.length > 0 && (
        <div className="pathway-section">
          <dt>Pathway evidence</dt>
          <p className="muted pathway-intro">
            Which pathways drove this read — the evidence behind the flag. A pathway fires when its harmful anomaly
            exceeds 1σ above its own baseline.
          </p>
          <PathwayBreakdown contributions={signal.contributions} />
        </div>
      )}
    </article>
  )
}
