import { useEffect, useState } from 'react'
import { Session } from '../peer-colab-model/Session'
import { EarlyWarningMonitor } from '@gen/East_Africa_dashbaord/Client/PathItems'
import type { RegionalOutlook as RegionalOutlookData, CountrySignal } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import { directionLabel, directionTone, confidenceLabel, coverageState, upsideUnevidenced } from '../lib/format'
import { ProvenanceBadge, UpsideGapTag } from '../components/ProvenanceBadge'
import { FiredSummary } from '../components/PathwayBreakdown'

type Props = { onSelectCountry: (code: string) => void }

export function RegionalOutlook({ onSelectCountry }: Props) {
  const [outlooks, setOutlooks] = useState<RegionalOutlookData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    Session.getClient()
      .request(EarlyWarningMonitor.getRegionalOutlooks())
      .then((result) => {
        if (!live) return
        if (result.success) {
          setOutlooks(result.value)
          setError(null)
        } else {
          setError(result.error?.toLongString() ?? 'Failed to load the regional outlook.')
        }
        setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  if (loading) return <p className="muted">Loading regional outlook…</p>
  if (error) return <p className="error">{error}</p>
  if (!outlooks || outlooks.length === 0) return <p className="muted">No outlook available.</p>

  return (
    <section>
      <p className="comparison-intro">
        Each African macro-region read side by side — so you can see whether East Africa's trajectory is
        regionally specific or part of a continent-wide pattern.
      </p>
      <div className="region-comparison">
        {outlooks.map((outlook) => (
          <RegionColumn key={outlook.region.code} outlook={outlook} onSelectCountry={onSelectCountry} />
        ))}
      </div>
    </section>
  )
}

function RegionColumn({
  outlook,
  onSelectCountry,
}: {
  outlook: RegionalOutlookData
  onSelectCountry: (code: string) => void
}) {
  const signals = outlook.countrySignals
  const monitored = signals.filter((s) => coverageState(s.provenance.coverage) === 'monitored')
  const partial = signals.filter((s) => coverageState(s.provenance.coverage) !== 'monitored')

  return (
    <div className="region-column">
      <div className={`headline tone-${directionTone(outlook.overallDirection)}`}>
        <span className="headline-eyebrow">{outlook.region.name}</span>
        <h2>{directionLabel(outlook.overallDirection)}</h2>
        <p className="headline-meta">
          {outlook.leadTimeMonths} months of lead time · {confidenceLabel(outlook.confidence.band)}
        </p>
        {outlook.confidence.note && <p className="headline-note">{outlook.confidence.note}</p>}
        <p className="coverage-summary">
          Fully monitored: {monitored.length} of {signals.length} countries. The rest have limited or no usable
          data — shown separately below.
        </p>
      </div>

      <h3 className="section-title">Monitored countries</h3>
      {monitored.length === 0 ? (
        <p className="muted">No country currently has full, fresh data.</p>
      ) : (
        <ul className="country-grid">
          {monitored.map((s) => (
            <CountryCard key={s.id} signal={s} onSelect={onSelectCountry} />
          ))}
        </ul>
      )}

      {partial.length > 0 && (
        <>
          <h3 className="section-title">Limited or not monitored</h3>
          <ul className="country-grid">
            {partial.map((s) => (
              <CountryCard key={s.id} signal={s} onSelect={onSelectCountry} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function CountryCard({ signal: s, onSelect }: { signal: CountrySignal; onSelect: (code: string) => void }) {
  const cov = coverageState(s.provenance.coverage)
  const uncovered = cov === 'unmonitored'
  const upside = upsideUnevidenced(s.direction)
  // Dividend reads are unevidenced, and uncovered reads have no direction — both
  // render neutral, never as a confident harm/dividend conclusion.
  const tone = uncovered || upside ? 'neutral' : directionTone(s.direction)

  return (
    <li>
      <button
        className={`country-card tone-${tone}${uncovered ? ' is-uncovered' : ''}`}
        onClick={() => onSelect(s.country.code)}
      >
        <span className="country-name">{s.country.name}</span>
        {uncovered ? (
          <span className="country-direction muted">Not monitored</span>
        ) : (
          <>
            <span className="country-direction">{upside ? 'Possible upside' : directionLabel(s.direction)}</span>
            {upside ? (
              <UpsideGapTag />
            ) : (
              <span className="country-sub">
                {s.dominantPathway.name} · {s.leadTimeMonths}mo · {s.confidence.band}
              </span>
            )}
          </>
        )}
        <ProvenanceBadge provenance={s.provenance} asOf={s.asOf} />
        {!uncovered && !upside && <FiredSummary contributions={s.contributions} />}
        {s.confidence.note && <span className="country-confnote">{s.confidence.note}</span>}
      </button>
    </li>
  )
}
