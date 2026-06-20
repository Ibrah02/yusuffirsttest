import { Transport, TransportClient, TransportSession } from '@peercolab/engine'
import { registerFifaMocks } from './mocks'

/**
 * The single TransportSession for the FIFA dashboards.
 *
 * Player operations are served by an in-memory mock layer fed from the bundled
 * dataset — no backend. The mocks are permanent (dev / test / QA run without a
 * server). A real BuilderServer transport would be wired here at a later
 * cutover, behind a flag, without removing the mocks.
 */
export class Session {
  static session?: TransportSession

  static initialize(): void {
    const builder = Transport.session('FifaDashboardSession')

    // 1. Register the mock interceptor layer — it claims the exact operation ids.
    registerFifaMocks(builder)

    // 2. Inspectors run for every call. PeerColab operations dispatch through the
    //    engine, NOT through fetch/XHR, so they never appear in the Network tab.
    //    Log every request; log only FAILED responses (success logs interleave
    //    out of order and turn the console into noise).
    this.session = builder
      .inspectRequest(async (_input, ctx) => {
        console.log(`[fifa] → ${ctx.operation.id}`)
      })
      .inspectResponse(async (result, _input, ctx) => {
        if (!result.success) {
          console.error(`[fifa] ✗ ${ctx.operation.id}`)
          console.error(result.error?.toLongString())
        }
        return result
      })
      .build()
  }

  /** A fresh client for a call. Ops are tenant-agnostic (requiresTenant: false). */
  static getClient(): TransportClient {
    if (!this.session) this.initialize()
    return this.session!.createClient('FifaDashboardClient')
  }
}
