// ---------------------------------------------------------------------------
// Dev-server proxy for the climate pathway — NASA POWER monthly rainfall.
//
// NASA POWER (power.larc.nasa.gov) is free and key-free, but we still fetch it
// server-side to keep the browser off cross-origin calls and to cache the
// payload. We read PRECTOTCORR (corrected total precipitation) monthly at a
// single representative point per country — the same crude single-point proxy
// the multi-indicator backtest used (a known simplification) — and compute the
// rainfall-DEFICIT anomaly: how far BELOW its own trailing baseline recent
// rainfall sits. This is the climate input the composite signal combines.
//
// Dev-only prototype of the eventual backend ingestion; runs in the Vite dev
// server (see vite.config.ts). Mirrors the FEWS NET price proxy.
// ---------------------------------------------------------------------------

import { computeAnomaly, type MonthlyPoint } from './anomaly'

export type ClimateResult = {
  countryCode: string
  asOfMonth: string | null
  rainfallMm: number | null
  zScore: number // signed: > 0 = drier than baseline (deficit)
  sustainedAnomalyMonths: number
  monthsOfHistory: number
  error?: string
}

// Representative cropland / pastoral point per country for the rainfall proxy.
const POINTS: Record<string, { lon: number; lat: number }> = {
  UG: { lon: 32.5, lat: 0.6 },
  KE: { lon: 37.0, lat: -0.5 },
  TZ: { lon: 35.0, lat: -6.0 },
  RW: { lon: 30.0, lat: -1.9 },
  BI: { lon: 29.9, lat: -3.4 },
  ET: { lon: 38.7, lat: 9.0 },
  SS: { lon: 30.0, lat: 7.0 },
}

const POWER_BASE = 'https://power.larc.nasa.gov/api/temporal/monthly/point'

const cache = new Map<string, { at: number; result: ClimateResult }>()
const TTL_MS = 6 * 60 * 60 * 1000 // 6h

function empty(code: string, error: string): ClimateResult {
  return { countryCode: code, asOfMonth: null, rainfallMm: null, zScore: 0, sustainedAnomalyMonths: 0, monthsOfHistory: 0, error }
}

/** Parse the POWER monthly response: { "YYYYMM": value, ... } with a "13" annual key and -999 fills. */
function toSeries(parameter: Record<string, number>): MonthlyPoint[] {
  const out: MonthlyPoint[] = []
  for (const [key, value] of Object.entries(parameter)) {
    const mm = key.slice(4, 6)
    if (mm === '13') continue // annual mean, skip
    if (value == null || value <= -999) continue // fill value
    out.push({ month: `${key.slice(0, 4)}-${mm}`, value })
  }
  return out
}

export async function getClimate(countryCode: string): Promise<ClimateResult> {
  const code = countryCode.toUpperCase()
  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result

  const point = POINTS[code]
  if (!point) return empty(code, 'No representative point configured for country.')

  // NASA POWER monthly rejects a future / in-progress end year (422), so cap at
  // the last complete calendar year.
  const end = new Date().getFullYear() - 1
  const start = end - 14
  const url =
    `${POWER_BASE}?parameters=PRECTOTCORR&community=AG` +
    `&longitude=${point.lon}&latitude=${point.lat}&start=${start}&end=${end}&format=JSON`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 60_000)
    let json: { properties?: { parameter?: { PRECTOTCORR?: Record<string, number> } } }
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`NASA POWER responded ${res.status}`)
      json = await res.json()
    } finally {
      clearTimeout(timer)
    }
    const param = json.properties?.parameter?.PRECTOTCORR
    if (!param) return empty(code, 'NASA POWER returned no PRECTOTCORR series.')

    const series = toSeries(param)
    const m = computeAnomaly(series, -1) // deficit: a LOW value is the anomaly
    const result: ClimateResult = {
      countryCode: code,
      asOfMonth: m.asOfMonth,
      rainfallMm: m.latest,
      zScore: m.zScore,
      sustainedAnomalyMonths: m.sustainedAnomalyMonths,
      monthsOfHistory: m.monthsOfHistory,
    }
    cache.set(code, { at: Date.now(), result })
    return result
  } catch (e) {
    return empty(code, (e as Error).message)
  }
}
