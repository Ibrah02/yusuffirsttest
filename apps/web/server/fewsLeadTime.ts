// ---------------------------------------------------------------------------
// Dev-server proxy for the lead-time probe.
//
// WHY this exists (a verified finding, see the rollout "Real-data feasibility
// for the early-warning signal"): FEWS NET is the only open source with monthly
// food prices, deep history, and all-seven-country coverage — but it sends NO
// CORS header and returns ~30 MB per country, so the browser cannot call it
// directly. HungerMap (CORS-friendly) is stale/empty for this region. So the
// honest way to get a REAL sub-annual lead-time signal in front of the dashboard
// is to fetch FEWS NET in Node (no CORS problem), downsample to a small monthly
// series, and serve a compact JSON the browser interceptor can consume.
//
// This is a dev-only prototype of the eventual P5 backend ingestion, NOT a
// production service. It runs inside the Vite dev server (see vite.config.ts).
// ---------------------------------------------------------------------------

export type LeadTimePoint = { month: string; price: number; markets: number }

export type LeadTimeResult = {
  countryCode: string
  product: string
  currency: string | null
  asOfMonth: string | null
  latest: number | null
  zScore: number // latest vs trailing-12-month baseline
  mom3: number | null // 3-month % change
  mom12: number | null // 12-month % change
  sustainedAnomalyMonths: number // consecutive recent months with rolling z > 1 — the computed lead
  marketsReporting: number
  monthsOfHistory: number
  series: LeadTimePoint[] // trimmed tail for the UI sparkline
  error?: string
}

// The regional staple used as the price proxy. Maize is the dominant staple
// across the monitored set; per-country staple selection is a future refinement.
const PRODUCT = 'Maize'
const FDW_BASE = 'https://fdw.fews.net/api/marketpricefacts/'

type FdwRow = {
  product?: string
  market?: string
  period_date?: string
  value?: number | null
  unit?: string
  currency?: string
  price_type?: string
}

// In-memory cache keyed by country code; FEWS NET payloads are large and change
// at most monthly, so we hold results for the dev-server lifetime.
const cache = new Map<string, { at: number; result: LeadTimeResult }>()
const TTL_MS = 6 * 60 * 60 * 1000 // 6h

const median = (a: number[]): number | null => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const stdev = (a: number[], mu: number) =>
  Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length)

/** Build a monthly national series: median retail price across reporting markets. */
function buildMonthlySeries(rows: FdwRow[]): { series: LeadTimePoint[]; currency: string | null } {
  const clean = rows.filter(
    (r) =>
      r.value != null &&
      r.price_type === 'Retail' &&
      r.unit === 'kg' &&
      /maize/i.test(r.product || ''),
  )
  const currency = clean[0]?.currency ?? null
  const byMonth = new Map<string, number[]>()
  for (const r of clean) {
    const m = (r.period_date || '').slice(0, 7) // YYYY-MM
    if (!m) continue
    const bucket = byMonth.get(m) ?? byMonth.set(m, []).get(m)!
    bucket.push(r.value as number)
  }
  const series = [...byMonth.entries()]
    .map(([month, vals]) => ({ month, price: median(vals) as number, markets: vals.length }))
    .filter((p) => p.price != null)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
  return { series, currency }
}

/** Compute anomaly / momentum / sustained-anomaly lead from the monthly series. */
function computeMetrics(series: LeadTimePoint[]) {
  if (series.length < 13) {
    return { latest: series.at(-1)?.price ?? null, asOfMonth: series.at(-1)?.month ?? null, zScore: 0, mom3: null, mom12: null, sustainedAnomalyMonths: 0, marketsReporting: series.at(-1)?.markets ?? 0 }
  }
  const latestPt = series.at(-1)!
  const latest = latestPt.price
  const baseline = series.slice(-13, -1).map((p) => p.price)
  const mu = mean(baseline)
  const sd = stdev(baseline, mu)
  const zScore = sd ? (latest - mu) / sd : 0
  const mom3 = (latest / series.at(-4)!.price - 1) * 100
  const mom12 = (latest / series.at(-13)!.price - 1) * 100

  // Lead = consecutive most-recent months where the price sat > 1σ above its own
  // trailing-12-month baseline. "The price signal has been firing for N months."
  let lead = 0
  for (let i = series.length - 1; i >= 12; i--) {
    const cur = series[i].price
    const base = series.slice(i - 12, i).map((p) => p.price)
    const bMu = mean(base)
    const bSd = stdev(base, bMu)
    const z = bSd ? (cur - bMu) / bSd : 0
    if (z > 1) lead++
    else break
  }
  return { latest, asOfMonth: latestPt.month, zScore, mom3, mom12, sustainedAnomalyMonths: lead, marketsReporting: latestPt.markets }
}

async function fetchFews(countryCode: string): Promise<FdwRow[]> {
  const url = `${FDW_BASE}?country_code=${encodeURIComponent(countryCode)}&product=${PRODUCT}&format=json`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`FEWS NET responded ${res.status}`)
    const json = (await res.json()) as FdwRow[] | { results?: FdwRow[] }
    return Array.isArray(json) ? json : json.results ?? []
  } finally {
    clearTimeout(timer)
  }
}

/** Main entry: fetch (cached) + transform for one country. */
export async function getLeadTime(countryCode: string): Promise<LeadTimeResult> {
  const code = countryCode.toUpperCase()
  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result

  try {
    const rows = await fetchFews(code)
    const { series, currency } = buildMonthlySeries(rows)
    const m = computeMetrics(series)
    const result: LeadTimeResult = {
      countryCode: code,
      product: 'Maize (retail, national median)',
      currency,
      asOfMonth: m.asOfMonth,
      latest: m.latest,
      zScore: m.zScore,
      mom3: m.mom3,
      mom12: m.mom12,
      sustainedAnomalyMonths: m.sustainedAnomalyMonths,
      marketsReporting: m.marketsReporting,
      monthsOfHistory: series.length,
      series: series.slice(-24), // last 2 years for a sparkline
    }
    cache.set(code, { at: Date.now(), result })
    return result
  } catch (e) {
    return {
      countryCode: code,
      product: 'Maize (retail, national median)',
      currency: null,
      asOfMonth: null,
      latest: null,
      zScore: 0,
      mom3: null,
      mom12: null,
      sustainedAnomalyMonths: 0,
      marketsReporting: 0,
      monthsOfHistory: 0,
      series: [],
      error: (e as Error).message,
    }
  }
}
