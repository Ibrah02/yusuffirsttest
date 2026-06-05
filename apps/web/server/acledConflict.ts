// ---------------------------------------------------------------------------
// Dev-server proxy for the conflict pathway — ACLED event data.
//
// ACLED (api.acleddata.com) is the production-grade open conflict source the
// feasibility research recommended: REST, free key registration, all seven
// countries from 1997 (South Sudan from 2011). It is KEY-GATED and sends no
// browser CORS header, so — like FEWS NET — it must run server-side. We read
// monthly fatalities per country and compute the violence anomaly: how far
// recent monthly fatalities sit above the country's own trailing baseline.
//
// Honest degradation: ACLED needs credentials. When ACLED_KEY / ACLED_EMAIL are
// not set in the dev environment, this returns an empty reading with a clear
// note rather than fabricating conflict data — the UI then shows the conflict
// pathway as unmonitored for that run, which is the truthful state.
//
// Dev-only prototype of the eventual backend ingestion; runs in the Vite dev
// server (see vite.config.ts).
// ---------------------------------------------------------------------------

import { computeAnomaly, type MonthlyPoint } from './anomaly'

export type ConflictResult = {
  countryCode: string
  asOfMonth: string | null
  fatalities: number | null // latest month
  events: number // latest month
  zScore: number // signed: > 0 = bloodier than baseline
  sustainedAnomalyMonths: number
  monthsOfHistory: number
  error?: string
}

// ACLED keys countries by name, not ISO code.
const ACLED_COUNTRY: Record<string, string> = {
  UG: 'Uganda',
  KE: 'Kenya',
  TZ: 'Tanzania',
  RW: 'Rwanda',
  BI: 'Burundi',
  ET: 'Ethiopia',
  SS: 'South Sudan',
}

const ACLED_BASE = 'https://api.acleddata.com/acled/read'

const cache = new Map<string, { at: number; result: ConflictResult }>()
const TTL_MS = 6 * 60 * 60 * 1000 // 6h

function empty(code: string, error: string): ConflictResult {
  return { countryCode: code, asOfMonth: null, fatalities: null, events: 0, zScore: 0, sustainedAnomalyMonths: 0, monthsOfHistory: 0, error }
}

type AcledRow = { event_date?: string; fatalities?: number | string }

/** Aggregate ACLED events into a monthly fatalities series + latest-month event count. */
function aggregate(rows: AcledRow[]): { series: MonthlyPoint[]; eventsByMonth: Map<string, number> } {
  const fatalByMonth = new Map<string, number>()
  const eventsByMonth = new Map<string, number>()
  for (const r of rows) {
    const month = (r.event_date || '').slice(0, 7)
    if (!month) continue
    const f = typeof r.fatalities === 'string' ? Number(r.fatalities) : r.fatalities ?? 0
    fatalByMonth.set(month, (fatalByMonth.get(month) ?? 0) + (Number.isFinite(f) ? f : 0))
    eventsByMonth.set(month, (eventsByMonth.get(month) ?? 0) + 1)
  }
  const series = [...fatalByMonth.entries()].map(([month, value]) => ({ month, value }))
  return { series, eventsByMonth }
}

export async function getConflict(countryCode: string): Promise<ConflictResult> {
  const code = countryCode.toUpperCase()
  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result

  const name = ACLED_COUNTRY[code]
  if (!name) return empty(code, 'Country not in the monitored set.')

  const key = process.env.ACLED_KEY
  const email = process.env.ACLED_EMAIL
  if (!key || !email) {
    // Truthful: no credentials → the conflict pathway is unmonitored this run.
    return empty(code, 'ACLED credentials not configured (set ACLED_KEY / ACLED_EMAIL) — conflict pathway unmonitored.')
  }

  const end = new Date().getFullYear()
  const start = end - 14
  const url =
    `${ACLED_BASE}?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}` +
    `&country=${encodeURIComponent(name)}&event_date=${start}-01-01|${end}-12-31&event_date_where=BETWEEN` +
    `&fields=event_date|fatalities&limit=0`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 90_000)
    let json: { data?: AcledRow[]; error?: unknown }
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`ACLED responded ${res.status}`)
      json = await res.json()
    } finally {
      clearTimeout(timer)
    }
    const rows = json.data ?? []
    if (!rows.length) return empty(code, 'ACLED returned no events for this country/window.')

    const { series, eventsByMonth } = aggregate(rows)
    const m = computeAnomaly(series, 1) // a HIGH value (more deaths) is the anomaly
    const result: ConflictResult = {
      countryCode: code,
      asOfMonth: m.asOfMonth,
      fatalities: m.latest,
      events: m.asOfMonth ? eventsByMonth.get(m.asOfMonth) ?? 0 : 0,
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
