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
  PathwayContribution,
  CountrySignal,
  RegionalOutlook,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type {
  FewsNetPriceSignal,
  AcledConflictSignal,
  NasaPowerClimateSignal,
} from '@gen/Main/Model/1_0/SourceData/PathItems'
import { SourceDataAcquisition } from '@gen/East_Africa_dashbaord/Client/PathItems'
import { Session } from '../../Session'
import { registerPriceOp, registerConflictOp, registerClimateOp } from '../sources'

// ---------------------------------------------------------------------------
// FOURTH interceptor layer — the live multi-indicator composite (`?source=composite`).
//
// This is the layer the IPC backtest pointed at as the fundable signal: combine
// the three pathway anomalies — price (FEWS NET), conflict (ACLED) and climate
// (NASA POWER) — into one early-warning read, instead of any single source. It
// dispatches all three MODELLED source ops per country through the engine, then
// applies the same transparent, pathway-routed weighting the backtest used:
//
//     composite(country) = Σ wᵢ · max(0, zᵢ)        fires when composite ≥ T
//
// where each zᵢ is the harmful-direction z-score of a pathway vs its own
// trailing baseline and wᵢ is a per-country weight (NOT machine-learned — ~26
// onsets would overfit). The per-pathway `Contributions` on the returned signal
// are the evidence behind the flag: which pathways fired, how anomalous, and
// their weight. That is exactly what the watchlist's evidence-per-flag review
// reads.
//
// Honest coverage: a pathway with no usable series (e.g. ACLED without
// credentials, or NASA POWER gap) contributes z=0 / fired=false and lowers the
// composite's coverage — the read never invents a pathway it cannot see.
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

const PATHWAYS: Record<'price' | 'conflict' | 'climate', Pathway> = {
  price: {
    id: 'pw-food-stunting',
    name: 'Food-price inflation → child stunting',
    description: 'Rising staple prices cut household calories; stunting and lost schooling follow with a lag.',
    polarity: 'Harm',
  },
  conflict: {
    id: 'pw-displacement',
    name: 'Conflict / displacement → food insecurity',
    description: 'Violence and displacement collapse local food systems faster than prices alone.',
    polarity: 'Harm',
  },
  climate: {
    id: 'pw-rainfall',
    name: 'Rainfall deficit → crop failure',
    description: 'A sustained rainfall deficit cuts harvests and pasture, feeding hunger one season on.',
    polarity: 'Harm',
  },
}

// Transparent, pathway-routed weights per country (default 1/1/1). South Sudan
// is conflict-led; the rest lean on price + climate. Hand-set, not learned.
const WEIGHTS: Record<string, { price: number; conflict: number; climate: number }> = {
  SS: { price: 0.5, conflict: 1.5, climate: 1 },
  ET: { price: 1, conflict: 1, climate: 1 },
  RW: { price: 1, conflict: 1, climate: 0.5 },
  BI: { price: 1, conflict: 1, climate: 0.5 },
}
const weightsFor = (code: string) => WEIGHTS[code] ?? { price: 1, conflict: 1, climate: 1 }

const FIRE_Z = 1 // a pathway "fires" when its harmful z exceeds 1σ
const THRESHOLD = 0.5 // composite firing threshold (from the backtest sweep)

type PathwayInput = { key: 'price' | 'conflict' | 'climate'; z: number; sustained: number; has: boolean; weight: number }

function buildSignal(
  code: string,
  price: FewsNetPriceSignal,
  conflict: AcledConflictSignal,
  climate: NasaPowerClimateSignal,
): CountrySignal {
  const w = weightsFor(code)
  const inputs: PathwayInput[] = [
    { key: 'price', z: price.zScore, sustained: price.sustainedAnomalyMonths, has: price.monthsOfHistory > 0, weight: w.price },
    { key: 'conflict', z: conflict.zScore, sustained: conflict.sustainedAnomalyMonths, has: conflict.monthsOfHistory > 0, weight: w.conflict },
    { key: 'climate', z: climate.zScore, sustained: climate.sustainedAnomalyMonths, has: climate.monthsOfHistory > 0, weight: w.climate },
  ]

  const contributions: PathwayContribution[] = inputs.map((i) => ({
    pathway: PATHWAYS[i.key],
    zScore: i.z,
    weight: i.weight,
    fired: i.has && i.z > FIRE_Z,
  }))

  const composite = inputs.reduce((sum, i) => sum + (i.has ? i.weight * Math.max(0, i.z) : 0), 0)
  const direction = composite >= THRESHOLD ? 'TowardHarm' : 'Neutral'

  // Dominant = the largest weighted contribution; if nothing fired, the
  // highest-weighted available pathway (default price) so the card still reads.
  const ranked = [...inputs].sort((a, b) => b.weight * Math.max(0, b.z) - a.weight * Math.max(0, a.z))
  const top = ranked.find((i) => i.has && i.z > 0) ?? ranked.find((i) => i.has) ?? inputs[0]

  const available = inputs.filter((i) => i.has).length
  const firedCount = contributions.filter((c) => c.fired).length

  return {
    id: `sig-${code.toLowerCase()}`,
    country: toCountry(code),
    direction,
    dominantPathway: PATHWAYS[top.key],
    leadTimeMonths: direction === 'TowardHarm' ? top.sustained : 0,
    confidence: deriveConfidence(available, firedCount, composite),
    asOf: latestAsOf(price.asOfMonth, conflict.asOfMonth, climate.asOfMonth),
    provenance: deriveProvenance(available, inputs),
    contributions,
  }
}

function deriveConfidence(available: number, firedCount: number, composite: number): Confidence {
  let band: 'High' | 'Medium' | 'Low'
  if (available === 3) band = 'Medium'
  else if (available >= 1) band = 'Low'
  else band = 'Low'
  const note =
    `Composite of ${available}/3 pathways (price + conflict + climate); ${firedCount} firing, score ${composite.toFixed(2)}. ` +
    'High-recall watchlist signal — review the per-pathway evidence before acting; precision is bounded by base rates, not tuning.'
  return { band, note }
}

function deriveProvenance(available: number, inputs: PathwayInput[]): Provenance {
  let coverage: Provenance['coverage']
  if (available === 3) coverage = 'Monitored'
  else if (available >= 1) coverage = 'Limited'
  else coverage = 'NotMonitored'
  const missing = inputs.filter((i) => !i.has).map((i) => i.key)
  const note =
    `Combined price + conflict + climate (${available}/3 pathways available)` +
    (missing.length ? `; missing: ${missing.join(', ')}.` : '.')
  return { source: available === 0 ? 'None' : 'Composite', coverage, basis: 'Modelled', note }
}

function latestAsOf(...months: (string | undefined)[]): Date {
  const valid = months.filter((m): m is string => !!m).sort()
  const latest = valid.at(-1) ?? new Date().toISOString().slice(0, 7)
  return new Date(`${latest}-01`)
}

// Compose the three modelled source ops per country, in parallel, through the engine.
async function loadCountry(code: string): Promise<CountrySignal> {
  const client = Session.getClient()
  const [priceR, conflictR, climateR] = await Promise.all([
    client.request(SourceDataAcquisition.getFewsNetPriceLeadTime({ countryCode: code })),
    client.request(SourceDataAcquisition.getAcledConflictSignal({ countryCode: code })),
    client.request(SourceDataAcquisition.getNasaPowerClimateSignal({ countryCode: code })),
  ])
  const price = priceR.success ? priceR.value : emptyPrice(code)
  const conflict = conflictR.success ? conflictR.value : emptyConflict(code)
  const climate = climateR.success ? climateR.value : emptyClimate(code)
  return buildSignal(code, price, conflict, climate)
}

const emptyPrice = (code: string): FewsNetPriceSignal => ({
  countryCode: code, product: 'maize retail', zScore: 0, sustainedAnomalyMonths: 0, marketsReporting: 0, monthsOfHistory: 0,
})
const emptyConflict = (code: string): AcledConflictSignal => ({
  countryCode: code, events: 0, zScore: 0, sustainedAnomalyMonths: 0, monthsOfHistory: 0,
})
const emptyClimate = (code: string): NasaPowerClimateSignal => ({
  countryCode: code, zScore: 0, sustainedAnomalyMonths: 0, monthsOfHistory: 0,
})

async function loadAll(): Promise<CountrySignal[]> {
  return Promise.all(COUNTRY_TABLE.map((c) => loadCountry(c.code)))
}

function rollUp(signals: CountrySignal[]): RegionalOutlook {
  const harm = signals.filter((s) => s.direction === 'TowardHarm')
  const leadTimeMonths = harm.length ? Math.max(...harm.map((s) => s.leadTimeMonths)) : 0
  const monitored = signals.filter((s) => s.provenance.coverage === 'Monitored').length
  const band: 'High' | 'Medium' | 'Low' = monitored > signals.length / 2 ? 'Medium' : 'Low'
  return {
    region: { code: 'EA', name: 'East Africa' },
    overallDirection: harm.length > signals.length / 2 ? 'TowardHarm' : 'Neutral',
    leadTimeMonths,
    confidence: {
      band,
      note: `${harm.length} of ${signals.length} countries flagged by the multi-indicator composite (price + conflict + climate). High-recall watchlist — analyst triage expected.`,
    },
    countrySignals: signals,
  }
}

// ---------------------------------------------------------------------------
// Interceptors — the three modelled source ops plus the composite early-warning
// handlers that combine them.
// ---------------------------------------------------------------------------

export function registerEarlyWarningComposite(builder: TransportSessionBuilder): void {
  registerClimateOp(registerConflictOp(registerPriceOp(builder)))
    .intercept(
      new GetRegionalOutlooks().handle(async () => {
        try {
          return Result.ok([rollUp(await loadAll())])
        } catch (e) {
          return Result.internalServerError<RegionalOutlook[]>(
            'EarlyWarning.RegionalOutlook.CompositeUnavailable',
            `Composite signal failed: ${(e as Error).message}`,
            'The combined signal is unavailable right now.',
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
          return Result.ok(await loadCountry(code))
        } catch (e) {
          return Result.internalServerError<CountrySignal>(
            'EarlyWarning.CountrySignal.CompositeUnavailable',
            `Composite signal failed: ${(e as Error).message}`,
            'The combined signal is unavailable right now.',
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
            'EarlyWarning.AtRisk.CompositeUnavailable',
            `Composite signal failed: ${(e as Error).message}`,
            'The combined signal is unavailable right now.',
          )
        }
      }),
    )
}
