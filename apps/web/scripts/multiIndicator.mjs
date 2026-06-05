// ---------------------------------------------------------------------------
// Multi-indicator early-warning model + backtest.
//
// The single-indicator z-score signals (price OR conflict) fire too often to
// fund (see the IPC backtest rollout). This combines THREE pathway indicators
// into one severity score and sweeps the firing threshold to find the best
// miss / false-alarm operating point:
//
//   price    — FEWS NET monthly maize price anomaly (z > 0 = dearer)
//   conflict — UCDP GED monthly battle deaths anomaly (z > 0 = bloodier)
//   climate  — NASA POWER monthly rainfall DEFICIT (z of -rainfall; > 0 = drier)
//
//   composite(m) = Σ wᵢ · max(0, zᵢ(m))          (only the "bad" direction counts)
//   fires when composite(m) ≥ T
//
// Weights are transparent and pathway-motivated (not heavy ML — with ~14 onsets
// that would overfit). Evaluated by sweeping T to trace the tradeoff, against the
// NGO criteria: lead ≥ 3mo, miss < 15%, peacetime false-alarm < 25%.
//
// Run: `node scripts/multiIndicator.mjs [CC,CC,...]`. Reuses the disk cache from
// ipcBacktest.mjs (price/ipc/GED); fetches NASA POWER climate on demand.
// ---------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

const COUNTRIES = (process.argv[2] || 'KE,ET,SS').split(',')
const LOOKBACK = 6
const CACHE = path.join(os.tmpdir(), 'eaw-backtest-cache')
fs.mkdirSync(CACHE, { recursive: true })

// gwId = UCDP Gleditsch-Ward; lon/lat = a representative cropland/pastoral point
// for the rainfall proxy (single point is crude — a known simplification).
// weights: [price, conflict, climate] — pathway-routed per country.
const CONFIG = {
  KE: { gwId: 501, lon: 37.0, lat: 0.3, w: [1, 1, 1] },
  ET: { gwId: 530, lon: 39.0, lat: 9.0, w: [1, 1, 1.5] },
  SS: { gwId: 626, lon: 31.5, lat: 7.0, w: [0.5, 1.5, 0.5] },
  UG: { gwId: 500, lon: 32.5, lat: 1.3, w: [1, 1, 1] },
  TZ: { gwId: 510, lon: 35.0, lat: -6.0, w: [1, 1, 1] },
  RW: { gwId: 517, lon: 30.0, lat: -2.0, w: [1, 1, 1] },
  BI: { gwId: 516, lon: 29.9, lat: -3.4, w: [1, 1, 1] },
}

const mi = (d) => { const [y, m] = d.slice(0, 7).split('-').map(Number); return y * 12 + (m - 1) }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const sd = (a, m) => Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const medOf = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null)
function splitCSV(line) { const o = []; let c = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch } else { if (ch === ',') { o.push(c); c = '' } else if (ch === '"') q = true; else c += ch } } o.push(c); return o }

// Point-in-time z of a dense {mi,val} series vs trailing-12 baseline → Map mi->z.
function zSeries(series, sign = 1) {
  const z = new Map()
  for (let i = 12; i < series.length; i++) {
    const base = series.slice(i - 12, i).map((p) => p.val)
    const mu = mean(base), s = sd(base, mu)
    z.set(series[i].mi, s ? (sign * (series[i].val - mu)) / s : 0)
  }
  return z
}

function priceSeries(cc) {
  const rows = JSON.parse(fs.readFileSync(path.join(CACHE, `price_${cc}.json`), 'utf8'))
  const bm = new Map()
  for (const r of rows) { if (r.value == null || r.price_type !== 'Retail' || r.unit !== 'kg' || !/maize/i.test(r.product || '')) continue; const m = (r.period_date || '').slice(0, 7); if (!m) continue; (bm.get(m) || bm.set(m, []).get(m)).push(r.value) }
  return [...bm.entries()].map(([m, v]) => ({ mi: mi(m), val: median(v) })).sort((a, b) => a.mi - b.mi)
}

let gedCsv = null
function ged() { if (gedCsv) return gedCsv; const f = fs.readdirSync(CACHE).find((x) => /^GEDEvent.*\.csv$/.test(x)); if (f) { gedCsv = path.join(CACHE, f); return gedCsv } const zip = path.join(CACHE, 'ged.zip'); if (!fs.existsSync(zip)) execSync(`curl -s -L --max-time 180 -o "${zip}" "https://ucdp.uu.se/downloads/ged/ged251-csv.zip"`); execSync(`unzip -o -q "${zip}" -d "${CACHE}"`); gedCsv = path.join(CACHE, fs.readdirSync(CACHE).find((x) => /^GEDEvent.*\.csv$/.test(x))); return gedCsv }
function conflictSeries(gwId) {
  const txt = fs.readFileSync(ged(), 'utf8').split(/\r?\n/); const h = splitCSV(txt[0]); const iC = h.indexOf('country_id'), iD = h.indexOf('date_start'), iB = h.indexOf('best')
  const bm = new Map(); for (let i = 1; i < txt.length; i++) { if (!txt[i]) continue; const f = splitCSV(txt[i]); if (Number(f[iC]) !== gwId) continue; const m = (f[iD] || '').slice(0, 7); if (!m) continue; bm.set(m, (bm.get(m) || 0) + (Number(f[iB]) || 0)) }
  if (!bm.size) return []; const ks = [...bm.keys()].map(mi); const lo = Math.min(...ks), hi = Math.max(...ks); const out = []
  for (let k = lo; k <= hi; k++) out.push({ mi: k, val: bm.get(`${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`) || 0 })
  return out
}

async function climateSeries(cc, cfg) {
  const f = path.join(CACHE, `climate_${cc}.json`)
  let p
  if (fs.existsSync(f)) p = JSON.parse(fs.readFileSync(f, 'utf8'))
  else {
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=PRECTOTCORR&community=AG&longitude=${cfg.lon}&latitude=${cfg.lat}&start=2011&end=2024&format=JSON`
    const res = await fetch(url); p = (await res.json()).properties.parameter.PRECTOTCORR; fs.writeFileSync(f, JSON.stringify(p))
  }
  return Object.entries(p).filter(([k, v]) => !k.endsWith('13') && v > -900)
    .map(([k, v]) => ({ mi: Number(k.slice(0, 4)) * 12 + (Number(k.slice(4)) - 1), val: v })).sort((a, b) => a.mi - b.mi)
}

// FINER onset labels: instead of the coarse max-area-phase 2->3 transition, use
// the SHARE of classified areas in Phase 3+ per assessment. An onset = that
// share jumping >= 10pp into a meaningful level (>= 10%). Captures geographic
// escalation (including within chronic crises) and yields more, less-rare events
// for firmer statistics. Sparse ad-hoc assessments (< 50 areas) are dropped —
// they report 1 area at 100% and would create fake jumps. Peacetime = share < 10%.
const MIN_AREAS = 50, SHARE_JUMP = 0.10, SHARE_MIN = 0.10, PEACE_SHARE = 0.10
function buildOnsets(cc) {
  const rows = JSON.parse(fs.readFileSync(path.join(CACHE, `ipc_${cc}.json`), 'utf8'))
  const cs = rows.filter((r) => r.scenario === 'CS' && r.is_allowing_for_assistance === false && r.value != null)
  const bd = new Map()
  for (const r of cs) { const d = r.reporting_date; if (!bd.has(d)) bd.set(d, { n: 0, n3: 0 }); const o = bd.get(d); o.n++; if (r.value >= 3) o.n3++ }
  const tl = [...bd.entries()].filter(([, o]) => o.n >= MIN_AREAS).map(([d, o]) => ({ mi: mi(d), share: o.n3 / o.n })).sort((a, b) => a.mi - b.mi)
  const onsets = []
  for (let i = 1; i < tl.length; i++) if (tl[i].share - tl[i - 1].share >= SHARE_JUMP && tl[i].share >= SHARE_MIN) onsets.push(tl[i])
  return { onsets, tl }
}

function backtest(fires, onsets, tl, L = LOOKBACK) {
  const leads = []; let misses = 0
  for (const o of onsets) { let e = null; for (let m = o.mi - L; m <= o.mi - 1; m++) if (fires.has(m)) { e = m; break } if (e != null) leads.push(o.mi - e); else misses++ }
  const fired = [...fires].sort((a, b) => a - b); const runs = []; let cur = null
  for (const m of fired) { if (cur && m === cur.end + 1) cur.end = m; else { cur = { start: m, end: m }; runs.push(cur) } }
  const oms = onsets.map((o) => o.mi)
  const shareAt = (m) => { let s = 0; for (const t of tl) { if (t.mi <= m) s = t.share; else break } return s }
  let faPeace = 0, peace = 0
  for (const r of runs) { const aligned = oms.some((om) => om >= r.start && om <= r.end + L); if (shareAt(r.start) < PEACE_SHARE) { peace++; if (!aligned) faPeace++ } }
  return { onsets: onsets.length, medianLead: medOf(leads), misses, peace, faPeace }
}

async function main() {
  console.log(`Multi-indicator model (price+conflict+climate) — ${COUNTRIES.join(', ')}\n`)
  const data = []
  for (const cc of COUNTRIES) {
    const cfg = CONFIG[cc]
    const zP = zSeries(priceSeries(cc), 1)
    const zC = zSeries(conflictSeries(cfg.gwId), 1)
    const zK = zSeries(await climateSeries(cc, cfg), -1) // deficit
    const months = new Set([...zP.keys(), ...zC.keys(), ...zK.keys()])
    const composite = new Map()
    for (const m of months) composite.set(m, cfg.w[0] * Math.max(0, zP.get(m) || 0) + cfg.w[1] * Math.max(0, zC.get(m) || 0) + cfg.w[2] * Math.max(0, zK.get(m) || 0))
    const { onsets, tl } = buildOnsets(cc)
    data.push({ cc, composite, onsets, tl })
    const cov = composite.size === 0 ? 'NO price/indicator data' : `${tl.length} full assessments`
    console.log(`  ${cc}: ${onsets.length} finer onsets, ${cov}`)
  }
  console.log()

  // keep only firing months in runs of length >= k
  const sustainSet = (fires, k) => {
    if (k <= 1) return fires
    const ms = [...fires].sort((a, b) => a - b); const kept = new Set(); let run = [], prev = null
    const flush = () => { if (run.length >= k) run.forEach((m) => kept.add(m)); run = [] }
    for (const m of ms) { if (prev !== null && m === prev + 1) run.push(m); else { flush(); run = [m] } prev = m }
    flush(); return kept
  }

  for (const SUS of [1, 2]) {
  console.log(`Threshold sweep — composite, sustained=${SUS} (aggregate over countries):`)
  console.log('  T    lead   miss    peace-FA   verdict')
  let best = null
  for (let T = 0.5; T <= 5.01; T += 0.5) {
    let leads = [], onsets = 0, misses = 0, peace = 0, faPeace = 0
    for (const d of data) {
      const fires = sustainSet(new Set([...d.composite.keys()].filter((m) => d.composite.get(m) >= T)), SUS)
      const r = backtest(fires, d.onsets, d.tl)
      onsets += r.onsets; misses += r.misses; peace += r.peace; faPeace += r.faPeace
      const ld = []; for (const o of d.onsets) { let e = null; for (let m = o.mi - LOOKBACK; m <= o.mi - 1; m++) if (fires.has(m)) { e = m; break } if (e != null) ld.push(o.mi - e) }
      leads.push(...ld)
    }
    const med = medOf(leads), miss = misses / onsets, fa = peace ? faPeace / peace : null
    const ok = med >= 3 && miss < 0.15 && fa != null && fa < 0.25
    const score = (med >= 3 ? 1 : 0) + (miss < 0.15 ? 1 : 0) + (fa != null && fa < 0.25 ? 1 : 0)
    const line = `  ${T.toFixed(1)}  ${(med ?? 0)}mo    ${(miss * 100).toFixed(0)}%     ${fa == null ? 'n/a' : (fa * 100).toFixed(0) + '%'}       ${ok ? 'ALL PASS' : score + '/3'}`
    console.log(line)
    if (!best || score > best.score || (score === best.score && (med ?? 0) >= (best.med ?? 0))) best = { T, med, miss, fa, score }
  }
  console.log(`  best: T=${best.T.toFixed(1)} → lead ${best.med}mo, miss ${(best.miss * 100).toFixed(0)}%, peacetime-FA ${best.fa == null ? 'n/a' : (best.fa * 100).toFixed(0) + '%'} (${best.score}/3)\n`)
  }
}

main()
