import { Result, TransportSessionBuilder } from '@peercolab/engine'
import {
  GetFewsNetPriceLeadTime,
  GetAcledConflictSignal,
  GetNasaPowerClimateSignal,
} from '@gen/Main/Model/1_0/SourceData/PathItems'
import type {
  FewsNetPriceSignal,
  AcledConflictSignal,
  NasaPowerClimateSignal,
} from '@gen/Main/Model/1_0/SourceData/PathItems'

// ---------------------------------------------------------------------------
// Shared implementations of the three modelled pathway source operations.
//
// Each fetches its dev-server proxy (see server/*.ts + vite.config.ts) and maps
// the proxy result onto the modelled SourceData type. A proxy error or missing
// credentials becomes an empty reading (no `latest`, zero history) rather than a
// thrown error, so the consuming signal can render the pathway as unmonitored
// honestly. Both the lead-time (price-only) layer and the composite layer
// register these from here, so there is one source-of-truth per source.
// ---------------------------------------------------------------------------

// --- Price: FEWS NET monthly prices ----------------------------------------
type LeadTimeResult = {
  countryCode: string
  product: string
  asOfMonth: string | null
  latest: number | null
  zScore: number
  mom3: number | null
  mom12: number | null
  sustainedAnomalyMonths: number
  marketsReporting: number
  monthsOfHistory: number
  error?: string
}

export async function fetchPriceSignal(code: string): Promise<FewsNetPriceSignal> {
  const r = await probe<LeadTimeResult>('/__probe/leadtime', code, {
    countryCode: code, product: '', asOfMonth: null, latest: null, zScore: 0,
    mom3: null, mom12: null, sustainedAnomalyMonths: 0, marketsReporting: 0, monthsOfHistory: 0,
  })
  return {
    countryCode: r.countryCode,
    product: r.product || 'maize retail',
    asOfMonth: r.asOfMonth ?? undefined,
    latest: r.latest ?? undefined,
    zScore: r.zScore,
    mom3: r.mom3 ?? undefined,
    mom12: r.mom12 ?? undefined,
    sustainedAnomalyMonths: r.sustainedAnomalyMonths,
    marketsReporting: r.marketsReporting,
    monthsOfHistory: r.monthsOfHistory,
  }
}

// --- Conflict: ACLED events -------------------------------------------------
type ConflictResult = {
  countryCode: string
  asOfMonth: string | null
  fatalities: number | null
  events: number
  zScore: number
  sustainedAnomalyMonths: number
  monthsOfHistory: number
  error?: string
}

export async function fetchConflictSignal(code: string): Promise<AcledConflictSignal> {
  const r = await probe<ConflictResult>('/__probe/conflict', code, {
    countryCode: code, asOfMonth: null, fatalities: null, events: 0, zScore: 0, sustainedAnomalyMonths: 0, monthsOfHistory: 0,
  })
  return {
    countryCode: r.countryCode,
    asOfMonth: r.asOfMonth ?? undefined,
    fatalities: r.fatalities ?? undefined,
    events: r.events,
    zScore: r.zScore,
    sustainedAnomalyMonths: r.sustainedAnomalyMonths,
    monthsOfHistory: r.monthsOfHistory,
  }
}

// --- Climate: NASA POWER rainfall ------------------------------------------
type ClimateResult = {
  countryCode: string
  asOfMonth: string | null
  rainfallMm: number | null
  zScore: number
  sustainedAnomalyMonths: number
  monthsOfHistory: number
  error?: string
}

export async function fetchClimateSignal(code: string): Promise<NasaPowerClimateSignal> {
  const r = await probe<ClimateResult>('/__probe/climate', code, {
    countryCode: code, asOfMonth: null, rainfallMm: null, zScore: 0, sustainedAnomalyMonths: 0, monthsOfHistory: 0,
  })
  return {
    countryCode: r.countryCode,
    asOfMonth: r.asOfMonth ?? undefined,
    rainfallMm: r.rainfallMm ?? undefined,
    zScore: r.zScore,
    sustainedAnomalyMonths: r.sustainedAnomalyMonths,
    monthsOfHistory: r.monthsOfHistory,
  }
}

// Fetch a dev proxy, falling back to an empty reading on any failure.
async function probe<T>(base: string, code: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${base}?country=${encodeURIComponent(code)}`)
    if (!res.ok) throw new Error(`${base} responded ${res.status}`)
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

// --- Registration -----------------------------------------------------------
// Register each modelled source op against its fetcher. Layers pick the ops
// they compose; only one layer is registered per session so ids never collide.

export function registerPriceOp(builder: TransportSessionBuilder): TransportSessionBuilder {
  return builder.intercept(
    new GetFewsNetPriceLeadTime().handle(async (input) => Result.ok(await fetchPriceSignal(input.countryCode.toUpperCase()))),
  )
}

export function registerConflictOp(builder: TransportSessionBuilder): TransportSessionBuilder {
  return builder.intercept(
    new GetAcledConflictSignal().handle(async (input) => Result.ok(await fetchConflictSignal(input.countryCode.toUpperCase()))),
  )
}

export function registerClimateOp(builder: TransportSessionBuilder): TransportSessionBuilder {
  return builder.intercept(
    new GetNasaPowerClimateSignal().handle(async (input) => Result.ok(await fetchClimateSignal(input.countryCode.toUpperCase()))),
  )
}
