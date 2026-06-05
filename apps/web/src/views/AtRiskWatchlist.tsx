import { useEffect, useState } from 'react'
import { Session } from '../peer-colab-model/Session'
import { EarlyWarningMonitor } from '@gen/East_Africa_dashbaord/Client/PathItems'
import type { CountrySignal, TriageReview } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import { directionLabel, directionTone, formatAsOf, isStale } from '../lib/format'
import { ProvenanceBadge } from '../components/ProvenanceBadge'
import { FiredSummary, PathwayBreakdown } from '../components/PathwayBreakdown'

type Props = { onSelectCountry: (code: string) => void }

const TRIAGE_STATES = ['New', 'Reviewed', 'Actioned', 'Dismissed'] as const
type Triage = (typeof TRIAGE_STATES)[number]

const FILTERS = [
  { value: 'active', label: 'Active queue' },
  { value: 'new', label: 'Needs review' },
  { value: 'all', label: 'All candidates' },
] as const

// Severity / recall score: lead time bought, reliability, and how many pathways
// are firing. Higher = review sooner. Ranking is client-side over the existing
// SearchAtRiskCountries — no false-alarm-free promise, recall and lead are the
// headline metrics.
function score(s: CountrySignal): number {
  const lead = s.leadTimeMonths || 0
  const confW = s.confidence.band === 'High' ? 3 : s.confidence.band === 'Medium' ? 2 : 1
  const fired = (s.contributions ?? []).filter((c) => c.fired).length
  return lead * 1.5 + confW + fired * 2
}

export function AtRiskWatchlist({ onSelectCountry }: Props) {
  const [filter, setFilter] = useState<string>('active')
  const [candidates, setCandidates] = useState<CountrySignal[] | null>(null)
  const [reviews, setReviews] = useState<Record<string, Triage>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    const client = Session.getClient()
    Promise.all([
      client.request(EarlyWarningMonitor.searchAtRiskCountries({})),
      client.request(EarlyWarningMonitor.getTriageReviews()),
    ]).then(([candResult, reviewResult]) => {
      if (!live) return
      if (candResult.success) {
        setCandidates(candResult.value)
        setError(null)
      } else {
        setError(candResult.error?.toLongString() ?? 'Failed to load the watchlist.')
      }
      if (reviewResult.success) {
        setReviews(Object.fromEntries(reviewResult.value.map((r: TriageReview) => [r.countryCode, r.state as Triage])))
      }
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [])

  const setTriage = (code: string, state: Triage) => {
    setReviews((prev) => ({ ...prev, [code]: state })) // optimistic
    Session.getClient()
      .request(EarlyWarningMonitor.setTriageReview({ countryCode: code, state }))
      .then((r) => {
        if (!r.success) setError(r.error?.toLongString() ?? 'Failed to save triage state.')
      })
  }

  const triageOf = (code: string): Triage => reviews[code] ?? 'New'

  const ranked = (candidates ?? []).slice().sort((a, b) => score(b) - score(a))
  const visible = ranked.filter((s) => {
    const t = triageOf(s.country.code)
    if (filter === 'active') return t !== 'Dismissed'
    if (filter === 'new') return t === 'New'
    return true
  })

  return (
    <section>
      <div className="watch-intro">
        <h2 className="watch-title">Watchlist — candidates for review</h2>
        <p className="muted">
          A high-recall list an analyst triages, not an automatic alarm. Candidates are ranked by lead time, reliability
          and how many pathways are firing. Expect precautionary flags — review the evidence, then action or dismiss.
        </p>
      </div>

      <div className="filter-row">
        <label htmlFor="triage-filter">Show</label>
        <select id="triage-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {candidates && (
          <span className="muted queue-count">
            {visible.length} shown · {ranked.filter((s) => triageOf(s.country.code) === 'New').length} awaiting review
          </span>
        )}
      </div>

      {loading && <p className="muted">Loading watchlist…</p>}
      {error && <p className="error">{error}</p>}
      {candidates && visible.length === 0 && (
        <p className="muted">
          {filter === 'new'
            ? 'Nothing awaiting review — the queue is clear.'
            : filter === 'active'
              ? 'No active candidates. Everything flagged has been dismissed.'
              : 'No candidates flagged right now.'}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="watchlist">
          {visible.map((s, i) => (
            <WatchRow
              key={s.id}
              rank={i + 1}
              signal={s}
              triage={triageOf(s.country.code)}
              expanded={expanded === s.country.code}
              onToggle={() => setExpanded(expanded === s.country.code ? null : s.country.code)}
              onTriage={(state) => setTriage(s.country.code, state)}
              onOpen={() => onSelectCountry(s.country.code)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function WatchRow({
  rank,
  signal: s,
  triage,
  expanded,
  onToggle,
  onTriage,
  onOpen,
}: {
  rank: number
  signal: CountrySignal
  triage: Triage
  expanded: boolean
  onToggle: () => void
  onTriage: (state: Triage) => void
  onOpen: () => void
}) {
  const stale = isStale(s.asOf)
  const dimmed = triage === 'Dismissed'

  return (
    <li className={`watch-card tone-${directionTone(s.direction)}${dimmed ? ' is-dismissed' : ''}`}>
      <button className="watch-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="watch-rank">#{rank}</span>
        <span className="watch-main">
          <span className="watch-country">{s.country.name}</span>
          <span className="watch-direction">{directionLabel(s.direction)}</span>
          <span className="watch-lead">flagged — {s.leadTimeMonths}mo lead · {s.confidence.band} confidence</span>
        </span>
        <span className={`triage-badge triage-${triage.toLowerCase()}`}>{triage}</span>
        <span className="watch-expand">{expanded ? '▾' : '▸'}</span>
      </button>

      <div className="watch-sub">
        <ProvenanceBadge provenance={s.provenance} asOf={s.asOf} />
        <FiredSummary contributions={s.contributions} />
      </div>

      {expanded && (
        <div className="watch-evidence">
          <p className="muted evidence-line">
            <strong>{s.dominantPathway.name}</strong> · {s.leadTimeMonths}-month lead · as of{' '}
            <span className={stale ? 'is-stale' : ''}>
              {formatAsOf(s.asOf)}
              {stale && ' (stale)'}
            </span>
          </p>
          {s.confidence.note && <p className="muted evidence-line">{s.confidence.note}</p>}
          <PathwayBreakdown contributions={s.contributions} />

          <div className="triage-controls">
            <span className="triage-label">Triage:</span>
            {TRIAGE_STATES.map((state) => (
              <button
                key={state}
                className={`triage-btn${triage === state ? ' active' : ''}`}
                onClick={() => onTriage(state)}
              >
                {state}
              </button>
            ))}
            <button className="triage-open" onClick={onOpen}>
              Open full read →
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
