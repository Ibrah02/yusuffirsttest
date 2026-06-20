// A categorical palette (Tableau-10 style) for charts. Distinct, balanced,
// readable on white. colorFor() cycles so any-length series gets stable colors.
export const PALETTE = [
  '#4e79a7', // blue
  '#f28e2b', // orange
  '#59a14f', // green
  '#e15759', // red
  '#b07aa1', // purple
  '#76b7b2', // teal
  '#edc948', // yellow
  '#ff9da7', // pink
  '#9c755f', // brown
  '#86bcb6', // sea
]

export function colorFor(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

// Stable colors for the 9 playing positions, so the same position is the same
// colour everywhere it appears (scatter legend, etc.).
const POSITION_ORDER = ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'RW', 'LW', 'ST']
export function positionColor(pos: string): string {
  const idx = POSITION_ORDER.indexOf(pos)
  return colorFor(idx === -1 ? 0 : idx)
}
