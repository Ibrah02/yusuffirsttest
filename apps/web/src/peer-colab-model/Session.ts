import { Transport, TransportClient, TransportSession } from '@peercolab/engine'
import { registerEarlyWarningMocks } from './interceptors/mocks/earlyWarningMocks'
import { registerEarlyWarningRealApi } from './interceptors/real/earlyWarningRealApi'
import { registerEarlyWarningLeadTimeProbe } from './interceptors/leadtime/earlyWarningLeadTimeProbe'
import { registerEarlyWarningComposite } from './interceptors/composite/earlyWarningComposite'
import { registerTriageOps } from './interceptors/triage'

/** Which interceptor layer serves the three early-warning operations. */
export type DataSource = 'mock' | 'realApi' | 'leadTime' | 'composite'

/**
 * The single TransportSession for the app (the §6 boot pattern).
 *
 * UX-first phase: `devDependenciesEnabled` is true, so the three early-warning
 * operations are served by an in-memory interceptor layer. There are now TWO
 * such layers, selected by `dataSource`:
 *   - 'mock'    — fabricated in-memory signals (every UI state exercisable).
 *   - 'realApi' — a feasibility probe: same ops, served from the real World
 *                 Bank Open Data API documented in the intention's Data
 *                 landscape. Shows which derived fields real data can support.
 *
 * Both are dev-dependency layers; the real BuilderServer transport still ships
 * at P5 and the mocks STAY for dev / test / QA either way.
 *
 * Default is 'mock'. Override without a rebuild via `?source=real` (or
 * `?source=mock`) on the URL, or at build time via `VITE_DATA_SOURCE`.
 */
export class Session {
  static session?: TransportSession
  // UX-first: serve operations from an in-memory layer. Flip to real transport at P5 cutover.
  static devDependenciesEnabled = true
  static dataSource: DataSource = resolveDataSource()

  static initialize(): void {
    const builder = Transport.session('EastAfricaMonitorSession')

    // 1. Register an interceptor layer FIRST — it claims exact operation ids.
    //    Only ONE layer registers, so ids never collide.
    if (this.devDependenciesEnabled) {
      if (this.dataSource === 'realApi') {
        registerEarlyWarningRealApi(builder)
      } else if (this.dataSource === 'leadTime') {
        registerEarlyWarningLeadTimeProbe(builder)
      } else if (this.dataSource === 'composite') {
        registerEarlyWarningComposite(builder)
      } else {
        registerEarlyWarningMocks(builder)
      }
      // Triage workqueue (local-storage) works alongside every signal source.
      registerTriageOps(builder)
    }
    // else: real BuilderServer transport pattern wired here at P5 (not yet built).

    // 2. Inspectors run for every call. PeerColab operations dispatch through the
    //    engine, NOT through fetch/XHR, so they never appear in the Network tab.
    //    Log every request; log only FAILED responses (success logs would interleave
    //    out of order and turn the console into a puzzle).
    this.session = builder
      .inspectRequest(async (_input, ctx) => {
        console.log(`[peercolab:${this.dataSource}] → ${ctx.operation.id}`)
      })
      .inspectResponse(async (result, _input, ctx) => {
        if (!result.success) {
          console.error(`[peercolab] ✗ ${ctx.operation.id}`)
          console.error(result.error?.toLongString())
        }
        return result
      })
      .build()
  }

  /** A fresh client for a call. Ops are tenant-agnostic (requiresTenant: false). */
  static getClient(): TransportClient {
    if (!this.session) this.initialize()
    return this.session!.createClient('EastAfricaMonitorClient')
  }
}

/**
 * Resolve the active data source at boot. Priority: `?source=` URL query (so a
 * QA reviewer can flip live without a rebuild) → `VITE_DATA_SOURCE` env →
 * 'mock' default.
 */
function resolveDataSource(): DataSource {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('source')
    if (q === 'real' || q === 'realApi') return 'realApi'
    if (q === 'leadtime' || q === 'leadTime') return 'leadTime'
    if (q === 'composite') return 'composite'
    if (q === 'mock') return 'mock'
  }
  const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DATA_SOURCE
  if (env === 'real' || env === 'realApi') return 'realApi'
  if (env === 'leadtime' || env === 'leadTime') return 'leadTime'
  if (env === 'composite') return 'composite'
  return 'mock'
}
