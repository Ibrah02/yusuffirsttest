import { Result, TransportSessionBuilder } from '@peercolab/engine'
import {
  GetRegionalOutlook,
  GetCountrySignal,
  SearchAtRiskCountries,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type {
  Country,
  Pathway,
  Provenance,
  PathwayContribution,
  CountrySignal,
  GetRegionalOutlookOutput,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'

// ---------------------------------------------------------------------------
// In-memory mock "DB" — the single source the three handlers read from.
// These permanent mocks let the UI run in dev / test / QA with no backend.
// ---------------------------------------------------------------------------

const pathways = {
  foodPriceStunting: {
    id: 'pw-food-stunting',
    name: 'Food-price inflation → child stunting',
    description: 'Rising staple prices cut household calories; stunting and lost schooling follow with a lag.',
    polarity: 'Harm',
  },
  displacementInsecurity: {
    id: 'pw-displacement',
    name: 'Displacement → food insecurity',
    description: 'Conflict-driven displacement collapses local food systems faster than prices alone.',
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
  youthIncome: {
    id: 'pw-youth-income',
    name: 'Youth workforce → income growth',
    description: 'A young workforce entering income-generating activity raises household incomes.',
    polarity: 'Dividend',
  },
  rainfallDeficit: {
    id: 'pw-rainfall',
    name: 'Rainfall deficit → crop failure',
    description: 'A sustained rainfall deficit cuts harvests and pasture, feeding hunger one season on.',
    polarity: 'Harm',
  },
} satisfies Record<string, Pathway>

const c = (id: string, code: string, name: string): Country => ({ id, code, name })

const countries = {
  UG: c('co-ug', 'UG', 'Uganda'),
  KE: c('co-ke', 'KE', 'Kenya'),
  TZ: c('co-tz', 'TZ', 'Tanzania'),
  RW: c('co-rw', 'RW', 'Rwanda'),
  BI: c('co-bi', 'BI', 'Burundi'),
  ET: c('co-et', 'ET', 'Ethiopia'),
  SS: c('co-ss', 'SS', 'South Sudan'),
} satisfies Record<string, Country>

const prov = (
  source: Provenance['source'],
  coverage: Provenance['coverage'],
  basis: Provenance['basis'],
  note: string,
): Provenance => ({ source, coverage, basis, note })

const con = (pathway: Pathway, zScore: number, weight: number): PathwayContribution => ({
  pathway,
  zScore,
  weight,
  fired: zScore > 1,
})

// A spread of directions, confidence bands AND provenance so every honesty UI
// state is exercisable from the default layer: Monitored vs Limited vs
// NotMonitored coverage, fresh vs stale `asOf`, and Observed vs Modelled basis.
// The coverage spread mirrors the research: reliable monitoring is feasible for
// Kenya, Ethiopia and South Sudan; Rwanda and Burundi are too sparse; Tanzania
// has no usable open data; Uganda's price series ends in 2015 (stale).
const signals: CountrySignal[] = [
  {
    id: 'sig-ug', country: countries.UG, direction: 'TowardDividend',
    dominantPathway: pathways.labourGdp, leadTimeMonths: 9,
    confidence: { band: 'High', note: 'Consistent labour-absorption and GDP series — but the latest usable data is from 2015.' },
    asOf: new Date('2015-12-01'),
    provenance: prov('WorldBankOpenData', 'Limited', 'Modelled', 'Price and income series end 2015 — this dividend read rests on stale inputs.'),
    contributions: [con(pathways.labourGdp, 0.5, 1), con(pathways.rainfallDeficit, 0.6, 1)],
  },
  {
    id: 'sig-ke', country: countries.KE, direction: 'TowardDividend',
    dominantPathway: pathways.youthIncome, leadTimeMonths: 7,
    confidence: { band: 'Medium', note: 'Income series lags; urban/rural split adds noise.' },
    asOf: new Date('2026-05-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Modelled', 'Income figures are modelled (RTFP-style estimates), not directly observed.'),
    contributions: [con(pathways.youthIncome, 0.4, 1), con(pathways.foodPriceStunting, 0.7, 1), con(pathways.rainfallDeficit, 0.5, 1)],
  },
  {
    id: 'sig-tz', country: countries.TZ, direction: 'Neutral',
    dominantPathway: pathways.urbanFoodDemand, leadTimeMonths: 5,
    confidence: { band: 'Medium', note: 'No usable open data source — direction shown is illustrative only.' },
    asOf: new Date('2026-05-01'),
    provenance: prov('None', 'NotMonitored', 'Modelled', 'No usable open data source for Tanzania — this country is not monitored.'),
    contributions: [],
  },
  {
    id: 'sig-rw', country: countries.RW, direction: 'TowardDividend',
    dominantPathway: pathways.labourGdp, leadTimeMonths: 8,
    confidence: { band: 'Medium', note: 'National statistics exist but are too sparse for a confident read.' },
    asOf: new Date('2026-02-01'),
    provenance: prov('WorldBankOpenData', 'Limited', 'Observed', 'Indicators too sparse and infrequent for a confident read.'),
    contributions: [con(pathways.labourGdp, 0.6, 1)],
  },
  {
    id: 'sig-bi', country: countries.BI, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 4,
    confidence: { band: 'Medium', note: 'Stunting proxy reliable; price coverage patchy and lagged.' },
    asOf: new Date('2025-11-01'),
    provenance: prov('FewsNetPrices', 'Limited', 'Observed', 'Patchy price coverage; latest data is several months old.'),
    contributions: [con(pathways.foodPriceStunting, 1.6, 1), con(pathways.rainfallDeficit, 1.2, 0.5), con(pathways.displacementInsecurity, 0.7, 1)],
  },
  {
    id: 'sig-et', country: countries.ET, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 6,
    confidence: { band: 'High', note: 'Multiple corroborating price and nutrition series.' },
    asOf: new Date('2026-05-01'),
    provenance: prov('FewsNetPrices', 'Monitored', 'Observed', 'Directly observed FEWS NET market prices, multiple markets reporting.'),
    contributions: [con(pathways.foodPriceStunting, 2.1, 1), con(pathways.rainfallDeficit, 1.4, 1), con(pathways.displacementInsecurity, 0.3, 1)],
  },
  {
    id: 'sig-ss', country: countries.SS, direction: 'TowardHarm',
    dominantPathway: pathways.displacementInsecurity, leadTimeMonths: 3,
    confidence: { band: 'Low', note: 'Sparse, intermittent data; high false-alarm risk — review before acting.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('FewsNetPrices', 'Monitored', 'Observed', 'Monitorable but sparse and intermittent; expect a higher triage load.'),
    contributions: [con(pathways.displacementInsecurity, 2.6, 1.5), con(pathways.foodPriceStunting, 1.3, 0.5), con(pathways.rainfallDeficit, 0.9, 1)],
  },
]

// ---------------------------------------------------------------------------
// Interceptors — one exact handler per operation. The UI calls these through
// the real engine; from its perspective there is no difference from a backend.
// ---------------------------------------------------------------------------

export function registerEarlyWarningMocks(builder: TransportSessionBuilder): void {
  builder
    .intercept(
      new GetRegionalOutlook().handle(async () => {
        const outlook: GetRegionalOutlookOutput = {
          // Mixed region: dividend in the south-west, harm in the conflict-affected north-east.
          overallDirection: 'Neutral',
          leadTimeMonths: 5,
          confidence: {
            band: 'Medium',
            note: 'Region-wide read averages high-confidence dividend signals against lower-confidence harm signals.',
          },
          countrySignals: signals,
        }
        return Result.ok(outlook)
      }),
    )
    .intercept(
      new GetCountrySignal().handle(async (input) => {
        const code = input.countryCode?.toUpperCase()
        const signal = signals.find((s) => s.country.code === code)
        if (!signal) {
          return Result.notFound<CountrySignal>(
            'EarlyWarning.CountrySignal.NotFound',
            `No early-warning signal for country code "${input.countryCode}".`,
            'That country is not in the monitored region.',
          )
        }
        return Result.ok(signal)
      }),
    )
    .intercept(
      new SearchAtRiskCountries().handle(async (input) => {
        // Empty filter → the at-risk watchlist (countries tipping toward harm).
        // A direction filter narrows to countries tipping that way.
        const wanted = input.direction ?? 'TowardHarm'
        const results = signals.filter((s) => s.direction === wanted)
        return Result.ok(results)
      }),
    )
}
