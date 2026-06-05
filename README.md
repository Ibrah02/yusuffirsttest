# yusuffirsttest

East Africa Early-Warning Monitor — a live monitoring tool for development/population-focused NGOs watching how population growth is interacting with inflation, conflict and climate across Uganda, Kenya, Tanzania, Rwanda, Burundi, Ethiopia and South Sudan.

The goal is early, honest, two-way sight: surface a high-recall watchlist of countries tipping toward crisis ahead of conventional harm indicators, with the evidence behind each flag, and never over-claim where the data can't support it.

## App

The web frontend lives in [`apps/web`](apps/web) (React + Vite + TypeScript).

```bash
cd apps/web
npm install
npm run dev
```

Data sources are selected at runtime via `?source=` (or `VITE_DATA_SOURCE`):

- `mock` (default) — fabricated in-memory signals, no network.
- `real` — World Bank Open Data (annual macro series).
- `leadtime` — FEWS NET monthly prices (price pathway).
- `composite` — the multi-indicator signal combining **price + conflict + climate** (FEWS NET, ACLED, NASA POWER).

ACLED is key-gated; set `ACLED_KEY` / `ACLED_EMAIL` to enable the conflict pathway against live data (it degrades to "unmonitored" without them).

## Modelling

The contract (operations, value types, provenance) is modelled in PeerColab; generated client code lives under `apps/web/src/peercolab-eaw`. See `CLAUDE.md` for the agent/contributor workflow.
