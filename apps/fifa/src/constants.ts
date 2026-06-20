// Distinct categorical values in the dataset, for filter dropdowns.
// Stable (the dataset is fixed); kept here so views don't re-scan the 1MB JSON.

export const CLUBS = [
  'Bayern Munich',
  'FC Barcelona',
  'Juventus',
  'Liverpool',
  'Manchester City',
  'PSG',
  'Real Madrid',
] as const

export const POSITIONS = ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'RW', 'LW', 'ST'] as const

export const NATIONALITIES = [
  'Argentina',
  'Brazil',
  'England',
  'France',
  'Germany',
  'Netherlands',
  'Portugal',
  'Spain',
] as const

export const RISK_LEVELS = ['Low', 'Medium', 'High'] as const
