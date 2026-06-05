import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { getLeadTime } from './server/fewsLeadTime'
import { getConflict } from './server/acledConflict'
import { getClimate } from './server/nasaPowerClimate'

// Dev-only middleware backing the real-source probes. Each pathway source runs
// in Node — FEWS NET / ACLED / NASA POWER are blocked from the browser by CORS,
// auth or payload size — and serves a compact JSON the browser interceptor
// consumes. Prototypes for the eventual P5 backend ingestion; see the
// "Real-data feasibility" rollout and the Source data acquisition layer.
//   /__probe/leadtime — FEWS NET prices (price pathway)
//   /__probe/conflict — ACLED events    (conflict pathway)
//   /__probe/climate  — NASA POWER rain (climate pathway)
function sourceProbes(): Plugin {
  const handler = (fetcher: (country: string) => Promise<unknown>) => async (
    req: { url?: string },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void },
  ) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const country = url.searchParams.get('country') ?? ''
    res.setHeader('Content-Type', 'application/json')
    if (!country) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'missing country query param' }))
      return
    }
    try {
      res.end(JSON.stringify(await fetcher(country)))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: (e as Error).message }))
    }
  }
  return {
    name: 'eaw-source-probes',
    configureServer(server) {
      server.middlewares.use('/__probe/leadtime', handler(getLeadTime))
      server.middlewares.use('/__probe/conflict', handler(getConflict))
      server.middlewares.use('/__probe/climate', handler(getClimate))
    },
  }
}

// The PeerColab CLI prints generated PathItems into src/peercolab-eaw/Yusuffirsttest.
// Alias it as @gen so app code imports operations/types without long relative paths.
export default defineConfig({
  plugins: [react(), sourceProbes()],
  resolve: {
    alias: {
      '@gen': fileURLToPath(new URL('./src/peercolab-eaw/Yusuffirsttest', import.meta.url)),
    },
  },
})
