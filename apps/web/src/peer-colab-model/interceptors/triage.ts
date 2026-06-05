import { Result, TransportSessionBuilder } from '@peercolab/engine'
import { GetTriageReviews, SetTriageReview } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'
import type { TriageReview } from '@gen/Main/Model/1_0/EarlyWarning/PathItems'

// ---------------------------------------------------------------------------
// Triage workqueue store — the analyst's review state for watchlist candidates.
//
// The signal is a high-recall watchlist a human reviews, not an auto-alarm, so
// "has this candidate been reviewed / actioned / dismissed?" is first-class
// product state. It is modelled as two operations (GetTriageReviews /
// SetTriageReview); under UX-first they are served from this local-storage
// interceptor — per-analyst, per-browser, persisted across reloads. The P5
// backend swaps in a shared store behind the same contract; the UI never
// changes. Registered in EVERY data-source layer (see Session), so triage works
// whichever signal source is active.
// ---------------------------------------------------------------------------

const KEY = 'eaw.triage.reviews.v1'

function load(): Record<string, TriageReview> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, TriageReview>) : {}
  } catch {
    return {}
  }
}

function save(map: Record<string, TriageReview>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* storage full / blocked — triage is best-effort in the probe */
  }
}

export function registerTriageOps(builder: TransportSessionBuilder): TransportSessionBuilder {
  return builder
    .intercept(new GetTriageReviews().handle(async () => Result.ok(Object.values(load()))))
    .intercept(
      new SetTriageReview().handle(async (input) => {
        const map = load()
        const code = input.countryCode.toUpperCase()
        const review: TriageReview = { countryCode: code, state: input.state }
        map[code] = review
        save(map)
        return Result.ok(review)
      }),
    )
}
