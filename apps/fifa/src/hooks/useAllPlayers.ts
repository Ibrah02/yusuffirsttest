import { useEffect, useState } from 'react'
import { Session } from '../session'
import { Player_data_feed } from '@gen/Fifa_dashboard_app/Client/PathItems'
import type { Player } from '@gen/Main/Model/1_0/PathItems'

// All aggregate views read the full dataset. We fetch it once through the
// modelled SearchPlayers op (no filters, limit above the row count) and cache
// the promise at module scope so tab-switching doesn't re-query.
let cache: Promise<Player[]> | null = null

function loadAll(): Promise<Player[]> {
  if (!cache) {
    cache = Session.getClient()
      .request(Player_data_feed.searchPlayers({ limit: 100000 }))
      .then((result) => {
        if (result.success) return result.value.players
        throw new Error(result.error?.toLongString() ?? 'Failed to load players.')
      })
  }
  return cache
}

type State = { players: Player[]; loading: boolean; error: string | null }

/** Load the full player set once, shared across all aggregate views. */
export function useAllPlayers(): State {
  const [state, setState] = useState<State>({ players: [], loading: true, error: null })

  useEffect(() => {
    let live = true
    loadAll()
      .then((players) => live && setState({ players, loading: false, error: null }))
      .catch((e: Error) => live && setState({ players: [], loading: false, error: e.message }))
    return () => {
      live = false
    }
  }, [])

  return state
}
