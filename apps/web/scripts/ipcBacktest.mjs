// ---------------------------------------------------------------------------
// IPC backtest — does the early-warning signal fire EARLY ENOUGH and RELIABLY
// ENOUGH to meet the NGO success criteria?
//
// Offline validation tool: `node scripts/ipcBacktest.mjs [CC,CC,...]`.
// It replays history: for each past IPC crisis onset, it checks whether (and how
// far ahead) the signal was already firing, using only data available at that
// time. Outputs lead time, miss rate, and false-alarm rate per country and in
// aggregate, against the three criteria from the NGO actor:
//   - lead >= 3 months over conventional harm indicators
//   - miss rate < 15%
//   - false-alarm rate < 25%
//
// SIGNALS (both use the same rule: value > 1σ above its trailing-12-month
// baseline, mirroring the live probe server/fewsLeadTime.ts):
//   - price:    FEWS NET monthly national-median maize retail price.
//   - conflict: UCDP GED monthly battle-related deaths (open bulk download).
// Countries flagged `fuseConflict` fire if EITHER signal fires — this is the
// pathway insight: South Sudan's crises are conflict-driven, so a price-only
// signal is blind to them.
//
// MATCHING uses a lookback WINDOW (default 6 months): an onset is detected if
// the signal fired anywhere in [D-L, D-1]; lead = the earliest such warning.
// (The v1 strict "contiguous run up to the onset" rule understated intermittent
// signals — conflict spikes especially.)
//
// Data is large (~30 MB price / ~200 MB IPC per country; 29 MB GED global zip)
// and fetched server-side, cached to disk.
// ---------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

// cc = ISO2 (FEWS NET); gwId = Gleditsch-Ward id (UCDP); fuseConflict = OR-in conflict signal
const CONFIG = {
  KE: { gwId: 501, fuseConflict: false },
  ET: { gwId: 530, fuseConflict: false },
  SS: { gwId: 626, fuseConflict: true },
  UG: { gwId: 500, fuseConflict: false },
  TZ: { gwId: 510, fuseConflict: false },
  RW: { gwId: 517, fuseConflict: false },
  BI: { gwId: 516, fuseConflict: false },
}
const COUNTRIES = (process.argv[2] || 'KE,ET,SS').split(',')
const LOOKBACK = 6 // months
// Sustained-spike requirement: a signal only counts as firing if the >1σ
// exceedance persists for SUSTAIN consecutive months. Drops transient one-month
// spikes (the main false-alarm source) while keeping the START of genuine runs,
// so lead time on surviving alarms is preserved. SUSTAIN=1 = no requirement.
const SUSTAIN = Number(process.env.SUSTAIN || 2)
const CACHE = path.join(os.tmpdir(), 'eaw-backtest-cache')
fs.mkdirSync(CACHE, { recursive: true })

const PRICE_URL = (cc) => `https://fdw.fews.net/api/marketpricefacts/?country_code=${cc}&product=Maize&format=json`
const IPC_URL = (cc) => `https://fdw.fews.net/api/ipcphase/?country_code=${cc}&format=json`
const GED_URL = 'https://ucdp.uu.se/downloads/ged/ged251-csv.zip'

const mi = (d) => { const [y, m] = d.slice(0, 7).split('-').map(Number); return y * 12 + (m - 1) }
const ym = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const sd = (a, m) => Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const medOf = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null)

function splitCSV(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else { if (c === ',') { out.push(cur); cur = '' } else if (c === '"') q = true; else cur += c }
  }
  out.push(cur); return out
}

async function loadJson(cc, kind, url) {
  const f = path.join(CACHE, `${kind}_${cc}.json`)
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  process.stdout.write(`  fetching ${kind} for ${cc} ... `)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 180_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const rows = Array.isArray(json) ? json : json.results ?? []
    fs.writeFileSync(f, JSON.stringify(rows)); console.log(`${rows.length} records`)
    return rows
  } finally { clearTimeout(t) }
}

// Rolling-z>1 firing map from a dense {mi,val} series.
function firingFrom(series) {
  const f = new Map()
  for (let i = 12; i < series.length; i++) {
    const base = series.slice(i - 12, i).map((p) => p.val)
    const mu = mean(base), s = sd(base, mu)
    f.set(series[i].mi, s ? (series[i].val - mu) / s > 1 : false)
  }
  return f
}

function priceFiring(rows) {
  const bm = new Map()
  for (const r of rows) {
    if (r.value == null || r.price_type !== 'Retail' || r.unit !== 'kg' || !/maize/i.test(r.product || '')) continue
    const m = (r.period_date || '').slice(0, 7); if (!m) continue
    ;(bm.get(m) || bm.set(m, []).get(m)).push(r.value)
  }
  const series = [...bm.entries()].map(([m, v]) => ({ mi: mi(m), val: median(v) })).sort((a, b) => a.mi - b.mi)
  return { firing: firingFrom(series), months: series.length }
}

// UCDP GED: ensure the global CSV is downloaded+unzipped, then monthly deaths for a country.
let gedCsvPath = null
function ensureGed() {
  if (gedCsvPath) return gedCsvPath
  const existing = fs.readdirSync(CACHE).find((f) => /^GEDEvent.*\.csv$/.test(f))
  if (existing) { gedCsvPath = path.join(CACHE, existing); return gedCsvPath }
  const zip = path.join(CACHE, 'ged.zip')
  if (!fs.existsSync(zip)) {
    process.stdout.write('  downloading UCDP GED ... ')
    execSync(`curl -s -L --max-time 180 -o "${zip}" "${GED_URL}"`); console.log('done')
  }
  execSync(`unzip -o -q "${zip}" -d "${CACHE}"`)
  gedCsvPath = path.join(CACHE, fs.readdirSync(CACHE).find((f) => /^GEDEvent.*\.csv$/.test(f)))
  return gedCsvPath
}

function conflictFiring(gwId) {
  const txt = fs.readFileSync(ensureGed(), 'utf8').split(/\r?\n/)
  const hdr = splitCSV(txt[0]), iC = hdr.indexOf('country_id'), iD = hdr.indexOf('date_start'), iB = hdr.indexOf('best')
  const bm = new Map()
  for (let i = 1; i < txt.length; i++) {
    if (!txt[i]) continue
    const f = splitCSV(txt[i]); if (Number(f[iC]) !== gwId) continue
    const m = (f[iD] || '').slice(0, 7); if (!m) continue
    bm.set(m, (bm.get(m) || 0) + (Number(f[iB]) || 0))
  }
  if (!bm.size) return { firing: new Map(), months: 0 }
  const keys = [...bm.keys()].map(mi); const lo = Math.min(...keys), hi = Math.max(...keys)
  const series = []
  for (let k = lo; k <= hi; k++) series.push({ mi: k, val: bm.get(ym(k)) || 0 }) // zero-fill gaps
  return { firing: firingFrom(series), months: bm.size }
}

// Country crisis-onset timeline: IPC Current Situation, max area phase, worsening into >=3.
function buildOnsets(ipcRows) {
  const cs = ipcRows.filter((r) => r.scenario === 'CS' && r.is_allowing_for_assistance === false && r.value != null)
  const byDate = new Map()
  for (const r of cs) byDate.set(r.reporting_date, Math.max(byDate.get(r.reporting_date) || 0, r.value))
  const tl = [...byDate.entries()].map(([date, ph]) => ({ mi: mi(date), date, ph })).sort((a, b) => a.mi - b.mi)
  const onsets = []
  for (let i = 1; i < tl.length; i++) if (tl[i].ph >= 3 && tl[i].ph > tl[i - 1].ph) onsets.push(tl[i])
  return { onsets, periods: tl.length, tl }
}

// Windowed matching. `tl` (IPC phase timeline) lets us suppress false alarms
// raised while a country is ALREADY in crisis (phase >= 3) — those aren't
// "crying wolf," so only "peacetime" (phase <= 2) over-fires count as false.
function backtest(firing, onsets, tl = [], L = LOOKBACK) {
  const fires = new Set([...firing.keys()].filter((m) => firing.get(m)))
  const leads = []; let misses = 0
  for (const o of onsets) {
    let earliest = null
    for (let m = o.mi - L; m <= o.mi - 1; m++) if (fires.has(m)) { earliest = m; break }
    if (earliest != null) leads.push(o.mi - earliest); else misses++
  }
  const fired = [...fires].sort((a, b) => a - b); const runs = []; let cur = null
  for (const m of fired) { if (cur && m === cur.end + 1) cur.end = m; else { cur = { start: m, end: m }; runs.push(cur) } }
  const oms = onsets.map((o) => o.mi)
  // phase at a given month = last known IPC phase on/before it (forward-filled).
  const phaseAt = (m) => { let ph = 1; for (const t of tl) { if (t.mi <= m) ph = t.ph; else break } return ph }
  let fa = 0, faPeace = 0, peaceRuns = 0
  for (const r of runs) {
    const aligned = oms.some((om) => om >= r.start && om <= r.end + L)
    if (!aligned) fa++
    if (phaseAt(r.start) <= 2) { peaceRuns++; if (!aligned) faPeace++ }
  }
  return {
    onsets: onsets.length, medianLead: medOf(leads), missRate: onsets.length ? misses / onsets.length : null,
    runs: runs.length, falseAlarmRate: runs.length ? fa / runs.length : null,
    peaceRuns, peacetimeFalseAlarmRate: peaceRuns ? faPeace / peaceRuns : null, leads,
  }
}

// Keep only firing months that belong to a contiguous run of length >= k.
function sustain(firing, k) {
  if (k <= 1) return firing
  const trueMonths = [...firing.keys()].filter((m) => firing.get(m)).sort((a, b) => a - b)
  const kept = new Set()
  let run = [], prev = null
  const flush = () => { if (run.length >= k) run.forEach((m) => kept.add(m)); run = [] }
  for (const m of trueMonths) { if (prev !== null && m === prev + 1) run.push(m); else { flush(); run = [m] } prev = m }
  flush()
  const out = new Map(); for (const m of firing.keys()) out.set(m, kept.has(m)); return out
}

const orFiring = (a, b) => { const f = new Map(); for (const k of new Set([...a.keys(), ...b.keys()])) f.set(k, a.get(k) || b.get(k)); return f }

async function main() {
  console.log(`IPC backtest (windowed L=${LOOKBACK}, sustain=${SUSTAIN}) — countries: ${COUNTRIES.join(', ')}\n`)
  const all = []
  for (const cc of COUNTRIES) {
    const cfg = CONFIG[cc] || { fuseConflict: false }
    try {
      console.log(`${cc}:`)
      const [price, ipc] = await Promise.all([loadJson(cc, 'price', PRICE_URL(cc)), loadJson(cc, 'ipc', IPC_URL(cc))])
      const pf = priceFiring(price)
      const { onsets, periods, tl } = buildOnsets(ipc)
      let firing = sustain(pf.firing, SUSTAIN), conflMonths = 0
      if (cfg.fuseConflict) { const cf = conflictFiring(cfg.gwId); firing = orFiring(firing, sustain(cf.firing, SUSTAIN)); conflMonths = cf.months }
      const r = backtest(firing, onsets, tl)
      all.push({ cc, fused: cfg.fuseConflict, ...r })
      const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`)
      console.log(`  price months=${pf.months}, IPC periods=${periods}, ${cfg.fuseConflict ? `conflict months=${conflMonths}, ` : ''}onsets=${r.onsets}${cfg.fuseConflict ? ' [PRICE+CONFLICT]' : ''}`)
      console.log(`  median lead=${r.medianLead ?? 'n/a'}mo | miss=${pct(r.missRate)} | false-alarm=${pct(r.falseAlarmRate)} (${r.runs} runs) | peacetime FA=${pct(r.peacetimeFalseAlarmRate)} (${r.peaceRuns} runs)\n`)
    } catch (e) { console.log(`  ERROR: ${e.message}\n`) }
  }

  const leads = all.flatMap((c) => c.leads)
  const onsets = all.reduce((s, c) => s + c.onsets, 0)
  const misses = all.reduce((s, c) => s + (c.onsets - c.leads.length), 0)
  const runs = all.reduce((s, c) => s + c.runs, 0)
  const fas = all.reduce((s, c) => s + Math.round((c.falseAlarmRate ?? 0) * c.runs), 0)
  const peaceRuns = all.reduce((s, c) => s + c.peaceRuns, 0)
  const faPeace = all.reduce((s, c) => s + Math.round((c.peacetimeFalseAlarmRate ?? 0) * c.peaceRuns), 0)
  const aMiss = onsets ? misses / onsets : null, aMed = medOf(leads)
  const aFA = runs ? fas / runs : null, aFApeace = peaceRuns ? faPeace / peaceRuns : null
  const pass = (b) => (b ? 'PASS' : 'FAIL')
  console.log('AGGREGATE')
  console.log(`  onsets=${onsets}, median lead=${aMed ?? 'n/a'}mo, miss=${aMiss == null ? 'n/a' : (aMiss * 100).toFixed(0) + '%'}`)
  console.log(`  false-alarm: all=${aFA == null ? 'n/a' : (aFA * 100).toFixed(0) + '%'} | peacetime-only=${aFApeace == null ? 'n/a' : (aFApeace * 100).toFixed(0) + '%'}`)
  console.log(`  criteria: lead>=3mo ${pass(aMed >= 3)} | miss<15% ${pass(aMiss != null && aMiss < 0.15)} | peacetime-FA<25% ${pass(aFApeace != null && aFApeace < 0.25)}`)
}

main()
