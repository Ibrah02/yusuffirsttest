import { Result, TransportSessionBuilder } from '@peercolab/engine'
import {
  GetRegionalOutlooks,
  GetCountrySignal,
  SearchAtRiskCountries,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type {
  Country,
  Pathway,
  Confidence,
  Provenance,
  CountrySignal,
  RegionalOutlook,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type { FewsNetPriceSignal } from '@gen/Main/Model/1_0/SourceData/PathItems'
import { SourceDataAcquisition } from '@gen/East_Africa_dashbaord/Client/PathItems'
import { Session } from '../../Session'
import { fetchPriceSignal, registerPriceOp } from '../sources'

// ---------------------------------------------------------------------------
// THIRD interceptor layer — the lead-time probe.
//
// Can real data produce a genuine `leadTimeMonths` — the field the World Bank
// annual API could not? Yes. It is sourced from FEWS NET MONTHLY market prices
// (deep history, all seven countries) via a dev-server proxy
// (`/__probe/leadtime`, see vite.config.ts + server/fewsLeadTime.ts) — FEWS NET
// has no CORS and ~30 MB payloads, so the browser cannot call it directly.
//
// The raw upstream call is now the MODELLED `GetFewsNetPriceLeadTime` operation
// (SourceData path, outbound in SourceDataAcquisition). In production the
// backend makes it server-side; under UX-first the interceptor below serves it
// from the dev proxy, and the derived early-warning handlers COMPOSE it through
// the engine (one dispatch per country). That anchors each signal's
// `provenance.source` (FewsNetPrices) to a real source contract.
//
// `sustainedAnomalyMonths` is REAL and computed: the number of consecutive
// recent months the national median maize price has sat >1σ above its own
// trailing-12-month baseline — a true sub-annual early-warning quantity, unlike
// the World Bank probe's hardcoded 0. Prices are directly observed, so
// provenance.basis is `Observed`.
//
// Scope honesty: this probe reads the PRICE-PRESSURE (harm) side only. Prices
// cannot express the demographic-dividend upside, so this layer never returns
// `TowardDividend`; that half still belongs to other indicators.
// ---------------------------------------------------------------------------

const COUNTRY_TABLE: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'UG', name: 'Uganda' },
  { code: 'KE', name: 'Kenya' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'BI', name: 'Burundi' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'SS', name: 'South Sudan' },
]

const toCountry = (code: string): Country => {
  const row = COUNTRY_TABLE.find((r) => r.code === code)!
  return { id: `co-${code.toLowerCase()}`, code, name: row.name }
}

const foodPriceStunting: Pathway = {
  id: 'pw-food-stunting',
  name: 'Food-price inflation → child stunting',
  description: 'Rising staple prices cut household calories; stunting and lost schooling follow with a lag.',
  polarity: 'Harm',
}

// The price source op (`GetFewsNetPriceLeadTime`) and its proxy mapping live in
// ../sources.ts — shared with the composite layer. This layer composes that op
// and derives the price-only early-warning read from it.

// ---------------------------------------------------------------------------
// Derivation from the price signal.
// ---------------------------------------------------------------------------

function deriveDirection(s: FewsNetPriceSignal): 'TowardHarm' | 'Neutral' {
  if (s.latest == null) return 'Neutral'
  // At-risk: price materially elevated vs its own baseline AND still rising.
  if (s.zScore >= 1.5 && (s.mom3 ?? 0) > 0) return 'TowardHarm'
  return 'Neutral'
}

function isRecent(month: string | undefined): boolean {
  if (!month) return false
  const [y, m] = month.split('-').map(Number)
  const asOf = new Date(y, m - 1, 1)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  return asOf >= cutoff
}

function deriveConfidence(s: FewsNetPriceSignal): Confidence {
  if (s.latest == null) {
    return { band: 'Low', note: 'No usable FEWS NET price series for this country.' }
  }
  const fresh = isRecent(s.asOfMonth)
  let band: 'High' | 'Medium' | 'Low'
  if (s.marketsReporting >= 15 && s.monthsOfHistory >= 36 && fresh) band = 'High'
  else if (s.marketsReporting >= 5 && s.monthsOfHistory >= 24) band = 'Medium'
  else band = 'Low'

  const parts = [
    `${s.product}, ${s.marketsReporting} markets, ${s.monthsOfHistory} months of history (to ${s.asOfMonth}).`,
    `z=${s.zScore.toFixed(2)} vs trailing-12; 3-mo ${fmtPct(s.mom3)}, 12-mo ${fmtPct(s.mom12)}.`,
    'Lead = months the price has stayed >1σ above baseline; validating it as a ≥3-month lead over IPC harm needs an IPC join.',
  ]
  if (!fresh) parts.push('Latest month is >3 months old.')
  return { band, note: parts.join(' ') }
}

// Provenance: directly-observed FEWS NET prices; coverage from how many markets
// report, how deep the history is, and how fresh the latest month is.
function deriveProvenance(s: FewsNetPriceSignal): Provenance {
  if (s.latest == null) {
    return { source: 'None', coverage: 'NotMonitored', basis: 'Observed', note: 'No usable FEWS NET price series for this country.' }
  }
  const fresh = isRecent(s.asOfMonth)
  let coverage: Provenance['coverage']
  if (s.marketsReporting >= 15 && s.monthsOfHistory >= 36 && fresh) coverage = 'Monitored'
  else coverage = 'Limited'
  const parts = [`FEWS NET ${s.product}: ${s.marketsReporting} markets, ${s.monthsOfHistory} months (to ${s.asOfMonth}).`]
  if (!fresh) parts.push('Latest month is >3 months old.')
  return { source: 'FewsNetPrices', coverage, basis: 'Observed', note: parts.join(' ') }
}

function toSignal(s: FewsNetPriceSignal): CountrySignal {
  const direction = deriveDirection(s)
  return {
    id: `sig-${s.countryCode.toLowerCase()}`,
    country: toCountry(s.countryCode),
    direction,
    dominantPathway: foodPriceStunting,
    leadTimeMonths: s.sustainedAnomalyMonths,
    confidence: deriveConfidence(s),
    asOf: new Date(`${s.asOfMonth ?? monthNow()}-01`),
    provenance: deriveProvenance(s),
  }
}

const fmtPct = (v: number | undefined) => (v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const monthNow = () => new Date().toISOString().slice(0, 7)

// Load every country's signal by COMPOSING the modelled source op — one engine
// dispatch per country, in parallel.
async function loadAll(): Promise<CountrySignal[]> {
  const client = Session.getClient()
  const signals = await Promise.all(
    COUNTRY_TABLE.map(async (c) => {
      const result = await client.request(SourceDataAcquisition.getFewsNetPriceLeadTime({ countryCode: c.code }))
      // The op maps proxy failures onto an empty signal, so a failed result is rare;
      // fall back to an empty reading to keep the region whole.
      const sig = result.success ? result.value : await fetchPriceSignal(c.code)
      return toSignal(sig)
    }),
  )
  return signals
}

function rollUp(signals: CountrySignal[]): RegionalOutlook {
  const harm = signals.filter((s) => s.direction === 'TowardHarm')
  // Headline lead = the most-established active warning across the region.
  const leadTimeMonths = harm.length ? Math.max(...harm.map((s) => s.leadTimeMonths)) : 0
  const monitored = signals.filter((s) => s.provenance.coverage === 'Monitored').length
  const band: 'High' | 'Medium' | 'Low' = monitored > signals.length / 2 ? 'Medium' : 'Low'
  return {
    region: { code: 'EA', name: 'East Africa' },
    overallDirection: harm.length > signals.length / 2 ? 'TowardHarm' : 'Neutral',
    leadTimeMonths,
    confidence: {
      band,
      note: `${harm.length} of ${signals.length} countries showing an active price-pressure signal (real FEWS NET monthly prices). Price-side only — dividend upside not covered by this probe.`,
    },
    countrySignals: signals,
  }
}

// ---------------------------------------------------------------------------
// Interceptors — the modelled source op plus the same three early-warning
// operation ids as the other layers.
// ---------------------------------------------------------------------------

export function registerEarlyWarningLeadTimeProbe(builder: TransportSessionBuilder): void {
  registerPriceOp(builder)
    .intercept(
      new GetRegionalOutlooks().handle(async () => {
        try {
          return Result.ok([rollUp(await loadAll())])
        } catch (e) {
          return Result.internalServerError<RegionalOutlook[]>(
            'EarlyWarning.RegionalOutlook.ProbeUnavailable',
            `Lead-time proxy failed: ${(e as Error).message}`,
            'The lead-time data source is unavailable right now.',
          )
        }
      }),
    )
    .intercept(
      new GetCountrySignal().handle(async (input) => {
        const code = input.countryCode?.toUpperCase()
        if (!COUNTRY_TABLE.some((c) => c.code === code)) {
          return Result.notFound<CountrySignal>(
            'EarlyWarning.CountrySignal.NotFound',
            `No country in the monitored region for code "${input.countryCode}".`,
            'That country is not in the monitored region.',
          )
        }
        try {
          const result = await Session.getClient().request(SourceDataAcquisition.getFewsNetPriceLeadTime({ countryCode: code }))
          const sig = result.success ? result.value : await fetchPriceSignal(code)
          return Result.ok(toSignal(sig))
        } catch (e) {
          return Result.internalServerError<CountrySignal>(
            'EarlyWarning.CountrySignal.ProbeUnavailable',
            `Lead-time proxy failed: ${(e as Error).message}`,
            'The lead-time data source is unavailable right now.',
          )
        }
      }),
    )
    .intercept(
      new SearchAtRiskCountries().handle(async (input) => {
        try {
          const signals = await loadAll()
          const wanted = input.direction ?? 'TowardHarm'
          return Result.ok(signals.filter((s) => s.direction === wanted))
        } catch (e) {
          return Result.internalServerError<CountrySignal[]>(
            'EarlyWarning.AtRisk.ProbeUnavailable',
            `Lead-time proxy failed: ${(e as Error).message}`,
            'The lead-time data source is unavailable right now.',
          )
        }
      }),
    )
}
