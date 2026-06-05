// Presentation helpers for the terminology codes the contract carries as strings.

export type DirectionTone = 'harm' | 'neutral' | 'dividend'

export function directionTone(direction: string): DirectionTone {
  if (direction === 'TowardHarm') return 'harm'
  if (direction === 'TowardDividend') return 'dividend'
  return 'neutral'
}

export function directionLabel(direction: string): string {
  switch (direction) {
    case 'TowardHarm':
      return 'Tipping toward harm'
    case 'TowardDividend':
      return 'Converting to dividend'
    case 'Neutral':
      return 'Neutral'
    default:
      return direction
  }
}

export function confidenceLabel(band: string): string {
  return `${band} confidence`
}

export function formatAsOf(asOf: Date | string): string {
  const d = typeof asOf === 'string' ? new Date(asOf) : asOf
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
}

// --- Provenance & honesty helpers -----------------------------------------
// A reading is "stale" once its as-of date is older than this many months. The
// UI must visually distinguish stale readings so a confident-looking signal is
// never mistaken for a current one.
export const STALE_MONTHS = 3

export function isStale(asOf: Date | string): boolean {
  const d = typeof asOf === 'string' ? new Date(asOf) : asOf
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - STALE_MONTHS)
  return d < cutoff
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'WorldBankOpenData':
      return 'World Bank'
    case 'FewsNetPrices':
      return 'FEWS NET'
    case 'HungerMap':
      return 'HungerMap'
    case 'Mock':
      return 'Mock data'
    case 'None':
      return 'No source'
    default:
      return source
  }
}

export type CoverageState = 'monitored' | 'limited' | 'unmonitored'

export function coverageState(coverage: string): CoverageState {
  if (coverage === 'Monitored') return 'monitored'
  if (coverage === 'NotMonitored') return 'unmonitored'
  return 'limited'
}

export function coverageLabel(coverage: string): string {
  switch (coverage) {
    case 'Monitored':
      return 'Monitored'
    case 'Limited':
      return 'Limited data'
    case 'NotMonitored':
      return 'Not monitored'
    default:
      return coverage
  }
}

export function isModelled(basis: string): boolean {
  return basis === 'Modelled'
}

// Short pathway labels for the composite breakdown chips (the full pathway names
// are too long for inline use).
export function pathwayShort(p: { id: string; name: string }): string {
  switch (p.id) {
    case 'pw-food-stunting':
      return 'Price'
    case 'pw-displacement':
      return 'Conflict'
    case 'pw-rainfall':
      return 'Climate'
    case 'pw-urban-demand':
      return 'Demand'
    case 'pw-labour-gdp':
      return 'Labour'
    case 'pw-youth-income':
      return 'Income'
    default:
      return p.name
  }
}

export function basisLabel(basis: string): string {
  return basis === 'Modelled' ? 'Modelled' : 'Observed'
}

// The upside gap: no demographic-dividend data source exists yet (all our
// sources are harm-side — price, conflict, climate). So any TowardDividend read
// is an inference the data cannot evidence; the UI must mark it, never present
// it as a confident win.
export function upsideUnevidenced(direction: string): boolean {
  return direction === 'TowardDividend'
}

// Honest lead-time text: framed as observed-not-guaranteed, n/a where the data
// can't support a real lead (uncovered countries, or dividend reads).
export function leadTimeText(signal: {
  leadTimeMonths: number
  direction: string
  provenance: { coverage: string }
}): string {
  if (upsideUnevidenced(signal.direction)) return 'n/a — upside not yet monitored'
  if (coverageState(signal.provenance.coverage) === 'unmonitored') return 'n/a — not monitored'
  if (!signal.leadTimeMonths) return 'n/a'
  return `~${signal.leadTimeMonths}-month lead (observed, not guaranteed)`
}
