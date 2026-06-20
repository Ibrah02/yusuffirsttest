import type { Player } from '@gen/Main/Model/1_0/PathItems'

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

/** Group players by a string key, returning [key, members][] sorted by key. */
export function groupBy(players: Player[], key: (p: Player) => string): [string, Player[]][] {
  const map = new Map<string, Player[]>()
  for (const p of players) {
    const k = key(p)
    const arr = map.get(k)
    if (arr) arr.push(p)
    else map.set(k, [p])
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** Average of a numeric field within each group, sorted descending by value. */
export function avgByGroup(
  players: Player[],
  key: (p: Player) => string,
  value: (p: Player) => number,
): { label: string; value: number; count: number }[] {
  return groupBy(players, key)
    .map(([label, members]) => ({ label, value: mean(members.map(value)), count: members.length }))
    .sort((a, b) => b.value - a.value)
}

/** Count of players per group, sorted descending. */
export function countByGroup(players: Player[], key: (p: Player) => string): { label: string; value: number }[] {
  return groupBy(players, key)
    .map(([label, members]) => ({ label, value: members.length }))
    .sort((a, b) => b.value - a.value)
}

/** Bin a numeric field into a fixed number of equal-width buckets. */
export function histogram(
  values: number[],
  binCount: number,
): { label: string; value: number; from: number; to: number }[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = (max - min) / binCount || 1
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    value: 0,
    label: '',
  }))
  for (const v of values) {
    let idx = Math.floor((v - min) / width)
    if (idx >= binCount) idx = binCount - 1
    if (idx < 0) idx = 0
    bins[idx].value++
  }
  return bins.map((b) => ({ ...b, label: `${Math.round(b.from)}–${Math.round(b.to)}` }))
}

/** Goals per 90 minutes; 0 when the player has no minutes. */
export function goalsPer90(p: Player): number {
  if (p.minutesPlayed <= 0) return 0
  return (p.goals / p.minutesPlayed) * 90
}

export function topN<T>(items: T[], n: number, value: (t: T) => number): T[] {
  return [...items].sort((a, b) => value(b) - value(a)).slice(0, n)
}
