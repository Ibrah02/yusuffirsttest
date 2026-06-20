import { useEffect, useMemo, useState } from 'react'
import { Session } from '../session'
import { Player_data_feed } from '@gen/Fifa_dashboard_app/Client/PathItems'
import type { Player, PlayerSearchFilters } from '@gen/Main/Model/1_0/PathItems'
import { CLUBS, POSITIONS, NATIONALITIES, RISK_LEVELS } from '../constants'
import { positionColor } from '../lib/palette'
import { ClubBadge } from '../components/ClubBadge'
import { flag } from '../lib/branding'

const PAGE_SIZE = 25

type SortKey = keyof Player

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'playerName', label: 'Player' },
  { key: 'age', label: 'Age', numeric: true },
  { key: 'club', label: 'Club' },
  { key: 'position', label: 'Pos' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'overallRating', label: 'OVR', numeric: true },
  { key: 'potentialRating', label: 'POT', numeric: true },
  { key: 'goals', label: 'Goals', numeric: true },
  { key: 'assists', label: 'Assists', numeric: true },
  { key: 'marketValueMillionEur', label: 'Value (€M)', numeric: true },
  { key: 'contractYearsLeft', label: 'Contract', numeric: true },
  { key: 'transferRiskLevel', label: 'Risk' },
]

type UiFilters = {
  club: string
  position: string
  nationality: string
  transferRiskLevel: string
  injuryProneOnly: boolean
  ageMin: string
  ageMax: string
}

const EMPTY: UiFilters = {
  club: '',
  position: '',
  nationality: '',
  transferRiskLevel: '',
  injuryProneOnly: false,
  ageMin: '',
  ageMax: '',
}

export function SquadExplorer() {
  const [filters, setFilters] = useState<UiFilters>(EMPTY)
  const [sortBy, setSortBy] = useState<SortKey>('marketValueMillionEur')
  const [sortDescending, setSortDescending] = useState(true)
  const [page, setPage] = useState(0)

  const [players, setPlayers] = useState<Player[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestInput = useMemo<PlayerSearchFilters>(() => {
    const f: PlayerSearchFilters = {
      sortBy,
      sortDescending,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }
    if (filters.club) f.club = filters.club
    if (filters.position) f.position = filters.position
    if (filters.nationality) f.nationality = filters.nationality
    if (filters.transferRiskLevel) f.transferRiskLevel = filters.transferRiskLevel
    if (filters.injuryProneOnly) f.injuryProneOnly = true
    if (filters.ageMin) f.ageMin = Number(filters.ageMin)
    if (filters.ageMax) f.ageMax = Number(filters.ageMax)
    return f
  }, [filters, sortBy, sortDescending, page])

  useEffect(() => {
    let live = true
    setLoading(true)
    Session.getClient()
      .request(Player_data_feed.searchPlayers(requestInput))
      .then((result) => {
        if (!live) return
        if (result.success) {
          setPlayers(result.value.players)
          setTotal(result.value.totalCount)
          setError(null)
        } else {
          setError(result.error?.toLongString() ?? 'Failed to load players.')
        }
        setLoading(false)
      })
    return () => {
      live = false
    }
  }, [requestInput])

  const update = <K extends keyof UiFilters>(key: K, value: UiFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0)
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortBy) {
      setSortDescending((d) => !d)
    } else {
      setSortBy(key)
      setSortDescending(true)
    }
    setPage(0)
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1
  const lastRow = Math.min(total, (page + 1) * PAGE_SIZE)

  return (
    <section className="fifa-view">
      <div className="fifa-filters">
        <label>
          Club
          <select value={filters.club} onChange={(e) => update('club', e.target.value)}>
            <option value="">All clubs</option>
            {CLUBS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Position
          <select value={filters.position} onChange={(e) => update('position', e.target.value)}>
            <option value="">All positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nationality
          <select value={filters.nationality} onChange={(e) => update('nationality', e.target.value)}>
            <option value="">All nationalities</option>
            {NATIONALITIES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Transfer risk
          <select
            value={filters.transferRiskLevel}
            onChange={(e) => update('transferRiskLevel', e.target.value)}
          >
            <option value="">Any risk</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="fifa-age">
          Age
          <span className="fifa-age-range">
            <input
              type="number"
              min={17}
              max={39}
              placeholder="min"
              value={filters.ageMin}
              onChange={(e) => update('ageMin', e.target.value)}
            />
            <span>–</span>
            <input
              type="number"
              min={17}
              max={39}
              placeholder="max"
              value={filters.ageMax}
              onChange={(e) => update('ageMax', e.target.value)}
            />
          </span>
        </label>
        <label className="fifa-checkbox">
          <input
            type="checkbox"
            checked={filters.injuryProneOnly}
            onChange={(e) => update('injuryProneOnly', e.target.checked)}
          />
          Injury-prone only
        </label>
        <button className="fifa-reset" onClick={() => { setFilters(EMPTY); setPage(0) }}>
          Reset
        </button>
      </div>

      <div className="fifa-resultbar">
        {loading ? (
          <span className="muted">Loading…</span>
        ) : (
          <span>
            Showing <strong>{firstRow}–{lastRow}</strong> of <strong>{total.toLocaleString()}</strong> players
          </span>
        )}
        <span className="fifa-pager">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            ‹ Prev
          </button>
          <span className="muted">
            Page {page + 1} / {pageCount}
          </span>
          <button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </button>
        </span>
      </div>

      {error ? (
        <p className="error">{error}</p>
      ) : (
        <div className="fifa-table-wrap">
          <table className="fifa-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.numeric ? 'num' : ''} ${sortBy === col.key ? 'sorted' : ''}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortBy === col.key && <span className="fifa-sort">{sortDescending ? ' ▼' : ' ▲'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.playerId}>
                  <td>
                    {p.playerName}
                    {p.injuryProne && <span className="fifa-injury" title="Injury-prone">✚</span>}
                  </td>
                  <td className="num">{p.age}</td>
                  <td><ClubBadge club={p.club} /></td>
                  <td>
                    <span
                      className="fifa-pos"
                      style={{ background: `${positionColor(p.position)}26`, color: positionColor(p.position) }}
                    >
                      {p.position}
                    </span>
                  </td>
                  <td>
                    <span className="flag-cell">
                      <span className="flag-emoji" aria-hidden="true">{flag(p.nationality)}</span>
                      {p.nationality}
                    </span>
                  </td>
                  <td className="num">{p.overallRating}</td>
                  <td className="num">{p.potentialRating}</td>
                  <td className="num">{p.goals}</td>
                  <td className="num">{p.assists}</td>
                  <td className="num">{p.marketValueMillionEur.toFixed(1)}</td>
                  <td className="num">{p.contractYearsLeft}</td>
                  <td>
                    <span className={`fifa-risk risk-${p.transferRiskLevel.toLowerCase()}`}>
                      {p.transferRiskLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
