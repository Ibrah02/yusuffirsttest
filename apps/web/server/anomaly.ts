// ---------------------------------------------------------------------------
// Shared monthly-anomaly maths for the dev-server source proxies.
//
// Every pathway source (price, conflict, climate) reduces to the same question:
// how far does the latest month sit above its own trailing-12-month baseline,
// counting only the HARMFUL direction, and for how many consecutive months has
// it stayed there? That sustained count is the sub-annual lead the multi-
// indicator model combines across pathways. This mirrors the z-score logic in
// fewsLeadTime.ts so conflict and climate compute identically.
// ---------------------------------------------------------------------------

export type MonthlyPoint = { month: string; value: number }

export type AnomalyMetrics = {
  asOfMonth: string | null
  latest: number | null
  zScore: number
  sustainedAnomalyMonths: number
  monthsOfHistory: number
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const stdev = (a: number[], mu: number) => Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length)

/**
 * Compute the anomaly metrics for a monthly series.
 *
 * `sign` selects which direction is harmful: +1 when a HIGH value is the
 * anomaly (conflict deaths, prices), -1 when a LOW value is (rainfall deficit).
 * The returned zScore is already signed so that > 0 always means "more harmful".
 */
export function computeAnomaly(series: MonthlyPoint[], sign: 1 | -1): AnomalyMetrics {
  const sorted = [...series].filter((p) => Number.isFinite(p.value)).sort((a, b) => (a.month < b.month ? -1 : 1))
  if (sorted.length < 13) {
    const last = sorted.at(-1)
    return {
      asOfMonth: last?.month ?? null,
      latest: last?.value ?? null,
      zScore: 0,
      sustainedAnomalyMonths: 0,
      monthsOfHistory: sorted.length,
    }
  }
  const latest = sorted.at(-1)!
  const baseline = sorted.slice(-13, -1).map((p) => p.value)
  const mu = mean(baseline)
  const sd = stdev(baseline, mu)
  const zScore = sd ? (sign * (latest.value - mu)) / sd : 0

  // Sustained = consecutive most-recent months whose signed z stayed > 1.
  let lead = 0
  for (let i = sorted.length - 1; i >= 12; i--) {
    const base = sorted.slice(i - 12, i).map((p) => p.value)
    const bMu = mean(base)
    const bSd = stdev(base, bMu)
    const z = bSd ? (sign * (sorted[i].value - bMu)) / bSd : 0
    if (z > 1) lead++
    else break
  }

  return {
    asOfMonth: latest.month,
    latest: latest.value,
    zScore,
    sustainedAnomalyMonths: lead,
    monthsOfHistory: sorted.length,
  }
}
