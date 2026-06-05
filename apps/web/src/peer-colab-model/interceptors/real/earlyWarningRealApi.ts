import { Result, TransportSessionBuilder } from '@peercolab/engine'
import {
  GetRegionalOutlook,
  GetCountrySignal,
  SearchAtRiskCountries,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type {
  Country,
  Pathway,
  Confidence,
  Provenance,
  CountrySignal,
  GetRegionalOutlookOutput,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import { GetWorldBankIndicator } from '@gen/Main/Model/1_0/SourceData/PathItems'
import type { WorldBankIndicatorReading } from '@gen/Main/Model/1_0/SourceData/PathItems'
import { SourceDataAcquisition } from '@gen/East_Africa_dashbaord/Client/PathItems'
import { Session } from '../../Session'

// ---------------------------------------------------------------------------
// SECOND interceptor layer — real data, not mock data.
//
// Same three operations the dashboard already calls, but served from the real
// World Bank Open Data Indicators API (free, no auth, CORS-enabled):
//     base: https://api.worldbank.org/v2/
//     inflation:           FP.CPI.TOTL.ZG   (consumer prices, annual %)
//     population growth:   SP.POP.GROW      (annual %)
//     GDP per-capita grow: NY.GDP.PCAP.KD.ZG (annual %)
//
// The raw upstream call is now a MODELLED operation — `GetWorldBankIndicator`
// in the SourceData path, classified outbound in the SourceDataAcquisition
// usage package. In production the backend makes this call; under UX-first it
// is served by the interceptor registered below, and the derived early-warning
// handlers COMPOSE it through the engine (one dispatch per indicator) instead
// of calling `fetch` directly. That makes each signal's `provenance.source`
// (WorldBankOpenData) point at a real source contract.
//
// PURPOSE: a feasibility probe. The dashboard's contract demands four DERIVED
// quantities per country — direction, dominant pathway, lead-time-months, and
// confidence. This layer shows which the real source can support:
//   - direction        → derivable, but only via a CRUDE illustrative heuristic
//   - dominantPathway  → heuristic attribution only (no real attribution model)
//   - leadTimeMonths   → NOT derivable from annual API series; reported as 0
//   - confidence       → grounded honestly in how complete / fresh the response was
// Because direction/pathway/lead-time are heuristic, provenance.basis is
// `Modelled`, and coverage reflects how complete the real response actually was.
// ---------------------------------------------------------------------------

const WB_BASE = 'https://api.worldbank.org/v2'
const CURRENT_YEAR = new Date().getFullYear()

// World Bank keys countries by ISO-3; the contract / dashboard use ISO-2.
const COUNTRY_TABLE: ReadonlyArray<{ code: string; iso3: string; name: string }> = [
  { code: 'UG', iso3: 'UGA', name: 'Uganda' },
  { code: 'KE', iso3: 'KEN', name: 'Kenya' },
  { code: 'TZ', iso3: 'TZA', name: 'Tanzania' },
  { code: 'RW', iso3: 'RWA', name: 'Rwanda' },
  { code: 'BI', iso3: 'BDI', name: 'Burundi' },
  { code: 'ET', iso3: 'ETH', name: 'Ethiopia' },
  { code: 'SS', iso3: 'SSD', name: 'South Sudan' },
]

const countryByIso3 = (iso3: string): Country | undefined => {
  const row = COUNTRY_TABLE.find((r) => r.iso3 === iso3)
  return row ? { id: `co-${row.code.toLowerCase()}`, code: row.code, name: row.name } : undefined
}

// Same pathway vocabulary as the mock layer — reused so attribution maps onto
// the model's named pathways. Here we only ever ASSIGN one heuristically.
const pathways = {
  foodPriceStunting: {
    id: 'pw-food-stunting',
    name: 'Food-price inflation → child stunting',
    description: 'Rising staple prices cut household calories; stunting and lost schooling follow with a lag.',
    polarity: 'Harm',
  },
  urbanFoodDemand: {
    id: 'pw-urban-demand',
    name: 'Urban food demand → price spikes',
    description: 'Fast urbanisation concentrates demand ahead of supply-chain capacity.',
    polarity: 'Harm',
  },
  labourGdp: {
    id: 'pw-labour-gdp',
    name: 'Labour-force expansion → GDP',
    description: 'A growing working-age share lifts output when it is absorbed into productive work.',
    polarity: 'Dividend',
  },
} satisfies Record<string, Pathway>

// ---------------------------------------------------------------------------
// The modelled source operation's implementation: one World Bank fetch per
// indicator across all requested countries. `mrnev=1` = most recent non-empty
// value, so we get one row per country (its latest year with data). Registered
// as the GetWorldBankIndicator interceptor below; the derived handlers reach it
// through the engine, never by calling this directly.
// ---------------------------------------------------------------------------

type WbRow = { countryiso3code: string; date: string; value: number | null }

async function fetchWorldBankIndicator(
  indicatorCode: string,
  iso3s: string[],
): Promise<WorldBankIndicatorReading[]> {
  const url = `${WB_BASE}/country/${iso3s.join(';')}/indicator/${indicatorCode}?format=json&mrnev=1&per_page=1000`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`World Bank ${indicatorCode} responded ${res.status}`)
  const json = (await res.json()) as [unknown, WbRow[] | null]
  const rows = json[1] ?? []
  const out: WorldBankIndicatorReading[] = []
  for (const row of rows) {
    if (row.value == null) continue
    const year = Number(row.date)
    out.push({
      countryIso3: row.countryiso3code,
      indicatorCode,
      year: Number.isFinite(year) ? year : 0,
      value: row.value,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Derivation — the honest core of the probe. Thresholds are ILLUSTRATIVE, not
// validated against history; they exist to show the shape of what real data
// can and cannot produce, not to be trusted as a signal.
// ---------------------------------------------------------------------------

type Series = { inflation?: number; popGrowth?: number; gdpPerCapGrowth?: number; latestYear: number }

function deriveDirection(s: Series): 'TowardHarm' | 'Neutral' | 'TowardDividend' {
  const { inflation, gdpPerCapGrowth } = s
  // Dividend: real income per head rising despite population growth.
  if (gdpPerCapGrowth != null && gdpPerCapGrowth >= 2 && (inflation == null || inflation < 12)) {
    return 'TowardDividend'
  }
  // Harm: high consumer inflation with little or no per-capita growth to absorb it.
  if (inflation != null && inflation >= 15 && (gdpPerCapGrowth == null || gdpPerCapGrowth < 1)) {
    return 'TowardHarm'
  }
  return 'Neutral'
}

function derivePathway(direction: string): Pathway {
  if (direction === 'TowardDividend') return pathways.labourGdp
  if (direction === 'TowardHarm') return pathways.foodPriceStunting
  return pathways.urbanFoodDemand
}

function presentCount(s: Series): number {
  return [s.inflation, s.popGrowth, s.gdpPerCapGrowth].filter((v) => v != null).length
}

function isStale(s: Series): boolean {
  return s.latestYear > 0 && s.latestYear < CURRENT_YEAR - 2
}

function deriveConfidence(s: Series): Confidence {
  const present = presentCount(s)
  const stale = isStale(s)
  // Capped at Medium on purpose: even with complete, fresh inputs the derivation
  // is a crude heuristic and lead-time is not derived at all.
  let band: 'High' | 'Medium' | 'Low'
  if (present === 3 && !stale) band = 'Medium'
  else band = 'Low'

  const missing = [
    s.inflation == null ? 'inflation' : null,
    s.popGrowth == null ? 'population growth' : null,
    s.gdpPerCapGrowth == null ? 'GDP/capita growth' : null,
  ].filter(Boolean)

  const parts: string[] = []
  parts.push(`Derived from ${present}/3 World Bank indicators (latest ${s.latestYear || 'n/a'}).`)
  if (missing.length) parts.push(`Missing: ${missing.join(', ')}.`)
  if (stale) parts.push('Latest data is >2 years old.')
  parts.push('Lead-time not derivable from annual series; direction/pathway are illustrative heuristics.')
  return { band, note: parts.join(' ') }
}

// Provenance is grounded in the real response: which source answered, how
// complete the coverage was, and that the derived fields are modelled (not
// directly observed). This is what makes the honesty UI truthful on live data.
function deriveProvenance(s: Series): Provenance {
  const present = presentCount(s)
  const stale = isStale(s)
  let coverage: Provenance['coverage']
  if (present === 0) coverage = 'NotMonitored'
  else if (present === 3 && !stale) coverage = 'Monitored'
  else coverage = 'Limited'

  const parts: string[] = [`World Bank: ${present}/3 indicators (latest ${s.latestYear || 'n/a'}).`]
  if (stale) parts.push('Latest data is >2 years old.')
  return {
    source: present === 0 ? 'None' : 'WorldBankOpenData',
    coverage,
    // Direction, pathway and lead-time are heuristic derivations, so the read is modelled.
    basis: 'Modelled',
    note: parts.join(' '),
  }
}

function toSignal(iso3: string, s: Series): CountrySignal | undefined {
  const country = countryByIso3(iso3)
  if (!country) return undefined
  const direction = deriveDirection(s)
  return {
    id: `sig-${country.code.toLowerCase()}`,
    country,
    direction,
    dominantPathway: derivePathway(direction),
    // Honest gap: annual World Bank series cannot yield a warning lead time.
    leadTimeMonths: 0,
    confidence: deriveConfidence(s),
    asOf: new Date(`${s.latestYear || CURRENT_YEAR}-12-31`),
    provenance: deriveProvenance(s),
  }
}

// Assemble signals for the requested ISO-3 set by COMPOSING the modelled source
// operation — one engine dispatch per indicator — and joining the readings.
async function loadSignals(iso3s: string[]): Promise<CountrySignal[]> {
  const client = Session.getClient()
  const fetchIndicator = async (indicatorCode: string): Promise<Map<string, { value: number; year: number }>> => {
    const result = await client.request(
      SourceDataAcquisition.getWorldBankIndicator({ indicatorCode, countryIso3Codes: iso3s }),
    )
    if (!result.success) {
      throw new Error(result.error?.toLongString() ?? `World Bank ${indicatorCode} unavailable`)
    }
    const m = new Map<string, { value: number; year: number }>()
    for (const r of result.value) m.set(r.countryIso3, { value: r.value, year: r.year })
    return m
  }

  const [cpi, pop, gdp] = await Promise.all([
    fetchIndicator('FP.CPI.TOTL.ZG'),
    fetchIndicator('SP.POP.GROW'),
    fetchIndicator('NY.GDP.PCAP.KD.ZG'),
  ])

  const signals: CountrySignal[] = []
  for (const iso3 of iso3s) {
    const inflation = cpi.get(iso3)
    const popGrowth = pop.get(iso3)
    const gdpPerCap = gdp.get(iso3)
    const latestYear = Math.max(inflation?.year ?? 0, popGrowth?.year ?? 0, gdpPerCap?.year ?? 0)
    const signal = toSignal(iso3, {
      inflation: inflation?.value,
      popGrowth: popGrowth?.value,
      gdpPerCapGrowth: gdpPerCap?.value,
      latestYear,
    })
    if (signal) signals.push(signal)
  }
  return signals
}

function rollUpRegion(signals: CountrySignal[]): GetRegionalOutlookOutput {
  const tally = (d: string) => signals.filter((s) => s.direction === d).length
  const harm = tally('TowardHarm')
  const dividend = tally('TowardDividend')
  const overallDirection = harm > dividend ? 'TowardHarm' : dividend > harm ? 'TowardDividend' : 'Neutral'
  const monitored = signals.filter((s) => s.provenance.coverage === 'Monitored').length
  const band: 'High' | 'Medium' | 'Low' = monitored > signals.length / 2 ? 'Medium' : 'Low'
  return {
    overallDirection,
    leadTimeMonths: 0,
    confidence: {
      band,
      note: `Aggregated from ${signals.length} country reads (${harm} harm / ${dividend} dividend); ${monitored} fully covered. Real World Bank data; lead-time not derivable, direction is an illustrative heuristic.`,
    },
    countrySignals: signals,
  }
}

// ---------------------------------------------------------------------------
// Interceptors — the modelled source op plus the same three early-warning
// operation ids as the mock layer; only one layer is registered at a time
// (selected in Session.ts).
// ---------------------------------------------------------------------------

const ALL_ISO3 = COUNTRY_TABLE.map((r) => r.iso3)

export function registerEarlyWarningRealApi(builder: TransportSessionBuilder): void {
  builder
    // The modelled outbound source call. The derived handlers below reach it
    // through the engine, so it shows up in the console inspector on every load.
    .intercept(
      new GetWorldBankIndicator().handle(async (input) => {
        try {
          return Result.ok(await fetchWorldBankIndicator(input.indicatorCode, input.countryIso3Codes))
        } catch (e) {
          return Result.internalServerError<WorldBankIndicatorReading[]>(
            'SourceData.WorldBank.SourceUnavailable',
            `World Bank fetch failed: ${(e as Error).message}`,
            'Live data source is unavailable right now.',
          )
        }
      }),
    )
    .intercept(
      new GetRegionalOutlook().handle(async () => {
        try {
          const signals = await loadSignals(ALL_ISO3)
          return Result.ok(rollUpRegion(signals))
        } catch (e) {
          return Result.internalServerError<GetRegionalOutlookOutput>(
            'EarlyWarning.RegionalOutlook.SourceUnavailable',
            `World Bank fetch failed: ${(e as Error).message}`,
            'Live data source is unavailable right now.',
          )
        }
      }),
    )
    .intercept(
      new GetCountrySignal().handle(async (input) => {
        const code = input.countryCode?.toUpperCase()
        const row = COUNTRY_TABLE.find((r) => r.code === code)
        if (!row) {
          return Result.notFound<CountrySignal>(
            'EarlyWarning.CountrySignal.NotFound',
            `No country in the monitored region for code "${input.countryCode}".`,
            'That country is not in the monitored region.',
          )
        }
        try {
          const signals = await loadSignals([row.iso3])
          const signal = signals[0]
          if (!signal) {
            return Result.notFound<CountrySignal>(
              'EarlyWarning.CountrySignal.NoData',
              `World Bank returned no usable indicators for ${row.iso3}.`,
              'No live data is available for that country yet.',
            )
          }
          return Result.ok(signal)
        } catch (e) {
          return Result.internalServerError<CountrySignal>(
            'EarlyWarning.CountrySignal.SourceUnavailable',
            `World Bank fetch failed: ${(e as Error).message}`,
            'Live data source is unavailable right now.',
          )
        }
      }),
    )
    .intercept(
      new SearchAtRiskCountries().handle(async (input) => {
        try {
          const signals = await loadSignals(ALL_ISO3)
          const wanted = input.direction ?? 'TowardHarm'
          return Result.ok(signals.filter((s) => s.direction === wanted))
        } catch (e) {
          return Result.internalServerError<CountrySignal[]>(
            'EarlyWarning.AtRisk.SourceUnavailable',
            `World Bank fetch failed: ${(e as Error).message}`,
            'Live data source is unavailable right now.',
          )
        }
      }),
    )
}
