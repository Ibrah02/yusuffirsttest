import { Result, TransportSessionBuilder } from '@peercolab/engine'
import { SearchPlayers, GetPlayer } from '@gen/Main/Model/1_0/Players/PathItems'
import type { Player, PlayerSearchFilters, PlayerSearchResult } from '@gen/Main/Model/1_0/PathItems'
import playersData from './data/players.json'

// ---------------------------------------------------------------------------
// In-memory mock "DB" — the bundled FIFA dataset (2,800 players), the single
// source both handlers read from. These permanent mocks let the dashboards run
// in dev / test / QA with no backend. The data is synthetic with no real
// cross-column relationships (see the rollout spec); flat charts are expected.
// ---------------------------------------------------------------------------

const ALL_PLAYERS = playersData as Player[]

type SortKey = keyof Player

function compare(a: Player, b: Player, key: SortKey): number {
  const av = a[key]
  const bv = b[key]
  if (typeof av === 'number' && typeof bv === 'number') return av - bv
  return String(av).localeCompare(String(bv))
}

function applyFilters(players: Player[], f: PlayerSearchFilters): Player[] {
  return players.filter((p) => {
    if (f.club && p.club !== f.club) return false
    if (f.position && p.position !== f.position) return false
    if (f.nationality && p.nationality !== f.nationality) return false
    if (f.transferRiskLevel && p.transferRiskLevel !== f.transferRiskLevel) return false
    if (f.injuryProneOnly && !p.injuryProne) return false
    if (f.ageMin != null && p.age < f.ageMin) return false
    if (f.ageMax != null && p.age > f.ageMax) return false
    return true
  })
}

function searchPlayers(filters: PlayerSearchFilters): PlayerSearchResult {
  let rows = applyFilters(ALL_PLAYERS, filters ?? {})

  if (filters?.sortBy && filters.sortBy in ALL_PLAYERS[0]) {
    const key = filters.sortBy as SortKey
    rows = [...rows].sort((a, b) => compare(a, b, key))
    if (filters.sortDescending) rows.reverse()
  }

  const totalCount = rows.length
  const offset = filters?.offset ?? 0
  const limit = filters?.limit ?? rows.length
  const page = rows.slice(offset, offset + limit)

  return { players: page, totalCount }
}

/**
 * Register the FIFA mock interceptor layer. Claims the exact operation ids for
 * SearchPlayers and GetPlayer; only this layer registers them, so ids never
 * collide.
 */
export function registerFifaMocks(builder: TransportSessionBuilder): void {
  builder
    .intercept(
      new SearchPlayers().handle(async (input) => {
        return Result.ok(searchPlayers(input))
      }),
    )
    .intercept(
      new GetPlayer().handle(async (playerId) => {
        const player = ALL_PLAYERS.find((p) => p.playerId === playerId)
        if (!player) {
          return Result.notFound<Player>(`No player with id ${playerId}.`)
        }
        return Result.ok(player)
      }),
    )
}
