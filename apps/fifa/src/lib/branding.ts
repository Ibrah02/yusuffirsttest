// Original, non-infringing visual identity for clubs and countries.
//
// Club crests are trademarked, so we do NOT use real logos. Instead each club
// gets a generated monogram badge: a coloured disc with its initials, using the
// club's real colours (colours are not copyrightable). Countries use standard
// flag emoji, which are free to use.

export type ClubBadge = { abbr: string; bg: string; fg: string; ring: string }

export const CLUB_BADGES: Record<string, ClubBadge> = {
  'Bayern Munich': { abbr: 'BAY', bg: '#dc052d', fg: '#ffffff', ring: '#0066b2' },
  'FC Barcelona': { abbr: 'BAR', bg: '#004d98', fg: '#edbb00', ring: '#a50044' },
  Juventus: { abbr: 'JUV', bg: '#111111', fg: '#ffffff', ring: '#ffffff' },
  Liverpool: { abbr: 'LIV', bg: '#c8102e', fg: '#ffffff', ring: '#00b2a9' },
  'Manchester City': { abbr: 'MCI', bg: '#6cabdd', fg: '#ffffff', ring: '#1c2c5b' },
  PSG: { abbr: 'PSG', bg: '#004170', fg: '#ffffff', ring: '#da291c' },
  'Real Madrid': { abbr: 'RMA', bg: '#f7f7f7', fg: '#00529f', ring: '#febe10' },
}

const FALLBACK_BADGE: ClubBadge = { abbr: '?', bg: '#9c755f', fg: '#ffffff', ring: '#9c755f' }

export function clubBadge(club: string): ClubBadge {
  return CLUB_BADGES[club] ?? FALLBACK_BADGE
}

// Country -> flag emoji. England uses the St George's-cross subdivision emoji.
export const FLAGS: Record<string, string> = {
  Argentina: '🇦🇷',
  Brazil: '🇧🇷',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Netherlands: '🇳🇱',
  Portugal: '🇵🇹',
  Spain: '🇪🇸',
}

export function flag(country: string): string {
  return FLAGS[country] ?? '🏳️'
}
