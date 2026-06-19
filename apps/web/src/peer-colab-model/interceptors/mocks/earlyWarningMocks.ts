import { Result, TransportSessionBuilder } from '@peercolab/engine'
import {
  GetRegionalOutlooks,
  GetCountrySignal,
  SearchAtRiskCountries,
} from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type {
  Country,
  Pathway,
  Provenance,
  PathwayContribution,
  CountrySignal,
  Region,
  RegionalOutlook,
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
  // East Africa (our working set)
  UG: c('co-ug', 'UG', 'Uganda'),
  KE: c('co-ke', 'KE', 'Kenya'),
  TZ: c('co-tz', 'TZ', 'Tanzania'),
  RW: c('co-rw', 'RW', 'Rwanda'),
  BI: c('co-bi', 'BI', 'Burundi'),
  ET: c('co-et', 'ET', 'Ethiopia'),
  SS: c('co-ss', 'SS', 'South Sudan'),
  // North Africa (the comparison bloc)
  EG: c('co-eg', 'EG', 'Egypt'),
  SD: c('co-sd', 'SD', 'Sudan'),
  MA: c('co-ma', 'MA', 'Morocco'),
  DZ: c('co-dz', 'DZ', 'Algeria'),
  TN: c('co-tn', 'TN', 'Tunisia'),
  LY: c('co-ly', 'LY', 'Libya'),
  // West Africa (third bloc)
  NG: c('co-ng', 'NG', 'Nigeria'),
  GH: c('co-gh', 'GH', 'Ghana'),
  SN: c('co-sn', 'SN', 'Senegal'),
  CI: c('co-ci', 'CI', "Côte d'Ivoire"),
  ML: c('co-ml', 'ML', 'Mali'),
  NE: c('co-ne', 'NE', 'Niger'),
  // Central Africa
  CD: c('co-cd', 'CD', 'DR Congo'),
  CM: c('co-cm', 'CM', 'Cameroon'),
  TD: c('co-td', 'TD', 'Chad'),
  CF: c('co-cf', 'CF', 'Central African Republic'),
  CG: c('co-cg', 'CG', 'Republic of Congo'),
  GA: c('co-ga', 'GA', 'Gabon'),
  // Southern Africa
  ZA: c('co-za', 'ZA', 'South Africa'),
  ZM: c('co-zm', 'ZM', 'Zambia'),
  ZW: c('co-zw', 'ZW', 'Zimbabwe'),
  MZ: c('co-mz', 'MZ', 'Mozambique'),
  MW: c('co-mw', 'MW', 'Malawi'),
  BW: c('co-bw', 'BW', 'Botswana'),
} satisfies Record<string, Country>

const regions = {
  EA: { code: 'EA', name: 'East Africa' },
  NA: { code: 'NA', name: 'North Africa' },
  WA: { code: 'WA', name: 'West Africa' },
  CA: { code: 'CA', name: 'Central Africa' },
  SA: { code: 'SA', name: 'Southern Africa' },
} satisfies Record<string, Region>

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
const eastAfricaSignals: CountrySignal[] = [
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

// North Africa — the comparison bloc. The dominant harm pathway here is
// import-dependence: these economies import most of their staple grain, so a
// currency slide or world-price spike feeds straight into food inflation —
// distinct from East Africa's conflict-and-climate driven mix. The same
// coverage-honesty spread applies (Egypt well monitored; Libya has no usable
// open data).
const northAfricaSignals: CountrySignal[] = [
  {
    id: 'sig-eg', country: countries.EG, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 6,
    confidence: { band: 'High', note: 'Heavy wheat-import exposure; currency devaluation feeds food inflation with a clear lag.' },
    asOf: new Date('2026-05-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Observed', 'Strong World Bank price and trade coverage; import-dependence is directly observed.'),
    contributions: [con(pathways.foodPriceStunting, 2.0, 1), con(pathways.urbanFoodDemand, 1.3, 1), con(pathways.rainfallDeficit, 0.4, 0.5)],
  },
  {
    id: 'sig-sd', country: countries.SD, direction: 'TowardHarm',
    dominantPathway: pathways.displacementInsecurity, leadTimeMonths: 3,
    confidence: { band: 'Low', note: 'Conflict-driven displacement; data sparse and intermittent — high false-alarm risk.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('AcledConflict', 'Limited', 'Observed', 'Conflict-event coverage exists but price series are patchy and lagged.'),
    contributions: [con(pathways.displacementInsecurity, 2.8, 1.5), con(pathways.foodPriceStunting, 1.5, 1), con(pathways.rainfallDeficit, 1.0, 0.5)],
  },
  {
    id: 'sig-ma', country: countries.MA, direction: 'TowardDividend',
    dominantPathway: pathways.labourGdp, leadTimeMonths: 8,
    confidence: { band: 'Medium', note: 'Industrial labour absorption (automotive, offshoring) lifting output; income series lag.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Modelled', 'GDP and labour series are modelled estimates, not directly observed.'),
    contributions: [con(pathways.labourGdp, 0.5, 1), con(pathways.youthIncome, 0.4, 1)],
  },
  {
    id: 'sig-dz', country: countries.DZ, direction: 'Neutral',
    dominantPathway: pathways.urbanFoodDemand, leadTimeMonths: 5,
    confidence: { band: 'Medium', note: 'Hydrocarbon revenue cushions subsidies for now; import reliance keeps the downside live.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('WorldBankOpenData', 'Limited', 'Modelled', 'Subsidy buffering makes the headline read noisy; coverage is partial.'),
    contributions: [con(pathways.urbanFoodDemand, 0.8, 1), con(pathways.foodPriceStunting, 0.6, 1)],
  },
  {
    id: 'sig-tn', country: countries.TN, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 4,
    confidence: { band: 'Medium', note: 'Fiscal stress straining food subsidies; price coverage decent but lagged.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('FewsNetPrices', 'Limited', 'Observed', 'Observed market prices, but reporting markets are few and several months behind.'),
    contributions: [con(pathways.foodPriceStunting, 1.7, 1), con(pathways.urbanFoodDemand, 0.9, 1)],
  },
  {
    id: 'sig-ly', country: countries.LY, direction: 'Neutral',
    dominantPathway: pathways.urbanFoodDemand, leadTimeMonths: 0,
    confidence: { band: 'Low', note: 'No usable open data source — direction shown is illustrative only.' },
    asOf: new Date('2026-01-01'),
    provenance: prov('None', 'NotMonitored', 'Modelled', 'No usable open data source for Libya — this country is not monitored.'),
    contributions: [],
  },
]

// West Africa — a two-pronged bloc. The coastal economies (Nigeria, Ghana) are
// driven by currency-devaluation food-price inflation; the Sahel interior (Mali,
// Niger) by conflict-driven displacement. Senegal and Côte d'Ivoire carry the
// dividend side (gas, cocoa, a young workforce being absorbed). Same coverage
// spread: Nigeria well covered, Niger has no usable open data.
const westAfricaSignals: CountrySignal[] = [
  {
    id: 'sig-ng', country: countries.NG, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 7,
    confidence: { band: 'High', note: 'Naira devaluation and fuel-subsidy removal feeding sharp staple-price inflation.' },
    asOf: new Date('2026-05-01'),
    provenance: prov('FewsNetPrices', 'Monitored', 'Observed', 'Multiple reporting markets; price inflation is directly observed.'),
    contributions: [con(pathways.foodPriceStunting, 2.3, 1), con(pathways.urbanFoodDemand, 1.4, 1), con(pathways.displacementInsecurity, 0.8, 0.5)],
  },
  {
    id: 'sig-gh', country: countries.GH, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 5,
    confidence: { band: 'Medium', note: 'Cedi depreciation and debt restructuring keep food inflation elevated; coverage decent.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Observed', 'Good World Bank price and trade coverage; recent but partial.'),
    contributions: [con(pathways.foodPriceStunting, 1.8, 1), con(pathways.urbanFoodDemand, 1.1, 1)],
  },
  {
    id: 'sig-sn', country: countries.SN, direction: 'TowardDividend',
    dominantPathway: pathways.youthIncome, leadTimeMonths: 8,
    confidence: { band: 'Medium', note: 'New gas revenue and a young workforce lifting incomes; income series lag.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Modelled', 'Income and labour figures are modelled estimates, not directly observed.'),
    contributions: [con(pathways.youthIncome, 0.5, 1), con(pathways.labourGdp, 0.4, 1)],
  },
  {
    id: 'sig-ci', country: countries.CI, direction: 'TowardDividend',
    dominantPathway: pathways.labourGdp, leadTimeMonths: 7,
    confidence: { band: 'Medium', note: 'Cocoa-led growth and urbanisation absorbing labour; data sparser than coastal peers.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('WorldBankOpenData', 'Limited', 'Modelled', 'Indicators present but infrequent; the dividend read is partial.'),
    contributions: [con(pathways.labourGdp, 0.6, 1), con(pathways.youthIncome, 0.4, 1)],
  },
  {
    id: 'sig-ml', country: countries.ML, direction: 'TowardHarm',
    dominantPathway: pathways.displacementInsecurity, leadTimeMonths: 3,
    confidence: { band: 'Low', note: 'Sahel insurgency displacing farmers; data sparse and intermittent — high false-alarm risk.' },
    asOf: new Date('2026-02-01'),
    provenance: prov('AcledConflict', 'Limited', 'Observed', 'Conflict-event coverage exists; price series are patchy and lagged.'),
    contributions: [con(pathways.displacementInsecurity, 2.5, 1.5), con(pathways.rainfallDeficit, 1.3, 1), con(pathways.foodPriceStunting, 1.0, 0.5)],
  },
  {
    id: 'sig-ne', country: countries.NE, direction: 'Neutral',
    dominantPathway: pathways.rainfallDeficit, leadTimeMonths: 0,
    confidence: { band: 'Low', note: 'No usable open data source — direction shown is illustrative only.' },
    asOf: new Date('2026-01-01'),
    provenance: prov('None', 'NotMonitored', 'Modelled', 'No usable open data source for Niger — this country is not monitored.'),
    contributions: [],
  },
]

// Central Africa — the conflict-and-displacement bloc and the thinnest data
// coverage of the five. Chronic insecurity (DR Congo's east, CAR, the Lake Chad
// basin) drives the harm; Gabon's small high-income, oil-backed economy is the
// lone dividend read. Several countries have no usable open data at all.
const centralAfricaSignals: CountrySignal[] = [
  {
    id: 'sig-cd', country: countries.CD, direction: 'TowardHarm',
    dominantPathway: pathways.displacementInsecurity, leadTimeMonths: 4,
    confidence: { band: 'Low', note: 'Eastern conflict displacing millions; data sparse and intermittent — high false-alarm risk.' },
    asOf: new Date('2026-02-01'),
    provenance: prov('AcledConflict', 'Limited', 'Observed', 'Conflict-event coverage exists; price and nutrition series are patchy.'),
    contributions: [con(pathways.displacementInsecurity, 2.7, 1.5), con(pathways.foodPriceStunting, 1.2, 1), con(pathways.rainfallDeficit, 0.7, 0.5)],
  },
  {
    id: 'sig-cm', country: countries.CM, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 5,
    confidence: { band: 'Medium', note: 'Anglophone crisis plus food-price pressure; coverage partial and lagged.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('FewsNetPrices', 'Limited', 'Observed', 'Some reporting markets; prices observed but several months behind.'),
    contributions: [con(pathways.foodPriceStunting, 1.6, 1), con(pathways.displacementInsecurity, 1.3, 1)],
  },
  {
    id: 'sig-td', country: countries.TD, direction: 'TowardHarm',
    dominantPathway: pathways.rainfallDeficit, leadTimeMonths: 4,
    confidence: { band: 'Low', note: 'Sahel drought and Lake Chad refugee load; very thin data.' },
    asOf: new Date('2026-02-01'),
    provenance: prov('FewsNetPrices', 'Limited', 'Observed', 'Sparse, intermittent reporting; expect a high triage load.'),
    contributions: [con(pathways.rainfallDeficit, 1.9, 1), con(pathways.displacementInsecurity, 1.5, 1), con(pathways.foodPriceStunting, 1.0, 0.5)],
  },
  {
    id: 'sig-cf', country: countries.CF, direction: 'TowardHarm',
    dominantPathway: pathways.displacementInsecurity, leadTimeMonths: 0,
    confidence: { band: 'Low', note: 'No usable open data source — direction is illustrative only.' },
    asOf: new Date('2025-12-01'),
    provenance: prov('None', 'NotMonitored', 'Modelled', 'No usable open data source for the Central African Republic — not monitored.'),
    contributions: [],
  },
  {
    id: 'sig-cg', country: countries.CG, direction: 'Neutral',
    dominantPathway: pathways.urbanFoodDemand, leadTimeMonths: 5,
    confidence: { band: 'Medium', note: 'Oil revenue cushions the headline; food-import reliance keeps the downside live.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('WorldBankOpenData', 'Limited', 'Modelled', 'Partial coverage; the read is noisy under subsidy buffering.'),
    contributions: [con(pathways.urbanFoodDemand, 0.7, 1), con(pathways.foodPriceStunting, 0.5, 1)],
  },
  {
    id: 'sig-ga', country: countries.GA, direction: 'TowardDividend',
    dominantPathway: pathways.labourGdp, leadTimeMonths: 7,
    confidence: { band: 'Medium', note: 'Small high-income oil economy absorbing labour; income series lag.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Modelled', 'GDP and labour figures are modelled estimates, not directly observed.'),
    contributions: [con(pathways.labourGdp, 0.5, 1), con(pathways.youthIncome, 0.3, 1)],
  },
]

// Southern Africa — the climate-and-drought bloc. The 2024-25 El Niño drought
// pushed Zambia, Zimbabwe and Malawi into food emergencies, so rainfall deficit
// is the dominant harm pathway here. South Africa's large, well-measured economy
// reads neutral and Botswana carries a steady dividend; coverage is the best of
// the five blocs.
const southernAfricaSignals: CountrySignal[] = [
  {
    id: 'sig-za', country: countries.ZA, direction: 'Neutral',
    dominantPathway: pathways.urbanFoodDemand, leadTimeMonths: 6,
    confidence: { band: 'High', note: 'Large, well-measured economy; high unemployment offset by stable food supply.' },
    asOf: new Date('2026-05-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Observed', 'Strong, directly-observed statistical coverage.'),
    contributions: [con(pathways.urbanFoodDemand, 0.8, 1), con(pathways.labourGdp, 0.6, 1)],
  },
  {
    id: 'sig-zm', country: countries.ZM, direction: 'TowardHarm',
    dominantPathway: pathways.rainfallDeficit, leadTimeMonths: 6,
    confidence: { band: 'Medium', note: 'El Niño drought cut the maize harvest; a national disaster was declared.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('FewsNetPrices', 'Monitored', 'Observed', 'Observed market prices and crop assessments; good coverage.'),
    contributions: [con(pathways.rainfallDeficit, 2.4, 1), con(pathways.foodPriceStunting, 1.5, 1)],
  },
  {
    id: 'sig-zw', country: countries.ZW, direction: 'TowardHarm',
    dominantPathway: pathways.foodPriceStunting, leadTimeMonths: 4,
    confidence: { band: 'Low', note: 'Currency instability and drought compound food inflation; data quality patchy.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('FewsNetPrices', 'Limited', 'Observed', 'Prices observed but currency distortions make them noisy.'),
    contributions: [con(pathways.foodPriceStunting, 1.9, 1), con(pathways.rainfallDeficit, 1.6, 1)],
  },
  {
    id: 'sig-mz', country: countries.MZ, direction: 'TowardHarm',
    dominantPathway: pathways.displacementInsecurity, leadTimeMonths: 4,
    confidence: { band: 'Medium', note: 'Cabo Delgado insurgency plus recurrent cyclones; coverage partial.' },
    asOf: new Date('2026-03-01'),
    provenance: prov('AcledConflict', 'Limited', 'Observed', 'Conflict and disaster coverage exists; price series lag.'),
    contributions: [con(pathways.displacementInsecurity, 1.8, 1.5), con(pathways.rainfallDeficit, 1.4, 1), con(pathways.foodPriceStunting, 1.0, 0.5)],
  },
  {
    id: 'sig-mw', country: countries.MW, direction: 'TowardHarm',
    dominantPathway: pathways.rainfallDeficit, leadTimeMonths: 5,
    confidence: { band: 'Medium', note: 'Drought-driven maize shortfall; thin fiscal buffers raise the stakes.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('FewsNetPrices', 'Monitored', 'Observed', 'Regular FEWS NET reporting; recent and observed.'),
    contributions: [con(pathways.rainfallDeficit, 2.1, 1), con(pathways.foodPriceStunting, 1.3, 1)],
  },
  {
    id: 'sig-bw', country: countries.BW, direction: 'TowardDividend',
    dominantPathway: pathways.labourGdp, leadTimeMonths: 8,
    confidence: { band: 'Medium', note: 'Stable, diamond-backed upper-middle-income economy absorbing labour.' },
    asOf: new Date('2026-04-01'),
    provenance: prov('WorldBankOpenData', 'Monitored', 'Modelled', 'Good coverage; income figures are modelled estimates.'),
    contributions: [con(pathways.labourGdp, 0.5, 1), con(pathways.youthIncome, 0.4, 1)],
  },
]

// The two handlers that look up or filter individual countries work across the
// whole monitored footprint, all five regions.
const allSignals: CountrySignal[] = [
  ...eastAfricaSignals,
  ...northAfricaSignals,
  ...westAfricaSignals,
  ...centralAfricaSignals,
  ...southernAfricaSignals,
]

// ---------------------------------------------------------------------------
// Interceptors — one exact handler per operation. The UI calls these through
// the real engine; from its perspective there is no difference from a backend.
// ---------------------------------------------------------------------------

export function registerEarlyWarningMocks(builder: TransportSessionBuilder): void {
  builder
    .intercept(
      new GetRegionalOutlooks().handle(async () => {
        const outlooks: RegionalOutlook[] = [
          {
            region: regions.EA,
            // Mixed region: dividend in the south-west, harm in the conflict-affected north-east.
            overallDirection: 'Neutral',
            leadTimeMonths: 5,
            confidence: {
              band: 'Medium',
              note: 'Region-wide read averages high-confidence dividend signals against lower-confidence harm signals.',
            },
            countrySignals: eastAfricaSignals,
          },
          {
            region: regions.NA,
            // Import-dependent economies: staple-grain import exposure tips the bloc toward harm.
            overallDirection: 'TowardHarm',
            leadTimeMonths: 6,
            confidence: {
              band: 'Medium',
              note: 'Harm is import-price driven here, not conflict-and-climate as in East Africa; Egypt and Tunisia anchor the read, Libya is unmonitored.',
            },
            countrySignals: northAfricaSignals,
          },
          {
            region: regions.WA,
            // Two-pronged: coastal currency-driven food inflation + Sahel conflict displacement.
            overallDirection: 'TowardHarm',
            leadTimeMonths: 7,
            confidence: {
              band: 'Medium',
              note: 'Harm runs on two tracks — coastal currency-driven food inflation (Nigeria, Ghana) and Sahel conflict displacement (Mali); Senegal and Côte d\'Ivoire carry the dividend side, Niger is unmonitored.',
            },
            countrySignals: westAfricaSignals,
          },
          {
            region: regions.CA,
            // Conflict-and-displacement dominated; the thinnest data coverage of the five.
            overallDirection: 'TowardHarm',
            leadTimeMonths: 4,
            confidence: {
              band: 'Low',
              note: 'Conflict and displacement drive the harm (DR Congo, CAR, the Lake Chad basin) on the weakest data of any bloc; Gabon is the lone dividend read, the CAR is unmonitored.',
            },
            countrySignals: centralAfricaSignals,
          },
          {
            region: regions.SA,
            // Climate-and-drought dominated; the best data coverage of the five.
            overallDirection: 'TowardHarm',
            leadTimeMonths: 6,
            confidence: {
              band: 'Medium',
              note: 'Harm is climate-driven here — the El Niño drought hit Zambia, Zimbabwe and Malawi; South Africa reads neutral and Botswana carries a dividend, on the best coverage of the five blocs.',
            },
            countrySignals: southernAfricaSignals,
          },
        ]
        return Result.ok(outlooks)
      }),
    )
    .intercept(
      new GetCountrySignal().handle(async (input) => {
        const code = input.countryCode?.toUpperCase()
        const signal = allSignals.find((s) => s.country.code === code)
        if (!signal) {
          return Result.notFound<CountrySignal>(
            'EarlyWarning.CountrySignal.NotFound',
            `No early-warning signal for country code "${input.countryCode}".`,
            'That country is not in the monitored footprint.',
          )
        }
        return Result.ok(signal)
      }),
    )
    .intercept(
      new SearchAtRiskCountries().handle(async (input) => {
        // Empty filter → the at-risk watchlist (countries tipping toward harm).
        // A direction filter narrows to countries tipping that way. Spans both regions.
        const wanted = input.direction ?? 'TowardHarm'
        const results = allSignals.filter((s) => s.direction === wanted)
        return Result.ok(results)
      }),
    )
}
